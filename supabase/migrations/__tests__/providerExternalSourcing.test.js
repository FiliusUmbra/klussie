// Provider Intelligence's own anticipated extension point (PLATFORM_DOMAIN_MODEL.md
// §14.4, "External directories") — the write contract that persists businesses sourced
// from outside the platform as candidates for a request. Structural only; no automatic
// trigger and no outreach/dispatch exist yet — see this migration's own header.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0216_provider_external_sourcing.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

describe("0216_provider_external_sourcing migration", () => {
  it("creates the provider schema and exactly the two expected tables", () => {
    expect(codeNoComments).toMatch(/create schema if not exists provider;/);
    const tables = [...codeNoComments.matchAll(/create table if not exists (provider\.\w+)/g)].map((m) => m[1]);
    expect(tables.sort()).toEqual(["provider.external_leads", "provider.lead_matches"]);
  });

  it("deduplicates leads globally by (source, source_ref), not per-request", () => {
    const table = codeNoComments.slice(
      codeNoComments.indexOf("create table if not exists provider.external_leads"),
      codeNoComments.indexOf("create table if not exists provider.lead_matches")
    );
    expect(table).toMatch(/constraint external_leads_source_ref_unique unique \(source, source_ref\)/);
  });

  it("a lead may match the same request at most once, but many requests over time", () => {
    const table = codeNoComments.slice(codeNoComments.indexOf("create table if not exists provider.lead_matches"));
    expect(table).toMatch(/constraint lead_matches_lead_request_unique unique \(lead_id, request_id\)/);
    expect(table).toMatch(/references provider\.external_leads \(id\)/);
    expect(table).toMatch(/references work\.requests \(id\)/);
  });

  it("captures match_reason as structured data, not prose — explainability per §14.4", () => {
    const table = codeNoComments.slice(codeNoComments.indexOf("create table if not exists provider.lead_matches"));
    expect(table).toMatch(/match_reason\s+jsonb\s+not null default '\{\}'::jsonb/);
  });

  it("both tables have RLS enabled with every direct grant revoked — reachable only through the write contract", () => {
    for (const table of ["provider.external_leads", "provider.lead_matches"]) {
      expect(codeNoComments).toMatch(new RegExp(`alter table ${table.replace(".", "\\.")} enable row level security;`));
      expect(codeNoComments).toMatch(
        new RegExp(`revoke all on ${table.replace(".", "\\.")} from public, anon, authenticated, service_role;`)
      );
    }
  });

  it("defines exactly the two expected functions", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (provider\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(["api.record_sourced_leads", "provider.record_sourced_leads_for_caller"]);
  });

  it("restricted to a real operator membership, excluding support — this is a write, the role audit applies (0179)", () => {
    const body = bodyOf("provider.record_sourced_leads_for_caller", codeNoComments);
    expect(body).toMatch(/workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)/);
    expect(body).toMatch(/and m\.role <> 'support'/);
    expect(body).toMatch(/raise exception 'provider\.record_sourced_leads_for_caller: caller lacks platform_operations'/);
  });

  it("refuses a request id that does not name a real row, rather than silently sourcing for nothing", () => {
    const body = bodyOf("provider.record_sourced_leads_for_caller", codeNoComments);
    expect(body).toMatch(/does not name a real request/);
    expect(body).toMatch(/errcode = 'no_data_found'/);
  });

  it("refuses an empty or non-array p_leads rather than silently no-op-ing", () => {
    const body = bodyOf("provider.record_sourced_leads_for_caller", codeNoComments);
    expect(body).toMatch(/p_leads must be a non-empty array/);
  });

  it("upserts a lead's contact fields only to fill a gap, never to overwrite an existing value", () => {
    const body = bodyOf("provider.record_sourced_leads_for_caller", codeNoComments);
    expect(body).toMatch(/phone\s*=\s*coalesce\(provider\.external_leads\.phone, excluded\.phone\)/);
    expect(body).toMatch(/email\s*=\s*coalesce\(provider\.external_leads\.email, excluded\.email\)/);
  });

  it("emits provider.leads.sourced on the request's own requesting workspace, never a fabricated one", () => {
    const body = bodyOf("provider.record_sourced_leads_for_caller", codeNoComments);
    expect(body).toMatch(/select r\.requesting_workspace_id into v_workspace_id/);
    expect(body).toMatch(/p_event_type\s*=>\s*'provider\.leads\.sourced'/);
    expect(body).toMatch(/p_workspace_id\s*=>\s*v_workspace_id/);
  });

  it("provider.record_sourced_leads_for_caller is plain SQL/plpgsql, not SECURITY DEFINER; the api delegate is", () => {
    const engineBody = codeNoComments.slice(
      codeNoComments.indexOf("create or replace function provider.record_sourced_leads_for_caller"),
      codeNoComments.indexOf("create or replace function api.record_sourced_leads")
    );
    expect(engineBody).not.toMatch(/security definer/);
    const apiBody = codeNoComments.slice(codeNoComments.indexOf("create or replace function api.record_sourced_leads"));
    expect(apiBody).toMatch(/security definer/);
  });

  it("api.record_sourced_leads is revoked from anon/service_role and granted only to authenticated", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function api\.record_sourced_leads\([^)]*\)\s*\n?\s*from public, anon, service_role;/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.record_sourced_leads\([^)]*\)\s*\n?\s*to authenticated;/
    );
  });

  it("provider.record_sourced_leads_for_caller is granted to nobody, reachable only via the delegate", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function provider\.record_sourced_leads_for_caller\([^)]*\)\s*\n?\s*from public, anon, authenticated, service_role;/
    );
    expect(codeNoComments).not.toMatch(/grant execute on function provider\.record_sourced_leads_for_caller/);
  });

  it("does not build any outreach, dispatch, or automatic trigger — sourcing/matching only", () => {
    expect(codeNoComments.toLowerCase()).not.toMatch(/sms|email_sent|dispatch|outreach|suppress/);
  });
});

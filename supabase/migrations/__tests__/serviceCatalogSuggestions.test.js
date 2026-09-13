// The write contract behind ADR-0027-adjacent Pro Workspace remarks, Theme E: a pro's
// free-text service description that the AI can't match to an existing public.services
// row becomes a real operator-review suggestion, never an instantly-live catalog entry.
// Structural only; real behaviour (a suggestion, its approval creating a real service +
// translations + pro_services row, a non-operator refused) is exercised live in this
// migration's own PR description, matching this codebase's established practice for a
// write contract's first real caller.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0221_service_catalog_suggestions.sql";

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

describe("0221_service_catalog_suggestions migration", () => {
  it("creates the catalog schema and exactly one new table", () => {
    expect(codeNoComments).toMatch(/create schema if not exists catalog;/);
    const tables = [...codeNoComments.matchAll(/create table (catalog\.\w+)/g)].map((m) => m[1]);
    expect(tables).toEqual(["catalog.service_suggestions"]);
  });

  it("constrains locale to the same ten-locale set 0017 already established for the catalog's own translation tables", () => {
    const table = codeNoComments.slice(codeNoComments.indexOf("create table catalog.service_suggestions"));
    expect(table).toMatch(/check \(locale in \('nl','fr','de','en','es','ar','fa','tr','ru','zh'\)\)/);
  });

  it("constrains status to pending/approved/rejected, defaulting to pending", () => {
    const table = codeNoComments.slice(codeNoComments.indexOf("create table catalog.service_suggestions"));
    expect(table).toMatch(/status\s+text\s+not null default 'pending'/);
    expect(table).toMatch(/check \(status in \('pending', 'approved', 'rejected'\)\)/);
  });

  it("keeps decided_at/decided_by/resulting_service_id consistent with status via a real check constraint", () => {
    const table = codeNoComments.slice(codeNoComments.indexOf("create table catalog.service_suggestions"));
    expect(table).toMatch(/constraint service_suggestions_decided_fields_consistent check/);
    // Both the rejected and approved branches are named explicitly, not just "not pending".
    expect(table).toMatch(/status = 'rejected' and decided_at is not null and decided_by is not null and resulting_service_id is null/);
    expect(table).toMatch(/status = 'approved' and decided_at is not null and decided_by is not null and resulting_service_id is not null/);
  });

  it("has RLS enabled with every direct grant revoked — reachable only through the write contract", () => {
    expect(codeNoComments).toMatch(/alter table catalog\.service_suggestions enable row level security;/);
    expect(codeNoComments).toMatch(/revoke all on catalog\.service_suggestions from anon, authenticated, service_role;/);
  });

  it("defines exactly the three expected engine functions plus their three api delegates", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (catalog\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "api.decide_service_suggestion",
      "api.list_service_suggestions",
      "api.suggest_service",
      "catalog.decide_service_suggestion_for_caller",
      "catalog.list_service_suggestions_for_caller",
      "catalog.suggest_service_for_caller",
    ].sort());
  });

  it("suggest_service resolves person_ref from auth.uid() itself, never a parameter", () => {
    const body = bodyOf("catalog.suggest_service_for_caller", codeNoComments);
    expect(body).toMatch(/where i\.auth_user_id = auth\.uid\(\)/);
    expect(body).not.toMatch(/p_person_ref/);
  });

  it("suggest_service refuses a caller who is not a real member of the given workspace", () => {
    const body = bodyOf("catalog.suggest_service_for_caller", codeNoComments);
    expect(body).toMatch(/caller is not a member of/);
  });

  it("suggest_service emits catalog.service.suggested", () => {
    const body = bodyOf("catalog.suggest_service_for_caller", codeNoComments);
    expect(body).toMatch(/p_event_type\s*=>\s*'catalog\.service\.suggested'/);
  });

  it("list and decide both require platform_operations, excluding support-only grants (0179's own write-path role audit)", () => {
    for (const fn of ["catalog.list_service_suggestions_for_caller", "catalog.decide_service_suggestion_for_caller"]) {
      const body = bodyOf(fn, codeNoComments);
      expect(body).toMatch(/workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)/);
      expect(body).toMatch(/and m\.role <> 'support'/);
    }
  });

  it("decide_service_suggestion refuses a suggestion that is not real, or already decided", () => {
    const body = bodyOf("catalog.decide_service_suggestion_for_caller", codeNoComments);
    expect(body).toMatch(/is not a real suggestion/);
    expect(body).toMatch(/was already decided/);
  });

  it("decide_service_suggestion locks the row before deciding, guarding against a concurrent double-decision", () => {
    const body = bodyOf("catalog.decide_service_suggestion_for_caller", codeNoComments);
    expect(body).toMatch(/where id = p_suggestion_id for update/);
  });

  it("never takes a client-supplied id for the new public.services row — that table keeps its own pre-ADR-0022 default", () => {
    const body = bodyOf("catalog.decide_service_suggestion_for_caller", codeNoComments);
    expect(body).not.toMatch(/p_new_service_id/);
    expect(body).toMatch(/insert into public\.services \(category_id, mode, base_price, certified_only, active\)/);
    expect(body).toMatch(/returning id into v_new_service_id/);
  });

  it("resolves the suggesting person's own real auth_user_id before writing pro_services — person_ref and pro_id are different identifier spaces", () => {
    const body = bodyOf("catalog.decide_service_suggestion_for_caller", codeNoComments);
    expect(body).toMatch(/select i\.auth_user_id into v_suggesting_auth_user_id/);
    expect(body).toMatch(/where i\.person_ref = v_suggestion\.suggested_by/);
    expect(body).toMatch(/insert into public\.pro_services \(pro_id, service_id, workspace_id\)\s*\n\s*values \(v_suggesting_auth_user_id, v_new_service_id, v_suggestion\.workspace_id\)/);
  });

  it("approval writes all ten locales of service_translations — the pro's own original plus every generated one", () => {
    const body = bodyOf("catalog.decide_service_suggestion_for_caller", codeNoComments);
    expect(body).toMatch(/values \(v_new_service_id, v_suggestion\.locale, v_suggestion\.proposed_name, v_suggestion\.proposed_blurb\)/);
    expect(body).toMatch(/for v_locale, v_translation in select \* from jsonb_each\(v_suggestion\.translations\)/);
  });

  it("rejection never touches public.services, service_translations, or pro_services", () => {
    const body = bodyOf("catalog.decide_service_suggestion_for_caller", codeNoComments);
    const elseBranch = body.slice(body.indexOf("else"));
    expect(elseBranch).not.toMatch(/insert into public\./);
  });

  it("every catalog.* engine function is plain SQL/plpgsql, not SECURITY DEFINER; every api.* delegate is", () => {
    for (const fn of [
      "catalog.suggest_service_for_caller",
      "catalog.list_service_suggestions_for_caller",
      "catalog.decide_service_suggestion_for_caller",
    ]) {
      expect(bodyOf(fn, codeNoComments)).not.toMatch(/security definer/);
    }
    for (const fn of ["api.suggest_service", "api.list_service_suggestions", "api.decide_service_suggestion"]) {
      const start = codeNoComments.indexOf(`create or replace function ${fn}`);
      const nextFn = codeNoComments.indexOf("create or replace function", start + 1);
      const end = nextFn === -1 ? codeNoComments.indexOf("\nrevoke all on function api.suggest_service", start) : nextFn;
      expect(codeNoComments.slice(start, end === -1 ? undefined : end)).toMatch(/security definer/);
    }
  });

  it("never provisions a new top-level category — only a new service under an existing one", () => {
    expect(codeNoComments).not.toMatch(/insert into public\.categories/);
    expect(codeNoComments).toMatch(/references public\.categories \(id\)/);
  });

  it("does not build any notification, email, or push delivery for the pro — a real operator review gate only", () => {
    expect(codeNoComments.toLowerCase()).not.toMatch(/resend|sendgrid|twilio|smtp|push_token/);
  });
});

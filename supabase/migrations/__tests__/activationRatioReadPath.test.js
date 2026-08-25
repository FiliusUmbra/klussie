// The Activation Ratio read path (Overview screen) — PLATFORM_ACTIVATION_PROGRAMME.md
// §4's own formula made computable. See ACTIVATION_RATIO_OVERVIEW_DESIGN.md for the
// full reasoning behind each journey's event_type/legacy-table pairing.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0180_activation_ratio_read_path.sql";

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

describe("0180_activation_ratio_read_path migration", () => {
  it("defines exactly the two expected functions", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (platform\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(["api.activation_ratios", "platform.activation_ratios_for_caller"]);
  });

  it("counts all five journeys' real event_type against a real comparator", () => {
    const body = bodyOf("platform.activation_ratios_for_caller", codeNoComments);
    const journeys = {
      property_asset_recorded: "property.asset.created",
      request_to_booking: "marketplace.request.created",
      work_performed_to_service_record: "service_record.service_record.created",
      conversation: "conversation.conversation.opened",
      report_or_dispute: "safety.case.filed",
    };
    for (const [key, eventType] of Object.entries(journeys)) {
      expect(body, `${key} missing its own event_type`).toMatch(new RegExp(`'${key}'[\\s\\S]*?event_type = '${eventType}'`));
    }
  });

  it("every event_type literal referenced is dotted <engine>.<aggregate>.<past-participle>", () => {
    const literals = [...codeNoComments.matchAll(/event_type = '([^']+)'/g)].map((m) => m[1]);
    expect(literals.length).toBe(5);
    for (const value of literals) {
      expect(value, `${value} is not dotted lowercase`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("each journey's legacy half reads from the real comparator table named in the design doc", () => {
    const body = bodyOf("platform.activation_ratios_for_caller", codeNoComments);
    expect(body).toMatch(/from public\.household_items h/);
    expect(body).toMatch(/from public\.service_requests r/);
    expect(body).toMatch(/from work\.engagements g[\s\S]*?g\.status = 'completed'/);
    expect(body).toMatch(/from public\.conversations c/);
    expect(body).toMatch(/from public\.reports p/);
  });

  it("ratio is null, not 0, when both counts are zero — division by zero handled explicitly", () => {
    const body = bodyOf("platform.activation_ratios_for_caller", codeNoComments);
    expect(body).toMatch(/case when \(c\.platform_count \+ c\.legacy_count\) = 0 then null/);
  });

  it("restricted to operators via the same EXISTS shape list_audit_records() already uses — zero rows, never an exception", () => {
    const body = bodyOf("platform.activation_ratios_for_caller", codeNoComments);
    expect(body).toMatch(/workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)/);
    expect(body).not.toMatch(/raise exception/);
    expect(body).toMatch(/where o\.is_operator/);
  });

  it("the operator check does NOT exclude role = 'support' — this is a read, the write-path role audit does not apply", () => {
    const body = bodyOf("platform.activation_ratios_for_caller", codeNoComments);
    expect(body).not.toMatch(/role <> 'support'/);
  });

  it("platform.activation_ratios_for_caller is plain SQL, not SECURITY DEFINER; the api delegate is", () => {
    const platformBody = codeNoComments.slice(
      codeNoComments.indexOf("create or replace function platform.activation_ratios_for_caller"),
      codeNoComments.indexOf("create or replace function api.activation_ratios")
    );
    expect(platformBody).not.toMatch(/security definer/);
    const apiBody = codeNoComments.slice(codeNoComments.indexOf("create or replace function api.activation_ratios"));
    expect(apiBody).toMatch(/security definer/);
  });

  it("api.activation_ratios is revoked from anon/service_role and granted only to authenticated", () => {
    expect(codeNoComments).toMatch(/revoke all on function api\.activation_ratios\(integer\) from public, anon, service_role;/);
    expect(codeNoComments).toMatch(/grant execute on function api\.activation_ratios\(integer\) to authenticated;/);
  });

  it("platform.activation_ratios_for_caller is granted to nobody explicitly", () => {
    expect(codeNoComments).not.toMatch(/grant execute on function platform\.activation_ratios_for_caller/);
  });
});

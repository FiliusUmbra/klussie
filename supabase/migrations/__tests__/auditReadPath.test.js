// Keeps 0133_audit_read_path.sql (Platform Activation Slice 0, WP 0.4; ADR-0030) inside
// its own stated rules: the same two-layer read-switch shape as every other engine
// (property.my_assets() / api.my_assets()), authorization composed from
// workspace.current_memberships() + workspace.workspace_has_capability() rather than
// invented, and platform.list_audit_records() reachable by nobody directly.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0133_audit_read_path.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0133_audit_read_path migration", () => {
  it("defines platform.list_audit_records() without SECURITY DEFINER — it inherits the delegate's context, matching property.my_assets()", () => {
    const start = codeNoComments.indexOf("create or replace function platform.list_audit_records");
    const end = codeNoComments.indexOf("$$;", start);
    const block = codeNoComments.slice(start, end);
    expect(block).not.toMatch(/security definer/i);
  });

  it("defines api.list_audit_records() as a thin SECURITY DEFINER delegate that does nothing but call the real function", () => {
    const start = codeNoComments.indexOf("create or replace function api.list_audit_records");
    const end = codeNoComments.indexOf(";", codeNoComments.indexOf("$$;", start));
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select \* from platform\.list_audit_records\(/);
  });

  it("authorizes via workspace.current_memberships() + workspace.workspace_has_capability('platform_operations') — composed, not reinvented", () => {
    expect(codeNoComments).toMatch(/from workspace\.current_memberships\(\) m/);
    expect(codeNoComments).toMatch(/workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)/);
  });

  it("gates access with an EXISTS predicate in the WHERE clause, never a raised exception — a non-operator gets zero rows, not a denial message", () => {
    expect(codeNoComments).toMatch(/where exists \(/);
    expect(codeNoComments).not.toMatch(/raise exception/i);
  });

  it("guards limit/offset against negative input", () => {
    expect(codeNoComments).toMatch(/greatest\(coalesce\(p_limit, 50\), 0\)/);
    expect(codeNoComments).toMatch(/greatest\(coalesce\(p_offset, 0\), 0\)/);
  });

  it("revokes platform.list_audit_records() from every role, including authenticated — reachable only as a nested call", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function platform\.list_audit_records\(\s*\n\s*uuid, text, text, timestamptz, timestamptz, integer, integer\s*\n\s*\) from public, anon, authenticated, service_role/
    );
  });

  it("grants api.list_audit_records() to authenticated only, after an explicit revoke from public/anon/service_role", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function api\.list_audit_records\(\s*\n\s*uuid, text, text, timestamptz, timestamptz, integer, integer\s*\n\s*\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.list_audit_records\(\s*\n\s*uuid, text, text, timestamptz, timestamptz, integer, integer\s*\n\s*\) to authenticated/
    );
  });

  it("does not re-grant USAGE on schema api — already granted in 0031", () => {
    expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
  });
});

// Keeps 0134_workspace_capability_check.sql (Platform Activation Slice 0, WP 0.5;
// ADR-0030) inside its own stated rules: scoped to the caller's own real membership,
// never a general oracle over an arbitrary workspace id, and the same two-layer shape
// as every other read switch.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0134_workspace_capability_check.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0134_workspace_capability_check migration", () => {
  it("defines workspace.my_workspace_has_capability() checking the caller's own membership before delegating to workspace_has_capability()", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.my_workspace_has_capability");
    const end = codeNoComments.indexOf("$$;", start);
    const block = codeNoComments.slice(start, end);
    expect(block).not.toMatch(/security definer/i);
    expect(block).toMatch(/from workspace\.current_memberships\(\) m where m\.workspace_id = p_workspace_id/);
    expect(block).toMatch(/workspace\.workspace_has_capability\(p_workspace_id, p_capability_key\)/);
  });

  it("defines api.my_workspace_has_capability() as a thin SECURITY DEFINER delegate", () => {
    const start = codeNoComments.indexOf("create or replace function api.my_workspace_has_capability");
    const end = codeNoComments.indexOf(";", codeNoComments.indexOf("$$;", start));
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select workspace\.my_workspace_has_capability\(p_workspace_id, p_capability_key\);/);
  });

  it("revokes workspace.my_workspace_has_capability() from every role — reachable only as a nested call", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function workspace\.my_workspace_has_capability\(uuid, text\) from public, anon, authenticated, service_role/
    );
  });

  it("grants api.my_workspace_has_capability() to authenticated only, after an explicit revoke", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function api\.my_workspace_has_capability\(uuid, text\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.my_workspace_has_capability\(uuid, text\) to authenticated/
    );
  });

  it("does not re-grant USAGE on schema api — already granted in 0031", () => {
    expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
  });
});

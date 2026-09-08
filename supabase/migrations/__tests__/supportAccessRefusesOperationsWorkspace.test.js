// Fix: workspace.grant_support_access_for_caller() (0172, further guarded by 0179) never
// refused the operations workspace itself as a grant target. 0179 closed the write-side
// loop (a support grant minted there could pass the "is this caller an operator" check
// on grant/end/decide) by excluding role = 'support' from that check -- but left a
// narrower, read-only gap: platform.list_audit_records(), safety.trust_safety_queue_for_
// caller() and safety.case_detail_for_caller() (deliberately, per 0179's own header) gate
// on the unscoped, un-excluded workspace_has_capability(m.workspace_id,
// 'platform_operations') check, which a support grant ON the operations workspace itself
// trivially satisfies. Live-verified 2026-09-08 as a real operator on staging: "Request
// access" against the Operations Workspace's own row succeeded; ended immediately, no
// data read through it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0213_support_access_refuses_operations_workspace.sql";
const PREVIOUS = "supabase/migrations/0179_exclude_support_role_from_operator_writes.sql";

function stripComments(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

const codeNoComments = stripComments(readFileSync(MIGRATION, "utf8"));
const current = bodyOf("workspace.grant_support_access_for_caller", codeNoComments);

describe("0213_support_access_refuses_operations_workspace migration", () => {
  it("refuses a target workspace that itself holds platform_operations", () => {
    expect(current).toMatch(
      /if workspace\.workspace_has_capability\(p_workspace_id, 'platform_operations'\) then/
    );
    expect(current).toMatch(/cannot grant support access on a workspace holding platform_operations/);
  });

  it("checks the target only after confirming the workspace exists, before minting anything", () => {
    const existsCheck = current.indexOf("workspace % does not exist");
    const targetGuard = current.indexOf("cannot grant support access on a workspace holding platform_operations");
    const insertMembership = current.indexOf("insert into workspace.memberships");
    expect(existsCheck).toBeGreaterThan(-1);
    expect(targetGuard).toBeGreaterThan(existsCheck);
    expect(insertMembership).toBeGreaterThan(targetGuard);
  });

  it("changes no grants — the function's own access posture is untouched", () => {
    expect(codeNoComments).not.toMatch(/^grant\b/m);
    expect(codeNoComments).not.toMatch(/^revoke\b/m);
  });

  it("touches only grant_support_access_for_caller — end/decide are untouched, 0179's own fix for those stands", () => {
    expect(codeNoComments).not.toMatch(/create or replace function safety\.record_decision_for_caller/);
    expect(codeNoComments).not.toMatch(/create or replace function workspace\.end_support_access_for_caller/);
  });

  it("is otherwise byte-for-byte identical to its last shipped version (0179)", () => {
    const previous = bodyOf("workspace.grant_support_access_for_caller", stripComments(readFileSync(PREVIOUS, "utf8")));
    const normalize = (s) =>
      s.replace(
        /\n\s*if workspace\.workspace_has_capability\(p_workspace_id, 'platform_operations'\) then[\s\S]*?end if;\n/,
        "\n"
      );
    expect(normalize(current)).toBe(previous);
  });
});

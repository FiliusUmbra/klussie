// Keeps 0194_restore_current_memberships_scope_filter.sql inside the exact shape its own
// header commits to: workspace.current_memberships() is redefined with the same signature
// and return type as 0031's original, gains back the `and m.scope is null` filter 0161 §1
// added, and nothing else in this file touches a grant, a policy, or another function.
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3) -- the live, adversarial proof (a scoped contractor denied a different property in
// the same workspace) is run against real staging data and captured in the PR
// description, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0194_restore_current_memberships_scope_filter.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

describe("0194_restore_current_memberships_scope_filter migration", () => {
  it("keeps the exact same signature and return type as 0031's original", () => {
    expect(codeNoComments).toMatch(
      /create or replace function workspace\.current_memberships\(\)\s*\nreturns table \(membership_id uuid, workspace_id uuid, role text, scope jsonb\)/
    );
  });

  it("restores the scope-null filter, last in the predicate chain", () => {
    const block = bodyOf("workspace.current_memberships");
    expect(block).toMatch(/and m\.scope is null;/);
  });

  it("keeps every pre-existing predicate unchanged -- auth.uid() match, not erased, active state, not expired", () => {
    const block = bodyOf("workspace.current_memberships");
    expect(block).toMatch(/i\.auth_user_id = auth\.uid\(\)/);
    expect(block).toMatch(/i\.erased_at is null/);
    expect(block).toMatch(/m\.state = 'active'/);
    expect(block).toMatch(/m\.expires_at is null or m\.expires_at > now\(\)/);
  });

  it("is language sql, stable, fixed empty search_path -- same posture as every version of this function", () => {
    expect(codeNoComments).toMatch(/language sql\nstable\nset search_path = ''\n/);
  });

  it("carries a comment explaining the scope-null exclusion", () => {
    expect(codeNoComments).toMatch(
      /comment on function workspace\.current_memberships\(\) is/
    );
  });

  it("touches no grant, no policy, and no other function -- this one function body only", () => {
    const statementLines = codeNoComments
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of statementLines) {
      expect(line).not.toMatch(/^(grant|revoke|create policy|drop policy|alter table)\s/i);
    }
    const defineCount = (codeNoComments.match(/create or replace function/g) || []).length;
    expect(defineCount).toBe(1);
  });
});

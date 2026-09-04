// Keeps 0191_restore_marketplace_isolation_policies.sql inside the exact shape its own
// header commits to: it recreates 0088's three RLS policies on work.requests/work.quotes/
// work.engagements byte-identically, touches no grant and no table structure, and drops
// nothing except the policies it immediately recreates. Structural, like every migration
// test in this repository (docs/engineering/TESTING.md §3) -- behaviour is proven against
// real staging data by supabase/diagnostics/VERIFY_MARKETPLACE_ISOLATION.sql, using
// synthetic fixtures rolled back in a transaction, never real customer data.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0191_restore_marketplace_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function policyBlock(policyName) {
  const start = codeNoComments.indexOf(`create policy "${policyName}"`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf(");", start) + 2;
  return codeNoComments.slice(start, end);
}

describe("0191_restore_marketplace_isolation_policies migration", () => {
  it("drops each policy with if exists before recreating it -- 0088's own idempotency pattern", () => {
    for (const [name, table] of [
      ["workspace members can view requests", "work.requests"],
      ["workspace members can view quotes", "work.quotes"],
      ["workspace members can view engagements", "work.engagements"],
    ]) {
      expect(codeNoComments).toMatch(
        new RegExp(`drop policy if exists "${name}" on ${table.replace(".", "\\.")};`)
      );
    }
  });

  describe('"workspace members can view requests" on work.requests', () => {
    it("is select-only, to authenticated, single-sided on requesting_workspace_id", () => {
      const block = policyBlock("workspace members can view requests");
      expect(block).toMatch(/on work\.requests for select\s*\n\s*to authenticated/);
      expect(block).toMatch(
        /requesting_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
      );
    });
  });

  describe('"workspace members can view quotes" on work.quotes', () => {
    it("is select-only, to authenticated, and keeps both halves of its own OR", () => {
      const block = policyBlock("workspace members can view quotes");
      expect(block).toMatch(/on work\.quotes for select\s*\n\s*to authenticated/);
      expect(block).toMatch(
        /offering_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
      );
      expect(block).toMatch(/or request_id in \(/);
      expect(block).toMatch(
        /requesting_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
      );
    });

    it("carries the same explanatory comment 0088 gave it", () => {
      expect(codeNoComments).toMatch(
        /comment on policy "workspace members can view quotes" on work\.quotes is/
      );
    });
  });

  describe('"workspace members can view engagements" on work.engagements', () => {
    it("is select-only, to authenticated, and checks both sides directly (no join needed)", () => {
      const block = policyBlock("workspace members can view engagements");
      expect(block).toMatch(/on work\.engagements for select\s*\n\s*to authenticated/);
      expect(block).toMatch(
        /requesting_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
      );
      expect(block).toMatch(
        /or performing_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
      );
    });
  });

  it("touches no grant and no table structure -- policies only", () => {
    expect(codeNoComments).not.toMatch(/\balter table\b/i);
    expect(codeNoComments).not.toMatch(/\bgrant\b|\brevoke\b/i);
    expect(codeNoComments).not.toMatch(/\bcreate table\b|\bdrop table\b/i);
  });

  it("drops no policy it does not immediately recreate in this same file", () => {
    const drops = [...codeNoComments.matchAll(/drop policy if exists "([^"]+)"/g)].map((m) => m[1]);
    const creates = [...codeNoComments.matchAll(/create policy "([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(drops)).toEqual(new Set(creates));
  });
});

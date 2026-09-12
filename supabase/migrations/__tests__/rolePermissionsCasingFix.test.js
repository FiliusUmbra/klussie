// 0219's own fix: workspace.role_permissions.role_name (0036) used ADR-0027's own
// display-styled capitalization ('Owner', 'Administrator', ...), but every real
// workspace.memberships.role insert across this codebase only ever writes lowercase
// ('owner') — a case-sensitive equality in workspace.decide_permission() means every
// real membership would be denied every permission the instant anything called it, until
// this fix. Structural only — the real behaviour is exercised for the first time by
// workspaceJoinRequests.test.js's own permission-gated tests.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0219_role_permissions_casing_fix.sql";
const code = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");

describe("0219_role_permissions_casing_fix migration", () => {
  it("lowercases every role_name in workspace.role_permissions, not just 'Owner'", () => {
    expect(code).toMatch(/update workspace\.role_permissions\s*\nset role_name = lower\(role_name\)/);
  });

  it("never touches workspace.memberships itself — that column's real, load-bearing values are the fixed point", () => {
    expect(code).not.toMatch(/update workspace\.memberships/);
  });

  it("only rewrites rows that actually need it, not an unconditional rewrite", () => {
    expect(code).toMatch(/where role_name <> lower\(role_name\)/);
  });
});

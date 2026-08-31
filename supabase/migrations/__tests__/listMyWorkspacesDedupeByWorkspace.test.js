// Keeps 0188_list_my_workspaces_dedupe_by_workspace.sql inside the two constraints it
// must not violate: still built on workspace.current_memberships() (0031) rather than
// re-querying workspace.memberships directly (the same rule listMyWorkspaces.test.js
// already enforces for 0038, unchanged by this migration), and now genuinely one row per
// workspace, not one row per membership. Behaviour -- that a workspace with two live
// contractor memberships collapses to one switcher tab -- is proven against staging by a
// live query, not simulated here; this file is structural, like every migration test in
// this repository (docs/engineering/TESTING.md §3).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0188_list_my_workspaces_dedupe_by_workspace.sql";

const rawCode = readFileSync(MIGRATION, "utf8");
const code = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .replace(/'(?:[^']|'')*'/g, "''");

function logicBlock() {
  const start = code.indexOf("create or replace function workspace.list_my_workspaces");
  expect(start).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf("$$;", start) + 3);
}

describe("0188_list_my_workspaces_dedupe_by_workspace migration", () => {
  it("deduplicates by workspace_id", () => {
    expect(logicBlock()).toMatch(/distinct on\s*\(\s*m\.workspace_id\s*\)/i);
  });

  it("orders each workspace's duplicates so the freshest membership wins", () => {
    const block = logicBlock();
    expect(block).toMatch(/order by\s+m\.workspace_id\s*,\s*m\.membership_id desc/i);
  });

  it("still reuses workspace.current_memberships() rather than re-querying memberships directly", () => {
    const block = logicBlock();
    expect(block).toMatch(/from workspace\.current_memberships\(\) m/i);
    expect(block).not.toMatch(/from workspace\.memberships\b/i);
  });

  it("still excludes archived workspaces", () => {
    expect(logicBlock()).toMatch(/archived_at is null/i);
  });

  it("still returns the same six display columns", () => {
    const block = logicBlock();
    expect(block).toMatch(/membership_id\s+uuid/i);
    expect(block).toMatch(/workspace_id\s+uuid/i);
    expect(block).toMatch(/role\s+text/i);
    expect(block).toMatch(/scope\s+jsonb/i);
    expect(block).toMatch(/workspace_type\s+text/i);
    expect(block).toMatch(/workspace_name\s+text/i);
  });

  it("does not touch workspace.memberships, the grant model, or the delegate's own grants", () => {
    expect(code).not.toMatch(/insert into workspace\.memberships/i);
    expect(code).not.toMatch(/update workspace\.memberships/i);
    expect(code).not.toMatch(/create or replace function api\.list_my_workspaces/i);
  });

  it("stays not SECURITY DEFINER, granted to nobody", () => {
    const block = logicBlock();
    expect(block).not.toMatch(/\bsecurity definer\b/i);
    expect(code).toMatch(
      /revoke all on function workspace\.list_my_workspaces\(\) from public, anon, authenticated, service_role/i
    );
  });

  it("is never referenced by an RLS policy", () => {
    expect(code).not.toMatch(/create policy/i);
  });
});

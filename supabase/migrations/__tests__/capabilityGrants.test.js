// Keeps 0077_capability_grants.sql inside workspace.memberships' own shape (migration
// 0030) — a set, not a single current value — and inside DATABASE_ARCHITECTURE.md §11's
// append-only grant-history rule.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0077_capability_grants.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0077_capability_grants migration", () => {
  it("creates exactly two tables, both in workspace", () => {
    const created = [...code.matchAll(/create table if not exists (workspace\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["workspace.capability_grant_history", "workspace.capability_grants"]);
  });

  it("capability_grants has no unique constraint on (workspace_id, capability_key)", () => {
    const start = code.indexOf("create table if not exists workspace.capability_grants");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).not.toMatch(/unique \(workspace_id, capability_key\)/);
    expect(block).toMatch(/references workspace\.workspaces \(id\)/);
    expect(block).toMatch(/references platform\.capabilities \(capability_key\)/);
  });

  it("constrains source to five real values, and withdrawn_at must be after granted_at", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists workspace.capability_grants");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/check \(source in \('preset', 'subscription', 'trial', 'negotiation', 'operator'\)\)/);
    expect(rawBlock).toMatch(/check \(withdrawn_at is null or withdrawn_at >= granted_at\)/);
  });

  it("has a partial index on currently-held grants", () => {
    expect(code).toMatch(
      /create index if not exists capability_grants_held_idx\s*\n\s*on workspace\.capability_grants \(workspace_id, capability_key\) where withdrawn_at is null/
    );
  });

  it("capability_grant_history carries workspace_id and capability_key directly, not only via grant_id", () => {
    const start = code.indexOf("create table if not exists workspace.capability_grant_history");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/grant_id\s+uuid\s+not null/);
    expect(block).toMatch(/workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/capability_key\s+text\s+not null/);
  });

  it("capability_grant_history is unconditionally append-only", () => {
    expect(codeNoComments).toMatch(/capability_grant_history_reject_mutation/);
    expect(codeNoComments).toMatch(/before update or delete on workspace\.capability_grant_history/);
  });

  it("grants UPDATE on capability_grants but DELETE on neither table", () => {
    expect(code).toMatch(/grant update on workspace\.capability_grants to klussie_engine_workspace/i);
    expect(code).not.toMatch(/grant delete on workspace\.capability_grants/i);
    expect(code).not.toMatch(/grant delete on workspace\.capability_grant_history/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("revokes both tables from anon, authenticated and service_role, adds no policy here", () => {
    expect(code).toMatch(/revoke all on workspace\.capability_grants from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on workspace\.capability_grant_history from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});

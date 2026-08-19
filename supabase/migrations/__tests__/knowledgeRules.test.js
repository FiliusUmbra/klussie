// Keeps 0107_knowledge_rules.sql inside §18.2's own rules: an aggregate (not a
// projection), four scope levels, two origins (never "observed but unconfirmed"), and
// supersession by new row rather than in-place edit.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0107_knowledge_rules.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0107_knowledge_rules migration", () => {
  it("creates exactly one table, in knowledge", () => {
    const created = [...code.matchAll(/create table if not exists (knowledge\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["knowledge.rules"]);
  });

  it("scope_type is constrained to the four levels §18.2 names, scope_id required iff not workspace-wide", () => {
    const start = codeNoComments.indexOf("create table if not exists knowledge.rules");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(scope_type in \('workspace', 'property', 'location', 'asset_class'\)\)/);
    expect(block).toMatch(/check \(\(scope_type = 'workspace'\) = \(scope_id is null\)\)/);
  });

  it("origin has exactly two values — declared and proposed, never a third for unconfirmed observations", () => {
    const start = codeNoComments.indexOf("create table if not exists knowledge.rules");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(origin in \('declared', 'proposed'\)\)/);
    expect(codeNoComments).not.toMatch(/'observed'/);
  });

  it("declared rules must have confirmed_at set at creation", () => {
    const start = codeNoComments.indexOf("create table if not exists knowledge.rules");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(origin <> 'declared' or confirmed_at is not null\)/);
  });

  it("status consistency ties retired_at/superseded_by to their own status value", () => {
    const start = codeNoComments.indexOf("create table if not exists knowledge.rules");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/status = 'active' and retired_at is null and superseded_by is null/);
    expect(block).toMatch(/status = 'retired' and retired_at is not null and superseded_by is null/);
    expect(block).toMatch(/status = 'superseded' and superseded_by is not null/);
  });

  it("category is a plain text column, not a closed enum", () => {
    const start = code.indexOf("create table if not exists knowledge.rules");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/category\s+text\s+not null/);
    expect(block).not.toMatch(/check \(category in/);
  });

  it("the guard trigger freezes every column except confirmed_at, status, superseded_by and retired_at, each one-way", () => {
    expect(codeNoComments).toMatch(/rules_guard_mutation/);
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("return coalesce", guardStart));
    for (const col of ["id", "workspace_id", "category", "scope_type", "scope_id", "rule", "origin", "created_at"]) {
      expect(guardBlock, `guard does not check ${col}`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(guardBlock).toMatch(/old\.confirmed_at is not null and new\.confirmed_at is distinct from old\.confirmed_at/);
    expect(guardBlock).toMatch(/old\.status <> 'active' and new\.status is distinct from old\.status/);
  });

  it("rejects delete unconditionally", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
    expect(codeNoComments).toMatch(/before update or delete on knowledge\.rules/);
  });

  it("grants UPDATE, never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on knowledge\.rules to klussie_engine_knowledge/i);
    expect(code).not.toMatch(/grant delete on knowledge\.rules/i);
    expect(code).toMatch(/revoke all on knowledge\.rules from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });
});

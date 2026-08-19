// Keeps 0108_workspace_edges.sql inside §27's own rules: an aggregate (asserted, not
// derived), no node table (workspace-side nodes already exist elsewhere), and retraction
// rather than deletion.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0108_workspace_edges.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0108_workspace_edges migration", () => {
  it("creates exactly one table, in knowledge — no companion node table", () => {
    const created = [...code.matchAll(/create table if not exists (knowledge\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["knowledge.workspace_edges"]);
  });

  it("from_type/to_type are unconstrained text, no per-kind foreign key", () => {
    const start = code.indexOf("create table if not exists knowledge.workspace_edges");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/from_type\s+text\s+not null/);
    expect(block).toMatch(/to_type\s+text\s+not null/);
    expect(block).not.toMatch(/from_type.*references/);
  });

  it("asserted_by_ref carries no foreign key — a durable reference, matching work.messages' own pattern", () => {
    const start = code.indexOf("create table if not exists knowledge.workspace_edges");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/asserted_by_ref\s+uuid\s+null/);
    expect(block).not.toMatch(/asserted_by_ref.*references/);
  });

  it("refuses a self-referencing edge", () => {
    const start = code.indexOf("create table if not exists knowledge.workspace_edges");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(from_type <> to_type or from_id <> to_id\)/);
  });

  it("the guard trigger freezes every column except retracted_at, one-way", () => {
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("return coalesce", guardStart));
    for (const col of ["id", "workspace_id", "from_type", "from_id", "edge_type", "to_type", "to_id", "asserted_by_ref", "asserted_at"]) {
      expect(guardBlock, `guard does not check ${col}`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(guardBlock).toMatch(/old\.retracted_at is not null and new\.retracted_at is distinct from old\.retracted_at/);
  });

  it("rejects delete unconditionally", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
  });

  it("grants UPDATE, never DELETE, revokes client roles, adds no policy here", () => {
    expect(code).toMatch(/grant update on knowledge\.workspace_edges to klussie_engine_knowledge/i);
    expect(code).not.toMatch(/grant delete on knowledge\.workspace_edges/i);
    expect(code).toMatch(/revoke all on knowledge\.workspace_edges from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});

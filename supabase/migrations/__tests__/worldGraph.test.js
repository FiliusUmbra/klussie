// Keeps 0109_world_graph.sql inside §27's own rules: real foreign keys between nodes and
// edges (unlike the workspace graph's own polymorphic edges), no workspace reference
// anywhere, and no direct write grant beyond what promotion itself needs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0109_world_graph.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0109_world_graph migration", () => {
  it("creates exactly two tables, both in knowledge", () => {
    const created = [...code.matchAll(/create table if not exists (knowledge\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["knowledge.world_edges", "knowledge.world_nodes"]);
  });

  it("world_edges uses real foreign keys into world_nodes on both sides", () => {
    const start = code.indexOf("create table if not exists knowledge.world_edges");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/from_node_id\s+uuid\s+not null\s*\n\s*references knowledge\.world_nodes \(id\)/);
    expect(block).toMatch(/to_node_id\s+uuid\s+not null\s*\n\s*references knowledge\.world_nodes \(id\)/);
  });

  it("neither table carries a workspace_id or any other tenant-reference column", () => {
    expect(codeNoComments).not.toMatch(/workspace_id/);
  });

  it("refuses a self-referencing world edge", () => {
    const start = code.indexOf("create table if not exists knowledge.world_edges");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(from_node_id <> to_node_id\)/);
  });

  it("UPDATE and DELETE are withheld from the engine on both tables — insert-only", () => {
    expect(code).toMatch(/revoke update, delete on knowledge\.world_nodes from klussie_engine_knowledge/i);
    expect(code).toMatch(/revoke update, delete on knowledge\.world_edges from klussie_engine_knowledge/i);
  });

  it("revokes client roles from both tables and adds no policy here", () => {
    expect(code).toMatch(/revoke all on knowledge\.world_nodes from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on knowledge\.world_edges from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("has no guard-mutation trigger — grants alone withhold UPDATE/DELETE", () => {
    expect(codeNoComments).not.toMatch(/create or replace function/);
    expect(codeNoComments).not.toMatch(/create trigger/);
  });
});

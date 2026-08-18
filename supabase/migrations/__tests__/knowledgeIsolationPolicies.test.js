// Keeps 0110_knowledge_isolation_policies.sql inside the ADR-0025 backstop shape every
// workspace-scoped table has held since, and confirms the world graph deliberately gets
// no policy at all.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0110_knowledge_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0110_knowledge_isolation_policies migration", () => {
  it("creates exactly two policies, for rules and workspace_edges", () => {
    const created = [...codeNoComments.matchAll(/create policy "([\w\s]+)"\s*\n\s*on (knowledge\.\w+)/g)];
    expect(created.length).toBe(2);
    const tables = created.map((m) => m[2]).sort();
    expect(tables).toEqual(["knowledge.rules", "knowledge.workspace_edges"]);
  });

  it("both policies are direct workspace_id membership checks against authenticated", () => {
    for (const table of ["knowledge.rules", "knowledge.workspace_edges"]) {
      const start = codeNoComments.indexOf(`on ${table} for select`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
      expect(block, `${table} policy missing membership check`).toMatch(
        /workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
      );
      expect(block).toMatch(/to authenticated/);
    }
  });

  it("touches neither world_nodes nor world_edges", () => {
    expect(codeNoComments).not.toMatch(/knowledge\.world_nodes/);
    expect(codeNoComments).not.toMatch(/knowledge\.world_edges/);
  });
});

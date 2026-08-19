// Keeps 0113_memory_isolation_policy.sql inside the "one join deeper" shape
// commerce.credits already established (Epic 14): no workspace_id column to check
// directly, so visibility resolves through the property's own current steward.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0113_memory_isolation_policy.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0113_memory_isolation_policy migration", () => {
  it("creates exactly one policy, for memory_versions", () => {
    const created = [...codeNoComments.matchAll(/create policy "([\w\s]+)"\s*\n\s*on (knowledge\.\w+)/g)];
    expect(created.length).toBe(1);
    expect(created[0][2]).toBe("knowledge.memory_versions");
  });

  it("joins through property.properties rather than checking a workspace_id column directly", () => {
    expect(codeNoComments).toMatch(/exists \(\s*\n\s*select 1 from property\.properties p\s*\n\s*where p\.id = memory_versions\.property_id/);
    expect(codeNoComments).toMatch(/p\.steward_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(codeNoComments).toMatch(/to authenticated/);
  });
});

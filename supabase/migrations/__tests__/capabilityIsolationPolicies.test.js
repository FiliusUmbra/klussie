// Keeps 0078_capability_isolation_policies.sql inside this session's own precedent:
// ordinary workspace-scoped isolation for the grant aggregate, unrestricted-to-
// authenticated catalogue visibility matching property.document_types/facet_types.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0078_capability_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0078_capability_isolation_policies migration", () => {
  it("creates exactly six policies", () => {
    const created = [...code.matchAll(/create policy "[^"]+"\s*\n\s*on ([\w.]+)/g)];
    expect(created.length).toBe(6);
  });

  it("capability_grants and capability_grant_history both use a direct workspace_id predicate", () => {
    for (const table of ["capability_grants", "capability_grant_history"]) {
      const start = codeNoComments.indexOf(`create policy "workspace members can view ${table}"`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
      expect(block).toMatch(/workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    }
  });

  it("all four catalogue tables get an unrestricted authenticated-only read policy", () => {
    for (const table of ["capabilities", "capability_dependencies", "capability_presets", "capability_preset_grants"]) {
      const start = codeNoComments.indexOf(`create policy "authenticated can view ${table}"`);
      expect(start, `missing policy for platform.${table}`).toBeGreaterThan(-1);
      const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
      expect(block).toMatch(/on platform\.\w+ for select/);
      expect(block).toMatch(/to authenticated/);
      expect(block).toMatch(/using \(true\)/);
    }
    expect(code).not.toMatch(/to anon/i);
  });

  it("every policy is select-only, to authenticated", () => {
    const policies = [...codeNoComments.matchAll(/create policy "[^"]+"\s*\n\s*on [\w.]+ for (\w+)\s*\n\s*to (\w+)/g)];
    expect(policies.length).toBe(6);
    for (const [, action, role] of policies) {
      expect(action).toBe("select");
      expect(role).toBe("authenticated");
    }
  });
});

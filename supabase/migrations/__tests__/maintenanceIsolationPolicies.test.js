// Keeps 0073_maintenance_isolation_policies.sql inside this session's own precedent:
// ordinary workspace-scoped isolation, no sharing concept, matching
// work.workflow_instances' own shape (migration 0068).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0073_maintenance_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0073_maintenance_isolation_policies migration", () => {
  it("creates exactly two policies, one per table", () => {
    const created = [...code.matchAll(/create policy "([^"]+)"\s*\n\s*on (work\.\w+)/g)];
    expect(created.length).toBe(2);
    expect(created.map((m) => m[2]).sort()).toEqual([
      "work.maintenance_obligations",
      "work.maintenance_schedules",
    ]);
  });

  it("both policies are ordinary workspace membership isolation, no sharing concept", () => {
    for (const table of ["maintenance_schedules", "maintenance_obligations"]) {
      const start = codeNoComments.indexOf(`create policy "workspace members can view ${table}"`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
      expect(block).toMatch(/workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
      expect(block).not.toMatch(/shares?/i);
    }
  });

  it("every policy is select-only, to authenticated", () => {
    const policies = [...codeNoComments.matchAll(/create policy "[^"]+"\s*\n\s*on work\.\w+ for (\w+)\s*\n\s*to (\w+)/g)];
    expect(policies.length).toBe(2);
    for (const [, action, role] of policies) {
      expect(action).toBe("select");
      expect(role).toBe("authenticated");
    }
  });
});

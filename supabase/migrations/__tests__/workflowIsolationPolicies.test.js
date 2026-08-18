// Keeps 0068_workflow_isolation_policies.sql inside §18's isolation rule and this
// session's own precedent: catalog visibility for definitions (workspace_id null or
// membership), ordinary membership for instances, one join deeper for everything that
// hangs off either by definition_id/instance_id rather than carrying its own
// workspace_id.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0068_workflow_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0068_workflow_isolation_policies migration", () => {
  it("creates exactly five policies, one per table", () => {
    const created = [...code.matchAll(/create policy "([^"]+)"\s*\n\s*on (work\.\w+)/g)];
    expect(created.length).toBe(5);
    expect(created.map((m) => m[2]).sort()).toEqual([
      "work.workflow_definitions",
      "work.workflow_instances",
      "work.workflow_stages",
      "work.workflow_transition_rules",
      "work.workflow_transitions",
    ]);
  });

  it("workflow_definitions is visible when workspace_id is null (platform-scoped) or the caller is a member", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view workflow_definitions"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/workspace_id is null/);
    expect(block).toMatch(/workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
  });

  it("workflow_stages and workflow_transition_rules follow definition_id, one join deep, same catalog rule", () => {
    for (const table of ["workflow_stages", "workflow_transition_rules"]) {
      const start = codeNoComments.indexOf(`create policy "workspace members can view ${table}"`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
      expect(block).toMatch(/definition_id in \(/);
      expect(block).toMatch(/d\.workspace_id is null/);
      expect(block).toMatch(/d\.workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    }
  });

  it("workflow_instances is ordinary membership isolation, no sharing concept", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view workflow_instances"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).not.toMatch(/shares?/i);
  });

  it("workflow_transitions follows instance_id, one join deep — no workspace_id column of its own", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view workflow_transitions"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/instance_id in \(/);
    expect(block).toMatch(/i\.workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
  });

  it("every policy is select-only, to authenticated — no anon, no write policy", () => {
    const policies = [...codeNoComments.matchAll(/create policy "[^"]+"\s*\n\s*on work\.\w+ for (\w+)\s*\n\s*to (\w+)/g)];
    expect(policies.length).toBe(5);
    for (const [, action, role] of policies) {
      expect(action).toBe("select");
      expect(role).toBe("authenticated");
    }
  });
});

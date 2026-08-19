// Keeps 0083_service_record_isolation_policies.sql inside §17's own boundary: the core
// is visible through EITHER direct performing-workspace membership OR the property's
// current steward, never a shortcut through one for the other; the performing annex
// never leaks to the property side and vice versa.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0083_service_record_isolation_policies.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0083_service_record_isolation_policies migration", () => {
  it("creates exactly four policies, one per table", () => {
    const created = [...code.matchAll(/create policy "[^"]+"\s*\n\s*on (work\.\w+)/g)];
    expect(created.map((m) => m[1]).sort()).toEqual([
      "work.service_record_amendments",
      "work.service_record_performing_annexes",
      "work.service_record_property_annexes",
      "work.service_records",
    ]);
  });

  it("service_records combines performing_workspace_id membership OR the property's current steward, via or", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view service_records"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/performing_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).toMatch(/\bor\s+property_id in \(/);
    expect(block).toMatch(/p\.steward_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
  });

  it("the performing annex's policy joins only through performing_workspace_id, never property stewardship", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view service_record_performing_annexes"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/sr\.performing_workspace_id in \(/);
    expect(block).not.toMatch(/steward_workspace_id/);
  });

  it("the property annex's policy uses its own frozen owning_workspace_id directly, never joins to service_records or the property", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view service_record_property_annexes"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/owning_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).not.toMatch(/work\.service_records/);
    expect(block).not.toMatch(/property\.properties/);
  });

  it("amendments restate the core's own combined OR predicate, not a narrower or looser shortcut", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view service_record_amendments"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/sr\.performing_workspace_id in \(/);
    expect(block).toMatch(/\bor\s+sr\.property_id in \(/);
    expect(block).toMatch(/p\.steward_workspace_id in \(/);
  });

  it("every policy is select-only, to authenticated", () => {
    const policies = [...codeNoComments.matchAll(/create policy "[^"]+"\s*\n\s*on work\.\w+ for (\w+)\s*\n\s*to (\w+)/g)];
    expect(policies.length).toBe(4);
    for (const [, action, role] of policies) {
      expect(action).toBe("select");
      expect(role).toBe("authenticated");
    }
  });
});

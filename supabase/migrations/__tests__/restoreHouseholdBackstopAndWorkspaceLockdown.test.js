// Keeps 0195_restore_household_backstop_and_workspace_lockdown.sql inside the exact shape
// its own header commits to: recreates 0037's own thirteen-table backstop policy
// byte-identically, and separately revokes authenticated's USAGE on schema workspace --
// nothing else touched. Structural, like every migration test in this repository
// (docs/engineering/TESTING.md §3) -- behaviour is proven against real staging data in the
// PR description, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0195_restore_household_backstop_and_workspace_lockdown.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const TABLES = [
  "pro_profiles", "pro_stats", "pro_services", "portfolio_items", "testimonials",
  "service_requests", "service_request_photos", "conversations", "messages", "reviews",
  "reports", "quotes", "household_items",
];

describe("0195_restore_household_backstop_and_workspace_lockdown migration", () => {
  describe("§1 · the thirteen-table workspace-isolation backstop", () => {
    it("drops and recreates the same-named policy on all thirteen tables", () => {
      for (const table of TABLES) {
        const name = `workspace members can view ${table}`;
        expect(codeNoComments).toMatch(
          new RegExp(`drop policy if exists "${name}" on public\\.${table};`)
        );
        expect(codeNoComments).toMatch(
          new RegExp(`create policy "${name}"\\s*\\n\\s*on public\\.${table} for select`)
        );
      }
    });

    it("every policy is select-only, to authenticated, with the identical uniform predicate", () => {
      const predicate = "workspace_id in (select workspace_id from api.current_workspace_memberships())";
      for (const table of TABLES) {
        const start = codeNoComments.indexOf(`create policy "workspace members can view ${table}"`);
        expect(start).toBeGreaterThan(-1);
        const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
        expect(block).toMatch(/for select\s*\n\s*to authenticated/);
        expect(block).toContain(predicate);
      }
    });

    it("creates exactly thirteen policies, one per table, no more", () => {
      const creates = [...codeNoComments.matchAll(/create policy "workspace members can view/g)];
      expect(creates).toHaveLength(13);
    });
  });

  describe("§2 · revoking authenticated's schema-level reach into workspace", () => {
    it("revokes USAGE on schema workspace from authenticated, and touches no other role", () => {
      expect(codeNoComments).toMatch(/revoke usage on schema workspace from authenticated;/);
      const revokeLines = codeNoComments.split("\n").filter((l) => /^revoke\s/i.test(l.trim()));
      expect(revokeLines).toHaveLength(1);
    });
  });

  it("touches no function, table structure, or other schema's grants", () => {
    expect(codeNoComments).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/i);
    expect(codeNoComments).not.toMatch(/\balter\s+table\b/i);
    expect(codeNoComments).not.toMatch(/\bcreate\s+table\b|\bdrop\s+table\b/i);
    expect(codeNoComments).not.toMatch(/\bgrant\b/i);
  });
});

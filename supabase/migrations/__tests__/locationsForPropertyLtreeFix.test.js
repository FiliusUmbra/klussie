// Fix: property.locations_for_property() (0161) declared its return type as bare
// `ltree` instead of `extensions.ltree` — this codebase's own strict, universal
// convention (0020, 0043, 0044, 0046, 0047, 0121, 0123, 0136) for every other ltree
// reference. Found live applying the migration backlog: `db push` failed with
// "type ltree does not exist" under this function's own `set search_path = ''`.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0170_fix_locations_for_property_ltree_qualification.sql";
const REGRESSED_MIGRATION = "supabase/migrations/0161_scoped_membership_authorization.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0170_fix_locations_for_property_ltree_qualification migration", () => {
  it("declares path as extensions.ltree, not bare ltree", () => {
    expect(codeNoComments).toMatch(/path extensions\.ltree\)/);
    expect(codeNoComments).not.toMatch(/path ltree\)/);
  });

  it("preserves 0161's own scoped-membership OR-branch unchanged — a type fix, not a behaviour change", () => {
    expect(codeNoComments).toMatch(/or l\.property_id in \(select property_id from workspace\.current_property_scope\(\)\)/);
    expect(codeNoComments).toMatch(/where p\.steward_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
  });

  it("keeps the identical search_path/language/volatility clauses 0136 and 0161 both used", () => {
    expect(codeNoComments).toMatch(/language sql\s*\nstable\s*\nset search_path = ''/);
  });

  it("does not touch 0161's own file at all — a new migration, not an edit to a shipped one", () => {
    const regressed = readFileSync(REGRESSED_MIGRATION, "utf8");
    expect(regressed).toMatch(/path ltree\)/); // still there, deliberately — history is not rewritten
  });

  it("changes no grants — the function's own access posture is untouched", () => {
    expect(codeNoComments).not.toMatch(/^grant\b/m);
    expect(codeNoComments).not.toMatch(/^revoke\b/m);
  });
});

// Keeps 0034_backfill_professional_workspace.sql inside ADR-0022 and roadmap §3, and
// inside the dual-role property WP 03.03 already established: this package must add a
// Professional Workspace without touching or duplicating anyone's Personal one.
//
// Structural. The mapping itself is proven against a real and synthetic population by
// supabase/diagnostics/VERIFY_BACKFILL_PROFESSIONAL_WORKSPACE.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0034_backfill_professional_workspace.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0034_backfill_professional_workspace migration", () => {
  it("processes only pro_profiles with no professional owner membership yet", () => {
    expect(code).toMatch(/where i\.erased_at is null\s+and not exists \(/);
    expect(code).not.toMatch(/on conflict/i);
  });

  it("checks for an existing membership joined to a professional workspace specifically", () => {
    // Scoped to type = 'professional', not "any workspace" — otherwise a dual-role person
    // who already has a Personal Workspace from WP 03.03 would be skipped here by mistake,
    // and never gain the Professional one the roadmap requires.
    const existsBlock = codeNoComments.slice(
      codeNoComments.indexOf("not exists ("),
      codeNoComments.indexOf(")\n),")
    );
    expect(existsBlock).toMatch(/w\.type = 'professional'/);
    expect(existsBlock).toMatch(/m\.role = 'owner'/);
  });

  it("joins pro_profiles to identity by auth_user_id, with an inner join", () => {
    // Inner, not left: a pro_profiles row with no matching identity is a data integrity
    // gap WP 03.07's reconciliation exists to catch, not one this backfill should paper
    // over by inventing a workspace for nobody.
    expect(code).toMatch(/join identity\.identities i on i\.auth_user_id = pp\.profile_id/i);
    expect(code).not.toMatch(/left join identity\.identities/i);
  });

  it("names the workspace by business_name, falling back to the person's own name", () => {
    expect(code).toMatch(
      /coalesce\(pp\.business_name, i\.full_name, ''\)/
    );
    expect(codeNoComments).toMatch(/coalesce\(pp\.business_name, i\.full_name, 'My Business'\)/);
  });

  it("mints both identifiers from pro_profiles.created_at, not identity.created_at or now()", () => {
    const mints = [...code.matchAll(/platform\.uuid_v7_at\(([^)]+)\)/g)].map((m) => m[1]);
    expect(mints.length).toBe(2);
    for (const arg of mints) {
      expect(arg).toMatch(/created_at/);
      expect(arg).not.toMatch(/i\.created_at/);
    }
    expect(code).not.toMatch(/uuid_v7_at\(now\(\)\)/);
  });

  it("creates the workspace as type professional, and the membership as role owner, state active", () => {
    expect(codeNoComments).toMatch(/'professional'/);
    expect(codeNoComments).toMatch(/'owner'/);
    expect(codeNoComments).toMatch(/'active'/);
  });

  it("excludes erased identities", () => {
    expect(code).toMatch(/i\.erased_at is null/);
  });

  it("writes nothing to public.pro_profiles or identity", () => {
    // Step 2 of §3: reads the existing table, writes only the new structure.
    expect(code).not.toMatch(/\b(update|delete from)\s+public\.pro_profiles/i);
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+identity\./i);
  });

  it("is a single statement — one CTE chain, not separate transactions", () => {
    const withOccurrences = [...code.matchAll(/^with candidates as \(/gim)];
    expect(withOccurrences).toHaveLength(1);
  });
});

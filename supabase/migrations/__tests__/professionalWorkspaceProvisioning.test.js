// Found while fixing "become a pro" discoverability (UNIFIED_PRODUCT_IA_REVIEW.md §5):
// becoming a pro never created a real Professional Workspace at all — the identical
// gap 0135_personal_workspace_provisioning.sql already found and fixed for the
// Personal Workspace side, four migrations later, for the professional side.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0168_professional_workspace_provisioning.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

describe("0168_professional_workspace_provisioning migration", () => {
  describe("workspace.create_professional_workspace_for_caller() — mirrors create_personal_workspace() (0135)", () => {
    const FN = "workspace.create_professional_workspace_for_caller";

    it("resolves person_ref from auth.uid() itself, never trusts a parameter", () => {
      const block = bodyOf(FN, codeNoComments);
      const paramList = block.slice(0, block.indexOf(")\nreturns"));
      expect(paramList).not.toMatch(/p_person_ref/);
      expect(block).toMatch(/where i\.auth_user_id = auth\.uid\(\)/);
    });

    it("refuses if the caller already has a professional workspace — one per person, matching the personal-workspace invariant", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/w\.type = 'professional'/);
      expect(block).toMatch(/object_not_in_prerequisite_state/);
    });

    it("creates the workspace and its founding owner membership, and emits both real events", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/insert into workspace\.workspaces \(id, type, name, created_at, updated_at\)/);
      expect(block).toMatch(/values \(p_workspace_id, 'professional', p_workspace_name/);
      expect(block).toMatch(/insert into workspace\.memberships/);
      expect(block).toMatch(/'owner', 'active'/);
      expect(block).toMatch(/'workspace\.workspace\.created'/);
      expect(block).toMatch(/'workspace\.membership\.joined'/);
    });

    it("is not SECURITY DEFINER — reachable only through its api.* delegate", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/security definer/);
    });

    it("is revoked from every role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function workspace\.create_professional_workspace_for_caller\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/
      );
    });
  });

  describe("api.become_pro() — composes pro_profiles with the workspace contract, one transaction", () => {
    const FN = "api.become_pro";

    it("is SECURITY DEFINER and delegates the workspace side to work.create_professional_workspace_for_caller()", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/security definer/);
      expect(block).toContain("workspace.create_professional_workspace_for_caller");
    });

    it("refuses a second call for the same caller — checked explicitly, not left to the raw PK violation", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/select 1 from public\.pro_profiles where profile_id = auth\.uid\(\)/);
      expect(block).toMatch(/object_not_in_prerequisite_state/);
    });

    it("inserts into pro_profiles keyed to auth.uid(), the same columns the client's own previous raw insert used", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/insert into public\.pro_profiles \(profile_id, pro_type, business_name, vat_number, bio\)/);
      expect(block).toMatch(/values \(auth\.uid\(\), p_pro_type, p_business_name, p_vat_number, p_bio\)/);
    });

    it("names the workspace with the same coalesce order 0034's own backfill established — business name, then the person's own name, then a placeholder", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/coalesce\(p_business_name, v_full_name, 'My Business'\)/);
    });

    it("is granted to authenticated, revoked from anon/service_role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.become_pro\([^)]*\)\s*\n\s*from public, anon, service_role/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.become_pro\([^)]*\)\s*\n\s*to authenticated/
      );
    });
  });
});

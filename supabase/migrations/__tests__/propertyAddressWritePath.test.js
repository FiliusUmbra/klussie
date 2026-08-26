// Beta-completion slice: 0182-0184 built the disclosure-consent schema and behavior but
// left property.properties' own address columns with no write path and no read exposure
// through api.my_properties(). This migration (0185) closes both. See its own header for
// the full reasoning — this file only verifies the structural guarantees the client
// depends on: the steward-only caller check, the full grant/revoke shape every other
// *_for_caller() contract in this codebase uses, and that api.my_properties() actually
// grew the new columns rather than silently keeping the pre-0182 shape.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0185_property_address_write_path.sql";

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

describe("0185_property_address_write_path migration", () => {
  describe("property.my_properties() / api.my_properties() — grew the address columns", () => {
    it("returns street/house_number/postcode/municipality/country/property_type/quote_prep_notes", () => {
      const block = bodyOf("property.my_properties", codeNoComments);
      for (const col of ["street", "house_number", "postcode", "municipality", "country", "property_type", "quote_prep_notes"]) {
        expect(block).toMatch(new RegExp(`${col}\\s+text`));
      }
    });

    it("never selects latitude/longitude — same restraint as api.matching_requests_for_pro()", () => {
      const block = bodyOf("property.my_properties", codeNoComments);
      expect(block).not.toMatch(/latitude|longitude/);
    });

    it("api.my_properties() stays a thin security definer delegate", () => {
      const block = bodyOf("api.my_properties", codeNoComments);
      expect(block).toMatch(/security definer/);
      expect(block).toMatch(/select \* from property\.my_properties\(\);/);
    });
  });

  describe("property.set_property_address_for_caller() — the write path", () => {
    const FN = "property.set_property_address_for_caller";

    it("resolves the property's own steward workspace and refuses when the property does not exist", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/select steward_workspace_id into v_steward_workspace_id\s*\n\s*from property\.properties where id = p_property_id;/);
      expect(block).toMatch(/if v_steward_workspace_id is null then\s*\n\s*raise exception/);
    });

    it("checks the caller holds a real membership in that steward workspace — no RLS-only assumption", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from workspace\.current_memberships\(\) m where m\.workspace_id = v_steward_workspace_id/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("defaults country to BE but never silently defaults any other field", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/country = coalesce\(p_country, 'BE'\)/);
      expect(block).not.toMatch(/street = coalesce/);
      expect(block).not.toMatch(/postcode = coalesce/);
      expect(block).not.toMatch(/municipality = coalesce/);
    });

    it("has no latitude/longitude parameter — no geocoding provider wired yet", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/p_latitude|p_longitude/);
    });
  });

  describe("api.set_property_address() — grant/revoke shape", () => {
    it("is security definer and revoked from anon/service_role, granted only to authenticated", () => {
      const block = bodyOf("api.set_property_address", codeNoComments);
      expect(block).toMatch(/security definer/);
      expect(codeNoComments).toMatch(
        /revoke all on function api\.set_property_address\([^)]*\) from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.set_property_address\([^)]*\) to authenticated;/
      );
    });

    it("the underlying property.* function is revoked from every client-facing role, including authenticated", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function property\.set_property_address_for_caller\([^)]*\) from public, anon, authenticated, service_role;/
      );
    });
  });
});

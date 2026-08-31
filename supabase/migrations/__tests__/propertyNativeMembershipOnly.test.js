// Keeps 0189_property_native_membership_only.sql inside the exact shape the corrective
// migration's own header commits to: property.my_properties() and
// property.set_property_address_for_caller() both authorize on native (non-engagement-
// derived) membership only, my_properties() returns each eligible property once, neither
// function's signature/ownership/grants moved, and both keep a fixed search_path.
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3) -- behaviour is proven against real staging data by
// supabase/diagnostics/VERIFY_PROPERTY_NATIVE_MEMBERSHIP_ONLY.sql, using synthetic
// fixtures rolled back in a transaction, never real customer data.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0189_property_native_membership_only.sql";

const rawCode = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
// Comments stripped, string literals kept intact -- 0185's own test file convention
// (propertyAddressWritePath.test.js), needed here because several checks below inspect
// literal content ('BE', the comment prose) rather than only SQL keywords.
const codeNoComments = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
// String literals blanked -- only for the negative "does not mention X" checks below,
// where blanking is harmless and avoids a false match inside unrelated prose.
const codeBlanked = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

describe("0189_property_native_membership_only migration", () => {
  describe("property.my_properties()", () => {
    it("keeps the exact same public return contract as 0185", () => {
      const block = bodyOf("property.my_properties");
      for (const col of [
        "id", "name", "jurisdiction", "steward_workspace_id", "steward_since",
        "street", "house_number", "postcode", "municipality", "country", "property_type", "quote_prep_notes",
      ]) {
        expect(block).toMatch(new RegExp(`${col}\\s+(uuid|text|timestamptz)`));
      }
    });

    it("still reuses workspace.current_memberships() -- no new isolation predicate invented", () => {
      const block = bodyOf("property.my_properties");
      expect(block).toMatch(/(from|join) workspace\.current_memberships\(\) m/i);
    });

    it("excludes engagement-derived memberships by provenance, not by role", () => {
      const block = bodyOf("property.my_properties");
      expect(block).toMatch(/wm\.granting_engagement_id is null/i);
      expect(block).not.toMatch(/role\s*(!?=|<>)\s*'(owner|contractor|support)'/i);
      expect(block).not.toMatch(/role\s+(not\s+)?in\s*\(/i);
    });

    it("deduplicates to one row per property", () => {
      const block = bodyOf("property.my_properties");
      expect(block).toMatch(/distinct on\s*\(\s*p\.id\s*\)/i);
      expect(block).toMatch(/order by\s+p\.id\s*,\s*wm\.id desc/i);
    });

    it("never selects latitude/longitude", () => {
      const block = bodyOf("property.my_properties");
      expect(block).not.toMatch(/latitude|longitude/);
    });

    it("keeps a fixed, empty search_path and is not SECURITY DEFINER", () => {
      const block = bodyOf("property.my_properties");
      expect(block).toMatch(/set search_path = ''/);
      expect(block).not.toMatch(/security definer/i);
    });
  });

  describe("property.set_property_address_for_caller()", () => {
    const FN = "property.set_property_address_for_caller";

    it("keeps the exact same parameter signature as 0185", () => {
      const block = bodyOf(FN);
      expect(block).toMatch(/p_property_id\s+uuid/);
      expect(block).toMatch(/p_street\s+text/);
      expect(block).toMatch(/p_house_number\s+text/);
      expect(block).toMatch(/p_postcode\s+text/);
      expect(block).toMatch(/p_municipality\s+text/);
      expect(block).toMatch(/p_country\s+text/);
      expect(block).toMatch(/p_property_type\s+text/);
      expect(block).toMatch(/p_quote_prep_notes\s+text/);
    });

    it("still resolves the property's own steward workspace and refuses when the property does not exist", () => {
      const block = bodyOf(FN);
      expect(block).toMatch(/select steward_workspace_id into v_steward_workspace_id\s*\n\s*from property\.properties where id = p_property_id;/);
      expect(block).toMatch(/if v_steward_workspace_id is null then\s*\n\s*raise exception/);
    });

    it("checks native membership -- workspace.current_memberships() joined against granting_engagement_id is null", () => {
      const block = bodyOf(FN);
      expect(block).toMatch(/from workspace\.current_memberships\(\) m/i);
      expect(block).toMatch(/wm\.granting_engagement_id is null/i);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("still defaults country to BE but never silently defaults any other field", () => {
      const block = bodyOf(FN);
      expect(block).toMatch(/country = coalesce\(p_country, 'BE'\)/);
      expect(block).not.toMatch(/street = coalesce/);
      expect(block).not.toMatch(/postcode = coalesce/);
      expect(block).not.toMatch(/municipality = coalesce/);
    });

    it("keeps a fixed, empty search_path", () => {
      const block = bodyOf(FN);
      expect(block).toMatch(/set search_path = ''/);
    });
  });

  describe("comments describe the enforced rule precisely", () => {
    it("property.my_properties()'s own comment states the native-membership rule", () => {
      expect(rawCode).toMatch(/comment on function property\.my_properties\(\) is/);
      const start = rawCode.indexOf("comment on function property.my_properties() is");
      const block = rawCode.slice(start, rawCode.indexOf(";", start));
      expect(block).toMatch(/native membership/i);
      expect(block).toMatch(/granting_engagement_id/i);
    });

    it("property.set_property_address_for_caller()'s own comment states the native-membership rule", () => {
      expect(rawCode).toMatch(/comment on function property\.set_property_address_for_caller/);
      const start = rawCode.indexOf(
        "comment on function property.set_property_address_for_caller(uuid, text, text, text, text, text, text, text) is"
      );
      expect(start).toBeGreaterThan(-1);
      const block = rawCode.slice(start, rawCode.indexOf(";", start));
      expect(block).toMatch(/native/i);
    });
  });

  describe("ownership, revokes and grants are preserved, not moved", () => {
    it("neither function is granted to anon, authenticated or service_role directly -- unchanged from 0185", () => {
      expect(codeBlanked).toMatch(
        /revoke all on function property\.my_properties\(\) from public, anon, authenticated, service_role;/i
      );
      expect(codeBlanked).toMatch(
        /revoke all on function property\.set_property_address_for_caller\([^)]*\) from public, anon, authenticated, service_role;/i
      );
    });

    it("does not touch api.my_properties() or api.set_property_address() -- the delegates are unedited", () => {
      expect(codeBlanked).not.toMatch(/create (or replace )?function api\.my_properties/i);
      expect(codeBlanked).not.toMatch(/create (or replace )?function api\.set_property_address/i);
    });

    it("does not touch 0188's own function or any unrelated schema object", () => {
      expect(codeBlanked).not.toMatch(/list_my_workspaces/i);
      expect(codeBlanked).not.toMatch(/create schema|drop schema|create table|drop table/i);
    });
  });
});

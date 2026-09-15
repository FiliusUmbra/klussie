// Home foundation slice — property.properties grows `kind` so a one-time service address
// (requests.js's resolveRequestLocation(), 'one_time_address') never resurfaces as a
// reusable "saved property" in ServiceLocationField.jsx or any future property switcher.
// See 0225's own header for the full reasoning — this file verifies the structural
// guarantees the client depends on, the same static-source-text discipline
// propertyAddressWritePath.test.js already established for 0185.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0225_property_kind_and_multi_property.sql";

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

describe("0225_property_kind_and_multi_property migration", () => {
  it("adds kind with a home/one_time check constraint, defaulting to home", () => {
    expect(codeNoComments).toMatch(/add column if not exists kind text not null default 'home'/);
    expect(codeNoComments).toMatch(/check \(kind in \('home', 'one_time'\)\)/);
  });

  it("backfills every existing one-time-address row by its known hardcoded name", () => {
    expect(codeNoComments).toMatch(
      /update property\.properties\s*\n\s*set kind = 'one_time'\s*\n\s*where name = 'Eenmalig serviceadres' and kind = 'home';/
    );
  });

  describe("property.create_property() — kind added, additive", () => {
    it("takes an optional p_kind defaulting to 'home', as the trailing parameter", () => {
      const block = bodyOf("property.create_property", codeNoComments);
      expect(block).toMatch(/p_kind\s+text default 'home'/);
    });

    it("writes kind into the insert and the emitted event payload", () => {
      const block = bodyOf("property.create_property", codeNoComments);
      expect(block).toMatch(/insert into property\.properties \(id, name, kind, steward_workspace_id/);
      expect(block).toMatch(/values \(p_property_id, p_name, p_kind,/);
      expect(block).toMatch(/jsonb_build_object\('name', p_name, 'kind', p_kind\)/);
    });
  });

  describe("property.create_property_for_caller() / api.create_property() — kind threaded through", () => {
    it("both keep the steward-membership check ahead of the delegate call", () => {
      const block = bodyOf("property.create_property_for_caller", codeNoComments);
      expect(block).toMatch(/from workspace\.current_memberships\(\) m where m\.workspace_id = p_steward_workspace_id/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("api.create_property() stays a thin security definer delegate, passing p_kind along", () => {
      const block = bodyOf("api.create_property", codeNoComments);
      expect(block).toMatch(/security definer/);
      expect(block).toMatch(/p_actor_type, p_actor_ref, p_kind\s*\n\s*\);/);
    });

    it("grant/revoke shape matches every other *_for_caller() write contract", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function property\.create_property_for_caller\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role;/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function api\.create_property\([^)]*\)\s*\n\s*from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_property\([^)]*\)\s*\n\s*to authenticated;/
      );
    });
  });

  describe("property.my_properties() / api.my_properties() — filtered to kind = 'home'", () => {
    it("only ever selects home-kind rows", () => {
      const block = bodyOf("property.my_properties", codeNoComments);
      expect(block).toMatch(/where p\.kind = 'home';/);
    });

    it("kept its exact 0185 return shape (no drop/recreate needed for a body-only change)", () => {
      const block = bodyOf("property.my_properties", codeNoComments);
      for (const col of ["street", "house_number", "postcode", "municipality", "country", "property_type", "quote_prep_notes"]) {
        expect(block).toMatch(new RegExp(`${col}\\s+text`));
      }
      expect(codeNoComments).not.toMatch(/drop function if exists (api|property)\.my_properties\(\)/);
    });

    it("api.my_properties() stays the same thin delegate", () => {
      const block = bodyOf("api.my_properties", codeNoComments);
      expect(block).toMatch(/security definer/);
      expect(block).toMatch(/select \* from property\.my_properties\(\);/);
    });
  });
});

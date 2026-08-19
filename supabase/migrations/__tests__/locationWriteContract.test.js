// Keeps 0140_location_write_contract.sql (Platform Activation Slice 1, WP 1.5) inside its
// own stated rules: a real, self-contained authorization check resolved from the actual
// target property (never trusted from p_property_id alone when a parent is given — the
// hazard 0044's own path-inheriting trigger creates), one generic exception, path left
// entirely to the existing trigger, and the logic function reachable only through its
// api.* delegate.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0140_location_write_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0140_location_write_contract migration", () => {
  describe("property.create_location()", () => {
    const block = bodyOf("property.create_location", codeNoComments);

    it("is not SECURITY DEFINER — it inherits the delegate's context", () => {
      expect(block).not.toMatch(/security definer/i);
    });

    it("resolves the real target property from p_parent_id before checking anything, rather than trusting p_property_id alone", () => {
      expect(block).toMatch(/if p_parent_id is not null then/);
      expect(block).toMatch(/select l\.property_id into v_target_property_id\s*\n\s*from property\.locations l\s*\n\s*where l\.id = p_parent_id/);
      expect(block).toMatch(/v_target_property_id := p_property_id/);
    });

    it("checks caller membership against the resolved property, not the raw parameter", () => {
      expect(block).toMatch(/where p\.id = v_target_property_id/);
      expect(block).not.toMatch(/where p\.id = p_property_id/);
    });

    it("raises one generic exception, not a distinguishing message", () => {
      expect(block).toMatch(/if v_steward_workspace_id is null then/);
      expect(block).toMatch(/errcode = 'insufficient_privilege'/);
      expect(block).not.toMatch(/no such/i);
    });

    it("inserts only id/property_id/parent_id/name/type — never computes path itself", () => {
      expect(block).toMatch(
        /insert into property\.locations \(id, property_id, parent_id, name, type, created_at, updated_at\)/
      );
      expect(block).not.toMatch(/\bpath\b/);
      expect(block).not.toMatch(/extensions\.ltree/);
    });

    it("inserts the resolved property id, not the raw parameter", () => {
      expect(block).toMatch(/values \(p_location_id, v_target_property_id, p_parent_id, p_name, p_type, now\(\), now\(\)\)/);
    });

    it("emits property.location.created", () => {
      expect(block).toMatch(/p_event_type\s+=> 'property\.location\.created'/);
      expect(block).toMatch(/p_subject_type\s+=> 'location'/);
    });
  });

  describe("api.create_location()", () => {
    it("is a thin SECURITY DEFINER pass-through calling property.create_location() and nothing else", () => {
      const block = bodyOf("api.create_location", codeNoComments);
      expect(block).toMatch(/security definer/i);
      expect(block).toMatch(/select property\.create_location\(/);
    });
  });

  describe("access", () => {
    it("revokes property.create_location() from every role, including authenticated — reachable only as a nested call", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function property\.create_location\(uuid, uuid, uuid, text, text, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, authenticated, service_role/
      );
    });

    it("grants api.create_location() to authenticated only, after an explicit revoke from public/anon/service_role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.create_location\(uuid, uuid, uuid, text, text, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, service_role/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_location\(uuid, uuid, uuid, text, text, uuid, uuid, platform\.actor_type, text\)\s*to authenticated/
      );
    });

    it("does not re-grant USAGE on schema api — already granted in 0031", () => {
      expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
    });

    it("does not build update_location(), a reparent wrapper, or retire_location() — named as deferred, not silently omitted", () => {
      expect(codeNoComments).not.toMatch(/create or replace function (property|api)\.update_location/);
      expect(codeNoComments).not.toMatch(/create or replace function (property|api)\.retire_location/);
      expect(codeNoComments).not.toMatch(/create or replace function api\.reparent_location/);
    });
  });
});

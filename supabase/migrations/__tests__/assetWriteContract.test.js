// Keeps 0139_asset_write_contract.sql (Platform Activation Slice 1, WP 1.4) inside its
// own stated rules: each of create/update/retire/dispose carries a real, self-contained
// authorization check (unlike property.create_property() or the maintenance write
// functions, both engine-internal), one generic exception covers both "no such row" and
// "not yours" everywhere, lifecycle transitions are gated by their own state invariants,
// and every logic function is reachable only through its api.* delegate.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0139_asset_write_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0139_asset_write_contract migration", () => {
  describe("property.create_asset()", () => {
    const block = bodyOf("property.create_asset", codeNoComments);

    it("is not SECURITY DEFINER — it inherits the delegate's context", () => {
      expect(block).not.toMatch(/security definer/i);
    });

    it("checks the caller's real membership via the property's own steward workspace", () => {
      expect(block).toMatch(
        /join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/
      );
    });

    it("raises one generic exception for an unauthorized or nonexistent property, not a distinguishing message", () => {
      expect(block).toMatch(/if v_steward_workspace_id is null then/);
      expect(block).toMatch(/errcode = 'insufficient_privilege'/);
      expect(block).not.toMatch(/no such property/i);
    });

    it("defaults source to 'manual' when not given", () => {
      expect(block).toMatch(/coalesce\(p_source, 'manual'\)/);
    });

    it("sets placed_since only when a location is actually given", () => {
      expect(block).toMatch(/case when p_location_id is not null then now\(\) end/);
    });

    it("emits property.asset.created", () => {
      expect(block).toMatch(/p_event_type\s+=> 'property\.asset\.created'/);
      expect(block).toMatch(/p_subject_type\s+=> 'asset'/);
    });
  });

  describe("property.update_asset()", () => {
    const block = bodyOf("property.update_asset", codeNoComments);

    it("is not SECURITY DEFINER", () => {
      expect(block).not.toMatch(/security definer/i);
    });

    it("checks the caller's real membership via the asset's own property's steward workspace", () => {
      expect(block).toMatch(/join property\.properties p on p\.id = a\.property_id/);
      expect(block).toMatch(
        /join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/
      );
    });

    it("never touches lifecycle_state, source, ai_suggestion, location_id, or placed_since", () => {
      expect(block).not.toMatch(/lifecycle_state\s*=/);
      expect(block).not.toMatch(/\bsource\s*=/);
      expect(block).not.toMatch(/ai_suggestion\s*=/);
      expect(block).not.toMatch(/location_id\s*=/);
      expect(block).not.toMatch(/placed_since\s*=/);
    });

    it("emits property.asset.updated", () => {
      expect(block).toMatch(/p_event_type\s+=> 'property\.asset\.updated'/);
    });
  });

  describe("property.retire_asset()", () => {
    const block = bodyOf("property.retire_asset", codeNoComments);

    it("is not SECURITY DEFINER", () => {
      expect(block).not.toMatch(/security definer/i);
    });

    it("only transitions from active, rejecting every other current state", () => {
      expect(block).toMatch(/if v_lifecycle_state <> 'active' then/);
      expect(block).toMatch(/errcode = 'object_not_in_prerequisite_state'/);
    });

    it("sets lifecycle_state to retired and emits property.asset.retired", () => {
      expect(block).toMatch(/set lifecycle_state = 'retired'/);
      expect(block).toMatch(/p_event_type\s+=> 'property\.asset\.retired'/);
    });
  });

  describe("property.dispose_asset()", () => {
    const block = bodyOf("property.dispose_asset", codeNoComments);

    it("is not SECURITY DEFINER", () => {
      expect(block).not.toMatch(/security definer/i);
    });

    it("rejects only an already-disposed asset — active or retired are both valid starting states", () => {
      expect(block).toMatch(/if v_lifecycle_state = 'disposed' then/);
      expect(block).not.toMatch(/v_lifecycle_state <> 'active' and v_lifecycle_state <> 'retired'/);
    });

    it("sets lifecycle_state to disposed, reports the previous state, and emits property.asset.disposed", () => {
      expect(block).toMatch(/set lifecycle_state = 'disposed'/);
      expect(block).toMatch(/p_event_type\s+=> 'property\.asset\.disposed'/);
      expect(block).toMatch(/'previousState', v_lifecycle_state/);
    });
  });

  describe("the four api.* delegates", () => {
    for (const fn of ["create_asset", "update_asset", "retire_asset", "dispose_asset"]) {
      it(`api.${fn}() is a thin SECURITY DEFINER pass-through calling property.${fn}() and nothing else`, () => {
        const block = bodyOf(`api.${fn}`, codeNoComments);
        expect(block).toMatch(/security definer/i);
        expect(block).toMatch(new RegExp(`select property\\.${fn}\\(`));
      });
    }
  });

  describe("access", () => {
    it("revokes every property.* logic function from public/anon/authenticated/service_role — reachable only as a nested call", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function property\.create_asset\([^)]*\)\s*from public, anon, authenticated, service_role/s
      );
      expect(codeNoComments).toMatch(
        /revoke all on function property\.update_asset\([^)]*\)\s*from public, anon, authenticated, service_role/s
      );
      expect(codeNoComments).toMatch(
        /revoke all on function property\.retire_asset\(uuid, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, authenticated, service_role/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function property\.dispose_asset\(uuid, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, authenticated, service_role/
      );
    });

    it("grants every api.* delegate to authenticated only, after an explicit revoke from public/anon/service_role", () => {
      for (const fn of ["create_asset", "update_asset", "retire_asset", "dispose_asset"]) {
        expect(codeNoComments).toMatch(new RegExp(`revoke all on function api\\.${fn}\\(`));
        expect(codeNoComments).toMatch(new RegExp(`grant execute on function api\\.${fn}\\([^;]*\\)\\s*to authenticated`, "s"));
      }
    });

    it("does not re-grant USAGE on schema api — already granted in 0031", () => {
      expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
    });

    it("does not touch property.assets' own table-level grants — 0048's UPDATE grant already stands", () => {
      expect(codeNoComments).not.toMatch(/grant update on property\.assets/);
      expect(codeNoComments).not.toMatch(/grant insert on property\.assets/);
    });
  });
});

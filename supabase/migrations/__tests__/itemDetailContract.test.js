// Keeps 0201_item_detail_contract.sql inside the exact shape its own header commits to:
// move_asset_for_caller() is the first real writer of property.asset_placements (0048),
// checks caller membership over the asset's own property, refuses a target room outside
// that property, only closes a placement when one actually existed and actually changed,
// and my_service_records() gains an optional, additive p_asset_id filter without
// widening what any existing caller could already see. Structural, like every migration
// test in this repository (docs/engineering/TESTING.md §3) — behaviour is proven against
// real staging data by VERIFY_ITEM_DETAIL_CONTRACT.sql, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0201_item_detail_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

describe("0201_item_detail_contract migration", () => {
  describe("property.move_asset_for_caller()", () => {
    const SIGNATURE =
      "property.move_asset_for_caller(\n  p_asset_id        uuid,\n  p_location_id     uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)";

    it("checks caller membership against the asset's own resolved property", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("refuses a target location outside the asset's own property", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/v_target_property_id is distinct from v_asset_property_id/);
    });

    it("allows a null location_id -- an item can be unplaced, not only moved", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/if p_location_id is not null then/);
    });

    it("closes the previous placement into asset_placements only when one existed and actually changed", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/if v_previous_location_id is not null and v_previous_location_id is distinct from p_location_id then/);
      expect(block).toMatch(/insert into property\.asset_placements \(id, asset_id, location_id, began_at, ended_at\)/);
    });

    it("uses clock_timestamp(), not now(), for began_at/ended_at/placed_since -- a real same-transaction collision the diagnostic caught", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/v_previous_placed_since, clock_timestamp\(\)\)/);
      expect(block).toMatch(/placed_since = case when p_location_id is not null then clock_timestamp\(\) else null end/);
    });

    it("updates the asset's current pointer, clearing placed_since when unplacing", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/update property\.assets/);
      expect(block).toMatch(/location_id = p_location_id/);
    });

    it("emits property.asset.moved", () => {
      expect(codeNoComments).toMatch(/p_event_type\s+=> 'property\.asset\.moved'/);
    });
  });

  describe("api.move_asset()", () => {
    it("delegates to property.move_asset_for_caller() with the same parameters", () => {
      const block = bodyOf(
        "api.move_asset(\n  p_asset_id        uuid,\n  p_location_id     uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(block).toMatch(/select property\.move_asset_for_caller\(/);
    });

    it("is revoked from anon/service_role and granted only to authenticated", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.move_asset\(uuid, uuid, uuid, uuid, platform\.actor_type, text\)\s*\n\s*from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.move_asset\(uuid, uuid, uuid, uuid, platform\.actor_type, text\)\s*\n\s*to authenticated;/
      );
    });
  });

  describe("work.my_service_records() / api.my_service_records() asset filter", () => {
    it("adds an optional, default-null p_asset_id parameter", () => {
      expect(codeNoComments).toMatch(
        /create or replace function work\.my_service_records\(p_workspace_id uuid, p_asset_id uuid default null\)/
      );
      expect(codeNoComments).toMatch(
        /create or replace function api\.my_service_records\(p_workspace_id uuid, p_asset_id uuid default null\)/
      );
    });

    it("narrows the existing workspace predicate with AND, never replacing it", () => {
      const block = bodyOf("work.my_service_records(p_workspace_id uuid, p_asset_id uuid default null)");
      expect(block).toMatch(/sr\.performing_workspace_id = p_workspace_id/);
      expect(block).toMatch(/and \(p_asset_id is null or sr\.asset_id = p_asset_id\)/);
    });

    it("returns asset_id and warranty_until so Item Detail needs no per-row resolve call", () => {
      expect(codeNoComments).toMatch(
        /returns table \(\s*\n\s*id uuid, property_id uuid, asset_id uuid, performing_workspace_id uuid,\s*\n\s*performed_at timestamptz, work_performed text, warranty_until date\s*\n\s*\)/
      );
    });

    it("drops the old single-parameter overload rather than leaving it alongside the new one", () => {
      expect(codeNoComments).toMatch(/drop function if exists work\.my_service_records\(uuid\);/);
      expect(codeNoComments).toMatch(/drop function if exists api\.my_service_records\(uuid\);/);
    });
  });
});

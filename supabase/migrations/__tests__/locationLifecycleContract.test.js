// Keeps 0198_location_lifecycle_contract.sql inside the exact shape its own header
// commits to: rename/retire/reparent each check the caller's real membership in the
// location's own property, retire refuses on an active child or active asset, and
// reparent wraps the existing, untouched property.reparent_location() rather than
// re-deriving its logic. Structural, like every migration test in this repository
// (docs/engineering/TESTING.md §3) -- behaviour is proven against real staging data by
// VERIFY_LOCATION_LIFECYCLE_CONTRACT.sql, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0198_location_lifecycle_contract.sql";

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

const MEMBERSHIP_CHECK = /join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/;

describe("0198_location_lifecycle_contract migration", () => {
  describe("property.rename_location_for_caller()", () => {
    it("checks caller membership against the location's own resolved property", () => {
      const block = bodyOf(
        "property.rename_location_for_caller(\n  p_location_id     uuid,\n  p_name            text,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(block).toMatch(MEMBERSHIP_CHECK);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("updates only name and updated_at -- no other column", () => {
      const start = codeNoComments.indexOf("update property.locations set name");
      expect(start).toBeGreaterThan(-1);
      const line = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
      expect(line).toMatch(/name = p_name, updated_at = now\(\)/);
    });

    it("emits property.location.renamed", () => {
      expect(codeNoComments).toMatch(/p_event_type\s+=> 'property\.location\.renamed'/);
    });
  });

  describe("property.retire_location_for_caller()", () => {
    it("checks caller membership, and refuses an already-retired location", () => {
      const block = bodyOf(
        "property.retire_location_for_caller(\n  p_location_id     uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(block).toMatch(MEMBERSHIP_CHECK);
      expect(block).toMatch(/v_already_retired/);
      expect(block).toMatch(/object_not_in_prerequisite_state/);
    });

    it("refuses when an active (non-retired) child location still exists", () => {
      const block = bodyOf(
        "property.retire_location_for_caller(\n  p_location_id     uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(block).toMatch(/l\.parent_id = p_location_id and l\.retired_at is null/);
    });

    it("refuses when an active asset is still placed in it", () => {
      const block = bodyOf(
        "property.retire_location_for_caller(\n  p_location_id     uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(block).toMatch(/a\.location_id = p_location_id and a\.lifecycle_state = 'active'/);
    });

    it("sets retired_at, never deletes the row", () => {
      expect(codeNoComments).toMatch(/update property\.locations set retired_at = now\(\), updated_at = now\(\)/);
      expect(codeNoComments).not.toMatch(/delete from property\.locations/i);
    });

    it("emits property.location.retired", () => {
      expect(codeNoComments).toMatch(/p_event_type\s+=> 'property\.location\.retired'/);
    });
  });

  describe("property.reparent_location_for_caller()", () => {
    it("checks caller membership against the location's CURRENT property before calling the existing function", () => {
      const block = bodyOf(
        "property.reparent_location_for_caller(\n  p_location_id     uuid,\n  p_new_parent_id   uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(block).toMatch(MEMBERSHIP_CHECK);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("delegates entirely to property.reparent_location(), never re-deriving its ltree logic", () => {
      const block = bodyOf(
        "property.reparent_location_for_caller(\n  p_location_id     uuid,\n  p_new_parent_id   uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(block).toMatch(/perform property\.reparent_location\(/);
      expect(codeNoComments).not.toMatch(/extensions\.ltree|extensions\.subpath|extensions\.nlevel/);
    });

    it("does not redefine property.reparent_location() itself -- it stays completely untouched", () => {
      expect(codeNoComments).not.toMatch(/create (or replace )?function property\.reparent_location\(p_location_id/);
    });
  });

  describe("api.* delegates", () => {
    const delegates = [
      { sig: "api.rename_location(uuid, text, uuid, uuid, platform.actor_type, text)", calls: "property.rename_location_for_caller" },
      { sig: "api.retire_location(uuid, uuid, uuid, platform.actor_type, text)", calls: "property.retire_location_for_caller" },
      { sig: "api.reparent_location(uuid, uuid, uuid, uuid, platform.actor_type, text)", calls: "property.reparent_location_for_caller" },
    ];

    it("each delegate is re-granted to authenticated only, never anon", () => {
      for (const { sig } of delegates) {
        const escaped = sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expect(codeNoComments).toMatch(new RegExp(`revoke all on function ${escaped} from public, anon, service_role;`));
        expect(codeNoComments).toMatch(new RegExp(`grant execute on function ${escaped} to authenticated;`));
      }
    });

    it("each delegate calls its own _for_caller wrapper, nothing lower-level directly", () => {
      for (const { calls } of delegates) {
        expect(codeNoComments).toMatch(new RegExp(`select ${calls.replace(".", "\\.")}\\(`));
      }
    });
  });

  it("touches no table structure and no RLS policy", () => {
    expect(codeNoComments).not.toMatch(/\bcreate table\b|\bdrop table\b|\balter table\b/i);
    expect(codeNoComments).not.toMatch(/create policy|drop policy/i);
  });
});

// Keeps 0203_maintenance_obligation_resolution.sql inside its own stated shape:
// work.complete_maintenance_obligation()/cancel_maintenance_obligation() (0074) have no
// authorization check at all -- this migration's whole job is the same "_for_caller"
// membership-gate wrapper this codebase has now established twice
// (work.create_manual_maintenance_obligation, 0142; property.move_asset_for_caller,
// 0201), delegating to the raw functions unchanged. Structural, like every migration test
// in this repository (docs/engineering/TESTING.md §3) — behaviour is proven against real
// staging data by live verification, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0203_maintenance_obligation_resolution.sql";

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

describe("0203_maintenance_obligation_resolution migration", () => {
  describe("work.complete_maintenance_obligation_for_caller()", () => {
    const SIGNATURE =
      "work.complete_maintenance_obligation_for_caller(\n  p_obligation_id   uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)";

    it("resolves the obligation's own workspace_id rather than trusting a client-supplied one", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/select workspace_id into v_workspace_id\s*\n\s*from work\.maintenance_obligations\s*\n\s*where id = p_obligation_id;/);
    });

    it("raises the identical error whether the obligation does not exist or the caller just isn't a member", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/if v_workspace_id is null or not exists \(/);
      expect(block).toMatch(/select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = v_workspace_id/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("delegates to the existing raw function, unmodified", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/perform work\.complete_maintenance_obligation\(p_obligation_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref\);/);
    });
  });

  describe("work.cancel_maintenance_obligation_for_caller()", () => {
    const SIGNATURE =
      "work.cancel_maintenance_obligation_for_caller(\n  p_obligation_id   uuid,\n  p_reason          text,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)";

    it("checks membership before ever reaching the reason-required logic in the function it calls", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/insufficient_privilege/);
      expect(block).toMatch(/perform work\.cancel_maintenance_obligation\(p_obligation_id, p_reason, p_event_id, p_correlation_id, p_actor_type, p_actor_ref\);/);
    });

    it("does not itself re-validate the reason -- that stays work.cancel_maintenance_obligation()'s own job", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).not.toMatch(/btrim\(p_reason\)/);
    });
  });

  describe("api.complete_maintenance_obligation() / api.cancel_maintenance_obligation()", () => {
    it("both delegate to their own *_for_caller() wrapper with the same parameters", () => {
      const completeBlock = bodyOf(
        "api.complete_maintenance_obligation(\n  p_obligation_id   uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(completeBlock).toMatch(/select work\.complete_maintenance_obligation_for_caller\(/);

      const cancelBlock = bodyOf(
        "api.cancel_maintenance_obligation(\n  p_obligation_id   uuid,\n  p_reason          text,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)"
      );
      expect(cancelBlock).toMatch(/select work\.cancel_maintenance_obligation_for_caller\(/);
    });

    it("are revoked from anon/service_role and granted only to authenticated", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.complete_maintenance_obligation\(uuid, uuid, uuid, platform\.actor_type, text\)\s*\n\s*from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.complete_maintenance_obligation\(uuid, uuid, uuid, platform\.actor_type, text\)\s*\n\s*to authenticated;/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function api\.cancel_maintenance_obligation\(uuid, text, uuid, uuid, platform\.actor_type, text\)\s*\n\s*from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.cancel_maintenance_obligation\(uuid, text, uuid, uuid, platform\.actor_type, text\)\s*\n\s*to authenticated;/
      );
    });
  });

  describe("my_maintenance_obligations() read extension", () => {
    it("drops both old same-signature functions before recreating them with the new column", () => {
      expect(codeNoComments).toMatch(/drop function if exists work\.my_maintenance_obligations\(uuid\);/);
      expect(codeNoComments).toMatch(/drop function if exists api\.my_maintenance_obligations\(uuid\);/);
    });

    it("returns cancellation_reason, present in the table since 0072 but never read back before this", () => {
      expect(codeNoComments).toMatch(
        /returns table \(\s*\n\s*id\s+uuid,\s*\n\s*asset_id\s+uuid,\s*\n\s*location_id\s+uuid,\s*\n\s*schedule_id\s+uuid,\s*\n\s*title\s+text,\s*\n\s*description\s+text,\s*\n\s*source\s+text,\s*\n\s*due_on\s+date,\s*\n\s*status\s+text,\s*\n\s*is_overdue\s+boolean,\s*\n\s*completed_at\s+timestamptz,\s*\n\s*cancelled_at\s+timestamptz,\s*\n\s*cancellation_reason\s+text\s*\n\s*\)/
      );
      expect(codeNoComments).toMatch(/o\.completed_at, o\.cancelled_at, o\.cancellation_reason/);
    });

    it("keeps the existing membership check unchanged", () => {
      expect(codeNoComments).toMatch(/exists \(select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_workspace_id\)/);
    });

    it("re-declares the same grant shape after the drop-and-recreate", () => {
      expect(codeNoComments).toMatch(/revoke all on function api\.my_maintenance_obligations\(uuid\) from public, anon, service_role;/);
      expect(codeNoComments).toMatch(/grant execute on function api\.my_maintenance_obligations\(uuid\) to authenticated;/);
    });
  });

  describe("the raw work-layer functions and their existing grant are left untouched", () => {
    it("never redefines or re-grants work.complete_maintenance_obligation()/cancel_maintenance_obligation() themselves", () => {
      expect(codeNoComments).not.toMatch(/create or replace function work\.complete_maintenance_obligation\(\s*\n\s*p_obligation_id/);
      expect(codeNoComments).not.toMatch(/to klussie_engine_work/);
    });

    it("both new *_for_caller() wrappers are revoked from every real role, reachable only via the api.* delegate", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.complete_maintenance_obligation_for_caller\(uuid, uuid, uuid, platform\.actor_type, text\)\s*\n\s*from public, anon, authenticated, service_role;/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function work\.cancel_maintenance_obligation_for_caller\(uuid, text, uuid, uuid, platform\.actor_type, text\)\s*\n\s*from public, anon, authenticated, service_role;/
      );
    });
  });
});

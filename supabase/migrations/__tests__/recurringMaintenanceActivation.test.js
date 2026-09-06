// Keeps 0205_recurring_maintenance_activation.sql inside its own stated shape: real
// membership- and subject-checked write delegates for create/cancel schedule (0074's own
// logic functions untouched), a schedule-shaped generation log (never reusing the
// event-shaped platform.consumer_quarantine), a SECURITY DEFINER generation delegate
// that mints its own ids the same way this codebase's only two real background jobs
// (0162, 0169) already do, and the exact pg_cron/`set role` mechanism 0162 verified
// live against this hosting platform. Structural, like every migration test in this
// repository (docs/engineering/TESTING.md §3) — behaviour is proven against real
// staging data by live verification, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0205_recurring_maintenance_activation.sql";

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

const CREATE_SIGNATURE =
  "work.create_maintenance_schedule_for_caller(\n  p_schedule_id               uuid,\n  p_workspace_id              uuid,\n  p_asset_id                  uuid,\n  p_location_id               uuid,\n  p_title                     text,\n  p_description               text,\n  p_recurrence                interval,\n  p_first_due_on              date,\n  p_seed_obligation_id        uuid,\n  p_schedule_event_id         uuid,\n  p_seed_obligation_event_id  uuid,\n  p_correlation_id            uuid,\n  p_actor_type                platform.actor_type,\n  p_actor_ref                 text\n)";

const CANCEL_SIGNATURE =
  "work.cancel_maintenance_schedule_for_caller(\n  p_schedule_id     uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)";

describe("0205_recurring_maintenance_activation migration", () => {
  describe("work.create_maintenance_schedule_for_caller()", () => {
    it("checks caller membership, excluding a support-role grant", () => {
      const block = bodyOf(CREATE_SIGNATURE);
      expect(block).toMatch(/select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_workspace_id and m\.role <> 'support'/);
    });

    it("refuses a given asset or location not stewarded by the workspace", () => {
      const block = bodyOf(CREATE_SIGNATURE);
      expect(block).toMatch(/if p_asset_id is not null and not exists \(/);
      expect(block).toMatch(/where a\.id = p_asset_id and p\.steward_workspace_id = p_workspace_id/);
      expect(block).toMatch(/if p_location_id is not null and not exists \(/);
      expect(block).toMatch(/where l\.id = p_location_id and p\.steward_workspace_id = p_workspace_id/);
    });

    it("delegates to the unmodified work.create_maintenance_schedule()", () => {
      const block = bodyOf(CREATE_SIGNATURE);
      expect(block).toMatch(/perform work\.create_maintenance_schedule\(/);
    });

    it("seeds the first occurrence only when it is already due, through the unmodified work.generate_due_obligation()", () => {
      const block = bodyOf(CREATE_SIGNATURE);
      expect(block).toMatch(/if p_first_due_on <= current_date then/);
      expect(block).toMatch(/perform work\.generate_due_obligation\(/);
    });
  });

  describe("work.cancel_maintenance_schedule_for_caller()", () => {
    it("resolves the workspace from the schedule row before checking, never trusting a co-supplied id", () => {
      const block = bodyOf(CANCEL_SIGNATURE);
      expect(block).toMatch(/select workspace_id into v_workspace_id\s*\n\s*from work\.maintenance_schedules\s*\n\s*where id = p_schedule_id;/);
    });

    it("checks membership, excluding support, collapsing 'does not exist' and 'not yours' into the same error", () => {
      const block = bodyOf(CANCEL_SIGNATURE);
      expect(block).toMatch(/if v_workspace_id is null or not exists \(/);
      expect(block).toMatch(/m\.role <> 'support'/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("delegates to the unmodified work.cancel_maintenance_schedule(), never touching any obligation", () => {
      const block = bodyOf(CANCEL_SIGNATURE);
      expect(block).toMatch(/perform work\.cancel_maintenance_schedule\(p_schedule_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref\);/);
      expect(block).not.toMatch(/maintenance_obligations/);
    });
  });

  describe("api.create_maintenance_schedule() / api.cancel_maintenance_schedule()", () => {
    it("both delegate to their own *_for_caller() wrapper with every parameter unchanged", () => {
      expect(codeNoComments).toMatch(/select work\.create_maintenance_schedule_for_caller\(/);
      expect(codeNoComments).toMatch(/select work\.cancel_maintenance_schedule_for_caller\(/);
    });

    it("are revoked from anon/service_role and granted only to authenticated", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.create_maintenance_schedule\([^)]+\)\s*\n\s*from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_maintenance_schedule\([^)]+\)\s*\n\s*to authenticated;/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function api\.cancel_maintenance_schedule\(uuid, uuid, uuid, platform\.actor_type, text\)\s*\n\s*from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.cancel_maintenance_schedule\(uuid, uuid, uuid, platform\.actor_type, text\)\s*\n\s*to authenticated;/
      );
    });
  });

  describe("work.maintenance_generation_log", () => {
    it("is a schedule-shaped log, not a reuse of the event-shaped consumer_quarantine", () => {
      expect(codeNoComments).toMatch(/create table if not exists work\.maintenance_generation_log/);
      expect(codeNoComments).toMatch(/schedule_id\s+uuid\s+not null/);
      expect(codeNoComments).toMatch(/outcome\s+text\s+not null/);
      expect(codeNoComments).toMatch(/check \(outcome in \('generated', 'failed'\)\)/);
    });

    it("requires a failure_reason exactly when the outcome is failed", () => {
      expect(codeNoComments).toMatch(/check \(\(outcome = 'failed'\) = \(failure_reason is not null\)\)/);
    });

    it("enables RLS with no policy and is revoked from every real application role, matching consumer_cursors/consumer_quarantine's own posture", () => {
      expect(codeNoComments).toMatch(/alter table work\.maintenance_generation_log enable row level security;/);
      expect(codeNoComments).toMatch(/revoke all on work\.maintenance_generation_log from anon, authenticated, service_role;/);
    });
  });

  describe("work.run_maintenance_schedule_generation()", () => {
    const SIGNATURE = "work.run_maintenance_schedule_generation()";

    it("is SECURITY DEFINER", () => {
      const start = codeNoComments.indexOf(`create or replace function ${SIGNATURE}`);
      const end = codeNoComments.indexOf("as $$", start);
      const declBlock = codeNoComments.slice(start, end);
      expect(declBlock).toMatch(/security definer/);
    });

    it("selects only active, due schedules", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/where active and next_due_on <= current_date/);
    });

    it("mints obligation/event/correlation ids via platform.uuid_v7_at(), the same shape 0162\\/0169 already established", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/v_obligation_id := platform\.uuid_v7_at\(now\(\)\);/);
      expect(block).toMatch(/v_event_id := platform\.uuid_v7_at\(now\(\)\);/);
    });

    it("calls the unmodified work.generate_due_obligation() with actor_type 'system'", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/perform work\.generate_due_obligation\(/);
      expect(block).toMatch(/p_actor_type\s+=> 'system'/);
    });

    it("processes each schedule inside its own exception block, logging success or failure without halting the batch", () => {
      const block = bodyOf(SIGNATURE);
      expect(block).toMatch(/exception when others then/);
      expect(block).toMatch(/values \(v_log_id, v_schedule_id, v_obligation_id, 'generated'\);/);
      expect(block).toMatch(/values \(v_log_id, v_schedule_id, 'failed', sqlerrm\);/);
    });

    it("is revoked from every real application role -- reachable only via the scheduler role's own EXECUTE grant", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.run_maintenance_schedule_generation\(\) from public, anon, authenticated, service_role;/
      );
    });
  });

  describe("the scheduler role and its cron job", () => {
    it("creates a dedicated, login-less role, matching 0162's own idiom exactly", () => {
      expect(codeNoComments).toMatch(/create role klussie_scheduler_maintenance nologin;/);
    });

    it("grants postgres SET on the new role -- the one verified-live mechanism this hosting platform requires for `set role` in a cron job body", () => {
      expect(codeNoComments).toMatch(/grant klussie_scheduler_maintenance to postgres with set true;/);
    });

    it("grants the scheduler role EXECUTE on the generation delegate only -- no direct table grant on any aggregate", () => {
      expect(codeNoComments).toMatch(/grant usage on schema work to klussie_scheduler_maintenance;/);
      expect(codeNoComments).toMatch(/grant execute on function work\.run_maintenance_schedule_generation\(\) to klussie_scheduler_maintenance;/);
      expect(codeNoComments).not.toMatch(/grant select.*on work\.maintenance_schedules to klussie_scheduler_maintenance/);
      expect(codeNoComments).not.toMatch(/grant select.*on work\.maintenance_obligations to klussie_scheduler_maintenance/);
    });

    it("schedules via cron.schedule() with `set role` / `reset role` inside the job body, never cron.schedule_in_database's username parameter", () => {
      expect(codeNoComments).toMatch(/select cron\.schedule\(\s*\n\s*'maintenance-schedule-generation',\s*\n\s*'0 3 \* \* \*',/);
      expect(codeNoComments).toMatch(/set role klussie_scheduler_maintenance; select work\.run_maintenance_schedule_generation\(\); reset role;/);
      expect(codeNoComments).not.toMatch(/cron\.schedule_in_database/);
    });
  });

  describe("nothing in 0074's own schedule/obligation logic functions is redefined here", () => {
    it("never redeclares work.create_maintenance_schedule()/cancel_maintenance_schedule()/generate_due_obligation() themselves", () => {
      expect(codeNoComments).not.toMatch(/create or replace function work\.create_maintenance_schedule\(\s*\n\s*p_schedule_id\s+uuid,\s*\n\s*p_workspace_id/);
      expect(codeNoComments).not.toMatch(/create or replace function work\.generate_due_obligation\(\s*\n\s*p_schedule_id/);
    });
  });
});

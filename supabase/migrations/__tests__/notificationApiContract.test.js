// Platform Activation Slice 4, WP 4.0 — Epic 19 (0115-0118) built a complete, real
// notification backend that no client code anywhere referenced and no api.* delegate
// existed for — unlike Service Records (Slice 3), nothing anywhere even calls
// platform.raise_notification() either (checked directly, see this migration's own
// header). This migration closes the read/write contract gap: four
// platform.*_for_caller() wrappers adding the caller-authorization check 0117's own raw
// functions never had, and five api.* delegates.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0166_notification_contract.sql";

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

describe("0166_notification_contract migration", () => {
  describe("platform.mark_notification_seen_for_caller() / mark_notification_acted_for_caller() — the caller check 0117 never had", () => {
    for (const fn of ["platform.mark_notification_seen_for_caller", "platform.mark_notification_acted_for_caller"]) {
      it(`${fn} checks the delivery's own person_ref resolves to the caller's identity`, () => {
        const block = bodyOf(fn, codeNoComments);
        expect(block).toMatch(/join identity\.identities i on i\.person_ref = d\.person_ref/);
        expect(block).toMatch(/i\.auth_user_id = auth\.uid\(\)/);
        expect(block).toMatch(/i\.erased_at is null/);
        expect(block).toMatch(/insufficient_privilege/);
      });
    }

    it("mark_notification_seen_for_caller delegates to the unmodified platform.mark_notification_seen()", () => {
      const block = bodyOf("platform.mark_notification_seen_for_caller", codeNoComments);
      expect(block).toMatch(/perform platform\.mark_notification_seen\(/);
    });

    it("mark_notification_acted_for_caller delegates to the unmodified platform.mark_notification_acted()", () => {
      const block = bodyOf("platform.mark_notification_acted_for_caller", codeNoComments);
      expect(block).toMatch(/perform platform\.mark_notification_acted\(/);
    });
  });

  describe("platform.set_notification_preference_for_caller() / notification_preferences_for_caller() — checked against membership, not delivery", () => {
    for (const fn of ["platform.set_notification_preference_for_caller", "platform.notification_preferences_for_caller"]) {
      it(`${fn} checks p_membership_id is one of the caller's own real memberships`, () => {
        const block = bodyOf(fn, codeNoComments);
        expect(block).toMatch(/p_membership_id not in \(select membership_id from workspace\.current_memberships\(\)\)/);
        expect(block).toMatch(/insufficient_privilege/);
      });
    }

    it("set_notification_preference_for_caller delegates to the unmodified platform.set_notification_preference()", () => {
      const block = bodyOf("platform.set_notification_preference_for_caller", codeNoComments);
      expect(block).toMatch(/perform platform\.set_notification_preference\(/);
    });

    it("notification_preferences_for_caller delegates to the unmodified platform.notification_preferences_for_membership()", () => {
      const block = bodyOf("platform.notification_preferences_for_caller", codeNoComments);
      expect(block).toMatch(/return query select \* from platform\.notification_preferences_for_membership\(/);
    });
  });

  it("all four platform.*_for_caller wrappers are revoked from every application role — reachable only through their api.* delegate", () => {
    for (const fn of [
      "platform.mark_notification_seen_for_caller",
      "platform.mark_notification_acted_for_caller",
      "platform.set_notification_preference_for_caller",
      "platform.notification_preferences_for_caller",
    ]) {
      expect(codeNoComments, `${fn} not revoked`).toMatch(
        new RegExp(`revoke all on function ${fn.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated, service_role`)
      );
    }
  });

  it("api.my_inbox() is a pure pass-through — platform.my_inbox() was already correctly auth.uid()-scoped, no wrapper logic needed", () => {
    const block = bodyOf("api.my_inbox", codeNoComments);
    expect(block).toMatch(/select \* from platform\.my_inbox\(\);/);
    expect(block).toMatch(/security definer/);
  });

  it("the four write/preference api.* delegates each call their own _for_caller wrapper, never the raw platform.* function directly", () => {
    const pairs = [
      ["api.mark_notification_seen", "platform.mark_notification_seen_for_caller"],
      ["api.mark_notification_acted", "platform.mark_notification_acted_for_caller"],
      ["api.set_notification_preference", "platform.set_notification_preference_for_caller"],
      ["api.my_notification_preferences", "platform.notification_preferences_for_caller"],
    ];
    for (const [apiFn, forCallerFn] of pairs) {
      const block = bodyOf(apiFn, codeNoComments);
      expect(block, `${apiFn} should call ${forCallerFn}`).toContain(forCallerFn);
    }
  });

  it("all five api.* delegates are granted to authenticated, and revoked from anon/service_role", () => {
    const delegates = ["my_inbox", "mark_notification_seen", "mark_notification_acted", "set_notification_preference", "my_notification_preferences"];
    for (const name of delegates) {
      expect(codeNoComments, `api.${name} not granted to authenticated`).toMatch(
        new RegExp(`grant execute on function api\\.${name}\\([^)]*\\) to authenticated`)
      );
      expect(codeNoComments, `api.${name} not revoked from anon`).toMatch(
        new RegExp(`revoke all on function api\\.${name}\\([^)]*\\) from public, anon, service_role`)
      );
    }
  });

  it("all five api.* delegates are SECURITY DEFINER, all four platform.*_for_caller wrappers are SECURITY INVOKER (the default)", () => {
    const definerFns = ["api.my_inbox", "api.mark_notification_seen", "api.mark_notification_acted", "api.set_notification_preference", "api.my_notification_preferences"];
    for (const fn of definerFns) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} should be SECURITY DEFINER`).toMatch(/security definer/);
    }
    const invokerFns = [
      "platform.mark_notification_seen_for_caller", "platform.mark_notification_acted_for_caller",
      "platform.set_notification_preference_for_caller", "platform.notification_preferences_for_caller",
    ];
    for (const fn of invokerFns) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} should not be SECURITY DEFINER`).not.toMatch(/security definer/);
    }
  });

  it("raise_notification / escalate_notification / mark_notification_delivered stay engine-only — no new grant to any client-facing role", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(codeNoComments).not.toMatch(
        new RegExp(`grant execute on function platform\\.(raise_notification|escalate_notification|mark_notification_delivered)\\([^)]*\\) to ${role}`)
      );
    }
    // And no _for_caller wrapper exists for any of the three — they are deliberately not
    // client-reachable at all, not merely ungranted.
    expect(codeNoComments).not.toMatch(/raise_notification_for_caller|escalate_notification_for_caller|mark_notification_delivered_for_caller/);
  });

  it("grants no new SELECT on platform.notifications / notification_deliveries — every read goes through api.my_inbox(), not a direct table grant", () => {
    expect(codeNoComments).not.toMatch(/grant select on\s*\n?\s*platform\.notifications/);
    expect(codeNoComments).not.toMatch(/grant select on\s*\n?\s*platform\.notification_deliveries/);
  });

  it("grants postgres the SET option on klussie_engine_platform — the same PG16 ADMIN/SET split fix 0162's own consumer needed, seeded ahead of WP 4.1", () => {
    expect(codeNoComments).toMatch(/grant klussie_engine_platform to postgres with set true;/);
  });
});

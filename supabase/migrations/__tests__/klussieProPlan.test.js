// Payments Slice B (WP B1) — the Klussie Pro plan row and the subscription lifecycle
// extensions (grace period, period-aware cancellation) it needs. Same static-source-text
// discipline as acquisitionFee.test.js.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const code = readFileSync("supabase/migrations/0232_klussie_pro_plan.sql", "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

describe("0232_klussie_pro_plan migration", () => {
  it("grants exactly maintenance_planning and workflow_automation — no re-description of the Professional tier", () => {
    expect(code).toMatch(
      /'klussie_pro', 'Klussie Pro', 'Professional', jsonb_build_array\('maintenance_planning', 'workflow_automation'\)/
    );
    // The whole point — this is an add-on, not a repeated tier bundle.
    expect(code).not.toMatch(/'klussie_pro'[\s\S]{0,200}'marketplace_provider'/);
  });

  it("adds past_due as a real fifth status, not a repurposed existing one", () => {
    expect(code).toMatch(/check \(status in \('trialing', 'active', 'past_due', 'lapsed', 'cancelled'\)\)/);
  });

  describe("commerce.activate_subscription() — upsert, not a plain INSERT (the reactivation bug fix)", () => {
    const block = () => bodyOf("commerce.activate_subscription");

    it("upserts on workspace_id, so a workspace that cancelled can resubscribe without a unique-constraint crash", () => {
      expect(block()).toMatch(/on conflict \(workspace_id\) do update set/);
    });

    it("clears every terminal timestamp on reactivation, never leaving a stale cancelled_at/lapsed_at on an active row", () => {
      const block2 = block();
      expect(block2).toMatch(/grace_until = null,/);
      expect(block2).toMatch(/lapsed_at = null,/);
      expect(block2).toMatch(/cancelled_at = null,/);
      expect(block2).toMatch(/cancellation_requested_at = null;/);
    });

    it("keeps the row's own original id on reactivation — id is never part of the update clause", () => {
      const start = code.indexOf("on conflict (workspace_id) do update set");
      const end = code.indexOf(";", start);
      const updateClause = code.slice(start, end);
      expect(updateClause).not.toMatch(/^\s*id = /m);
    });
  });

  describe("commerce.mark_subscription_past_due() — the grace period begins", () => {
    const block = () => bodyOf("commerce.mark_subscription_past_due");

    it("requires a positive grace period", () => {
      expect(block()).toMatch(/if p_grace_days is null or p_grace_days <= 0 then/);
    });

    it("only ever moves an active subscription to past_due — never lapsed or cancelled directly", () => {
      expect(block()).toMatch(/where id = p_subscription_id and status = 'active'/);
    });

    it("withdraws nothing — access is preserved through the grace window", () => {
      expect(block()).not.toMatch(/withdraw_capability/);
    });
  });

  describe("commerce.recover_subscription_from_grace() — never grants a new unpaid subscription", () => {
    const block = () => bodyOf("commerce.recover_subscription_from_grace");

    it("only ever recovers a genuinely past_due subscription", () => {
      expect(block()).toMatch(/where id = p_subscription_id and status = 'past_due'/);
    });

    it("grants nothing — nothing was ever withdrawn to re-grant", () => {
      expect(block()).not.toMatch(/grant_capability/);
    });
  });

  it("commerce.lapse_expired_grace_subscriptions() reuses the untouched lapse_subscription(), never re-deriving the withdrawal loop", () => {
    const block = bodyOf("commerce.lapse_expired_grace_subscriptions");
    expect(block).toMatch(/where status = 'past_due' and grace_until < now\(\)/);
    expect(block).toMatch(/perform commerce\.lapse_subscription\(/);
    expect(block).not.toMatch(/withdraw_capability/);
  });

  describe("commerce.request_cancellation_for_caller() — preserves access through the paid-through date", () => {
    const block = () => bodyOf("commerce.request_cancellation_for_caller");

    it("checks the caller's own real membership", () => {
      expect(block()).toMatch(/from workspace\.current_memberships\(\) m where m\.workspace_id = v_workspace_id/);
    });

    it("touches only cancellation_requested_at — no capability, no status change", () => {
      expect(block()).toMatch(/set cancellation_requested_at = now\(\)/);
      expect(block()).not.toMatch(/withdraw_capability/);
      expect(block()).not.toMatch(/set status/);
    });

    it("refuses on an already-terminal subscription", () => {
      expect(block()).toMatch(/if v_status not in \('active', 'past_due'\) then/);
    });
  });

  it("commerce.cancel_subscription() withdraws in reverse plan order, the same shape as lapse_subscription()", () => {
    const block = bodyOf("commerce.cancel_subscription");
    expect(block).toMatch(/order by ordinality desc/);
    expect(block).toMatch(/perform workspace\.withdraw_capability\(/);
    expect(block).toMatch(/set status = 'cancelled', cancelled_at = now\(\)/);
  });

  it("api.my_subscription() reads through a real membership join, never a bare WHERE", () => {
    const block = bodyOf("api.my_subscription");
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = s\.workspace_id/);
  });

  it("grants api.* functions to authenticated, everything else stays klussie_engine_commerce only", () => {
    expect(code).toMatch(/grant execute on function api\.my_subscription\(uuid\) to authenticated;/);
    expect(code).toMatch(
      /grant execute on function api\.request_subscription_cancellation\([^)]*\) to authenticated;/
    );
    expect(code).toMatch(
      /grant execute on function commerce\.cancel_subscription\([^)]*\) to klussie_engine_commerce;/
    );
    expect(code).not.toMatch(/grant execute on function commerce\.cancel_subscription\([^)]*\) to authenticated/);
  });
});

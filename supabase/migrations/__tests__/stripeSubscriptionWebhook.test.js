// Payments Slice B (WP B2) — the Stripe Billing webhook trust boundary: deduplication,
// and a service_role-only api.* delegate layer over the untouched subscription contract
// (0130/0232). Same static-source-text discipline as the other migration test files in
// this directory.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const code = readFileSync("supabase/migrations/0233_stripe_subscription_webhook_contract.sql", "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

const commerceFunctions = [...code.matchAll(/create or replace function (commerce\.[a-z_]+)\(/g)].map((m) => m[1]);
const apiFunctions = [...code.matchAll(/create or replace function (api\.[a-z_]+)\(/g)].map((m) => m[1]);

describe("0233_stripe_subscription_webhook_contract migration", () => {
  it("defines the six commerce.* functions this webhook needs, no more, no fewer", () => {
    expect(new Set(commerceFunctions)).toEqual(
      new Set([
        "commerce.record_stripe_webhook_event",
        "commerce.subscription_id_for_provider",
        "commerce.activate_subscription_from_stripe_event",
        "commerce.renew_subscription_from_stripe_event",
        "commerce.mark_subscription_past_due_from_stripe_event",
        "commerce.cancel_subscription_from_stripe_event",
      ])
    );
  });

  // Checked directly before this migration was written: every client call anywhere in
  // this codebase goes through .schema("api") — PostgREST does not expose `commerce` at
  // all, so a service_role grant directly on the commerce.* functions above would be
  // unreachable from api/stripe-subscription-webhook.js regardless of GRANTs. This is the
  // real gap this migration's own header names finding while writing the webhook handler.
  it("defines exactly five api.* wrappers — one per commerce.* action the webhook handler actually calls, skipping the internal-only lookup", () => {
    expect(new Set(apiFunctions)).toEqual(
      new Set([
        "api.record_stripe_webhook_event",
        "api.activate_subscription_from_stripe_event",
        "api.renew_subscription_from_stripe_event",
        "api.mark_subscription_past_due_from_stripe_event",
        "api.cancel_subscription_from_stripe_event",
      ])
    );
  });

  it("no commerce.* function in this migration is SECURITY DEFINER — only the api.* wrapper is, matching every other engine contract in this codebase", () => {
    for (const fnName of commerceFunctions) {
      const start = code.indexOf(`create or replace function ${fnName}(`);
      const end = code.indexOf("\n$$;", start);
      const block = code.slice(start, end);
      expect(block).not.toMatch(/security definer/);
    }
  });

  it("every api.* wrapper is SECURITY DEFINER — service_role holds no direct grant on any commerce.* function", () => {
    for (const fnName of apiFunctions) {
      const start = code.indexOf(`create or replace function ${fnName}(`);
      const end = code.indexOf("\n$$;", start);
      const block = code.slice(start, end);
      expect(block).toMatch(/security definer/);
    }
  });

  it("revokes every commerce.* function from service_role too — reachable only via api.*", () => {
    expect(code).toMatch(
      /revoke all on function %s from public, anon, authenticated, service_role/
    );
  });

  it("grants every api.* wrapper to service_role only — never authenticated, never anon", () => {
    const accessSection = code.slice(code.indexOf("foreach fn in array array[\n    'api."));
    expect(accessSection).toMatch(/revoke all on function %s from public, anon, authenticated/);
    expect(accessSection).toMatch(/grant execute on function %s to service_role/);
    expect(accessSection).not.toMatch(/to authenticated;/);
  });

  it("deduplicates by primary key, not a SELECT-then-INSERT race", () => {
    const block = bodyOf("commerce.record_stripe_webhook_event");
    expect(block).toMatch(/on conflict \(stripe_event_id\) do nothing/);
    expect(block).toMatch(/returning true/);
  });

  it("renew_subscription_from_stripe_event resolves past_due (grace recovery) and active (ordinary renewal) to different contract calls from one event type", () => {
    const block = bodyOf("commerce.renew_subscription_from_stripe_event");
    expect(block).toMatch(/perform commerce\.recover_subscription_from_grace\(/);
    expect(block).toMatch(/perform commerce\.renew_subscription\(/);
  });

  it("every _from_stripe_event delegate fixes actor_type/actor_ref to system/stripe-webhook, never accepting one as a parameter", () => {
    for (const fnName of commerceFunctions.filter((n) => n.endsWith("_from_stripe_event"))) {
      const start = code.indexOf(`create or replace function ${fnName}(`);
      const paramsEnd = code.indexOf(")", start);
      const params = code.slice(start, paramsEnd);
      expect(params).not.toMatch(/p_actor_type|p_actor_ref/);
    }
  });

  it("resolves the subscription by provider id before ever delegating — never trusts a caller-supplied internal id", () => {
    for (const fnName of [
      "commerce.renew_subscription_from_stripe_event",
      "commerce.mark_subscription_past_due_from_stripe_event",
      "commerce.cancel_subscription_from_stripe_event",
    ]) {
      const block = bodyOf(fnName);
      expect(block).toMatch(/commerce\.subscription_id_for_provider\(p_provider_subscription_id\)/);
      expect(block).toMatch(/if v_subscription_id is null then/);
    }
  });

  it("every api.* wrapper is a pure pass-through — no logic of its own beyond delegating", () => {
    for (const fnName of apiFunctions) {
      const block = bodyOf(fnName);
      const commerceCallee = fnName.replace("api.", "commerce.");
      expect(block).toMatch(new RegExp(`select ${commerceCallee.replace(".", "\\.")}\\(`));
    }
  });
});

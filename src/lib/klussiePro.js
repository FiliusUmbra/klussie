// Payments Slice B (WP B4) — the professional's own read/write path onto Klussie Pro.
// fetchMyKlussieSubscription()/requestKlussieProCancellation() go through api.* RPCs
// (0232), same as every other engine contract this codebase already calls this way.
// startKlussieProCheckout() calls the Vercel route (api/stripe-subscription-checkout.js)
// with the caller's own bearer token, matching src/lib/aiIntake.js's own established
// fetch-with-bearer-token shape — the price itself is never sent from here; the server
// resolves it from its own env-configured Price id.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

export const KLUSSIE_PRO_PLAN_KEY = "klussie_pro";
export const KLUSSIE_PRO_CHECKOUT_FAILED = "KLUSSIE_PRO_CHECKOUT_FAILED";

/** The workspace's own current subscription, or null if it has never had one. */
export async function fetchMyKlussieSubscription(workspaceId) {
  if (!workspaceId) return null;
  const { data, error } = await supabase.schema("api").rpc("my_subscription", { p_workspace_id: workspaceId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    planKey: row.plan_key,
    status: row.status,
    trialEndsAt: row.trial_ends_at,
    startedAt: row.started_at,
    renewedAt: row.renewed_at,
    currentPeriodEnd: row.current_period_end,
    graceUntil: row.grace_until,
    cancellationRequestedAt: row.cancellation_requested_at,
  };
}

/**
 * Starts a real Stripe Checkout Session (test mode) for Klussie Pro and returns its
 * hosted URL — the caller navigates the browser there itself (window.location.href),
 * matching how a Stripe-hosted redirect flow always works; nothing here opens it.
 */
export async function startKlussieProCheckout(workspaceId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(KLUSSIE_PRO_CHECKOUT_FAILED);

  const res = await fetch("/api/stripe-subscription-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ workspaceId, origin: window.location.origin }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(KLUSSIE_PRO_CHECKOUT_FAILED);
  }
  if (!res.ok || !data?.url) throw new Error(KLUSSIE_PRO_CHECKOUT_FAILED);
  return data.url;
}

/**
 * The professional's own explicit cancel action — preserves access through the current
 * paid period (0232's own commerce.request_cancellation_for_caller(): no capability is
 * touched here at all, only a timestamp).
 */
export async function requestKlussieProCancellation(subscriptionId, actorRef) {
  const { error } = await supabase.schema("api").rpc("request_subscription_cancellation", {
    p_subscription_id: subscriptionId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

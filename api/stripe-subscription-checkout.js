// Vercel serverless function — Payments Slice B (WP B2). Starts a real Stripe Checkout
// Session (subscription mode, test mode) for Klussie Pro. Requires an authenticated
// Supabase session and is rate-limited per user, the same restraint every other endpoint
// here holds (source-providers.js's own header: not AI-specific despite the table's name).
//
// THE PRICE IS NEVER CLIENT-SUPPLIED
//
// api/_lib/auth.js's own header: no endpoint trusts a caller it hasn't verified, and no
// client-supplied "trust me" value is ever the price or rate a real charge uses (the same
// discipline api/stripe-connect-onboarding.js and every commerce.* contract function in
// this codebase already holds). STRIPE_KLUSSIE_PRO_PRICE_ID is a server-only env var,
// pointing at a real Price object configured once in the Stripe Dashboard (test mode) —
// the client sends only which workspace is subscribing and where to return to.
import { verifyAuth, AuthError } from "./_lib/auth.js";
import { checkAndLogUsage, RateLimitError } from "./_lib/rateLimit.js";
import { createSubscriptionCheckoutSession } from "./_lib/stripeGateway.js";

const ENDPOINT = "stripe-subscription-checkout";
const PLAN_KEY = "klussie_pro";
const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let auth;
  try {
    auth = await verifyAuth(req);
    await checkAndLogUsage(auth.supabase, auth.user.id, ENDPOINT);
  } catch (err) {
    if (err instanceof AuthError || err instanceof RateLimitError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("stripe-subscription-checkout auth/rate-limit error:", err);
    res.status(500).json({ error: "Could not verify your session. Please try again." });
    return;
  }

  const { workspaceId, origin } = req.body || {};
  if (!workspaceId || typeof workspaceId !== "string") {
    res.status(400).json({ error: "Missing workspaceId." });
    return;
  }
  if (!isHttpUrl(origin)) {
    res.status(400).json({ error: "Missing or invalid origin." });
    return;
  }

  const priceId = process.env.STRIPE_KLUSSIE_PRO_PRICE_ID;
  if (!priceId) {
    res.status(500).json({ error: "Klussie Pro is not configured on the server." });
    return;
  }

  try {
    // Refuses a second checkout for a workspace already on an active/trialing/past_due
    // Klussie Pro subscription — a second one would create a second real Stripe
    // subscription object that commerce.activate_subscription()'s own per-workspace
    // upsert (0232) would silently orphan on the next webhook, left billing forever with
    // nothing in this codebase tracking it.
    const { data: existing, error: existingError } = await auth.supabase
      .schema("api")
      .rpc("my_subscription", { p_workspace_id: workspaceId });
    if (existingError) throw existingError;
    const current = existing?.[0];
    if (current && current.plan_key === PLAN_KEY && ACTIVE_STATUSES.includes(current.status)) {
      res.status(409).json({ error: "This workspace already has an active Klussie Pro subscription." });
      return;
    }

    const session = await createSubscriptionCheckoutSession({
      customerEmail: auth.user.email,
      priceId,
      workspaceId,
      successUrl: `${origin}/app?klussieProCheckout=complete`,
      cancelUrl: `${origin}/app?klussieProCheckout=cancelled`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("stripe-subscription-checkout failed:", err);
    res.status(500).json({ error: "Could not start checkout. Please try again." });
  }
}

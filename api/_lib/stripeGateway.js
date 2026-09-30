// The one file that knows Stripe's own SDK shapes — matching aiGateway.js's own role for
// Anthropic (that file's own header: "the only file that knows [the provider]'s own
// shapes... swapping a capability to a different provider later means changing the body
// here, not every endpoint that uses it"). Payments Slice A: Connect Express payout
// accounts. Payments Slice B: Stripe Billing subscription checkout and webhook signature
// verification. No charge, transfer, or payout call exists anywhere in this file — real
// money movement for the acquisition fee itself is a separate, later, explicitly-gated
// slice (MONETIZATION.md's own sequencing).
import Stripe from "stripe";

let stripeClient = null;
function getStripeClient() {
  if (!stripeClient) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) throw new Error("Payouts are not configured on the server (missing STRIPE_SECRET_KEY).");
    // No explicit apiVersion override — the installed `stripe` package (package.json)
    // already pins a real, known-good API version internally; writing a version string
    // here from memory risks a value that was never real, silently breaking every call
    // this file makes. Bump the version deliberately, by upgrading the `stripe` package
    // itself and reading its own release notes, not by editing a string here.
    stripeClient = new Stripe(apiKey);
  }
  return stripeClient;
}

/**
 * A real Stripe Express account for a professional workspace — Belgium-only for now
 * (BASE_SERVICES/appStrings' own single-jurisdiction scope, matching every other
 * beta-era assumption in this codebase). `email` seeds the onboarding form; Stripe's own
 * hosted flow collects everything else Express needs (business type, bank details,
 * identity), never this codebase.
 */
export async function createExpressAccount({ email }) {
  const stripe = getStripeClient();
  return stripe.accounts.create({
    type: "express",
    country: "BE",
    email: email || undefined,
    capabilities: { transfers: { requested: true } },
  });
}

/**
 * A one-time hosted onboarding URL for a real Stripe account. `refreshUrl` is where
 * Stripe sends the pro back if the link itself expired (Account Links are short-lived);
 * `returnUrl` is where a completed (or abandoned) session lands — either way, the app's
 * own onboarding.js re-checks live status rather than trusting either URL was actually
 * reached in good faith.
 */
export async function createOnboardingLink({ accountId, refreshUrl, returnUrl }) {
  const stripe = getStripeClient();
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
}

/**
 * The live truth about a Stripe account — never cached, never persisted (see
 * 0226_payout_accounts.sql's own header for why). Shaped down to the three booleans the
 * UI actually needs, not the SDK's full account object.
 */
export async function fetchAccountStatus(accountId) {
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(accountId);
  return {
    detailsSubmitted: !!account.details_submitted,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
  };
}

/**
 * A one-time login link into the account's own Stripe Express dashboard — where a pro
 * actually manages payout details/bank account once connected. Express accounts have no
 * dashboard access through Stripe's own hosted onboarding alone; this is the documented,
 * separate call for reaching it afterward.
 */
export async function createDashboardLoginLink(accountId) {
  const stripe = getStripeClient();
  return stripe.accounts.createLoginLink(accountId);
}

/**
 * A Stripe Checkout Session in subscription mode for Klussie Pro (Payments Slice B).
 * Deliberately does NOT pre-create or search for a Stripe Customer — Checkout creates one
 * inline from `customerEmail` if none is passed, avoiding the Search API's own eventual-
 * consistency window (a real risk of double-creating a customer for the same workspace on
 * a quick retry). The real customer/subscription ids come back on the webhook's own
 * checkout.session.completed event, which is when this codebase first persists them
 * (commerce.activate_subscription_from_stripe_event, 0233) — never assumed here.
 * `workspaceId` is carried in both `client_reference_id` and `subscription_data.metadata`
 * so the webhook can resolve it however the specific event shape makes it available.
 */
export async function createSubscriptionCheckoutSession({ customerEmail, priceId, workspaceId, successUrl, cancelUrl }) {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: customerEmail || undefined,
    client_reference_id: workspaceId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { workspaceId } },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

/**
 * A Stripe-hosted Billing Portal session — where a subscriber manages payment methods or
 * cancels on their own, without this codebase building any of that UI itself.
 */
export async function createBillingPortalSession({ customerId, returnUrl }) {
  const stripe = getStripeClient();
  return stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

/**
 * The live subscription object, including its own authoritative current_period_end —
 * never computed locally. Both checkout.session.completed and invoice.paid/payment_failed
 * carry the subscription id but not a reliably-shaped period end of their own (a Checkout
 * Session has none at all; an invoice's own line-item period is per-line, not per-
 * subscription), so the webhook handler re-fetches the one real source of truth rather
 * than parsing either payload's own partial shape.
 */
export async function retrieveSubscription(subscriptionId) {
  const stripe = getStripeClient();
  return stripe.subscriptions.retrieve(subscriptionId);
}

/**
 * Verifies a webhook request's own Stripe-Signature header against the raw request body
 * and the server-only STRIPE_WEBHOOK_SECRET — this IS the authentication for a webhook
 * request (0233_stripe_subscription_webhook_contract.sql's own header: no Supabase user
 * session exists to verify instead). Throws on a missing/invalid/forged signature; the
 * caller must not act on the payload unless this returns successfully.
 */
export function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("Webhook handling is not configured on the server (missing STRIPE_WEBHOOK_SECRET).");
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

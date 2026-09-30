// Vercel serverless function — Payments Slice 1 (WP 1). Creates (or reuses) a Stripe
// Express account for the caller's own workspace and returns a fresh hosted onboarding
// link. Requires an authenticated Supabase session — see api/_lib/auth.js — and is
// rate-limited per user via api/_lib/rateLimit.js, same as every other endpoint here
// (source-providers.js's own header: not AI-specific despite the table's name, it's this
// codebase's one per-user-per-endpoint call budget).
//
// NO STATUS IS EVER TRUSTED FROM THE CLIENT OR WRITTEN HERE
//
// This route only ever writes the one immutable fact commerce.payout_accounts holds — a
// Stripe account id (see 0226_payout_accounts.sql's own header for why no
// details_submitted/charges_enabled/payouts_enabled column exists to write). Whether the
// account is actually usable is answered live, every time, by api/stripe-connect-
// status.js, never by anything this route returns.
import { verifyAuth, AuthError } from "./_lib/auth.js";
import { checkAndLogUsage, RateLimitError } from "./_lib/rateLimit.js";
import { createExpressAccount, createOnboardingLink } from "./_lib/stripeGateway.js";
// The explicit .ts extension is load-bearing, not a typo — see api/source-providers.js's
// own comment on this same import: Vercel's serverless bundler does no extension
// rewriting the way Vite's client bundler does.
import { uuidv7 } from "../src/lib/ids.ts";

const ENDPOINT = "stripe-connect-onboarding";

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
    console.error("stripe-connect-onboarding auth/rate-limit error:", err);
    res.status(500).json({ error: "Could not verify your session. Please try again." });
    return;
  }

  const { workspaceId, origin } = req.body || {};
  if (!workspaceId || typeof workspaceId !== "string") {
    res.status(400).json({ error: "Missing workspaceId." });
    return;
  }
  // `origin` is the caller's own window.location.origin (custom domain, preview URL, or
  // localhost during development all differ) — Stripe just redirects the browser back
  // there, so trusting the client for it carries no authorization weight; validated only
  // to keep a malformed value out of the Stripe API call.
  if (!isHttpUrl(origin)) {
    res.status(400).json({ error: "Missing or invalid origin." });
    return;
  }

  try {
    const { data: existing, error: existingError } = await auth.supabase
      .schema("api")
      .rpc("my_payout_account", { p_workspace_id: workspaceId });
    if (existingError) throw existingError;

    let accountId = existing?.[0]?.provider_account_id;

    if (!accountId) {
      const account = await createExpressAccount({ email: auth.user.email });
      accountId = account.id;

      const { error: createError } = await auth.supabase.schema("api").rpc("create_payout_account", {
        p_payout_account_id: uuidv7(),
        p_workspace_id: workspaceId,
        p_provider: "stripe",
        p_provider_account_id: accountId,
        p_event_id: uuidv7(),
        p_correlation_id: uuidv7(),
        p_actor_type: "person",
        p_actor_ref: auth.user.id,
      });
      if (createError) throw createError;
    }

    const link = await createOnboardingLink({
      accountId,
      refreshUrl: `${origin}/app?stripeReturn=refresh`,
      returnUrl: `${origin}/app?stripeReturn=complete`,
    });

    res.status(200).json({ url: link.url });
  } catch (err) {
    console.error("stripe-connect-onboarding failed:", err);
    // 42501 is Postgres's own SQLSTATE for insufficient_privilege — the real refusal
    // commerce.create_payout_account_for_caller() raises for a non-member caller.
    const status = err?.code === "42501" ? 403 : 500;
    res.status(status).json({ error: "Could not start payout setup. Please try again." });
  }
}

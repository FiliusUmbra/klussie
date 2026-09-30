// Vercel serverless function — Payments Slice 1 (WP A0). The live truth about a
// workspace's own Stripe Connect account, asked of Stripe directly on every call — see
// 0226_payout_accounts.sql's own header for why details_submitted/charges_enabled/
// payouts_enabled are never persisted anywhere and must always be asked fresh.
import { verifyAuth, AuthError } from "./_lib/auth.js";
import { checkAndLogUsage, RateLimitError } from "./_lib/rateLimit.js";
import { fetchAccountStatus, createDashboardLoginLink } from "./_lib/stripeGateway.js";

const ENDPOINT = "stripe-connect-status";

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
    console.error("stripe-connect-status auth/rate-limit error:", err);
    res.status(500).json({ error: "Could not verify your session. Please try again." });
    return;
  }

  const { workspaceId } = req.body || {};
  if (!workspaceId || typeof workspaceId !== "string") {
    res.status(400).json({ error: "Missing workspaceId." });
    return;
  }

  try {
    const { data: existing, error: existingError } = await auth.supabase
      .schema("api")
      .rpc("my_payout_account", { p_workspace_id: workspaceId });
    if (existingError) throw existingError;

    const accountId = existing?.[0]?.provider_account_id;
    if (!accountId) {
      res.status(200).json({ connected: false });
      return;
    }

    const status = await fetchAccountStatus(accountId);
    const loginLink = status.detailsSubmitted ? await createDashboardLoginLink(accountId) : null;

    res.status(200).json({
      connected: true,
      detailsSubmitted: status.detailsSubmitted,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      dashboardUrl: loginLink?.url || null,
    });
  } catch (err) {
    console.error("stripe-connect-status failed:", err);
    res.status(500).json({ error: "Could not check payout status. Please try again." });
  }
}

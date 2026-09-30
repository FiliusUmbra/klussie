// Vercel serverless function — Payments Slice B (WP B2). Stripe calls this route directly;
// there is no Supabase user session to verify at all. See 0233_stripe_subscription_
// webhook_contract.sql's own header for the full reasoning: Stripe's own HMAC signature
// (STRIPE_WEBHOOK_SECRET, server-only, never client-exposed) IS the verification Rule 5
// requires here, the webhook-appropriate equivalent of verifyAuth()'s bearer token for
// every other endpoint in this codebase.
//
// THE SERVICE ROLE KEY IS USED HERE, DELIBERATELY, AND ONLY HERE
//
// Every commerce.*_from_stripe_event() function (0233) is granted to service_role alone.
// This is the one file in this codebase importing the service-role client — see that
// migration's own header for why a verified webhook is the narrow, deliberate exception
// to "never use the service-role key in a user-facing request path" (it is not a
// user-facing path).
//
// RAW BODY, NOT PARSED JSON — Stripe's signature covers the exact bytes it sent
//
// Vercel's default body parsing would already have re-serialized the payload by the time
// a handler sees req.body, which breaks HMAC verification (the signature was computed
// over Stripe's own exact byte stream). bodyParser is disabled below and the raw body is
// read directly from the request stream before anything else happens.
import { createClient } from "@supabase/supabase-js";
import { constructWebhookEvent, retrieveSubscription } from "./_lib/stripeGateway.js";
import { uuidv7 } from "../src/lib/ids.ts";

export const config = { api: { bodyParser: false } };

const PLAN_KEY = "klussie_pro";
const GRACE_DAYS = 7;

function getServiceRoleClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Webhook handling is not configured on the server (missing SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("stripe-subscription-webhook signature verification failed:", err.message);
    res.status(400).json({ error: "Invalid signature." });
    return;
  }

  const supabase = getServiceRoleClient();

  try {
    const { data: isNewEvent, error: dedupeError } = await supabase
      .schema("api")
      .rpc("record_stripe_webhook_event", { p_stripe_event_id: event.id, p_event_type: event.type });
    if (dedupeError) throw dedupeError;
    // No row back means this exact event id was already processed on an earlier delivery
    // (Stripe's own documented at-least-once retries) — acknowledge and stop, not an error.
    if (!isNewEvent) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;
        const workspaceId = session.client_reference_id || session.subscription_data?.metadata?.workspaceId;
        if (!workspaceId) {
          console.error("stripe-subscription-webhook: checkout.session.completed with no workspaceId", session.id);
          break;
        }
        const subscription = await retrieveSubscription(session.subscription);
        const { error } = await supabase.schema("api").rpc("activate_subscription_from_stripe_event", {
          p_subscription_id: uuidv7(),
          p_workspace_id: workspaceId,
          p_plan_key: PLAN_KEY,
          p_payer: { payerType: "workspace", payerRef: workspaceId },
          p_event_id: uuidv7(),
          p_correlation_id: uuidv7(),
          p_provider_subscription_id: subscription.id,
          p_provider_customer_id: session.customer,
          p_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        });
        if (error) throw error;
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const subscription = await retrieveSubscription(invoice.subscription);
        const { error } = await supabase.schema("api").rpc("renew_subscription_from_stripe_event", {
          p_provider_subscription_id: invoice.subscription,
          p_event_id: uuidv7(),
          p_correlation_id: uuidv7(),
          p_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        });
        if (error) throw error;
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const { error } = await supabase.schema("api").rpc("mark_subscription_past_due_from_stripe_event", {
          p_provider_subscription_id: invoice.subscription,
          p_event_id: uuidv7(),
          p_correlation_id: uuidv7(),
          p_grace_days: GRACE_DAYS,
        });
        if (error) throw error;
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const { error } = await supabase.schema("api").rpc("cancel_subscription_from_stripe_event", {
          p_provider_subscription_id: subscription.id,
          p_event_id: uuidv7(),
          p_correlation_id: uuidv7(),
        });
        if (error) throw error;
        break;
      }

      default:
        // Every other event type is real and expected — Stripe sends many more than this
        // integration reacts to (e.g. invoice.created, customer.updated). Acknowledged,
        // not an error.
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`stripe-subscription-webhook failed processing ${event.type} (${event.id}):`, err);
    // A non-2xx response tells Stripe to retry this exact event later — correct here,
    // since the failure is this handler's own (a transient DB error, a missing
    // subscription row), not a reason to silently drop a real lifecycle event.
    res.status(500).json({ error: "Could not process webhook event." });
  }
}

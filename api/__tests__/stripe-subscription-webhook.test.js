// Tests for api/stripe-subscription-webhook.js's own request handling: signature
// verification, deduplication, the four real event types it reacts to, and that no
// non-2xx path ever gets skipped silently. Not a test of Stripe's own signature algorithm
// — constructWebhookEvent() itself is mocked, matching how every other endpoint test in
// this codebase treats its own _lib gateway.
import { describe, it, expect, vi, beforeEach } from "vitest";

const constructWebhookEventMock = vi.fn();
const retrieveSubscriptionMock = vi.fn();
const rpcMock = vi.fn();
const schemaMock = vi.fn(() => ({ rpc: rpcMock }));
const createClientMock = vi.fn(() => ({ schema: schemaMock }));

vi.mock("../_lib/stripeGateway.js", () => ({
  constructWebhookEvent: (...args) => constructWebhookEventMock(...args),
  retrieveSubscription: (...args) => retrieveSubscriptionMock(...args),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args) => createClientMock(...args),
}));

import handler from "../stripe-subscription-webhook.js";

// req is an async-iterable of body chunks, matching how Vercel's raw Node request stream
// is actually consumed once bodyParser is disabled — not a plain object with a .body
// field, which is the one thing this handler must NOT read (see its own header on why).
function fakeReqRes({ method = "POST", chunks = ["{}"], signature = "sig_test" } = {}) {
  const req = {
    method,
    headers: { "stripe-signature": signature },
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VITE_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  rpcMock.mockResolvedValue({ data: true, error: null });
});

describe("stripe-subscription-webhook handler", () => {
  it("rejects anything but POST", async () => {
    const { req, res } = fakeReqRes({ method: "GET" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("400s on an invalid signature, before ever touching the database", async () => {
    constructWebhookEventMock.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    const { req, res } = fakeReqRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("acknowledges without re-processing when the event id was already seen", async () => {
    constructWebhookEventMock.mockReturnValue({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // dedupe: no row back = already seen

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("activates the subscription on checkout.session.completed, resolving current_period_end live from Stripe", async () => {
    constructWebhookEventMock.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", client_reference_id: "ws-1", customer: "cus_1", subscription: "sub_1" } },
    });
    retrieveSubscriptionMock.mockResolvedValue({ id: "sub_1", current_period_end: 1893456000 });
    rpcMock.mockResolvedValueOnce({ data: true, error: null }); // dedupe: new event
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // activate

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const activateCall = rpcMock.mock.calls.find(([name]) => name === "activate_subscription_from_stripe_event");
    expect(activateCall[1]).toMatchObject({
      p_workspace_id: "ws-1", p_plan_key: "klussie_pro",
      p_provider_subscription_id: "sub_1", p_provider_customer_id: "cus_1",
    });
    expect(activateCall[1].p_current_period_end).toBe(new Date(1893456000 * 1000).toISOString());
  });

  it("ignores a checkout.session.completed in a non-subscription mode", async () => {
    constructWebhookEventMock.mockReturnValue({
      id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "payment" } },
    });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(retrieveSubscriptionMock).not.toHaveBeenCalled();
  });

  it("logs and skips a checkout.session.completed with no resolvable workspaceId, rather than crashing", async () => {
    constructWebhookEventMock.mockReturnValue({
      id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "subscription" } },
    });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(retrieveSubscriptionMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("renews the subscription on invoice.paid", async () => {
    constructWebhookEventMock.mockReturnValue({
      id: "evt_1", type: "invoice.paid", data: { object: { subscription: "sub_1" } },
    });
    retrieveSubscriptionMock.mockResolvedValue({ id: "sub_1", current_period_end: 1893456000 });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const renewCall = rpcMock.mock.calls.find(([name]) => name === "renew_subscription_from_stripe_event");
    expect(renewCall[1]).toMatchObject({ p_provider_subscription_id: "sub_1" });
  });

  it("marks the subscription past_due on invoice.payment_failed, with the configured grace period", async () => {
    constructWebhookEventMock.mockReturnValue({
      id: "evt_1", type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } },
    });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const pastDueCall = rpcMock.mock.calls.find(([name]) => name === "mark_subscription_past_due_from_stripe_event");
    expect(pastDueCall[1]).toMatchObject({ p_provider_subscription_id: "sub_1", p_grace_days: 7 });
  });

  it("cancels the subscription on customer.subscription.deleted", async () => {
    constructWebhookEventMock.mockReturnValue({
      id: "evt_1", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } },
    });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const cancelCall = rpcMock.mock.calls.find(([name]) => name === "cancel_subscription_from_stripe_event");
    expect(cancelCall[1]).toMatchObject({ p_provider_subscription_id: "sub_1" });
  });

  it("acknowledges an event type it doesn't react to, rather than erroring", async () => {
    constructWebhookEventMock.mockReturnValue({ id: "evt_1", type: "customer.updated", data: { object: {} } });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
  });

  it("500s (asking Stripe to retry) when the underlying contract call fails, without leaking the raw error", async () => {
    constructWebhookEventMock.mockReturnValue({
      id: "evt_1", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } },
    });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "insufficient_privilege: real internal detail" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { req, res } = fakeReqRes();
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/insufficient_privilege/);
    errorSpy.mockRestore();
  });
});

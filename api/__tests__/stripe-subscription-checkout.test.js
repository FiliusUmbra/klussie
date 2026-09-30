// Tests for api/stripe-subscription-checkout.js's own request handling: method/validation
// guards, the price-is-never-client-supplied discipline, the double-subscribe refusal, and
// the generic failure message. Not a test of Stripe's own Checkout Session shape.
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyAuthMock = vi.fn();
const checkAndLogUsageMock = vi.fn();
const createSubscriptionCheckoutSessionMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("../_lib/auth.js", () => ({
  verifyAuth: (...args) => verifyAuthMock(...args),
  AuthError: class AuthError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  },
}));
vi.mock("../_lib/rateLimit.js", () => ({
  checkAndLogUsage: (...args) => checkAndLogUsageMock(...args),
  RateLimitError: class RateLimitError extends Error {
    constructor(message) { super(message); this.status = 429; }
  },
}));
vi.mock("../_lib/stripeGateway.js", () => ({
  createSubscriptionCheckoutSession: (...args) => createSubscriptionCheckoutSessionMock(...args),
}));

import handler from "../stripe-subscription-checkout.js";
import { AuthError } from "../_lib/auth.js";

function fakeReqRes({ method = "POST", body = {} } = {}) {
  const req = { method, body };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req, res };
}

const supabaseStub = { schema: () => ({ rpc: rpcMock }) };

beforeEach(() => {
  vi.clearAllMocks();
  verifyAuthMock.mockResolvedValue({ user: { id: "user-1", email: "pro@example.com" }, supabase: supabaseStub });
  checkAndLogUsageMock.mockResolvedValue();
  rpcMock.mockResolvedValue({ data: [], error: null });
  createSubscriptionCheckoutSessionMock.mockResolvedValue({ url: "https://checkout.stripe.com/session-1" });
  process.env.STRIPE_KLUSSIE_PRO_PRICE_ID = "price_test_123";
});

describe("stripe-subscription-checkout handler", () => {
  it("rejects anything but POST", async () => {
    const { req, res } = fakeReqRes({ method: "GET" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("requires auth before touching the body", async () => {
    verifyAuthMock.mockRejectedValue(new AuthError("Missing Authorization header.", 401));
    const { req, res } = fakeReqRes({ body: { workspaceId: "ws-1", origin: "https://klussie.app" } });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(createSubscriptionCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("rejects a missing workspaceId", async () => {
    const { req, res } = fakeReqRes({ body: { origin: "https://klussie.app" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(createSubscriptionCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("rejects a missing or invalid origin", async () => {
    for (const bad of [undefined, "not-a-url", "javascript:alert(1)"]) {
      const { req, res } = fakeReqRes({ body: { workspaceId: "ws-1", origin: bad } });
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    }
    expect(createSubscriptionCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("500s with a generic message when the price is not configured on the server", async () => {
    delete process.env.STRIPE_KLUSSIE_PRO_PRICE_ID;
    const { req, res } = fakeReqRes({ body: { workspaceId: "ws-1", origin: "https://klussie.app" } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(createSubscriptionCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("refuses a second checkout when the workspace already has an active Klussie Pro subscription", async () => {
    rpcMock.mockResolvedValue({ data: [{ plan_key: "klussie_pro", status: "active" }], error: null });
    const { req, res } = fakeReqRes({ body: { workspaceId: "ws-1", origin: "https://klussie.app" } });

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(createSubscriptionCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("allows a new checkout when the existing subscription is a different plan or already cancelled/lapsed", async () => {
    rpcMock.mockResolvedValue({ data: [{ plan_key: "klussie_pro", status: "cancelled" }], error: null });
    const { req, res } = fakeReqRes({ body: { workspaceId: "ws-1", origin: "https://klussie.app" } });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(createSubscriptionCheckoutSessionMock).toHaveBeenCalled();
  });

  it("never lets the client choose the price — always the server's own env-configured id", async () => {
    const { req, res } = fakeReqRes({
      body: { workspaceId: "ws-1", origin: "https://klussie.app", priceId: "price_attacker_supplied" },
    });

    await handler(req, res);

    expect(createSubscriptionCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: "price_test_123" })
    );
  });

  it("returns the real checkout URL on success", async () => {
    const { req, res } = fakeReqRes({ body: { workspaceId: "ws-1", origin: "https://klussie.app" } });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: "https://checkout.stripe.com/session-1" });
  });

  it("never leaks a raw Stripe error to the client", async () => {
    createSubscriptionCheckoutSessionMock.mockRejectedValue(new Error("stripe internals: card_declined at layer 9"));
    const { req, res } = fakeReqRes({ body: { workspaceId: "ws-1", origin: "https://klussie.app" } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/stripe internals/);
  });
});

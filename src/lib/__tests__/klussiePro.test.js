// Payments Slice B (WP B4) — the client side of api.my_subscription()/api.request_
// subscription_cancellation() (0232) and the Stripe Checkout redirect (0233's own
// checkout route).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rpcMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: { schema: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { supabase } from "../supabaseClient";
import {
  fetchMyKlussieSubscription,
  startKlussieProCheckout,
  requestKlussieProCancellation,
  KLUSSIE_PRO_CHECKOUT_FAILED,
} from "../klussiePro";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  rpcMock.mockReset();
  vi.mocked(supabase.schema).mockReset();
  vi.mocked(supabase.schema).mockReturnValue({ rpc: rpcMock });
  getSessionMock.mockReset();
  vi.mocked(supabase.auth.getSession).mockImplementation(getSessionMock);
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchMyKlussieSubscription", () => {
  it("returns null without calling the RPC when no workspaceId is given", async () => {
    const result = await fetchMyKlussieSubscription(null);
    expect(result).toBeNull();
    expect(supabase.schema).not.toHaveBeenCalled();
  });

  it("returns null, not a row, when the workspace has never had a subscription", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const result = await fetchMyKlussieSubscription("ws-1");
    expect(result).toBeNull();
  });

  it("shapes the real row into camelCase", async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: "sub-1", plan_key: "klussie_pro", status: "active", trial_ends_at: null,
        started_at: "2026-01-01T00:00:00Z", renewed_at: null, current_period_end: "2026-02-01T00:00:00Z",
        grace_until: null, cancellation_requested_at: null,
      }],
      error: null,
    });

    const result = await fetchMyKlussieSubscription("ws-1");

    expect(rpcMock).toHaveBeenCalledWith("my_subscription", { p_workspace_id: "ws-1" });
    expect(result).toMatchObject({ id: "sub-1", planKey: "klussie_pro", status: "active", currentPeriodEnd: "2026-02-01T00:00:00Z" });
  });

  it("throws the real Supabase error rather than swallowing it", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(fetchMyKlussieSubscription("ws-1")).rejects.toThrow("denied");
  });
});

describe("startKlussieProCheckout", () => {
  it("throws when there is no real session, before ever calling fetch", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await expect(startKlussieProCheckout("ws-1")).rejects.toThrow(KLUSSIE_PRO_CHECKOUT_FAILED);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("posts the workspaceId and origin with the caller's own bearer token, and returns the real checkout URL", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok-1" } } });
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session-1" }) });

    const url = await startKlussieProCheckout("ws-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/stripe-subscription-checkout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-1" }),
      })
    );
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ workspaceId: "ws-1" });
    expect(url).toBe("https://checkout.stripe.com/session-1");
  });

  it("throws a stable error code, not the server's own message, on a failed response", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok-1" } } });
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Klussie Pro is not configured on the server." }) });

    await expect(startKlussieProCheckout("ws-1")).rejects.toThrow(KLUSSIE_PRO_CHECKOUT_FAILED);
  });
});

describe("requestKlussieProCancellation", () => {
  it("calls request_subscription_cancellation with the subscription id and the caller's own actorRef", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await requestKlussieProCancellation("sub-1", "pro-1");

    const call = rpcMock.mock.calls.find(([name]) => name === "request_subscription_cancellation");
    expect(call[1]).toMatchObject({ p_subscription_id: "sub-1", p_actor_type: "person", p_actor_ref: "pro-1" });
  });

  it("throws the real Supabase error", async () => {
    rpcMock.mockResolvedValue({ error: new Error("insufficient_privilege") });
    await expect(requestKlussieProCancellation("sub-1", "pro-1")).rejects.toThrow("insufficient_privilege");
  });
});

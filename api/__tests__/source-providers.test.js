// Tests for api/source-providers.js's own request handling: method/validation guards,
// the Places lookup and its field mapping, never guessing an email Places didn't give,
// and the generic failure message on both a Places error and a persist refusal. Not a
// test of provider.record_sourced_leads_for_caller() itself — see
// supabase/migrations/__tests__/providerExternalSourcing.test.js for that.
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyAuthMock = vi.fn();
const checkAndLogUsageMock = vi.fn();
let uuidCounter = 0;

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
vi.mock("../../src/lib/ids.ts", () => ({ uuidv7: () => `uuid-${++uuidCounter}` }));

import handler from "../source-providers.js";
import { AuthError } from "../_lib/auth.js";

const PLACE_FULL = {
  id: "place-1",
  displayName: { text: "Loodgieterij Janssens" },
  formattedAddress: "Kerkstraat 1, 2000 Antwerpen",
  nationalPhoneNumber: "+32 3 123 45 67",
  websiteUri: "https://janssens-loodgieter.example",
};

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

function supabaseStub({ rpcResult = { data: null, error: null } } = {}) {
  const rpc = vi.fn(() => Promise.resolve(rpcResult));
  return { schema: () => ({ rpc }), __rpc: rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  verifyAuthMock.mockResolvedValue({ user: { id: "operator-1" }, supabase: supabaseStub() });
  checkAndLogUsageMock.mockResolvedValue();
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ places: [PLACE_FULL] }),
    })
  );
});

describe("source-providers handler", () => {
  it("rejects anything but POST", async () => {
    const { req, res } = fakeReqRes({ method: "GET" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("requires auth and rate-limits before touching the body", async () => {
    verifyAuthMock.mockRejectedValue(new AuthError("Missing Authorization header.", 401));
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // Found live during testing: this endpoint's own checkAndLogUsage() call hit a real,
  // unhandled Postgres constraint violation (fixed separately in 0217) that reached the
  // client as a raw error message before this guard existed. Locks in the fix rather than
  // just the constraint that made the bug visible.
  it("returns a generic message, never the raw error, when checkAndLogUsage fails for a reason that isn't AuthError/RateLimitError", async () => {
    checkAndLogUsageMock.mockRejectedValue(new Error('new row for relation "ai_usage_log" violates check constraint "ai_usage_log_endpoint_check"'));
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/ai_usage_log/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing requestId, serviceName, or city", async () => {
    const { req, res } = fakeReqRes({ body: { serviceName: "Loodgieterswerken", city: "Antwerpen" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns a real 500, not a crash, when Places is not configured", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("queries Places with the real endpoint, field mask, and a Belgium-scoped text query", async () => {
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(init.headers["X-Goog-FieldMask"]).toMatch(/places\.nationalPhoneNumber/);
    expect(JSON.parse(init.body).textQuery).toBe("Loodgieterswerken in Antwerpen, Belgium");
  });

  it("returns an empty candidate list, not an error, when Places finds nothing", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ places: [] }) }));
    const supabase = supabaseStub();
    verifyAuthMock.mockResolvedValue({ user: { id: "operator-1" }, supabase });
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.candidates).toEqual([]);
    expect(supabase.__rpc).not.toHaveBeenCalled();
  });

  it("maps a Places result without ever inventing an email address", async () => {
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.candidates).toEqual([{
      id: "uuid-1",
      businessName: "Loodgieterij Janssens",
      phone: "+32 3 123 45 67",
      website: "https://janssens-loodgieter.example",
      city: "Antwerpen",
    }]);
  });

  it("falls back to the formatted address when a place has no displayName", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ places: [{ id: "place-2", formattedAddress: "Somewhere 1" }] }) })
    );
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.body.candidates[0].businessName).toBe("Somewhere 1");
    expect(res.body.candidates[0].phone).toBeNull();
  });

  it("persists every candidate via api.record_sourced_leads, deduplicated by source_ref, with an explainable match_reason", async () => {
    const supabase = supabaseStub();
    verifyAuthMock.mockResolvedValue({ user: { id: "operator-1" }, supabase });
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(supabase.__rpc).toHaveBeenCalledWith(
      "record_sourced_leads",
      expect.objectContaining({
        p_request_id: "req-1",
        p_leads: [expect.objectContaining({
          source: "google_places",
          source_ref: "place-1",
          business_name: "Loodgieterij Janssens",
          email: null,
          match_reason: { serviceName: "Loodgieterswerken", city: "Antwerpen", source: "google_places_text_search" },
        })],
        p_actor_type: "person",
        p_actor_ref: "operator-1",
      })
    );
  });

  it("caps candidates at 8 even when Places returns more", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...PLACE_FULL, id: `place-${i}` }));
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ places: many }) }));
    const supabase = supabaseStub();
    verifyAuthMock.mockResolvedValue({ user: { id: "operator-1" }, supabase });
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.body.candidates).toHaveLength(8);
    expect(supabase.__rpc.mock.calls[0][1].p_leads).toHaveLength(8);
  });

  it("returns the generic failure message, never the raw error, when the Places call itself fails", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network down")));
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.error).not.toMatch(/network down/);
  });

  it("returns 403, not a raw database error, when the caller lacks platform_operations", async () => {
    const supabase = supabaseStub({ rpcResult: { data: null, error: { code: "42501", message: "provider.record_sourced_leads_for_caller: caller lacks platform_operations" } } });
    verifyAuthMock.mockResolvedValue({ user: { id: "customer-1" }, supabase });
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).not.toMatch(/caller lacks platform_operations/);
  });

  it("returns a generic 500 for any other persist failure", async () => {
    const supabase = supabaseStub({ rpcResult: { data: null, error: { code: "23505", message: "some other constraint" } } });
    verifyAuthMock.mockResolvedValue({ user: { id: "operator-1" }, supabase });
    const { req, res } = fakeReqRes({ body: { requestId: "req-1", serviceName: "Loodgieterswerken", city: "Antwerpen" } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
  });
});

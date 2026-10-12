// api/property-photo.js — the Street View hero. Not a test of Google's imagery; it pins the
// guards: configuration, ownership via the caller's own RLS-scoped read, "real data or
// nothing", and that the key never leaves the server.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const verifyAuthMock = vi.fn();
const checkAndLogUsageMock = vi.fn();

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

import handler, { addressQuery } from "../property-photo.js";
import { AuthError } from "../_lib/auth.js";
import { RateLimitError } from "../_lib/rateLimit.js";

const PID = "11111111-2222-4333-8444-555555555555";
const PROPERTY = { id: PID, street: "Teststraat", house_number: "1", postcode: "1000", municipality: "Brussel", country: "BE" };

function fakeReqRes({ method = "GET", query = { propertyId: PID } } = {}) {
  const req = { method, query, headers: {} };
  const res = {
    statusCode: null, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
    send(p) { this.body = p; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
  return { req, res };
}

const supabaseWith = (rows, error = null) => ({ schema: () => ({ rpc: vi.fn(() => Promise.resolve({ data: rows, error })) }) });

let fetchMock;
beforeEach(() => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  verifyAuthMock.mockReset().mockResolvedValue({ user: { id: "u1" }, supabase: supabaseWith([PROPERTY]) });
  checkAndLogUsageMock.mockReset().mockResolvedValue(undefined);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.GOOGLE_MAPS_API_KEY; });

describe("addressQuery", () => {
  it("builds one geocodable line, defaulting the country to Belgium", () => {
    expect(addressQuery(PROPERTY)).toBe("Teststraat 1, 1000 Brussel, BE");
    expect(addressQuery({ street: "Rue X", postcode: "4000", municipality: "Liège" })).toBe("Rue X, 4000 Liège, BE");
  });
});

describe("property-photo handler", () => {
  it("rejects anything but GET and a missing or malformed propertyId, before touching anything", async () => {
    const post = fakeReqRes({ method: "POST" }); await handler(post.req, post.res); expect(post.res.statusCode).toBe(405);
    const none = fakeReqRes({ query: {} }); await handler(none.req, none.res); expect(none.res.statusCode).toBe(400);
    const bad = fakeReqRes({ query: { propertyId: "not-a-uuid" } }); await handler(bad.req, bad.res); expect(bad.res.statusCode).toBe(400);
    expect(verifyAuthMock).not.toHaveBeenCalled();
  });

  it("answers 501 not_configured with no key — before auth, before logging any usage, before Google", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const { req, res } = fakeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(501);
    expect(res.body.code).toBe("not_configured");
    expect(verifyAuthMock).not.toHaveBeenCalled();
    expect(checkAndLogUsageMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes auth and rate-limit statuses through", async () => {
    verifyAuthMock.mockRejectedValueOnce(new AuthError("Invalid session", 401));
    const a = fakeReqRes(); await handler(a.req, a.res); expect(a.res.statusCode).toBe(401);
    checkAndLogUsageMock.mockRejectedValueOnce(new RateLimitError("Too many"));
    const b = fakeReqRes(); await handler(b.req, b.res); expect(b.res.statusCode).toBe(429);
  });

  it("only serves a property the caller can read (my_properties is RLS-scoped) — someone else's id is just 404", async () => {
    verifyAuthMock.mockResolvedValue({ user: { id: "u1" }, supabase: supabaseWith([{ ...PROPERTY, id: "99999999-2222-4333-8444-555555555555" }]) });
    const { req, res } = fakeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("no_address");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes no Google request for a property without a confirmed address", async () => {
    verifyAuthMock.mockResolvedValue({ user: { id: "u1" }, supabase: supabaseWith([{ id: PID, street: "", postcode: "", municipality: "" }]) });
    const { req, res } = fakeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the free metadata first and never fetches the billed image when there is no imagery", async () => {
    fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve({ status: "ZERO_RESULTS" }) });
    const { req, res } = fakeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("no_imagery");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/streetview/metadata");
  });

  it("streams the image with a private cache header and never puts the key in the response", async () => {
    fetchMock
      .mockResolvedValueOnce({ json: () => Promise.resolve({ status: "OK" }) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => "image/jpeg" }, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) });
    const { req, res } = fakeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/jpeg");
    expect(res.headers["Cache-Control"]).toMatch(/^private/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(JSON.stringify(res.headers)).not.toContain("test-key");
  });

  it("reports an upstream failure as 502, without leaking the key or Google's error", async () => {
    fetchMock.mockRejectedValue(new Error("boom test-key"));
    const { req, res } = fakeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("test-key");
  });
});

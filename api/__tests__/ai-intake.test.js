// Tests for api/ai-intake.js's own request handling: method/validation guards, the
// never-trust-an-invented-service-id guard, and the generic failure messages on both
// the auth/rate-limit path and the AI-gateway call. Not a test of Claude's actual
// output — see api/_lib/__tests__/aiGateway.test.js for the content-block shape.
//
// No test file existed for this handler before this one — found alongside the same
// raw-error-leak pattern already fixed in api/source-providers.js (migration 0217's
// own commit flagged it as latent here too, and in api/ask-about-item.js).
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyAuthMock = vi.fn();
const checkAndLogUsageMock = vi.fn();
const reasonMock = vi.fn();
const emitEventMock = vi.fn();

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
vi.mock("../_lib/aiGateway.js", () => ({ reason: (...args) => reasonMock(...args) }));
vi.mock("../_lib/events.js", () => ({ emitEvent: (...args) => emitEventMock(...args) }));

import handler from "../ai-intake.js";
import { AuthError } from "../_lib/auth.js";

const SERVICES = [
  { id: "svc-plumbing", name: "Plumbing", category: "plumbing", blurb: "Leaks, pipes, drains." },
];

const ANALYSIS_RESULT = {
  matchedServiceId: "svc-plumbing",
  categoryId: "plumbing",
  problem: "Leaking gutter",
  description: "The gutter is leaking after a repair.",
  urgency: "medium",
  confidence: 90,
  possibleCauses: [],
  recommendedMaterials: [],
  requiredSkills: [],
  structuredFields: {},
  followUpQuestions: [],
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

beforeEach(() => {
  vi.clearAllMocks();
  verifyAuthMock.mockResolvedValue({ user: { id: "user-1" }, supabase: {} });
  checkAndLogUsageMock.mockResolvedValue();
  reasonMock.mockResolvedValue({ ...ANALYSIS_RESULT });
});

describe("ai-intake handler", () => {
  it("rejects anything but POST", async () => {
    const { req, res } = fakeReqRes({ method: "GET" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("requires auth and rate-limits before touching the body", async () => {
    verifyAuthMock.mockRejectedValue(new AuthError("Missing Authorization header.", 401));
    const { req, res } = fakeReqRes({ body: { text: "leak", services: SERVICES } });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  // Found by code audit (the same shared pattern already fixed in
  // api/source-providers.js, migration 0217's own commit): checkAndLogUsage() can throw
  // a raw Postgres error (e.g. a constraint violation) that isn't AuthError/
  // RateLimitError — that must never reach the client verbatim.
  it("returns a generic message, never the raw error, when checkAndLogUsage fails for a reason that isn't AuthError/RateLimitError", async () => {
    checkAndLogUsageMock.mockRejectedValue(new Error('new row for relation "ai_usage_log" violates check constraint "ai_usage_log_endpoint_check"'));
    const { req, res } = fakeReqRes({ body: { text: "leak", services: SERVICES } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/ai_usage_log/);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no text, voice transcript, or photo", async () => {
    const { req, res } = fakeReqRes({ body: { services: SERVICES } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("rejects a missing or empty service catalog", async () => {
    const { req, res } = fakeReqRes({ body: { text: "leak", services: [] } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("accepts a voice transcript alone, with no typed text", async () => {
    const { req, res } = fakeReqRes({ body: { voiceTranscript: "the gutter is leaking", services: SERVICES } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("accepts a photo alone, with no typed text or voice transcript", async () => {
    const { req, res } = fakeReqRes({ body: { photos: [{ mediaType: "image/jpeg", data: "abc" }], services: SERVICES } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("returns the model's own analysis on success", async () => {
    const { req, res } = fakeReqRes({ body: { text: "leak", services: SERVICES } });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.matchedServiceId).toBe("svc-plumbing");
    expect(emitEventMock).toHaveBeenCalledWith(
      expect.anything(),
      "ai_intake.analyzed",
      expect.objectContaining({ matchedServiceId: "svc-plumbing" })
    );
  });

  // Never trust a service id the model invented — an id absent from the catalog it was
  // actually given must fall back to unmatched rather than pointing the client at a
  // service that doesn't exist.
  it("falls back matchedServiceId/categoryId/structuredFields to unmatched when the model invents an id outside the given catalog", async () => {
    reasonMock.mockResolvedValue({
      ...ANALYSIS_RESULT,
      matchedServiceId: "svc-not-in-catalog",
      categoryId: "some-category",
      structuredFields: { foo: "bar" },
    });
    const { req, res } = fakeReqRes({ body: { text: "leak", services: SERVICES } });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.matchedServiceId).toBeNull();
    expect(res.body.categoryId).toBeNull();
    expect(res.body.structuredFields).toEqual({});
  });

  it("returns the generic localized-at-the-client failure message, never the raw error, when the AI call itself fails", async () => {
    reasonMock.mockRejectedValue(new Error("upstream 500"));
    const { req, res } = fakeReqRes({ body: { text: "leak", services: SERVICES } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/upstream 500/);
  });
});

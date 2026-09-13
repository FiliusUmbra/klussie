// Tests for api/suggest-service.js's own request handling: method/validation guards, the
// AI classification step (match vs. new), reusing translate() as-is for every locale but
// the pro's own, and the generic failure message on both an AI failure and a persist
// refusal. Not a test of catalog.suggest_service_for_caller() itself — see
// supabase/migrations/__tests__/serviceCatalogSuggestions.test.js for that.
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyAuthMock = vi.fn();
const checkAndLogUsageMock = vi.fn();
const reasonMock = vi.fn();
const translateMock = vi.fn();
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
vi.mock("../_lib/aiGateway.js", () => ({
  reason: (...args) => reasonMock(...args),
  translate: (...args) => translateMock(...args),
}));
vi.mock("../../src/lib/ids.ts", () => ({ uuidv7: () => `uuid-${++uuidCounter}` }));

import handler from "../suggest-service.js";
import { AuthError } from "../_lib/auth.js";

const EXISTING_CATEGORIES = [{ id: "cleaning" }, { id: "repair" }];
const EXISTING_SERVICES = [
  { id: "svc-1", category_id: "cleaning", mode: "book", base_price: "40.00", service_translations: [{ name: "Cleaning", blurb: "A clean home.", locale: "en" }] },
];

const NEW_CLASSIFICATION = {
  outcome: "new",
  categoryId: "repair",
  proposedName: "Solar panel installation",
  proposedBlurb: "Installs solar panels on residential roofs.",
  proposedMode: "quote",
  proposedBasePrice: 500,
  confidence: 0.82,
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

function supabaseStub({ catalogResult, rpcResult = { data: null, error: null } } = {}) {
  const rpc = vi.fn(() => Promise.resolve(rpcResult));
  const from = vi.fn((table) => {
    const result = catalogResult?.[table] ?? { data: [], error: null };
    // categories' own read chain ends at select() (no .eq()); services' own chain adds
    // .eq("active", true) — a plain thenable covers both, since select() alone is
    // already awaited directly by Promise.all in the handler.
    const chain = {
      select: () => chain,
      eq: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  });
  return { from, schema: () => ({ rpc }), __rpc: rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  verifyAuthMock.mockResolvedValue({
    user: { id: "pro-1" },
    supabase: supabaseStub({ catalogResult: { categories: { data: EXISTING_CATEGORIES, error: null }, services: { data: EXISTING_SERVICES, error: null } } }),
  });
  checkAndLogUsageMock.mockResolvedValue();
  reasonMock.mockResolvedValue({ outcome: "match", matchedServiceId: "svc-1", confidence: 0.9 });
  translateMock.mockImplementation(({ text }) => Promise.resolve(`translated:${text}`));
});

const VALID_BODY = { workspaceId: "ws-1", description: "I install solar panels", locale: "nl" };

describe("suggest-service handler", () => {
  it("rejects anything but POST", async () => {
    const { req, res } = fakeReqRes({ method: "GET" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("requires auth and rate-limits before touching the body", async () => {
    verifyAuthMock.mockRejectedValue(new AuthError("Missing Authorization header.", 401));
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("returns a generic message, never the raw error, when checkAndLogUsage fails for a reason that isn't AuthError/RateLimitError", async () => {
    checkAndLogUsageMock.mockRejectedValue(new Error('new row for relation "ai_usage_log" violates check constraint "ai_usage_log_endpoint_check"'));
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/ai_usage_log/);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("rejects a missing workspaceId, description, or locale", async () => {
    for (const body of [
      { description: "x", locale: "nl" },
      { workspaceId: "ws-1", locale: "nl" },
      { workspaceId: "ws-1", description: "x" },
    ]) {
      const { req, res } = fakeReqRes({ body });
      await handler(req, res);
      expect(res.statusCode).toBe(400);
    }
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("rejects a description over the length cap", async () => {
    const { req, res } = fakeReqRes({ body: { ...VALID_BODY, description: "x".repeat(501) } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported locale", async () => {
    const { req, res } = fakeReqRes({ body: { ...VALID_BODY, locale: "xx" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when the catalog read fails", async () => {
    verifyAuthMock.mockResolvedValue({
      user: { id: "pro-1" },
      supabase: supabaseStub({ catalogResult: { categories: { data: null, error: { message: "boom" } }, services: { data: [], error: null } } }),
    });
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/boom/);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("passes the existing categories and services to the classifier, never the pro's raw catalog snapshot from the client", async () => {
    const { req, res } = fakeReqRes({ body: VALID_BODY });
    await handler(req, res);

    const [{ systemPrompt, text }] = reasonMock.mock.calls[0];
    expect(text).toBe(VALID_BODY.description);
    expect(systemPrompt).toMatch(/cleaning/);
    expect(systemPrompt).toMatch(/svc-1/);
  });

  it("on a match, returns the matched id and never writes or translates anything", async () => {
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ outcome: "match", matchedServiceId: "svc-1" });
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when the AI classification call itself fails", async () => {
    reasonMock.mockRejectedValue(new Error("anthropic down"));
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/anthropic down/);
  });

  it("returns a generic 500 when the AI returns an incomplete 'new' classification", async () => {
    reasonMock.mockResolvedValue({ outcome: "new", confidence: 0.5 });
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("on a new proposal, translates the name and blurb into every locale except the pro's own", async () => {
    reasonMock.mockResolvedValue(NEW_CLASSIFICATION);
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // 9 other locales x (name + blurb) = 18 calls, never one for the source locale itself.
    expect(translateMock).toHaveBeenCalledTimes(18);
    expect(translateMock.mock.calls.some(([arg]) => arg.targetLocale === "nl")).toBe(false);
    expect(translateMock.mock.calls.some(([arg]) => arg.targetLocale === "fr" && arg.targetLanguageName === "French" && arg.text === NEW_CLASSIFICATION.proposedName)).toBe(true);
  });

  it("writes the suggestion via api.suggest_service with the classification, translations, and a resolved actor", async () => {
    reasonMock.mockResolvedValue(NEW_CLASSIFICATION);
    const supabase = supabaseStub({ catalogResult: { categories: { data: EXISTING_CATEGORIES, error: null }, services: { data: EXISTING_SERVICES, error: null } } });
    verifyAuthMock.mockResolvedValue({ user: { id: "pro-1" }, supabase });
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe("new");
    expect(supabase.__rpc).toHaveBeenCalledWith(
      "suggest_service",
      expect.objectContaining({
        p_workspace_id: "ws-1",
        p_raw_description: VALID_BODY.description,
        p_locale: "nl",
        p_category_id: "repair",
        p_proposed_name: NEW_CLASSIFICATION.proposedName,
        p_proposed_blurb: NEW_CLASSIFICATION.proposedBlurb,
        p_proposed_mode: "quote",
        p_proposed_base_price: 500,
        p_ai_confidence: 0.82,
        p_actor_type: "person",
        p_actor_ref: "pro-1",
      })
    );
    const [, params] = supabase.__rpc.mock.calls[0];
    expect(Object.keys(params.p_translations).sort()).toEqual(["ar", "de", "en", "es", "fa", "fr", "ru", "tr", "zh"].sort());
    expect(params.p_translations.fr.name).toBe(`translated:${NEW_CLASSIFICATION.proposedName}`);
  });

  it("returns a generic 500 when translation fails", async () => {
    reasonMock.mockResolvedValue(NEW_CLASSIFICATION);
    translateMock.mockRejectedValue(new Error("translation down"));
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/translation down/);
  });

  it("returns 403, not a raw database error, when the caller isn't a real workspace member", async () => {
    reasonMock.mockResolvedValue(NEW_CLASSIFICATION);
    const supabase = supabaseStub({
      catalogResult: { categories: { data: EXISTING_CATEGORIES, error: null }, services: { data: EXISTING_SERVICES, error: null } },
      rpcResult: { data: null, error: { code: "42501", message: "catalog.suggest_service_for_caller: caller is not a member of ws-1" } },
    });
    verifyAuthMock.mockResolvedValue({ user: { id: "pro-1" }, supabase });
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).not.toMatch(/is not a member of/);
  });

  it("returns a generic 500 for any other persist failure", async () => {
    reasonMock.mockResolvedValue(NEW_CLASSIFICATION);
    const supabase = supabaseStub({
      catalogResult: { categories: { data: EXISTING_CATEGORIES, error: null }, services: { data: EXISTING_SERVICES, error: null } },
      rpcResult: { data: null, error: { code: "23505", message: "some other constraint" } },
    });
    verifyAuthMock.mockResolvedValue({ user: { id: "pro-1" }, supabase });
    const { req, res } = fakeReqRes({ body: VALID_BODY });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
  });
});

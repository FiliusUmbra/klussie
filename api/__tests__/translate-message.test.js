// Tests for api/translate-message.js's own request handling: method/validation guards,
// the target-language allowlist, and the generic failure message on an AI-gateway error.
// Not a test of the actual translation output.
//
// Found by code audit: LANGUAGE_NAMES had no es or fa entries at all, even though both
// are real, fully-localized locales this app ships (src/lib/lang.js's own LANGS) --
// targetLocale is always a viewer's own langCode (ConversationSheet.jsx's only caller),
// so every translation request from a Spanish- or Persian-reading person fell through to
// the 400 branch and was silently swallowed by that caller's own catch: the whole
// message-translation feature was completely non-functional for two of the ten
// audiences it claims to serve, with no error ever visible to anyone.
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyAuthMock = vi.fn();
const checkAndLogUsageMock = vi.fn();
const translateMock = vi.fn();
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
vi.mock("../_lib/aiGateway.js", () => ({ translate: (...args) => translateMock(...args) }));
vi.mock("../_lib/events.js", () => ({ emitEvent: (...args) => emitEventMock(...args) }));

import handler from "../translate-message.js";
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

beforeEach(() => {
  vi.clearAllMocks();
  verifyAuthMock.mockResolvedValue({ user: { id: "user-1" }, supabase: {} });
  checkAndLogUsageMock.mockResolvedValue();
  translateMock.mockResolvedValue("translated text");
});

describe("translate-message handler", () => {
  it("rejects anything but POST", async () => {
    const { req, res } = fakeReqRes({ method: "GET" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("requires auth before touching the body", async () => {
    verifyAuthMock.mockRejectedValue(new AuthError("Missing Authorization header.", 401));
    const { req, res } = fakeReqRes({ body: { text: "hallo", targetLocale: "en" } });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("rejects a missing text", async () => {
    const { req, res } = fakeReqRes({ body: { targetLocale: "en" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("rejects text over the length limit", async () => {
    const { req, res } = fakeReqRes({ body: { text: "x".repeat(2001), targetLocale: "en" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(translateMock).not.toHaveBeenCalled();
  });

  // The regression itself: every one of the app's 10 real UI locales (src/lib/lang.js's
  // own LANGS) must be accepted as a translation target — es and fa most of all, since
  // those two were the ones missing entirely.
  it.each(["nl", "fr", "de", "en", "es", "ar", "fa", "tr", "ru", "zh"])(
    "accepts %s as a real target language",
    async (targetLocale) => {
      const { req, res } = fakeReqRes({ body: { text: "hallo", targetLocale } });
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(translateMock).toHaveBeenCalledWith(expect.objectContaining({ targetLocale }));
    }
  );

  it("rejects a target language this client does not know", async () => {
    const { req, res } = fakeReqRes({ body: { text: "hallo", targetLocale: "xx" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(translateMock).not.toHaveBeenCalled();
  });

  it("returns a generic failure message, never a raw one, when the AI gateway throws", async () => {
    translateMock.mockRejectedValue(new Error("upstream 500"));
    const { req, res } = fakeReqRes({ body: { text: "hallo", targetLocale: "en" } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/upstream/);
  });

  it("emits the translated event on success", async () => {
    const { req, res } = fakeReqRes({ body: { text: "hallo", targetLocale: "es" } });
    await handler(req, res);
    expect(emitEventMock).toHaveBeenCalledWith({}, "message.translated", { targetLocale: "es" });
  });
});

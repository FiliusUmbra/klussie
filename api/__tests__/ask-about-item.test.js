// Tests for api/ask-about-item.js's own request handling: method/validation guards, the
// re-resolve-through-the-caller's-own-token pattern (never trusting client-supplied
// "facts"), the at-most-one-preferred-document selection, and the generic failure
// message on an AI-gateway error. Not a test of Claude's actual output — see
// api/_lib/__tests__/aiGateway.test.js for the content-block shape, and
// ai/ask-about-item/evaluation.md for real prompt/answer benchmark cases.
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

import handler from "../ask-about-item.js";
import { AuthError } from "../_lib/auth.js";

const ASSET = {
  id: "asset-1", name: "Boiler", type: "boiler", make: "Vaillant", model: "ecoTEC",
  serial_number: null, condition: "good", acquired_on: null, installed_on: null,
  warranty_expires_on: "2029-01-20", expected_service_life_months: null, notes: null,
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

function supabaseStub({ assetRows = [ASSET], documentRows = [], obligationRows = [], recordRows = [], download = null } = {}) {
  const rpc = vi.fn((name) => {
    if (name === "resolve_asset") return Promise.resolve({ data: assetRows, error: null });
    if (name === "my_documents") return Promise.resolve({ data: documentRows, error: null });
    if (name === "my_maintenance_obligations") return Promise.resolve({ data: obligationRows, error: null });
    if (name === "my_service_records") return Promise.resolve({ data: recordRows, error: null });
    return Promise.resolve({ data: null, error: new Error(`unexpected rpc ${name}`) });
  });
  return {
    schema: () => ({ rpc }),
    storage: { from: () => ({ download: download || vi.fn(() => Promise.resolve({ data: null, error: new Error("no file") })) }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyAuthMock.mockResolvedValue({ user: { id: "user-1" }, supabase: supabaseStub() });
  checkAndLogUsageMock.mockResolvedValue();
  reasonMock.mockResolvedValue({ answer: "The warranty expires on 2029-01-20.", groundedIn: ["item_details"] });
});

describe("ask-about-item handler", () => {
  it("rejects anything but POST", async () => {
    const { req, res } = fakeReqRes({ method: "GET" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("requires auth and rate-limits before touching the body", async () => {
    verifyAuthMock.mockRejectedValue(new AuthError("Missing Authorization header.", 401));
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("rejects a missing itemId", async () => {
    const { req, res } = fakeReqRes({ body: { question: "When does it expire?" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("rejects a missing or blank question", async () => {
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "   " } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a question over the length limit", async () => {
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "a".repeat(301) } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("404s when resolve_asset returns no row -- an item the caller cannot see, never leaked as 403", async () => {
    verifyAuthMock.mockResolvedValue({ user: { id: "user-1" }, supabase: supabaseStub({ assetRows: [] }) });
    const { req, res } = fakeReqRes({ body: { itemId: "someone-elses-asset", question: "q" } });

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(reasonMock).not.toHaveBeenCalled();
  });

  it("re-resolves the item through the caller's own token, never trusting client-supplied facts", async () => {
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "When does the warranty expire?" } });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.answer).toBe("The warranty expires on 2029-01-20.");
    const systemPrompt = reasonMock.mock.calls[0][0].systemPrompt;
    expect(systemPrompt).toMatch(/Vaillant/);
    expect(systemPrompt).toMatch(/2029-01-20/);
  });

  it("answers from item facts alone, with an honest note, when no document is attached", async () => {
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });
    await handler(req, res);

    const call = reasonMock.mock.calls[0][0];
    expect(call.documents).toEqual([]);
    expect(call.systemPrompt).toMatch(/No warranty or manual document is attached/);
  });

  it("prefers a manual over a warranty document when both are attached", async () => {
    const download = vi.fn(() => Promise.resolve({
      data: { size: 10, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) },
      error: null,
    }));
    verifyAuthMock.mockResolvedValue({
      user: { id: "user-1" },
      supabase: supabaseStub({
        documentRows: [
          { id: "doc-warranty", type_key: "warranty", storage_bucket: "documents", storage_path: "ws/doc-warranty/w.pdf" },
          { id: "doc-manual", type_key: "manual", storage_bucket: "documents", storage_path: "ws/doc-manual/m.pdf" },
        ],
        download,
      }),
    });
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });

    await handler(req, res);

    const call = reasonMock.mock.calls[0][0];
    expect(call.documents).toHaveLength(1);
    expect(call.documents[0].mediaType).toBe("application/pdf");
  });

  it("sends a photographed document (jpg/png) as an image content block, never a document one", async () => {
    const download = vi.fn(() => Promise.resolve({
      data: { size: 10, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) },
      error: null,
    }));
    verifyAuthMock.mockResolvedValue({
      user: { id: "user-1" },
      supabase: supabaseStub({
        documentRows: [{ id: "doc-1", type_key: "warranty", storage_bucket: "documents", storage_path: "ws/doc-1/warranty.jpg" }],
        download,
      }),
    });
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });

    await handler(req, res);

    const call = reasonMock.mock.calls[0][0];
    expect(call.documents).toEqual([]);
    expect(call.images).toHaveLength(1);
    expect(call.images[0].mediaType).toBe("image/jpeg");
  });

  it("skips an attachment with an unrecognized file extension, grounding on item facts alone", async () => {
    verifyAuthMock.mockResolvedValue({
      user: { id: "user-1" },
      supabase: supabaseStub({
        documentRows: [{ id: "doc-1", type_key: "manual", storage_bucket: "documents", storage_path: "ws/doc-1/manual.docx" }],
      }),
    });
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });

    await handler(req, res);

    expect(reasonMock.mock.calls[0][0].documents).toEqual([]);
  });

  it("returns the generic localized-at-the-client failure message, never the raw error, when the AI call itself fails", async () => {
    reasonMock.mockRejectedValue(new Error("upstream 500"));
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/upstream 500/);
  });
});

// Item Detail slice — grounding widened to this item's own maintenance and service
// history, both scoped by workspaceId (client-supplied only to say WHICH of the
// caller's own real memberships to query; the RPCs themselves still check
// workspace.current_memberships() server-side), plus the groundedIn citation.
describe("ask-about-item handler — maintenance and service history grounding", () => {
  it("does not fetch maintenance or service history when workspaceId is not given -- unchanged from before this widening", async () => {
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });
    await handler(req, res);

    const systemPrompt = reasonMock.mock.calls[0][0].systemPrompt;
    expect(systemPrompt).toMatch(/No maintenance has been scheduled or logged/);
    expect(systemPrompt).toMatch(/No completed work has been recorded/);
  });

  it("includes this item's own open/overdue maintenance, filtered from the workspace's full list", async () => {
    verifyAuthMock.mockResolvedValue({
      user: { id: "user-1" },
      supabase: supabaseStub({
        obligationRows: [
          { asset_id: "asset-1", title: "Descale", status: "open", due_on: "2030-01-01" },
          { asset_id: "some-other-asset", title: "Filter change", status: "open", due_on: "2030-01-01" },
        ],
      }),
    });
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q", workspaceId: "ws-1" } });

    await handler(req, res);

    const systemPrompt = reasonMock.mock.calls[0][0].systemPrompt;
    expect(systemPrompt).toMatch(/Descale/);
    expect(systemPrompt).not.toMatch(/Filter change/);
  });

  it("includes this item's own service history, already scoped server-side by p_asset_id", async () => {
    verifyAuthMock.mockResolvedValue({
      user: { id: "user-1" },
      supabase: supabaseStub({
        recordRows: [{ performed_at: "2026-08-01T00:00:00Z", work_performed: "Replaced the drain pump.", warranty_until: null }],
      }),
    });
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q", workspaceId: "ws-1" } });

    await handler(req, res);

    expect(reasonMock.mock.calls[0][0].systemPrompt).toMatch(/Replaced the drain pump/);
  });

  it("returns the model's own groundedIn citation, filtered to the real closed set of source names", async () => {
    reasonMock.mockResolvedValue({ answer: "Yes, still covered.", groundedIn: ["item_details", "not_a_real_source"] });
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });

    await handler(req, res);

    expect(res.body.groundedIn).toEqual(["item_details"]);
  });

  it("returns an empty groundedIn array, not a throw, when the model omits it", async () => {
    reasonMock.mockResolvedValue({ answer: "Yes, still covered." });
    const { req, res } = fakeReqRes({ body: { itemId: "asset-1", question: "q" } });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.groundedIn).toEqual([]);
  });
});

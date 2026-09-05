// Tests for api/_lib/aiGateway.js's own content-block construction — the one file that
// knows Anthropic's tool-forcing/content-block shapes (its own header). Not a test of
// Claude's actual output (no real API key is available in CI, and none should be
// needed) — a test that the right request shape reaches the SDK, and that the tool-use
// response is unwrapped correctly. See ai/ask-about-item/prompt.md for the documented
// contract this backs.
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    constructor() {
      this.messages = { create: createMock };
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

const TOOL = {
  name: "submit_answer",
  description: "Submit the answer.",
  input_schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
};

describe("reason()", () => {
  it("sends a plain text-only content block when no images or documents are given", async () => {
    createMock.mockResolvedValue({ content: [{ type: "tool_use", name: "submit_answer", input: { answer: "42" } }] });
    const { reason } = await import("../aiGateway.js");

    await reason({ systemPrompt: "sys", text: "hello", toolSchema: TOOL });

    const call = createMock.mock.calls[0][0];
    expect(call.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hello" }] }]);
    expect(call.tool_choice).toEqual({ type: "tool", name: "submit_answer" });
  });

  it("appends an image content block, base64/media_type carried through unchanged", async () => {
    createMock.mockResolvedValue({ content: [{ type: "tool_use", name: "submit_answer", input: { answer: "ok" } }] });
    const { reason } = await import("../aiGateway.js");

    await reason({
      systemPrompt: "sys", text: "hello",
      images: [{ mediaType: "image/jpeg", data: "AAAA" }],
      toolSchema: TOOL,
    });

    const content = createMock.mock.calls[0][0].messages[0].content;
    expect(content).toContainEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
  });

  // "Ask Klussie" slice (0199) — a warranty/manual PDF, read by Claude natively rather
  // than through a separate OCR/extraction step (this file's own header).
  it("appends a document content block for a PDF, alongside text and any images", async () => {
    createMock.mockResolvedValue({ content: [{ type: "tool_use", name: "submit_answer", input: { answer: "ok" } }] });
    const { reason } = await import("../aiGateway.js");

    await reason({
      systemPrompt: "sys", text: "When does the warranty expire?",
      documents: [{ mediaType: "application/pdf", data: "QkJC" }],
      toolSchema: TOOL,
    });

    const content = createMock.mock.calls[0][0].messages[0].content;
    expect(content).toContainEqual({ type: "document", source: { type: "base64", media_type: "application/pdf", data: "QkJC" } });
  });

  it("returns the tool_use block's input, not the raw response", async () => {
    createMock.mockResolvedValue({
      content: [
        { type: "text", text: "thinking out loud" },
        { type: "tool_use", name: "submit_answer", input: { answer: "The warranty expires in 2029." } },
      ],
    });
    const { reason } = await import("../aiGateway.js");

    const result = await reason({ systemPrompt: "sys", text: "q", toolSchema: TOOL });

    expect(result).toEqual({ answer: "The warranty expires in 2029." });
  });

  it("throws a clear error when the model returns no tool_use block at all", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "just talking" }] });
    const { reason } = await import("../aiGateway.js");

    await expect(reason({ systemPrompt: "sys", text: "q", toolSchema: TOOL })).rejects.toThrow(
      "AI did not return a structured response."
    );
  });

  it("throws a clear, explicit error when ANTHROPIC_API_KEY is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { reason } = await import("../aiGateway.js");

    await expect(reason({ systemPrompt: "sys", text: "q", toolSchema: TOOL })).rejects.toThrow(
      "AI Gateway is not configured on the server (missing ANTHROPIC_API_KEY)."
    );
  });
});

describe("translate()", () => {
  it("wraps reason() with a translation-specific system prompt and the haiku model", async () => {
    createMock.mockResolvedValue({ content: [{ type: "tool_use", name: "submit_translation", input: { translatedText: "Bonjour" } }] });
    const { translate } = await import("../aiGateway.js");

    const result = await translate({ text: "Hello", targetLocale: "fr", targetLanguageName: "French" });

    expect(result).toBe("Bonjour");
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
    expect(call.system).toMatch(/French/);
    expect(call.system).toMatch(/fr/);
  });
});

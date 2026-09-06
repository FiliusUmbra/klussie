// Tests for api/_lib/documentAttachment.js — the security-relevant part of handing an
// already-attached document to the AI Gateway: which extensions are trusted, how big a
// file may be, and what happens when the download itself fails. Extracted from
// api/ask-about-item.js during the Document Understanding slice so both it and
// api/suggest-item-details.js share one implementation.
import { describe, it, expect, vi } from "vitest";
import { extensionOf, fetchDocumentAttachment } from "../documentAttachment.js";

function supabaseStub({ download }) {
  return { storage: { from: () => ({ download }) } };
}

function blobOf(bytes, size = bytes.length) {
  return { size, arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) };
}

describe("extensionOf()", () => {
  it("lowercases and returns the extension", () => {
    expect(extensionOf("ws/doc-1/Manual.PDF")).toBe("pdf");
  });

  it("returns null for a path with no extension", () => {
    expect(extensionOf("ws/doc-1/manual")).toBeNull();
  });

  it("returns null for a missing path", () => {
    expect(extensionOf(undefined)).toBeNull();
  });
});

describe("fetchDocumentAttachment()", () => {
  it("downloads a PDF and returns a 'document' kind attachment, base64-encoded", async () => {
    const download = vi.fn(() => Promise.resolve({ data: blobOf([1, 2, 3]), error: null }));
    const supabase = supabaseStub({ download });

    const result = await fetchDocumentAttachment(supabase, { storageBucket: "documents", storagePath: "ws/doc-1/manual.pdf" });

    expect(result.reason).toBeNull();
    expect(result.attachment).toEqual({ kind: "document", mediaType: "application/pdf", data: Buffer.from([1, 2, 3]).toString("base64") });
  });

  it("downloads a JPEG and returns an 'image' kind attachment -- never sent as a document block", async () => {
    const download = vi.fn(() => Promise.resolve({ data: blobOf([4, 5, 6]), error: null }));
    const supabase = supabaseStub({ download });

    const result = await fetchDocumentAttachment(supabase, { storageBucket: "documents", storagePath: "ws/doc-1/warranty.jpg" });

    expect(result.attachment.kind).toBe("image");
    expect(result.attachment.mediaType).toBe("image/jpeg");
  });

  it("skips an unrecognized extension without attempting a download", async () => {
    const download = vi.fn();
    const supabase = supabaseStub({ download });

    const result = await fetchDocumentAttachment(supabase, { storageBucket: "documents", storagePath: "ws/doc-1/manual.docx" });

    expect(result.attachment).toBeNull();
    expect(result.reason).toBe("unsupported_type");
    expect(download).not.toHaveBeenCalled();
  });

  it("skips a file over the size cap without sending it anywhere", async () => {
    const download = vi.fn(() => Promise.resolve({ data: blobOf([0], 9 * 1024 * 1024), error: null }));
    const supabase = supabaseStub({ download });

    const result = await fetchDocumentAttachment(supabase, { storageBucket: "documents", storagePath: "ws/doc-1/manual.pdf" });

    expect(result.attachment).toBeNull();
    expect(result.reason).toBe("too_large");
  });

  it("reports a download failure distinctly from an unsupported type", async () => {
    const download = vi.fn(() => Promise.resolve({ data: null, error: new Error("not found") }));
    const supabase = supabaseStub({ download });

    const result = await fetchDocumentAttachment(supabase, { storageBucket: "documents", storagePath: "ws/doc-1/manual.pdf" });

    expect(result.attachment).toBeNull();
    expect(result.reason).toBe("download_failed");
  });
});

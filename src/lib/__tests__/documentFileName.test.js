import { describe, it, expect } from "vitest";
import { documentFileName } from "../documentFileName.js";

describe("documentFileName", () => {
  it("is the last segment of the storage path (workspace/document/filename)", () => {
    expect(documentFileName({ storagePath: "ws-1/doc-1/TEST-REVIEW-document.txt" })).toBe("TEST-REVIEW-document.txt");
  });
  it("decodes a percent-encoded name, and survives a malformed one", () => {
    expect(documentFileName({ storagePath: "ws/doc/My%20manual.pdf" })).toBe("My manual.pdf");
    expect(documentFileName({ storagePath: "ws/doc/100%.pdf" })).toBe("100%.pdf");
  });
  it("is empty when there is no stored path", () => {
    expect(documentFileName({})).toBe("");
    expect(documentFileName(null)).toBe("");
  });
});

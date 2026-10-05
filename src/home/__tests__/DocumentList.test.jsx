// DocumentList (panelParts.jsx) — 2026-10-04 live review, item 4: a property-level document
// listed as just its type label, with no file name and nothing to tap. Rows now show the
// real file name and offer Open and Download.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/documents.js", () => ({
  getDocumentUrl: vi.fn(() => Promise.resolve("https://staging.example/signed")),
  documentTypeLabelKey: (k) => ({ other: "documentTypeOther", warranty: "documentTypeWarranty" })[k] ?? null,
}));

import { getDocumentUrl } from "../../lib/documents.js";
import { DocumentList } from "../panelParts.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const DOC = { id: "d1", typeKey: "other", issuer: "TEST REVIEW", storageBucket: "documents", storagePath: "ws-1/d1/TEST-REVIEW-document.txt" };

let openSpy;
beforeEach(() => { openSpy = vi.spyOn(window, "open").mockImplementation(() => null); vi.mocked(getDocumentUrl).mockClear(); });
afterEach(() => openSpy.mockRestore());

const renderList = (documents = [DOC]) => render(<DocumentList t={t} fmtDate={(d) => d} documents={documents} />);

describe("DocumentList", () => {
  it("shows the real file name under the type label", () => {
    renderList();
    expect(screen.getByText("TEST-REVIEW-document.txt")).toBeTruthy();
    expect(screen.getByText("documentTypeOther — TEST REVIEW")).toBeTruthy();
  });

  it("Open fetches a signed URL and opens it in a new tab", async () => {
    renderList();
    fireEvent.click(screen.getByText("documentOpenAction"));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith("https://staging.example/signed", "_blank", "noopener,noreferrer"));
    expect(getDocumentUrl).toHaveBeenCalledWith("documents", "ws-1/d1/TEST-REVIEW-document.txt", { download: false });
  });

  it("Download asks for an attachment URL", async () => {
    renderList();
    fireEvent.click(screen.getByLabelText("documentDownloadAction"));
    await waitFor(() => expect(getDocumentUrl).toHaveBeenCalledWith("documents", "ws-1/d1/TEST-REVIEW-document.txt", { download: true }));
  });

  it("says so, instead of doing nothing, when the file can't be retrieved", async () => {
    vi.mocked(getDocumentUrl).mockResolvedValueOnce(null);
    renderList();
    fireEvent.click(screen.getByText("documentOpenAction"));
    expect((await screen.findByRole("alert")).textContent).toBe("itemDetailDocumentOpenFailed");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("offers no retrieval buttons for a document with no stored file (nothing to open)", () => {
    renderList([{ id: "d2", typeKey: "other" }]);
    expect(screen.queryByText("documentOpenAction")).toBeNull();
  });
});

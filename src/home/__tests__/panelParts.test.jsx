// DocumentRowContent's own tests. Shared by DocumentList (MyItemsPanel.jsx's own
// property-level list) and Item Detail's own document rows (ItemDetailSheet.jsx) — one
// component, both callers get any fix here at once.
//
// Found live during a UX review, 2026-09-06: two of a customer's real documents both
// fell back to the exact same bare type label ("Warranty", "Warranty"), genuinely
// indistinguishable in the list — even though DocumentUploadSheet.jsx has always asked
// for and saved an `issuer` (e.g. "Vaillant"), already threaded through every fetch path.
// See ProJobDetailSheet.test.jsx for the identical fix on the pro's own, separate
// rendering of the same data.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentRowContent, DocumentList } from "../panelParts.jsx";

// Returns each key as itself, matching this codebase's own established test idiom.
const t = new Proxy({}, { get: (_, key) => String(key) });
const fmtDate = (ts) => `date:${ts}`;

describe("DocumentRowContent", () => {
  it("shows only the type label when the document has no issuer — unchanged from before", () => {
    render(<DocumentRowContent t={t} fmtDate={fmtDate} doc={{ id: "d1", typeKey: "warranty" }} />);
    expect(screen.getByText("documentTypeWarranty")).toBeTruthy();
  });

  it("appends the document's own issuer to its type label, when one is given", () => {
    render(<DocumentRowContent t={t} fmtDate={fmtDate} doc={{ id: "d1", typeKey: "warranty", issuer: "Vaillant" }} />);
    expect(screen.getByText("documentTypeWarranty — Vaillant")).toBeTruthy();
  });

  it("prefers a real caption over the type label + issuer, unchanged from before", () => {
    render(<DocumentRowContent t={t} fmtDate={fmtDate} doc={{ id: "d1", typeKey: "warranty", issuer: "Vaillant", caption: "Boiler warranty card" }} />);
    expect(screen.getByText("Boiler warranty card")).toBeTruthy();
    expect(screen.queryByText(/Vaillant/)).toBeNull();
  });

  it("falls back to the raw typeKey + issuer for a document type this codebase has no label for", () => {
    render(<DocumentRowContent t={t} fmtDate={fmtDate} doc={{ id: "d1", typeKey: "some_future_type", issuer: "Acme" }} />);
    expect(screen.getByText("some_future_type — Acme")).toBeTruthy();
  });
});

describe("DocumentList", () => {
  it("distinguishes two documents of the same type by their own issuer", () => {
    render(
      <DocumentList
        t={t}
        fmtDate={fmtDate}
        documents={[
          { id: "d1", typeKey: "warranty", issuer: "Vaillant" },
          { id: "d2", typeKey: "warranty", issuer: "Bosch" },
        ]}
      />
    );
    expect(screen.getByText("documentTypeWarranty — Vaillant")).toBeTruthy();
    expect(screen.getByText("documentTypeWarranty — Bosch")).toBeTruthy();
  });
});

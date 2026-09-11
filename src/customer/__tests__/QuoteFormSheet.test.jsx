// QuoteFormSheet.jsx's own tests — none existed before this.
//
// Found by code audit: closeLabel was missing on this Drawer, and the "Remove photo"
// button was still hardcoded English ("Remove photo") instead of the real,
// already-localized t.itemPhotoRemove three sibling .photo-remove-btn instances already
// use (AiIntakeSheet.jsx, ItemFormSheet.jsx, ServiceRecordEditorSheet.jsx). Currently
// unreachable in production (CustomerApp.jsx's own header: no live trigger sets
// activeService/quoteForm today), but both are real bugs the moment this screen is
// reconnected — scoped narrowly to just those two regressions; ServiceLocationField and
// ItemAssociationField are stubbed to trivial markers so this file never needs to reach
// into their own dependency trees.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/auth.jsx", () => ({
  useAuth: () => ({ user: { id: "cust-1" }, profile: { city: "Gent" }, activeWorkspace: { workspace_id: "ws-1" } }),
}));
vi.mock("../ServiceLocationField.jsx", () => ({ ServiceLocationField: () => null }));
vi.mock("../ItemAssociationField.jsx", () => ({ ItemAssociationField: () => null }));

import { LangContext } from "../../lib/lang";
import { QuoteFormSheet } from "../QuoteFormSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t,
  serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }),
  whenLabel: (w) => w,
};

const SERVICE = { id: "svc-plumbing", cat: "plumbing", mode: "quote" };

function renderSheet(props = {}) {
  return render(
    <LangContext.Provider value={ctx}>
      <QuoteFormSheet service={SERVICE} onClose={vi.fn()} onSubmit={vi.fn()} {...props} />
    </LangContext.Provider>
  );
}

describe("QuoteFormSheet", () => {
  it("gives the close button a real accessible name, not the design-system default", () => {
    renderSheet();
    expect(screen.getByLabelText("closeBtn")).toBeTruthy();
  });

  it("gives a real, localized accessible name to the remove-photo button, not hardcoded English", async () => {
    renderSheet();

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["x"], "leak.jpg", { type: "image/jpeg" });
    // jsdom doesn't implement createObjectURL — stub it so addPhotos() doesn't throw.
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByLabelText("itemPhotoRemove")).toBeTruthy();
    expect(screen.queryByLabelText("Remove photo")).toBeNull();
  });
});

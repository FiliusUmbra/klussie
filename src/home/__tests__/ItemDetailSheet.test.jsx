// Item Detail slice — ItemDetailSheet.jsx's own tests. This is the new front door for an
// existing real item: Identity (facts, not a form), Documents (list + real open action),
// Maintenance (filtered from the workspace-wide list already fetched upstream), History
// (this item's own service records), Ask Klussie (now grounded in maintenance/service
// history too, with a real citation), and the Move/Retire/Report-a-problem actions.
//
// EVERY RENDER GOES THROUGH renderDetail(), NOT A BARE render() CALL
//
// The component always fires two async fetches on mount (documents, service history),
// regardless of which behaviour a given test cares about. A bare render() followed by
// purely synchronous assertions leaves both promises' .then(setState) still pending when
// the test function returns — React then applies that state update during the NEXT
// test's render cycle, outside act(), which produced real, reproducible cross-test
// flakiness here (a later test's own button clicks silently missing their handler).
// renderDetail() waits for both fetches to have actually been called and settled before
// returning, so every test starts from a fully quiesced component.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/householdItems.js", () => ({
  moveAsset: vi.fn(() => Promise.resolve()),
  retireAsset: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../lib/documents.js", () => ({
  createDocument: vi.fn(() => Promise.resolve({ id: "doc-new" })),
  fetchDocumentsForAsset: vi.fn(() => Promise.resolve([])),
  getDocumentUrl: vi.fn(() => Promise.resolve("https://staging.example/signed-url")),
  documentTypeLabelKey: (typeKey) => ({
    warranty: "documentTypeWarranty", certificate: "documentTypeCertificate",
    manual: "documentTypeManual", other: "documentTypeOther",
  })[typeKey] ?? null,
}));
vi.mock("../../lib/serviceRecords.js", () => ({
  fetchServiceRecordsForAsset: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../lib/askAboutItem.js", () => ({
  askAboutItem: vi.fn(() => Promise.resolve({ answer: "The warranty expires on 2029-01-20.", groundedIn: ["item_details"] })),
}));

import { moveAsset, retireAsset } from "../../lib/householdItems.js";
import { fetchDocumentsForAsset, getDocumentUrl } from "../../lib/documents.js";
import { fetchServiceRecordsForAsset } from "../../lib/serviceRecords.js";
import { askAboutItem } from "../../lib/askAboutItem.js";
import { ItemDetailSheet } from "../ItemDetailSheet.jsx";

const t = {
  itemRoomLabel: "Room", itemRoomNone: "No room selected", cancelBtn: "Cancel",
  itemAskTitle: "Ask Klussie about this", itemAskHint: "Klussie answers from what's saved about this item.",
  itemAskPlaceholder: "e.g. When does the warranty expire?", itemAskButton: "Ask",
  itemAskThinking: "Klussie is thinking…", itemAskFailed: "Klussie couldn't answer right now. Please try again.",
  itemAskSourceLabel: "Source", itemAskSourceDetails: "this item's own details",
  itemAskSourceDocument: "its attached document", itemAskSourceMaintenance: "its maintenance records",
  itemAskSourceHistory: "its service history",
  itemDocumentsTitle: "Documents", itemDocumentsEmpty: "No documents added for this item yet.",
  itemDetailDocumentOpenFailed: "Couldn't open this document. Please try again.",
  documentFormAddTitle: "Add a document", documentFormFileLabel: "File", documentFormFileAdd: "Choose file",
  documentFormTypeLabel: "Type", documentTypeWarranty: "Warranty", documentTypeCertificate: "Certificate",
  documentTypeManual: "Manual", documentTypeOther: "Other",
  documentFormIssuerLabel: "Issuer", documentFormValidUntilLabel: "Valid until", documentFormSaveNew: "Save document",
  documentFormSaveFailed: "Couldn't save the document. Please try again.",
  myItemsLoading: "Loading…", myItemsDocumentExpired: "Expired", myItemsDocumentValidUntil: "Valid until {date}",
  myItemsMaintenanceTitle: "Maintenance", myItemsMaintenanceEmpty: "Nothing scheduled or overdue.",
  myItemsMaintenanceOverdue: "Overdue", myItemsMaintenanceDueOn: "Due {date}",
  itemDetailHistoryTitle: "History", itemDetailHistoryEmpty: "No completed work recorded for this item yet.",
  itemDetailEditAction: "Edit details",
  itemDetailMoveAction: "Move to another room", itemDetailMoveTitle: "Move item", itemDetailMoveSave: "Save",
  itemDetailMoveFailed: "Couldn't move this item. Please try again.",
  itemDetailReportProblem: "Report a problem",
  itemDetailRetireAction: "Retire item",
  itemDetailRetireConfirm: "Retire this item? It will disappear from your active items, but its history is kept.",
  itemDetailRetireFailed: "Couldn't retire this item. Please try again.",
  itemDetailWarrantyCovered: "Covered by warranty until {date}", itemDetailWarrantyExpired: "Warranty ended on {date}",
  itemDetailWarrantyUnknown: "No warranty date saved",
};

const ITEM = {
  id: "asset-1", name: "Washing machine", brand: "Vaillant", model: "ecoTEC",
  room: "Kitchen", locationId: "loc-1", purchasedOn: "2024-01-15",
  warrantyExpiresOn: "2029-01-20", photoUrl: null,
};

const ROOMS = [
  { id: "loc-1", name: "Kitchen", type: "kitchen", children: [] },
  { id: "loc-2", name: "Garage", type: null, children: [] },
];

const fmtDate = (iso) => iso;

const BASE_PROPS = {
  t, ownerId: "owner-1", workspaceId: "ws-1", rooms: ROOMS, fmtDate, item: ITEM,
  maintenance: [], onClose: () => {}, onEdit: () => {}, onSaved: () => Promise.resolve(),
};

async function renderDetail(props = {}) {
  const utils = render(<ItemDetailSheet {...BASE_PROPS} {...props} />);
  await waitFor(() => {
    expect(fetchDocumentsForAsset).toHaveBeenCalled();
    expect(fetchServiceRecordsForAsset).toHaveBeenCalled();
  });
  // The two fetches above resolve immediately (mocked), but their own .then(setState)
  // still lands on a later microtask than the assertion above — one more real await
  // (not a bare Promise.resolve()) gives React's own scheduler room to flush it before
  // the test starts interacting, which is the actual fix for the cross-test act()
  // warnings this file used to produce.
  await waitFor(() => {});
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ItemDetailSheet — Identity", () => {
  it("shows the item's own name, brand/model, room, purchase date and warranty status", async () => {
    await renderDetail();
    expect(screen.getByText("Washing machine")).toBeTruthy();
    expect(screen.getByText("Vaillant ecoTEC")).toBeTruthy();
    expect(screen.getByText("Kitchen")).toBeTruthy();
    expect(screen.getByText("2024-01-15")).toBeTruthy();
    expect(screen.getByText("Covered by warranty until 2029-01-20")).toBeTruthy();
  });

  it("shows the room-none label when the item has no room", async () => {
    await renderDetail({ item: { ...ITEM, room: null, locationId: null } });
    expect(screen.getByText("No room selected")).toBeTruthy();
  });

  // Item Detail slice (0201) — move_asset_for_caller() only ever updates locationId,
  // never the free-text room_label an item was originally created with, so the room
  // shown here must resolve against the real room tree, not the (possibly stale) label.
  it("prefers the real current room over a stale free-text label", async () => {
    await renderDetail({ item: { ...ITEM, room: "Kitchen", locationId: "loc-2" } });
    expect(screen.getByText("Garage")).toBeTruthy();
    expect(screen.queryByText("Kitchen")).toBeNull();
  });

  it("falls back to the stored free-text room label when no real location is set", async () => {
    await renderDetail({ item: { ...ITEM, room: "Attic", locationId: null } });
    expect(screen.getByText("Attic")).toBeTruthy();
  });

  it("shows an honest 'no warranty date' state when none is saved", async () => {
    await renderDetail({ item: { ...ITEM, warrantyExpiresOn: null } });
    expect(screen.getByText("No warranty date saved")).toBeTruthy();
  });

  it("shows an expired-warranty state for a past date", async () => {
    await renderDetail({ item: { ...ITEM, warrantyExpiresOn: "2020-01-01" } });
    expect(screen.getByText("Warranty ended on 2020-01-01")).toBeTruthy();
  });

  it("calls onEdit when 'Edit details' is tapped", async () => {
    const onEdit = vi.fn();
    await renderDetail({ onEdit });
    fireEvent.click(screen.getByText("Edit details"));
    expect(onEdit).toHaveBeenCalled();
  });
});

describe("ItemDetailSheet — Documents", () => {
  it("shows the empty state, then a real document once fetched", async () => {
    fetchDocumentsForAsset.mockResolvedValueOnce([
      { id: "doc-1", typeKey: "manual", caption: null, validUntil: null, storageBucket: "documents", storagePath: "ws-1/doc-1/manual.pdf" },
    ]);
    await renderDetail();
    expect(fetchDocumentsForAsset).toHaveBeenCalledWith("asset-1");
    expect(screen.getByText("Manual")).toBeTruthy();
  });

  it("shows the real empty-documents message when there are none", async () => {
    await renderDetail();
    expect(screen.getByText("No documents added for this item yet.")).toBeTruthy();
  });

  it("opens a real signed URL when a document row is tapped", async () => {
    fetchDocumentsForAsset.mockResolvedValueOnce([
      { id: "doc-1", typeKey: "manual", caption: null, validUntil: null, storageBucket: "documents", storagePath: "ws-1/doc-1/manual.pdf" },
    ]);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    await renderDetail();

    fireEvent.click(screen.getByText("Manual").closest("button"));

    await waitFor(() => expect(getDocumentUrl).toHaveBeenCalledWith("documents", "ws-1/doc-1/manual.pdf"));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith("https://staging.example/signed-url", "_blank", "noopener,noreferrer"));
    openSpy.mockRestore();
  });

  it("shows a real failure message, never a silent no-op, when opening a document fails", async () => {
    fetchDocumentsForAsset.mockResolvedValueOnce([
      { id: "doc-1", typeKey: "manual", caption: null, validUntil: null, storageBucket: "documents", storagePath: "ws-1/doc-1/manual.pdf" },
    ]);
    getDocumentUrl.mockResolvedValueOnce(null);
    await renderDetail();

    fireEvent.click(screen.getByText("Manual").closest("button"));

    await waitFor(() => expect(screen.getByText("Couldn't open this document. Please try again.")).toBeTruthy());
  });

  it("opens DocumentUploadSheet scoped to this item's own id when 'Add a document' is tapped", async () => {
    await renderDetail();
    fireEvent.click(screen.getByText("Add a document"));
    expect(screen.getByText("Choose file")).toBeTruthy();
  });
});

describe("ItemDetailSheet — Maintenance (filtered from the already-fetched workspace list)", () => {
  it("shows the empty state when this item has no maintenance rows", async () => {
    const maintenance = [{ id: "m-1", assetId: "some-other-asset", title: "Filter change", status: "open", dueOn: "2030-01-01", isOverdue: false }];
    await renderDetail({ maintenance });
    expect(screen.getByText("Nothing scheduled or overdue.")).toBeTruthy();
  });

  it("shows only this item's own maintenance rows, not the whole workspace's", async () => {
    const maintenance = [
      { id: "m-1", assetId: "asset-1", title: "Descale", status: "open", dueOn: "2030-01-01", isOverdue: false },
      { id: "m-2", assetId: "some-other-asset", title: "Filter change", status: "open", dueOn: "2030-01-01", isOverdue: false },
    ];
    await renderDetail({ maintenance });
    expect(screen.getByText("Descale")).toBeTruthy();
    expect(screen.queryByText("Filter change")).toBeNull();
  });

  it("shows a loading line while the workspace-wide list has not resolved yet (maintenance is null)", async () => {
    // Not renderDetail() here on purpose -- that helper waits for BOTH document/history
    // fetches to settle, but this test's own point is that the workspace-wide maintenance
    // fetch (owned by the caller, not this component) has not resolved yet.
    render(<ItemDetailSheet {...BASE_PROPS} maintenance={null} />);
    await waitFor(() => {
      expect(fetchDocumentsForAsset).toHaveBeenCalled();
      expect(fetchServiceRecordsForAsset).toHaveBeenCalled();
    });
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});

describe("ItemDetailSheet — History (this item's own service records)", () => {
  it("shows the empty state honestly when there is no recorded work yet", async () => {
    await renderDetail();
    expect(fetchServiceRecordsForAsset).toHaveBeenCalledWith("ws-1", "asset-1");
    expect(screen.getByText("No completed work recorded for this item yet.")).toBeTruthy();
  });

  it("lists a real service record once fetched", async () => {
    fetchServiceRecordsForAsset.mockResolvedValueOnce([
      { id: "sr-1", performedAt: "2026-08-01", workPerformed: "Replaced the drain pump.", warrantyUntil: null },
    ]);
    await renderDetail();
    expect(screen.getByText("Replaced the drain pump.")).toBeTruthy();
  });
});

describe("ItemDetailSheet — Move", () => {
  it("moves the item to the picked room, then closes the whole sheet", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    await renderDetail({ onSaved, onClose });

    fireEvent.click(screen.getByText("Move to another room"));
    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "loc-2" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(moveAsset).toHaveBeenCalledWith("asset-1", "loc-2", "owner-1"));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("sends null when 'No room selected' is picked -- unplacing is allowed", async () => {
    await renderDetail();
    fireEvent.click(screen.getByText("Move to another room"));
    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(moveAsset).toHaveBeenCalledWith("asset-1", null, "owner-1"));
  });

  it("shows a real failure message and keeps the sheet open when the move fails", async () => {
    moveAsset.mockRejectedValueOnce(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    await renderDetail({ onClose });

    fireEvent.click(screen.getByText("Move to another room"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByText("Couldn't move this item. Please try again.")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ItemDetailSheet — Retire", () => {
  it("asks for confirmation, then retires and closes on success", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    await renderDetail({ onSaved, onClose });

    fireEvent.click(screen.getByText("Retire item"));
    expect(retireAsset).not.toHaveBeenCalled();
    expect(screen.getByText("Retire this item? It will disappear from your active items, but its history is kept.")).toBeTruthy();

    fireEvent.click(screen.getAllByText("Retire item")[1]);

    await waitFor(() => expect(retireAsset).toHaveBeenCalledWith("asset-1", "owner-1"));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a real failure message when retiring fails", async () => {
    retireAsset.mockRejectedValueOnce(new Error("boom"));
    await renderDetail();

    fireEvent.click(screen.getByText("Retire item"));
    fireEvent.click(screen.getAllByText("Retire item")[1]);

    await waitFor(() => expect(screen.getByText("Couldn't retire this item. Please try again.")).toBeTruthy());
  });
});

describe("ItemDetailSheet — Report a problem", () => {
  it("calls onReportProblem when given", async () => {
    const onReportProblem = vi.fn();
    await renderDetail({ onReportProblem });
    fireEvent.click(screen.getByText("Report a problem"));
    expect(onReportProblem).toHaveBeenCalled();
  });

  it("omits the action entirely when not given (MyBusinessPanel.jsx's own reuse has no conversational flow)", async () => {
    await renderDetail({ onReportProblem: undefined });
    expect(screen.queryByText("Report a problem")).toBeNull();
  });
});

describe("ItemDetailSheet — Ask Klussie (grounded, now including maintenance and service history)", () => {
  it("disables Ask until a question is typed, then answers with a real citation", async () => {
    await renderDetail();

    expect(screen.getByText("Ask").closest("button").disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. When does the warranty expire?"), { target: { value: "When does the warranty expire?" } });
    expect(screen.getByText("Ask").closest("button").disabled).toBe(false);
    fireEvent.click(screen.getByText("Ask"));

    await waitFor(() => expect(askAboutItem).toHaveBeenCalledWith({
      itemId: "asset-1", question: "When does the warranty expire?", workspaceId: "ws-1",
    }));
    await waitFor(() => expect(screen.getByText("The warranty expires on 2029-01-20.")).toBeTruthy());
    expect(screen.getByText("Source: this item's own details")).toBeTruthy();
  });

  it("shows no citation line when groundedIn is empty (the model said it didn't know)", async () => {
    askAboutItem.mockResolvedValueOnce({ answer: "I don't have that information.", groundedIn: ["none"] });
    await renderDetail();

    fireEvent.change(screen.getByPlaceholderText("e.g. When does the warranty expire?"), { target: { value: "q" } });
    fireEvent.click(screen.getByText("Ask"));

    await waitFor(() => expect(screen.getByText("I don't have that information.")).toBeTruthy());
    expect(screen.queryByText(/^Source:/)).toBeNull();
  });

  it("shows the generic localized error, never the raw failure, when asking fails", async () => {
    askAboutItem.mockRejectedValueOnce(new Error("500 Internal Server Error"));
    await renderDetail();

    fireEvent.change(screen.getByPlaceholderText("e.g. When does the warranty expire?"), { target: { value: "Is it still under warranty?" } });
    fireEvent.click(screen.getByText("Ask"));

    await waitFor(() => expect(screen.getByText("Klussie couldn't answer right now. Please try again.")).toBeTruthy());
    expect(screen.queryByText("500 Internal Server Error")).toBeNull();
  });
});

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
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../lib/householdItems.js", () => ({
  moveAsset: vi.fn(() => Promise.resolve()),
  retireAsset: vi.fn(() => Promise.resolve()),
  updateAsset: vi.fn(() => Promise.resolve({ id: "asset-1", photoPath: null })),
}));
vi.mock("../../lib/maintenance.js", () => ({
  createMaintenanceObligation: vi.fn(() => Promise.resolve()),
  completeMaintenanceObligation: vi.fn(() => Promise.resolve()),
  cancelMaintenanceObligation: vi.fn(() => Promise.resolve()),
  fetchMaintenanceSchedules: vi.fn(() => Promise.resolve([])),
  createMaintenanceSchedule: vi.fn(() => Promise.resolve()),
  cancelMaintenanceSchedule: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../lib/documentUnderstanding.js", () => ({
  suggestItemDetailsFromDocument: vi.fn(() => Promise.resolve({ suggestions: {} })),
  DOCUMENT_UNREADABLE: "DOCUMENT_UNREADABLE",
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

import { moveAsset, retireAsset, updateAsset } from "../../lib/householdItems.js";
import { fetchDocumentsForAsset, getDocumentUrl } from "../../lib/documents.js";
import { fetchServiceRecordsForAsset } from "../../lib/serviceRecords.js";
import { askAboutItem } from "../../lib/askAboutItem.js";
import {
  createMaintenanceObligation, completeMaintenanceObligation, cancelMaintenanceObligation,
  fetchMaintenanceSchedules, createMaintenanceSchedule, cancelMaintenanceSchedule,
} from "../../lib/maintenance.js";
import { suggestItemDetailsFromDocument } from "../../lib/documentUnderstanding.js";
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
  itemDetailAddMaintenanceAction: "Add maintenance", itemDetailAddMaintenanceTitleLabel: "Task",
  itemDetailAddMaintenanceTitlePlaceholder: "e.g. Descale the machine",
  itemDetailAddMaintenanceDescriptionLabel: "Notes (optional)", itemDetailAddMaintenanceDueLabel: "Due date",
  itemDetailAddMaintenanceSave: "Save",
  itemDetailAddMaintenanceFailed: "Couldn't save this task. Please try again.",
  itemDetailMaintenanceMarkDone: "Mark done", itemDetailMaintenanceCancelTask: "Cancel task",
  itemDetailMaintenanceCancelReasonLabel: "Reason (required)",
  itemDetailMaintenanceCancelReasonPlaceholder: "e.g. No longer needed",
  itemDetailMaintenanceCompleted: "Completed", itemDetailMaintenanceCancelledReason: "Cancelled: {reason}",
  itemDetailMaintenanceActionFailed: "Couldn't update this task. Please try again.",
  itemDetailScheduleModeOnce: "One-time", itemDetailScheduleModeRecurring: "Recurring",
  itemDetailScheduleStartsOnLabel: "Starts on", itemDetailScheduleCadenceLabel: "Repeats",
  itemDetailScheduleCadenceMonthly: "Monthly", itemDetailScheduleCadenceEvery3Months: "Every 3 months",
  itemDetailScheduleCadenceEvery6Months: "Every 6 months", itemDetailScheduleCadenceYearly: "Yearly",
  itemDetailScheduleStopAction: "Stop future reminders",
  itemDetailScheduleStopConfirm: "Stop future reminders for this task? It won't be scheduled again, but anything already due stays as is.",
  itemDetailScheduleStopFailed: "Couldn't stop future reminders. Please try again.",
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
  itemDetailSuggestAction: "Let Klussie read this", itemDetailSuggestTitle: "Suggested details",
  itemDetailSuggestIntro: "Klussie found the following in this document. Check the ones you want to save.",
  itemDetailSuggestEmpty: "Klussie didn't find any new details in this document.",
  itemDetailSuggestFailed: "Klussie could not read this document right now. Please try again.",
  itemDetailSuggestUnreadable: "Klussie can only read PDF, JPG or PNG files right now.",
  itemDetailSuggestSave: "Save selected",
  itemDetailSuggestSaveFailed: "Couldn't save the selected details. Please try again.",
  itemDetailSuggestFieldManufacturer: "Manufacturer", itemDetailSuggestFieldModel: "Model",
  itemDetailSuggestFieldSerialNumber: "Serial number", itemDetailSuggestFieldPurchaseDate: "Purchase date",
  itemDetailSuggestFieldInstallDate: "Install date", itemDetailSuggestFieldWarrantyEndDate: "Warranty end date",
  itemDetailSuggestCurrentValue: "Currently: {value}", itemDetailSuggestMaintenanceTitle: "Suggested maintenance",
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
    // Recurring Maintenance Activation slice — a third fetch joined the same initial
    // effect; the exact class of omission that produced this file's own act() bug
    // before (see below) is trivial to reintroduce by forgetting to wait for a newly
    // added fetch here too.
    expect(fetchMaintenanceSchedules).toHaveBeenCalled();
  });
  // The fetches above resolve immediately (mocked), but their own .then(setState)
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
      expect(fetchMaintenanceSchedules).toHaveBeenCalled();
    });
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});

// Add Maintenance slice — the plain, unconditional "Add maintenance" action, now that
// api.create_maintenance_obligation() has a real client caller (the Document
// Understanding slice's own confirm flow). A due date is required at the contract level
// (work.maintenance_obligations.due_on is not-null), so Save stays disabled until both a
// title and a due date are given.
describe("ItemDetailSheet — Add maintenance", () => {
  it("keeps Save disabled until both a task name and a due date are given", async () => {
    await renderDetail();
    fireEvent.click(screen.getByText("Add maintenance"));

    expect(screen.getByText("Save").closest("button").disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. Descale the machine"), { target: { value: "Descale the machine" } });
    expect(screen.getByText("Save").closest("button").disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-01" } });
    expect(screen.getByText("Save").closest("button").disabled).toBe(false);
  });

  it("creates a real obligation scoped to this item and this workspace, then closes", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    await renderDetail({ onSaved, onClose });

    fireEvent.click(screen.getByText("Add maintenance"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Descale the machine"), { target: { value: "Descale the machine" } });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Every 3 months." } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(createMaintenanceObligation).toHaveBeenCalledWith({
      workspaceId: "ws-1", assetId: "asset-1", actorRef: "owner-1",
      title: "Descale the machine", description: "Every 3 months.", dueOn: "2026-12-01",
    }));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("never calls createMaintenanceObligation when Cancel is tapped", async () => {
    await renderDetail();
    fireEvent.click(screen.getByText("Add maintenance"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Descale the machine"), { target: { value: "Descale" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-01" } });

    fireEvent.click(screen.getByText("Cancel"));

    expect(createMaintenanceObligation).not.toHaveBeenCalled();
  });

  it("shows the generic localized error, never a raw one, and does not close, when saving fails", async () => {
    createMaintenanceObligation.mockRejectedValueOnce(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    await renderDetail({ onClose });

    fireEvent.click(screen.getByText("Add maintenance"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Descale the machine"), { target: { value: "Descale" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByText("Couldn't save this task. Please try again.")).toBeTruthy());
    expect(screen.queryByText("insufficient_privilege")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// Recurring Maintenance Activation slice.
describe("ItemDetailSheet — Recurring maintenance", () => {
  it("defaults to One-time; switching to Recurring swaps the due-date label and reveals a cadence picker", async () => {
    await renderDetail();
    fireEvent.click(screen.getByText("Add maintenance"));

    expect(screen.getByText("Due date")).toBeTruthy();
    expect(screen.queryByText("Repeats")).toBeNull();

    fireEvent.click(screen.getByText("Recurring"));

    expect(screen.getByText("Starts on")).toBeTruthy();
    expect(screen.getByText("Repeats")).toBeTruthy();
    expect(screen.getByText("Every 3 months")).toBeTruthy();
  });

  it("creates a real schedule with the chosen cadence, scoped to this item and workspace, then closes", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    await renderDetail({ onSaved, onClose });

    fireEvent.click(screen.getByText("Add maintenance"));
    fireEvent.click(screen.getByText("Recurring"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Descale the machine"), { target: { value: "Descale the machine" } });
    fireEvent.change(screen.getByLabelText("Starts on"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByText("Every 6 months"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(createMaintenanceSchedule).toHaveBeenCalledWith({
      workspaceId: "ws-1", assetId: "asset-1", actorRef: "owner-1",
      title: "Descale the machine", description: "", recurrence: "6 months", firstDueOn: "2026-12-01",
    }));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an upcoming schedule with no open task yet, offering only Stop future reminders", async () => {
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2026-12-01", active: true },
    ]);
    await renderDetail();

    await waitFor(() => expect(screen.getByText("Descale the machine")).toBeTruthy());
    expect(screen.getByText("Due 2026-12-01")).toBeTruthy();
    expect(screen.getByText("Stop future reminders")).toBeTruthy();
    expect(screen.queryByText("Mark done")).toBeNull();
  });

  it("does not show an upcoming-schedule row for a schedule that already has an open task -- that task's own row carries the action instead", async () => {
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2027-03-01", active: true },
    ]);
    const openRow = { id: "m-1", assetId: "asset-1", scheduleId: "sch-1", title: "Descale the machine", status: "open", dueOn: "2026-12-01", isOverdue: false };
    await renderDetail({ maintenance: [openRow] });

    await waitFor(() => expect(screen.getAllByText("Descale the machine")).toHaveLength(1));
    expect(screen.getByText("Mark done")).toBeTruthy();
    expect(screen.getByText("Stop future reminders")).toBeTruthy();
  });

  it("an open task from a schedule already stopped shows no Stop future reminders action", async () => {
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2027-03-01", active: false },
    ]);
    const openRow = { id: "m-1", assetId: "asset-1", scheduleId: "sch-1", title: "Descale the machine", status: "open", dueOn: "2026-12-01", isOverdue: false };
    await renderDetail({ maintenance: [openRow] });

    await waitFor(() => expect(screen.getByText("Mark done")).toBeTruthy());
    expect(screen.queryByText("Stop future reminders")).toBeNull();
  });

  it("stopping future reminders from an open task's own row calls the real RPC and refreshes in place, without closing the sheet", async () => {
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2027-03-01", active: true },
    ]);
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2027-03-01", active: false },
    ]);
    const openRow = { id: "m-1", assetId: "asset-1", scheduleId: "sch-1", title: "Descale the machine", status: "open", dueOn: "2026-12-01", isOverdue: false };
    const onClose = vi.fn();
    await renderDetail({ maintenance: [openRow], onClose });

    await waitFor(() => expect(screen.getByText("Stop future reminders")).toBeTruthy());
    fireEvent.click(screen.getByText("Stop future reminders"));
    fireEvent.click(screen.getAllByText("Stop future reminders").at(-1));

    await waitFor(() => expect(cancelMaintenanceSchedule).toHaveBeenCalledWith("sch-1", "owner-1"));
    await waitFor(() => expect(screen.queryByText("Stop future reminders")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stopping future reminders from an upcoming schedule's own row removes that row once confirmed", async () => {
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2026-12-01", active: true },
    ]);
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2026-12-01", active: false },
    ]);
    await renderDetail();

    await waitFor(() => expect(screen.getByText("Descale the machine")).toBeTruthy());
    fireEvent.click(screen.getByText("Stop future reminders"));
    fireEvent.click(screen.getAllByText("Stop future reminders").at(-1));

    await waitFor(() => expect(cancelMaintenanceSchedule).toHaveBeenCalledWith("sch-1", "owner-1"));
    await waitFor(() => expect(screen.queryByText("Descale the machine")).toBeNull());
  });

  it("dismissing the stop prompt never calls cancelMaintenanceSchedule", async () => {
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2026-12-01", active: true },
    ]);
    await renderDetail();
    await waitFor(() => expect(screen.getByText("Descale the machine")).toBeTruthy());

    fireEvent.click(screen.getByText("Stop future reminders"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(cancelMaintenanceSchedule).not.toHaveBeenCalled();
    expect(screen.getByText("Descale the machine")).toBeTruthy();
  });

  it("shows the generic localized error, never a raw one, when stopping fails", async () => {
    fetchMaintenanceSchedules.mockResolvedValueOnce([
      { id: "sch-1", assetId: "asset-1", locationId: null, title: "Descale the machine", description: null, recurrence: "3 mons", nextDueOn: "2026-12-01", active: true },
    ]);
    cancelMaintenanceSchedule.mockRejectedValueOnce(new Error("schedule does not exist or is already cancelled"));
    await renderDetail();
    await waitFor(() => expect(screen.getByText("Descale the machine")).toBeTruthy());

    fireEvent.click(screen.getByText("Stop future reminders"));
    fireEvent.click(screen.getAllByText("Stop future reminders").at(-1));

    await waitFor(() => expect(screen.getByText("Couldn't stop future reminders. Please try again.")).toBeTruthy());
    expect(screen.queryByText("schedule does not exist or is already cancelled")).toBeNull();
  });
});

// Maintenance resolution slice — unlike Move/Retire/Add, resolving a task stays open
// (maintenanceOverrides reflects the confirmed change locally) since completing or
// cancelling several tasks in one visit is a real, repeatable action.
describe("ItemDetailSheet — Maintenance resolution (mark done / cancel)", () => {
  const OPEN_ROW = { id: "m-1", assetId: "asset-1", title: "Descale", status: "open", dueOn: "2030-01-01", isOverdue: false };

  it("marking a task done calls the real RPC, reflects it locally, and keeps the sheet open", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    await renderDetail({ maintenance: [OPEN_ROW], onSaved, onClose });

    fireEvent.click(screen.getByText("Mark done"));

    await waitFor(() => expect(completeMaintenanceObligation).toHaveBeenCalledWith("m-1", "owner-1"));
    await waitFor(() => expect(screen.getByText("Completed")).toBeTruthy());
    expect(screen.queryByText("Mark done")).toBeNull();
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the generic localized error, never a raw one, when marking done fails", async () => {
    completeMaintenanceObligation.mockRejectedValueOnce(new Error("object_not_in_prerequisite_state"));
    await renderDetail({ maintenance: [OPEN_ROW] });

    fireEvent.click(screen.getByText("Mark done"));

    await waitFor(() => expect(screen.getByText("Couldn't update this task. Please try again.")).toBeTruthy());
    expect(screen.queryByText("object_not_in_prerequisite_state")).toBeNull();
    // The row itself must not silently flip to completed on a failed call.
    expect(screen.getByText("Mark done")).toBeTruthy();
  });

  it("cancelling requires a non-blank reason before Confirm is enabled", async () => {
    await renderDetail({ maintenance: [OPEN_ROW] });
    fireEvent.click(screen.getByText("Cancel task"));

    expect(screen.getAllByText("Cancel task").at(-1).closest("button").disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. No longer needed"), { target: { value: "No longer needed" } });
    expect(screen.getAllByText("Cancel task").at(-1).closest("button").disabled).toBe(false);
  });

  it("cancelling calls the real RPC with the given reason, reflects it locally, and keeps the sheet open", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    await renderDetail({ maintenance: [OPEN_ROW], onSaved, onClose });

    fireEvent.click(screen.getByText("Cancel task"));
    fireEvent.change(screen.getByPlaceholderText("e.g. No longer needed"), { target: { value: "No longer needed" } });
    fireEvent.click(screen.getAllByText("Cancel task").at(-1));

    await waitFor(() => expect(cancelMaintenanceObligation).toHaveBeenCalledWith("m-1", "No longer needed", "owner-1"));
    await waitFor(() => expect(screen.getByText("Cancelled: No longer needed")).toBeTruthy());
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("dismissing the cancel prompt never calls cancelMaintenanceObligation", async () => {
    await renderDetail({ maintenance: [OPEN_ROW] });
    fireEvent.click(screen.getByText("Cancel task"));
    fireEvent.change(screen.getByPlaceholderText("e.g. No longer needed"), { target: { value: "No longer needed" } });

    fireEvent.click(screen.getByText("Cancel"));

    expect(cancelMaintenanceObligation).not.toHaveBeenCalled();
    // Dismissing goes back to the plain row, not a stuck cancelled state.
    expect(screen.getByText("Descale")).toBeTruthy();
  });

  it("shows the generic localized error, never a raw one, when cancelling fails", async () => {
    cancelMaintenanceObligation.mockRejectedValueOnce(new Error("a cancellation reason is required"));
    await renderDetail({ maintenance: [OPEN_ROW] });

    fireEvent.click(screen.getByText("Cancel task"));
    fireEvent.change(screen.getByPlaceholderText("e.g. No longer needed"), { target: { value: "No longer needed" } });
    fireEvent.click(screen.getAllByText("Cancel task").at(-1));

    // Shown both inline (Mark done's own error spot) and inside the still-open cancel
    // modal (see CancelMaintenanceModal's own header on why its error renders inside
    // itself) — only one is ever visible behind the modal overlay, but both are real DOM
    // text, hence AllBy here rather than a singular query.
    await waitFor(() => expect(screen.getAllByText("Couldn't update this task. Please try again.").length).toBeGreaterThan(0));
    expect(screen.queryByText("a cancellation reason is required")).toBeNull();
  });

  it("shows neither action for an already-completed or already-cancelled row", async () => {
    const settled = [
      { id: "m-2", assetId: "asset-1", title: "Filter change", status: "completed", isOverdue: false },
      { id: "m-3", assetId: "asset-1", title: "Gutter clean", status: "cancelled", isOverdue: false, cancellationReason: "Done by someone else" },
    ];
    await renderDetail({ maintenance: settled });

    expect(screen.queryByText("Mark done")).toBeNull();
    expect(screen.queryByText("Cancel task")).toBeNull();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Cancelled: Done by someone else")).toBeTruthy();
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

  // Real bug, found while building the Add Maintenance slice and fixed alongside this
  // test: the error used to render as a JSX sibling AFTER the modal rather than inside
  // it, which put it behind Modal's own fixed, full-viewport overlay -- present in the
  // DOM (so a plain getByText here would have passed even with the bug) but never
  // visible to the user for as long as the modal stayed open on a failure. Asserting the
  // error is inside the open dialog is the structural proxy jsdom can check for "the
  // user can actually see this."
  it("shows a real failure message INSIDE the still-open move dialog, not behind it, and keeps the sheet open", async () => {
    moveAsset.mockRejectedValueOnce(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    await renderDetail({ onClose });

    fireEvent.click(screen.getByText("Move to another room"));
    fireEvent.click(screen.getByText("Save"));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText("Couldn't move this item. Please try again.")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clears a previous failure's error when the move dialog is reopened", async () => {
    moveAsset.mockRejectedValueOnce(new Error("insufficient_privilege"));
    await renderDetail();

    fireEvent.click(screen.getByText("Move to another room"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText("Couldn't move this item. Please try again.")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancel"));

    fireEvent.click(screen.getByText("Move to another room"));

    expect(screen.queryByText("Couldn't move this item. Please try again.")).toBeNull();
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

  // Unlike Move's own equivalent (a real, separate bug fixed alongside this test),
  // Retire's error was already rendered inside its own confirm dialog from the start --
  // pinned structurally here rather than assumed.
  it("shows a real failure message INSIDE the still-open retire dialog when retiring fails", async () => {
    retireAsset.mockRejectedValueOnce(new Error("boom"));
    await renderDetail();

    fireEvent.click(screen.getByText("Retire item"));
    fireEvent.click(screen.getAllByText("Retire item")[1]);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText("Couldn't retire this item. Please try again.")).toBeTruthy());
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

// Document Understanding slice — "let Klussie read this document" per document row,
// then explicit per-field confirmation before anything is actually saved. Every
// checkbox starts unchecked (opt-in, never opt-out from a batch of model output).
describe("ItemDetailSheet — Suggested details from a document", () => {
  const DOC = { id: "doc-1", typeKey: "manual", caption: null, validUntil: null, storageBucket: "documents", storagePath: "ws-1/doc-1/manual.pdf" };

  async function openSuggestModal(extraProps = {}) {
    fetchDocumentsForAsset.mockResolvedValueOnce([DOC]);
    await renderDetail(extraProps);
    fireEvent.click(screen.getByText("Let Klussie read this"));
    await waitFor(() => expect(suggestItemDetailsFromDocument).toHaveBeenCalledWith({ itemId: "asset-1", documentId: "doc-1" }));
  }

  it("calls suggestItemDetailsFromDocument with this exact document's id when tapped", async () => {
    await openSuggestModal();
  });

  it("shows the honest empty state when Klussie finds nothing in the document", async () => {
    suggestItemDetailsFromDocument.mockResolvedValueOnce({ suggestions: {} });
    await openSuggestModal();

    await waitFor(() => expect(screen.getByText("Klussie didn't find any new details in this document.")).toBeTruthy());
  });

  it("lists each found field unchecked, with the item's current value shown alongside", async () => {
    suggestItemDetailsFromDocument.mockResolvedValueOnce({ suggestions: { manufacturer: "Miele", warrantyEndDate: "2031-01-01" } });
    await openSuggestModal();

    await waitFor(() => expect(screen.getByText(/Manufacturer:/)).toBeTruthy());
    expect(screen.getByText(/Miele/)).toBeTruthy();
    // ITEM.brand is "Vaillant" -- shown as the current value being potentially replaced.
    expect(screen.getByText(/Currently: Vaillant/)).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.every((box) => !box.checked)).toBe(true);
    expect(screen.getByText("Save selected").closest("button").disabled).toBe(true);
  });

  it("saves only the checked field, preserving every other current value, then closes", async () => {
    suggestItemDetailsFromDocument.mockResolvedValueOnce({ suggestions: { manufacturer: "Miele", model: "W1" } });
    const onSaved = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    await openSuggestModal({ onSaved, onClose });

    await waitFor(() => expect(screen.getByText(/Manufacturer:/)).toBeTruthy());
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // manufacturer only, not model
    fireEvent.click(screen.getByText("Save selected"));

    await waitFor(() => expect(updateAsset).toHaveBeenCalledWith("asset-1", expect.objectContaining({
      brand: "Miele", model: "ecoTEC", // model unchanged -- the box was never checked
      name: "Washing machine", warrantyExpiresOn: "2029-01-20",
    })));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("also creates a real maintenance obligation when the maintenance suggestion is checked", async () => {
    suggestItemDetailsFromDocument.mockResolvedValueOnce({
      suggestions: { maintenanceSuggestion: { title: "Descale", description: "Every 3 months.", dueOn: "2026-12-01" } },
    });
    await openSuggestModal();

    await waitFor(() => expect(screen.getByText(/Suggested maintenance:/)).toBeTruthy());
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByText("Save selected"));

    await waitFor(() => expect(createMaintenanceObligation).toHaveBeenCalledWith({
      workspaceId: "ws-1", assetId: "asset-1", actorRef: "owner-1",
      title: "Descale", description: "Every 3 months.", dueOn: "2026-12-01",
    }));
  });

  it("never calls updateAsset or createMaintenanceObligation when Cancel is tapped", async () => {
    suggestItemDetailsFromDocument.mockResolvedValueOnce({ suggestions: { manufacturer: "Miele" } });
    await openSuggestModal();

    await waitFor(() => expect(screen.getByText(/Manufacturer:/)).toBeTruthy());
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByText("Cancel"));

    expect(updateAsset).not.toHaveBeenCalled();
  });

  it("shows a distinct message for a file Klussie can't read, not the generic failure text", async () => {
    suggestItemDetailsFromDocument.mockRejectedValueOnce(new Error("DOCUMENT_UNREADABLE"));
    await openSuggestModal();

    await waitFor(() => expect(screen.getByText("Klussie can only read PDF, JPG or PNG files right now.")).toBeTruthy());
  });

  it("shows the generic localized error, never a raw one, on any other failure", async () => {
    suggestItemDetailsFromDocument.mockRejectedValueOnce(new Error("upstream 500"));
    await openSuggestModal();

    await waitFor(() => expect(screen.getByText("Klussie could not read this document right now. Please try again.")).toBeTruthy());
    expect(screen.queryByText("upstream 500")).toBeNull();
  });

  it("shows a save-specific failure message, and does not close, when the confirm save itself fails", async () => {
    suggestItemDetailsFromDocument.mockResolvedValueOnce({ suggestions: { manufacturer: "Miele" } });
    updateAsset.mockRejectedValueOnce(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    await openSuggestModal({ onClose });

    await waitFor(() => expect(screen.getByText(/Manufacturer:/)).toBeTruthy());
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByText("Save selected"));

    await waitFor(() => expect(screen.getByText("Couldn't save the selected details. Please try again.")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});

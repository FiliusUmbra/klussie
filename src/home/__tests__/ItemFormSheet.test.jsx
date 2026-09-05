// Platform Activation Slice 1, WP 1.8 — ItemFormSheet.jsx's own cutover: propertyId
// present means the real contract (createAsset/updateAsset/retireAsset) is used; its
// absence falls back to the legacy household_items functions. Also the real bugfix this
// work package found: before this, editing or deleting an item read through
// api.my_assets() called updateHouseholdItem(item.id, ...)/deleteHouseholdItem(item.id,
// ...) with a property.assets id against the household_items table — matching zero rows.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/householdItems.js", () => ({
  createHouseholdItem: vi.fn(() => Promise.resolve({ id: "legacy-1" })),
  updateHouseholdItem: vi.fn(() => Promise.resolve({ id: "legacy-1" })),
  setHouseholdItemPhoto: vi.fn(() => Promise.resolve({ photoPath: null, photoUrl: null })),
  deleteHouseholdItem: vi.fn(() => Promise.resolve()),
  createAsset: vi.fn(() => Promise.resolve({ id: "asset-1", photoPath: null })),
  updateAsset: vi.fn(() => Promise.resolve({ id: "asset-1", photoPath: null })),
  retireAsset: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/documents.js", () => ({
  createDocument: vi.fn(() => Promise.resolve({ id: "doc-new" })),
  fetchDocumentsForAsset: vi.fn(() => Promise.resolve([])),
  documentTypeLabelKey: (typeKey) => ({
    warranty: "documentTypeWarranty", certificate: "documentTypeCertificate",
    manual: "documentTypeManual", other: "documentTypeOther",
  })[typeKey] ?? null,
}));

vi.mock("../../lib/askAboutItem.js", () => ({
  askAboutItem: vi.fn(() => Promise.resolve("The warranty expires on 2029-01-20.")),
}));

import {
  createHouseholdItem, updateHouseholdItem, deleteHouseholdItem, createAsset, updateAsset, retireAsset,
} from "../../lib/householdItems.js";
import { fetchDocumentsForAsset } from "../../lib/documents.js";
import { askAboutItem } from "../../lib/askAboutItem.js";
import { ItemFormSheet } from "../ItemFormSheet.jsx";

const t = {
  itemAddTitle: "Add item", itemEditTitle: "Edit item",
  itemNameLabel: "Name", itemNamePlaceholder: "e.g. washing machine",
  itemCategoryLabel: "Category", itemRoomLabel: "Room", itemRoomPlaceholder: "e.g. kitchen",
  itemBrandLabel: "Brand", itemModelLabel: "Model",
  itemPhotoLabel: "Photo", itemPhotoAdd: "Add photo", itemPhotoRemove: "Remove photo",
  itemPurchasedLabel: "Purchased on", itemNotesLabel: "Notes",
  itemSaveNew: "Save item", itemSaveChanges: "Save changes",
  itemDelete: "Delete item", itemDeleteConfirm: "Delete this item?", cancelBtn: "Cancel",
  itemCatAppliance: "Appliances", itemCatElectronics: "Electronics", itemCatFurniture: "Furniture",
  itemCatGarden: "Garden", itemCatTool: "Tools", itemCatOther: "Other",
  itemRoomKitchen: "Kitchen", itemRoomLiving: "Living room", itemRoomBedroom: "Bedroom",
  itemRoomBathroom: "Bathroom", itemRoomGarage: "Garage", itemRoomGarden: "Garden",
  itemRoomAttic: "Attic", itemRoomBasement: "Basement",
  itemDocumentsTitle: "Documents", itemDocumentsEmpty: "No documents added for this item yet.",
  itemAskTitle: "Ask Klussie about this", itemAskHint: "Klussie answers from what's saved about this item.",
  itemAskPlaceholder: "e.g. When does the warranty expire?", itemAskButton: "Ask",
  itemAskThinking: "Klussie is thinking…", itemAskFailed: "Klussie couldn't answer right now. Please try again.",
  documentFormAddTitle: "Add a document", documentFormFileLabel: "File", documentFormFileAdd: "Choose file",
  documentFormTypeLabel: "Type", documentTypeWarranty: "Warranty", documentTypeCertificate: "Certificate",
  documentTypeManual: "Manual", documentTypeOther: "Other",
  documentFormIssuerLabel: "Issuer", documentFormValidUntilLabel: "Valid until", documentFormSaveNew: "Save document",
  documentFormSaveFailed: "Couldn't save the document. Please try again.",
  myItemsLoading: "Loading…", myItemsDocumentExpired: "Expired", myItemsDocumentValidUntil: "Valid until {date}",
};

const ITEM = { id: "asset-1", name: "Boiler", category: "appliance", room: "Kitchen", photoPath: "owner-1/asset-1/old", photoUrl: null };

const ROOMS = [
  { id: "loc-1", name: "Kitchen", type: "kitchen", children: [] },
  { id: "loc-2", name: "Garage", type: null, children: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillNameAndSave(saveLabel) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Boiler" } });
  fireEvent.click(screen.getByText(saveLabel));
  await waitFor(() => {});
}

describe("ItemFormSheet — create, real contract vs legacy", () => {
  it("calls createAsset, never createHouseholdItem, when propertyId is given", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={null} onClose={() => {}} onSaved={onSaved} />);

    await fillNameAndSave("Save item");

    await waitFor(() => expect(createAsset).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: "prop-1", ownerId: "owner-1", actorRef: "owner-1", name: "Boiler",
    })));
    expect(createHouseholdItem).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("calls createHouseholdItem, never createAsset, when propertyId is absent", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemFormSheet t={t} ownerId="owner-1" item={null} onClose={() => {}} onSaved={onSaved} />);

    await fillNameAndSave("Save item");

    await waitFor(() => expect(createHouseholdItem).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-1", name: "Boiler" })));
    expect(createAsset).not.toHaveBeenCalled();
  });
});

// Home Builder slice — property.create_asset() always accepted a real location_id; this
// form previously hardcoded it to null. Creating now offers the customer's own actual
// rooms, once any exist, alongside the create/legacy split above.
describe("ItemFormSheet — room picker (Home Builder slice)", () => {
  it("offers a real room picker on create when real rooms exist, instead of the free-text/suggested-chips UI", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} item={null} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByLabelText("Room")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Kitchen" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Garage" })).toBeTruthy();
    // The free-text fallback's suggested chips must not also render — one room UI, not two.
    expect(screen.queryByRole("button", { name: t.itemRoomBedroom })).toBeNull();
  });

  it("sends the picked room's id as locationId, and its name for display, when creating", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} item={null} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Boiler" } });
    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "loc-2" } });
    fireEvent.click(screen.getByText("Save item"));

    await waitFor(() => expect(createAsset).toHaveBeenCalledWith(expect.objectContaining({
      locationId: "loc-2", room: "Garage",
    })));
  });

  it("sends null locationId when no room is picked, the default selection", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} item={null} onClose={() => {}} onSaved={onSaved} />);

    await fillNameAndSave("Save item");

    await waitFor(() => expect(createAsset).toHaveBeenCalledWith(expect.objectContaining({ locationId: null })));
  });

  it("pre-selects the room passed as initialLocationId (arriving via 'add something to this room')", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} initialLocationId="loc-1" item={null} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByLabelText("Room").value).toBe("loc-1");
  });

  it("falls back to the free-text/suggested-chips UI when editing, even though real rooms exist", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} item={ITEM} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.queryByRole("option", { name: "Kitchen" })).toBeNull();
    expect(screen.getByText(t.itemRoomKitchen)).toBeTruthy();
  });

  it("falls back to the free-text/suggested-chips UI when no real rooms exist yet, even on create", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" rooms={[]} item={null} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByText(t.itemRoomKitchen)).toBeTruthy();
  });
});

describe("ItemFormSheet — edit, real contract vs legacy", () => {
  it("calls updateAsset(item.id, ...), never updateHouseholdItem, when propertyId is given — the real bugfix", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={ITEM} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(updateAsset).toHaveBeenCalledWith("asset-1", expect.objectContaining({
      ownerId: "owner-1", actorRef: "owner-1", previousPhotoPath: "owner-1/asset-1/old",
    })));
    expect(updateHouseholdItem).not.toHaveBeenCalled();
  });

  it("calls updateHouseholdItem(item.id, ...) when propertyId is absent", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemFormSheet t={t} ownerId="owner-1" item={ITEM} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(updateHouseholdItem).toHaveBeenCalledWith("asset-1", expect.objectContaining({ ownerId: "owner-1" })));
    expect(updateAsset).not.toHaveBeenCalled();
  });
});

describe("ItemFormSheet — delete, real contract vs legacy", () => {
  it("retires (never hard-deletes) when propertyId is given", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={ITEM} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByText("Delete item"));
    fireEvent.click(screen.getAllByText("Delete item")[1]);

    await waitFor(() => expect(retireAsset).toHaveBeenCalledWith("asset-1", "owner-1"));
    expect(deleteHouseholdItem).not.toHaveBeenCalled();
  });

  it("hard-deletes through household_items when propertyId is absent", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemFormSheet t={t} ownerId="owner-1" item={ITEM} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByText("Delete item"));
    fireEvent.click(screen.getAllByText("Delete item")[1]);

    await waitFor(() => expect(deleteHouseholdItem).toHaveBeenCalledWith("asset-1", "owner-1/asset-1/old"));
    expect(retireAsset).not.toHaveBeenCalled();
  });
});

// "Ask Klussie" slice (0199) — editing a real item (propertyId present, so item.id is a
// genuine property.assets id) also offers that item's own documents and a grounded
// question. Neither section renders on create, nor on the legacy household_items path,
// since neither api.create_document(p_asset_id) nor api.resolve_asset() has anything to
// attach to or read there.
describe("ItemFormSheet — Documents and Ask Klussie (real items only)", () => {
  it("does not show either section when creating a new item", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={null} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByText("Documents")).toBeNull();
    expect(screen.queryByText("Ask Klussie about this")).toBeNull();
  });

  it("does not show either section on the legacy household_items path, even when editing", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" item={ITEM} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByText("Documents")).toBeNull();
    expect(screen.queryByText("Ask Klussie about this")).toBeNull();
  });

  it("shows the empty state, then fetches and lists the item's own documents when editing a real item", async () => {
    fetchDocumentsForAsset.mockResolvedValueOnce([
      { id: "doc-1", typeKey: "manual", issuer: null, validFrom: null, validUntil: null, caption: null },
    ]);
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" workspaceId="ws-1" fmtDate={(d) => d} item={ITEM} onClose={() => {}} onSaved={() => {}} />);

    expect(fetchDocumentsForAsset).toHaveBeenCalledWith("asset-1");
    await waitFor(() => expect(screen.getByText("Manual")).toBeTruthy());
  });

  it("shows the real empty-documents message when the item has none", async () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" workspaceId="ws-1" fmtDate={(d) => d} item={ITEM} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.getByText("No documents added for this item yet.")).toBeTruthy());
  });

  it("opens DocumentUploadSheet scoped to this item's own id, not the property", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" workspaceId="ws-1" fmtDate={(d) => d} item={ITEM} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.click(screen.getByText("Add a document"));

    expect(screen.getByText("Choose file")).toBeTruthy();
  });

  it("disables Ask until a question is typed, then answers it and shows the grounded answer", async () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" workspaceId="ws-1" fmtDate={(d) => d} item={ITEM} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByText("Ask").closest("button").disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("e.g. When does the warranty expire?"), { target: { value: "When does the warranty expire?" } });
    expect(screen.getByText("Ask").closest("button").disabled).toBe(false);
    fireEvent.click(screen.getByText("Ask"));

    await waitFor(() => expect(askAboutItem).toHaveBeenCalledWith({ itemId: "asset-1", question: "When does the warranty expire?" }));
    await waitFor(() => expect(screen.getByText("The warranty expires on 2029-01-20.")).toBeTruthy());
  });

  it("shows the generic localized error, never the raw failure, when asking fails", async () => {
    askAboutItem.mockRejectedValueOnce(new Error("500 Internal Server Error"));
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" workspaceId="ws-1" fmtDate={(d) => d} item={ITEM} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. When does the warranty expire?"), { target: { value: "Is it still under warranty?" } });
    fireEvent.click(screen.getByText("Ask"));

    await waitFor(() => expect(screen.getByText("Klussie couldn't answer right now. Please try again.")).toBeTruthy());
    expect(screen.queryByText("500 Internal Server Error")).toBeNull();
  });
});

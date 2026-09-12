// Platform Activation Slice 1, WP 1.8 — ItemFormSheet.jsx's own cutover: propertyId
// present means the real contract (updateAsset/retireAsset) is used; its absence falls
// back to the legacy household_items functions. Also the real bugfix this work package
// found: before this, editing or deleting an item read through api.my_assets() called
// updateHouseholdItem(item.id, ...)/deleteHouseholdItem(item.id, ...) with a
// property.assets id against the household_items table — matching zero rows.
//
// Documents and Ask Klussie moved to ItemDetailSheet.jsx (Item Detail slice) — see that
// file's own test for their coverage. Product remark, 2026-09-12 — creating something
// new moved to ItemAddWizard.jsx's own step-by-step flow (see its own test file); this
// component is edit-only now, and this file's own create-mode describe blocks moved
// there with it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/householdItems.js", () => ({
  updateHouseholdItem: vi.fn(() => Promise.resolve({ id: "legacy-1" })),
  deleteHouseholdItem: vi.fn(() => Promise.resolve()),
  updateAsset: vi.fn(() => Promise.resolve({ id: "asset-1", photoPath: null })),
  retireAsset: vi.fn(() => Promise.resolve()),
}));

import { updateHouseholdItem, deleteHouseholdItem, updateAsset, retireAsset } from "../../lib/householdItems.js";
import { ItemFormSheet } from "../ItemFormSheet.jsx";

const t = {
  itemEditTitle: "Edit item",
  itemNameLabel: "Name", itemNamePlaceholder: "e.g. washing machine",
  itemCategoryLabel: "Category", itemRoomLabel: "Room", itemRoomPlaceholder: "e.g. kitchen",
  itemBrandLabel: "Brand", itemModelLabel: "Model",
  itemPhotoLabel: "Photo", itemPhotoAdd: "Add photo", itemPhotoRemove: "Remove photo",
  itemPurchasedLabel: "Purchased on", itemNotesLabel: "Notes",
  itemSaveChanges: "Save changes", itemSaveFailed: "Couldn't save this item.",
  itemDelete: "Delete item", itemDeleteConfirm: "Delete this item?", cancelBtn: "Cancel",
  itemDetailRetireFailed: "Couldn't retire this item.",
  itemCatAppliance: "Appliances", itemCatElectronics: "Electronics", itemCatFurniture: "Furniture",
  itemCatGarden: "Garden", itemCatTool: "Tools", itemCatOther: "Other",
  itemRoomKitchen: "Kitchen", itemRoomLiving: "Living room", itemRoomBedroom: "Bedroom",
  itemRoomBathroom: "Bathroom", itemRoomGarage: "Garage", itemRoomGarden: "Garden",
  itemRoomAttic: "Attic", itemRoomBasement: "Basement",
};

const ITEM = { id: "asset-1", name: "Boiler", category: "appliance", room: "Kitchen", photoPath: "owner-1/asset-1/old", photoUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ItemFormSheet — room field, edit only", () => {
  // Real rooms are never offered here even when given — ItemAddWizard.jsx's own "extra"
  // step is the only place the real room picker appears now; edit keeps its own
  // free-text/suggested-chips shape regardless of what rooms exist.
  it("always shows the free-text/suggested-chips room UI, never a real-room picker", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={ITEM} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.queryByRole("option", { name: "Kitchen" })).toBeNull();
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

  // Document Understanding slice — this form has no inputs for these five fields; it
  // must pass the item's own current values through so updateAsset() doesn't erase them
  // (its own default is null, meant only for a genuinely blank field).
  it("passes the item's own serialNumber/installedOn/warrantyExpiresOn/condition through, preserving whatever this form has no input for", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const item = { ...ITEM, serialNumber: "SN-9", installedOn: "2024-03-01", expectedServiceLifeMonths: 120, warrantyExpiresOn: "2029-01-20", condition: "good" };
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={item} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(updateAsset).toHaveBeenCalledWith("asset-1", expect.objectContaining({
      serialNumber: "SN-9", installedOn: "2024-03-01", expectedServiceLifeMonths: 120,
      warrantyExpiresOn: "2029-01-20", condition: "good",
    })));
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

// Found by code audit: both catch blocks did `setError(err.message || String(err))`,
// showing a raw Postgres/Storage error verbatim — the exact anti-pattern documents.js's
// own header names and fixes.
describe("ItemFormSheet — save/delete failure", () => {
  it("shows a generic localized error, never the raw backend message, when saving fails", async () => {
    vi.mocked(updateAsset).mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    const onSaved = vi.fn();
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={ITEM} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(screen.getByText("Couldn't save this item.")).toBeTruthy());
    expect(screen.queryByText(/row-level security/)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText("Save changes").disabled).toBe(false);
  });

  it("shows the shared retire-failed message, never the raw backend message, when deleting fails", async () => {
    vi.mocked(retireAsset).mockRejectedValueOnce(new Error("network error"));
    const onSaved = vi.fn();
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={ITEM} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByText("Delete item"));
    fireEvent.click(screen.getAllByText("Delete item")[1]);

    await waitFor(() => expect(screen.getByText("Couldn't retire this item.")).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();
  });
});

// Found by code audit: the "remove photo" button cleared photoFile/photoPreview without
// ever revoking the object URL pickPhoto() had created for it -- a real, unbounded memory
// leak on every tap. QuoteFormSheet.jsx's own removePhoto() (and, since, this file's own
// header) is the established correct shape: create once on pick, revoke once on remove.
describe("ItemFormSheet — photo object URL lifecycle", () => {
  const file = new File(["x"], "boiler.jpg", { type: "image/jpeg" });

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock-1");
    URL.revokeObjectURL = vi.fn();
  });

  it("revokes the object URL for a locally picked photo when it's removed", () => {
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={ITEM} onClose={() => {}} onSaved={vi.fn()} />);

    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Remove photo"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("never calls revokeObjectURL on an existing item's own real photoUrl, only on a locally picked file", () => {
    const withPhoto = { ...ITEM, photoUrl: "https://example.test/storage/owner-1/asset-1/old.jpg" };
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={withPhoto} onClose={() => {}} onSaved={vi.fn()} />);

    // No file was ever picked here — the preview shown is the item's own existing
    // photoUrl, a real server URL, never one this component created itself.
    fireEvent.click(screen.getByLabelText("Remove photo"));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});

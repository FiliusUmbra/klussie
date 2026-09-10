// Platform Activation Slice 1, WP 1.8 — ItemFormSheet.jsx's own cutover: propertyId
// present means the real contract (createAsset/updateAsset/retireAsset) is used; its
// absence falls back to the legacy household_items functions. Also the real bugfix this
// work package found: before this, editing or deleting an item read through
// api.my_assets() called updateHouseholdItem(item.id, ...)/deleteHouseholdItem(item.id,
// ...) with a property.assets id against the household_items table — matching zero rows.
//
// Documents and Ask Klussie moved to ItemDetailSheet.jsx (Item Detail slice) — see that
// file's own test for their coverage. This file is a pure create/edit form again.
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

import {
  createHouseholdItem, updateHouseholdItem, deleteHouseholdItem, createAsset, updateAsset, retireAsset,
} from "../../lib/householdItems.js";
import { ItemFormSheet } from "../ItemFormSheet.jsx";

const t = {
  itemAddTitle: "Add item", itemEditTitle: "Edit item",
  itemNameLabel: "Name", itemNamePlaceholder: "e.g. washing machine",
  itemCategoryLabel: "Category", itemRoomLabel: "Room", itemRoomPlaceholder: "e.g. kitchen",
  itemBrandLabel: "Brand", itemModelLabel: "Model",
  itemPhotoLabel: "Photo", itemPhotoAdd: "Add photo", itemPhotoRemove: "Remove photo",
  itemPurchasedLabel: "Purchased on", itemNotesLabel: "Notes",
  itemSaveNew: "Save item", itemSaveChanges: "Save changes", itemSaveFailed: "Couldn't save this item.",
  itemDelete: "Delete item", itemDeleteConfirm: "Delete this item?", cancelBtn: "Cancel",
  itemDetailRetireFailed: "Couldn't retire this item.",
  itemCatAppliance: "Appliances", itemCatElectronics: "Electronics", itemCatFurniture: "Furniture",
  itemCatGarden: "Garden", itemCatTool: "Tools", itemCatOther: "Other",
  itemRoomKitchen: "Kitchen", itemRoomLiving: "Living room", itemRoomBedroom: "Bedroom",
  itemRoomBathroom: "Bathroom", itemRoomGarage: "Garage", itemRoomGarden: "Garden",
  itemRoomAttic: "Attic", itemRoomBasement: "Basement",
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
    vi.mocked(createAsset).mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    const onSaved = vi.fn();
    render(<ItemFormSheet t={t} ownerId="owner-1" propertyId="prop-1" item={null} onClose={() => {}} onSaved={onSaved} />);

    await fillNameAndSave("Save item");

    await waitFor(() => expect(screen.getByText("Couldn't save this item.")).toBeTruthy());
    expect(screen.queryByText(/row-level security/)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText("Save item").disabled).toBe(false);
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

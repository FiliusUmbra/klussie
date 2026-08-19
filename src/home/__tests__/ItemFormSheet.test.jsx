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
  itemSaveNew: "Save item", itemSaveChanges: "Save changes",
  itemDelete: "Delete item", itemDeleteConfirm: "Delete this item?", cancelBtn: "Cancel",
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

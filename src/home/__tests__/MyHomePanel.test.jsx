// Home Builder vertical slice — MyHomePanel.jsx's own HomeBuilderSection: "building your
// home" now lives in My Home, not tucked inside My Items where the only entry point used
// to be a bare, unlabeled "+" beside a "Rooms" heading (found live during this slice's own
// audit). This file exercises the four states HomeBuilderSection itself decides between
// (loading, no property yet, empty, populated) and the two sheets it opens — creating a
// room and, from an existing room, adding something to it — leaving each sheet's own save
// logic to LocationFormSheet.test.jsx/ItemFormSheet.test.jsx.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/locations.js", () => ({
  createLocation: vi.fn(() => Promise.resolve({ id: "loc-new" })),
  renameLocation: vi.fn(() => Promise.resolve()),
  retireLocation: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../lib/householdItems.js", () => ({
  createHouseholdItem: vi.fn(() => Promise.resolve({ id: "legacy-1" })),
  updateHouseholdItem: vi.fn(() => Promise.resolve({ id: "legacy-1" })),
  setHouseholdItemPhoto: vi.fn(() => Promise.resolve({ photoPath: null, photoUrl: null })),
  deleteHouseholdItem: vi.fn(() => Promise.resolve()),
  createAsset: vi.fn(() => Promise.resolve({ id: "asset-1", photoPath: null })),
  updateAsset: vi.fn(() => Promise.resolve({ id: "asset-1", photoPath: null })),
  retireAsset: vi.fn(() => Promise.resolve()),
}));

import { createLocation } from "../../lib/locations.js";
import { createAsset } from "../../lib/householdItems.js";
import { MyHomePanel } from "../MyHomePanel.jsx";

const t = {
  myHomeQuestion: "Your home",
  homeReportProblem: "Report a problem",
  myHomeNoPropertyYet: "We're still setting up your home.",
  myHomeActiveTitle: "Happening now", myHomeActiveEmpty: "Nothing in progress right now.",
  myHomeProsTitle: "Professionals you trust", myHomeProsEmpty: "No professional has finished a job here yet.",
  myHomeHistoryTitle: "Home history", myHomeHistoryEmpty: "Nothing finished yet.",
  myHomeReviewsTitle: "Reviews", myHomeReviewsEmpty: "No reviews yet.",
  myHomeAiTitle: "AI summaries", myHomeAiEmpty: "No AI summaries yet.",
  myHomePhotosTitle: "Photos",
  // Home Builder
  homeBuilderTitle: "Rooms",
  homeBuilderLoading: "Loading rooms…",
  homeBuilderNoPropertyYet: "We're still setting up your home. Please check back soon.",
  homeBuilderEmptyTitle: "Start building your home",
  homeBuilderEmptyHint: "Add your first room — for example the kitchen or living room — and build from there.",
  homeBuilderAddFirstRoom: "Add your first room",
  homeBuilderAddAnotherRoom: "Add another room",
  // LocationFormSheet (rendered from HomeBuilderSection)
  locationFormAddTitle: "Add a room", locationFormNameLabel: "Name",
  locationFormNamePlaceholder: "e.g. Attic", locationFormTypeLabel: "Type",
  locationFormTypePlaceholder: "e.g. bedroom", locationFormParentLabel: "Inside",
  locationFormParentNone: "None — top level", locationFormSaveNew: "Save room",
  locationEditTitle: "Edit room", locationSaveChanges: "Save changes",
  locationAddItemHere: "Add something to this room", locationRemove: "Remove room",
  locationRemoveConfirm: "Remove this room? This can't be undone.",
  locationRetireBlockedChildren: "This room still contains another room. Remove that one first.",
  locationRetireBlockedItems: "Something is still placed in this room. Remove or move it first.",
  cancelBtn: "Cancel",
  // ItemFormSheet (rendered from "add something to this room")
  itemAddTitle: "Add item", itemEditTitle: "Edit item",
  itemNameLabel: "Name", itemNamePlaceholder: "e.g. washing machine",
  itemCategoryLabel: "Category", itemRoomLabel: "Room", itemRoomPlaceholder: "e.g. kitchen",
  itemBrandLabel: "Brand", itemModelLabel: "Model",
  itemPhotoLabel: "Photo", itemPhotoAdd: "Add photo", itemPhotoRemove: "Remove photo",
  itemPurchasedLabel: "Purchased on", itemNotesLabel: "Notes",
  itemSaveNew: "Save item", itemSaveChanges: "Save changes",
  itemDelete: "Delete item", itemDeleteConfirm: "Delete this item?",
  itemCatAppliance: "Appliances", itemCatElectronics: "Electronics", itemCatFurniture: "Furniture",
  itemCatGarden: "Garden", itemCatTool: "Tools", itemCatOther: "Other",
  itemRoomKitchen: "Kitchen", itemRoomLiving: "Living room", itemRoomBedroom: "Bedroom",
  itemRoomBathroom: "Bathroom", itemRoomGarage: "Garage", itemRoomGarden: "Garden",
  itemRoomAttic: "Attic", itemRoomBasement: "Basement",
};

const fmtDate = (iso) => iso;
const serviceInfo = () => ({ name: "Service" });

function baseHomeCtx(overrides = {}) {
  return {
    property: { isEmpty: true },
    openWork: [],
    trustedPros: [],
    history: [],
    photoSources: [],
    propertyId: null,
    homeProfile: null,
    refreshItems: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

const BASE_PROPS = {
  t, ownerId: "owner-1", serviceInfo, fmtDate,
  onReportProblem: () => {}, onOpenRequest: () => {}, requests: [],
};

describe("MyHomePanel — HomeBuilderSection states", () => {
  it("shows a loading line while homeProfile has not resolved yet", () => {
    render(<MyHomePanel {...BASE_PROPS} homeCtx={baseHomeCtx({ homeProfile: null })} />);
    expect(screen.getByText("Loading rooms…")).toBeTruthy();
  });

  it("shows a real recovery message, not an empty room list, when no property has resolved yet", () => {
    render(<MyHomePanel {...BASE_PROPS} homeCtx={baseHomeCtx({ propertyId: null, homeProfile: { rooms: [] } })} />);
    expect(screen.getByText("We're still setting up your home. Please check back soon.")).toBeTruthy();
    expect(screen.queryByText("Start building your home")).toBeNull();
  });

  it("shows the first-room empty state, with a labeled primary action, once a real property exists with no rooms yet", () => {
    render(<MyHomePanel {...BASE_PROPS} homeCtx={baseHomeCtx({ propertyId: "prop-1", homeProfile: { rooms: [] } })} />);
    expect(screen.getByText("Start building your home")).toBeTruthy();
    expect(screen.getByText("Add your first room — for example the kitchen or living room — and build from there.")).toBeTruthy();
    expect(screen.getByText("Add your first room")).toBeTruthy();
  });

  it("shows the room tree and a labeled 'add another room' action once at least one room exists", () => {
    const rooms = [{ id: "loc-1", name: "Kitchen", type: "kitchen", children: [] }];
    render(<MyHomePanel {...BASE_PROPS} homeCtx={baseHomeCtx({ propertyId: "prop-1", homeProfile: { rooms } })} />);
    expect(screen.getByText("Kitchen")).toBeTruthy();
    expect(screen.getByText("Add another room")).toBeTruthy();
    expect(screen.queryByText("Start building your home")).toBeNull();
  });
});

describe("MyHomePanel — HomeBuilderSection actions", () => {
  it("opens LocationFormSheet in create mode from 'Add your first room'", () => {
    render(<MyHomePanel {...BASE_PROPS} homeCtx={baseHomeCtx({ propertyId: "prop-1", homeProfile: { rooms: [] } })} />);
    fireEvent.click(screen.getByText("Add your first room"));
    expect(screen.getByText("Add a room")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("creates the first room with the property's id, then refreshes", async () => {
    const refreshItems = vi.fn(() => Promise.resolve());
    render(<MyHomePanel {...BASE_PROPS} homeCtx={baseHomeCtx({ propertyId: "prop-1", homeProfile: { rooms: [] }, refreshItems })} />);

    fireEvent.click(screen.getByText("Add your first room"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kitchen" } });
    fireEvent.click(screen.getByText("Save room"));

    await waitFor(() => expect(createLocation).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: "prop-1", name: "Kitchen", actorRef: "owner-1",
    })));
    expect(refreshItems).toHaveBeenCalled();
  });

  it("opens LocationFormSheet in edit mode when an existing room is tapped", () => {
    const rooms = [{ id: "loc-1", name: "Kitchen", type: "kitchen", children: [] }];
    render(<MyHomePanel {...BASE_PROPS} homeCtx={baseHomeCtx({ propertyId: "prop-1", homeProfile: { rooms } })} />);

    fireEvent.click(screen.getByText("Kitchen"));

    expect(screen.getByText("Edit room")).toBeTruthy();
    expect(screen.getByLabelText("Name").value).toBe("Kitchen");
  });

  it("goes from a room's 'Add something to this room' straight into ItemFormSheet, pre-selecting that room", async () => {
    const rooms = [{ id: "loc-1", name: "Kitchen", type: "kitchen", children: [] }];
    render(<MyHomePanel {...BASE_PROPS} homeCtx={baseHomeCtx({ propertyId: "prop-1", homeProfile: { rooms } })} />);

    fireEvent.click(screen.getByText("Kitchen"));
    fireEvent.click(screen.getByText("Add something to this room"));

    expect(screen.getByText("Add item")).toBeTruthy();
    // The real room picker, pre-selected to the room the customer just came from.
    expect(screen.getByLabelText("Room").value).toBe("loc-1");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Washing machine" } });
    fireEvent.click(screen.getByText("Save item"));

    await waitFor(() => expect(createAsset).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: "prop-1", locationId: "loc-1", name: "Washing machine",
    })));
  });
});

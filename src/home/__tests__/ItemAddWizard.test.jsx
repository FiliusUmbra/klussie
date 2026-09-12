// ItemAddWizard.jsx's own tests — creating something new, one question per screen.
// Moved here from ItemFormSheet.test.jsx's own create-mode describe blocks (product
// remark, 2026-09-12: ItemFormSheet.jsx is edit-only now).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/householdItems.js", () => ({
  createHouseholdItem: vi.fn(() => Promise.resolve({ id: "legacy-1" })),
  setHouseholdItemPhoto: vi.fn(() => Promise.resolve({ photoPath: null, photoUrl: null })),
  createAsset: vi.fn(() => Promise.resolve({ id: "asset-1", photoPath: null })),
}));

import { createHouseholdItem, setHouseholdItemPhoto, createAsset } from "../../lib/householdItems.js";
import { ItemAddWizard } from "../ItemAddWizard.jsx";

const t = {
  itemWizardStepProgress: "Step {n} of {total}",
  itemWizardPhotoTitle: "A photo of the nameplate",
  itemWizardPhotoHint: "The brand, model and serial number are usually printed on a small plate or sticker on the item itself.",
  itemWizardExtraTitle: "Anything else to add?",
  itemNameLabel: "Name", itemNamePlaceholder: "e.g. washing machine",
  itemCategoryLabel: "Category", itemRoomLabel: "Room", itemRoomPlaceholder: "e.g. kitchen", itemRoomNone: "No room chosen",
  itemBrandLabel: "Brand", itemModelLabel: "Model",
  itemPhotoLabel: "Photo", itemPhotoAdd: "Add photo", itemPhotoRemove: "Remove photo",
  itemPurchasedLabel: "Purchased on", itemNotesLabel: "Notes",
  itemSaveNew: "Save item", itemSaveFailed: "Couldn't save this item.",
  tourNext: "Next", tourBack: "Back", tourSkip: "Skip", closeBtn: "Close",
  itemCatAppliance: "Appliances", itemCatElectronics: "Electronics", itemCatFurniture: "Furniture",
  itemCatGarden: "Garden", itemCatTool: "Tools", itemCatOther: "Other",
  itemRoomKitchen: "Kitchen", itemRoomLiving: "Living room", itemRoomBedroom: "Bedroom",
  itemRoomBathroom: "Bathroom", itemRoomGarage: "Garage", itemRoomGarden: "Garden",
  itemRoomAttic: "Attic", itemRoomBasement: "Basement",
};

const ROOMS = [
  { id: "loc-1", name: "Kitchen", type: "kitchen", children: [] },
  { id: "loc-2", name: "Garage", type: null, children: [] },
];

function next() { fireEvent.click(screen.getByText("Next")); }
function skip() { fireEvent.click(screen.getByText("Skip")); }
function whatStep(name) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ItemAddWizard — one question per screen", () => {
  it("starts on the 'what is it' step, Next disabled until a name is given", () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Next").disabled).toBe(true);

    whatStep("Boiler");
    expect(screen.getByText("Next").disabled).toBe(false);
  });

  it("walks through photo, brand and model in order, ending on the extra-details step", () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={() => {}} />);

    whatStep("Boiler");
    next();
    expect(screen.getByText("A photo of the nameplate")).toBeTruthy();

    skip();
    expect(screen.getByText("Brand")).toBeTruthy();

    skip();
    expect(screen.getByText("Model")).toBeTruthy();

    skip();
    expect(screen.getByText("Anything else to add?")).toBeTruthy();
    // The terminal step's own primary action is the save button, not another "Next".
    expect(screen.getByText("Save item")).toBeTruthy();
  });

  it("never offers Skip on the 'what is it' step -- the one required field", () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByText("Skip")).toBeNull();
  });

  it("Back returns to the previous step without losing what was already typed", () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={() => {}} />);

    whatStep("Boiler");
    next();
    skip(); // brand
    fireEvent.click(screen.getByText("Back"));

    expect(screen.getByText("A photo of the nameplate")).toBeTruthy();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByLabelText("Name").value).toBe("Boiler");
  });

  it("shows the step progress, updating as steps advance", () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();

    whatStep("Boiler");
    next();
    expect(screen.getByText("Step 2 of 5")).toBeTruthy();
  });
});

describe("ItemAddWizard — create, real contract vs legacy", () => {
  async function fillAndSave() {
    whatStep("Boiler");
    next(); // photo
    skip();
    skip(); // brand
    skip(); // model
    fireEvent.click(screen.getByText("Save item")); // extra
    await waitFor(() => {});
  }

  it("calls createAsset, never createHouseholdItem, when propertyId is given", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemAddWizard t={t} ownerId="owner-1" propertyId="prop-1" onClose={() => {}} onSaved={onSaved} />);

    await fillAndSave();

    await waitFor(() => expect(createAsset).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: "prop-1", ownerId: "owner-1", actorRef: "owner-1", name: "Boiler",
    })));
    expect(createHouseholdItem).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("calls createHouseholdItem, never createAsset, when propertyId is absent", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={onSaved} />);

    await fillAndSave();

    await waitFor(() => expect(createHouseholdItem).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-1", name: "Boiler" })));
    expect(createAsset).not.toHaveBeenCalled();
  });

  // The legacy path uploads the photo as a second call, once the row (and its id) exist
  // — matching ItemFormSheet.jsx's own create path before this split.
  it("uploads a picked photo via setHouseholdItemPhoto after the item exists, on the legacy path", async () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={vi.fn(() => Promise.resolve())} />);

    whatStep("Boiler");
    next(); // photo
    const file = new File(["x"], "boiler.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    next(); // brand
    next(); // model
    next(); // extra
    fireEvent.click(screen.getByText("Save item"));

    await waitFor(() => expect(setHouseholdItemPhoto).toHaveBeenCalledWith("legacy-1", "owner-1", file, null));
  });
});

// Home Builder slice — property.create_asset() always accepted a real location_id; the
// wizard's own "extra" step offers the customer's own actual rooms, once any exist.
describe("ItemAddWizard — room picker on the extra-details step", () => {
  async function toExtraStep() {
    whatStep("Boiler");
    next();
    skip();
    skip();
    skip();
  }

  it("offers a real room picker when real rooms exist, instead of the free-text/suggested-chips UI", async () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} onClose={() => {}} onSaved={() => {}} />);
    await toExtraStep();

    expect(screen.getByLabelText("Room")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Kitchen" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Garage" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.itemRoomBedroom })).toBeNull();
  });

  it("sends the picked room's id as locationId, and its name for display", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemAddWizard t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} onClose={() => {}} onSaved={onSaved} />);
    await toExtraStep();

    fireEvent.change(screen.getByLabelText("Room"), { target: { value: "loc-2" } });
    fireEvent.click(screen.getByText("Save item"));

    await waitFor(() => expect(createAsset).toHaveBeenCalledWith(expect.objectContaining({
      locationId: "loc-2", room: "Garage",
    })));
  });

  it("sends null locationId when no room is picked, the default selection", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<ItemAddWizard t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} onClose={() => {}} onSaved={onSaved} />);
    await toExtraStep();
    fireEvent.click(screen.getByText("Save item"));

    await waitFor(() => expect(createAsset).toHaveBeenCalledWith(expect.objectContaining({ locationId: null })));
  });

  it("pre-selects the room passed as initialLocationId (arriving via 'add something to this room')", async () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" propertyId="prop-1" rooms={ROOMS} initialLocationId="loc-1" onClose={() => {}} onSaved={() => {}} />);
    await toExtraStep();

    expect(screen.getByLabelText("Room").value).toBe("loc-1");
  });

  it("falls back to the free-text/suggested-chips UI when no real rooms exist yet", async () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" propertyId="prop-1" rooms={[]} onClose={() => {}} onSaved={() => {}} />);
    await toExtraStep();

    expect(screen.getByText(t.itemRoomKitchen)).toBeTruthy();
  });
});

describe("ItemAddWizard — save failure", () => {
  it("shows a generic localized error, never the raw backend message, and stays on the extra step", async () => {
    vi.mocked(createAsset).mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    const onSaved = vi.fn();
    render(<ItemAddWizard t={t} ownerId="owner-1" propertyId="prop-1" onClose={() => {}} onSaved={onSaved} />);

    whatStep("Boiler");
    next();
    skip();
    skip();
    skip();
    fireEvent.click(screen.getByText("Save item"));

    await waitFor(() => expect(screen.getByText("Couldn't save this item.")).toBeTruthy());
    expect(screen.queryByText(/row-level security/)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText("Save item").disabled).toBe(false);
  });
});

// Found by code audit (ItemFormSheet.jsx's own precedent): create once on pick, revoke
// once on remove or replace — never leak the blob URL.
describe("ItemAddWizard — photo object URL lifecycle", () => {
  const file = new File(["x"], "boiler.jpg", { type: "image/jpeg" });

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock-1");
    URL.revokeObjectURL = vi.fn();
  });

  it("revokes the object URL for a locally picked photo when it's removed", () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={vi.fn()} />);
    whatStep("Boiler");
    next();

    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Remove photo"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  // The same one photo slot is reachable from the Brand and Model steps' own small
  // camera icon -- picking a photo there must not create a second, orphaned object URL.
  it("the Brand step's own small photo icon reaches the same one photo slot the Photo step set", () => {
    render(<ItemAddWizard t={t} ownerId="owner-1" onClose={() => {}} onSaved={vi.fn()} />);
    whatStep("Boiler");
    next(); // photo
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    next(); // brand

    expect(screen.getByText("Brand")).toBeTruthy();
    // Exactly one file input exists for the whole wizard, shared across steps.
    expect(document.querySelectorAll('input[type="file"]').length).toBe(1);
  });
});

// Platform Activation Slice 1, WP 1.8 — LocationFormSheet.jsx's own tests: it calls
// createLocation() with a trimmed name and the chosen parent, and the parent picker
// reflects the real tree depth-first, indented.
//
// Move Room UI slice — MoveRoomModal's own tests, below: the destination picker excludes
// the room being edited and every depth of its own descendants, pre-selects its current
// parent, and moveLocation() is called exactly once per confirm, closing the whole sheet
// on success — never combined with renameLocation() in one submit (see
// LocationFormSheet.jsx's own header for why).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/locations.js", () => ({
  createLocation: vi.fn(() => Promise.resolve({ id: "loc-new" })),
  renameLocation: vi.fn(() => Promise.resolve()),
  retireLocation: vi.fn(() => Promise.resolve()),
  moveLocation: vi.fn(() => Promise.resolve()),
}));

import { createLocation, renameLocation, retireLocation, moveLocation } from "../../lib/locations.js";
import { LocationFormSheet } from "../LocationFormSheet.jsx";

const t = {
  locationFormAddTitle: "Add a room", locationFormNameLabel: "Name",
  locationFormNamePlaceholder: "e.g. Attic", locationFormTypeLabel: "Type",
  locationFormTypePlaceholder: "e.g. bedroom", locationFormParentLabel: "Inside",
  locationFormParentNone: "None — top level", locationFormSaveNew: "Save room",
  locationEditTitle: "Edit room", locationSaveChanges: "Save changes",
  locationAddItemHere: "Add something to this room", locationRemove: "Remove room",
  locationRemoveConfirm: "Remove this room? This can't be undone.",
  locationRetireBlockedChildren: "This room still contains another room. Remove that one first.",
  locationRetireBlockedItems: "Something is still placed in this room. Remove or move it first.",
  locationMoveAction: "Move room or area", locationMoveTitle: "Move room or area",
  locationMoveFieldLabel: "Move to", locationMoveTopLevel: "Top level",
  locationMoveSummary: "This room will be: {location}", locationMoveSave: "Move",
  locationMoveFailed: "Couldn't move this room. Please try again.",
  cancelBtn: "Cancel",
};

const PANTRY = { id: "loc-3", name: "Pantry", type: null, parentId: "loc-2", children: [] };
const KITCHEN = { id: "loc-2", name: "Kitchen", type: "kitchen", parentId: "loc-1", children: [PANTRY] };
const GARAGE = { id: "loc-4", name: "Garage", type: null, parentId: null, children: [] };
const GROUND_FLOOR = { id: "loc-1", name: "Ground floor", type: "floor", parentId: null, children: [KITCHEN] };

const ROOMS = [GROUND_FLOOR, GARAGE];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LocationFormSheet", () => {
  it("disables save until a name is entered", () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[]} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Save room").closest("button").disabled).toBe(true);
  });

  it("lists the real tree in the parent picker, indented by depth", () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByRole("option", { name: "Ground floor" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "— Kitchen" })).toBeTruthy();
  });

  it("calls createLocation with a trimmed name and the chosen parent, then saves and closes", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn(() => Promise.resolve());
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Bathroom  " } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "bathroom" } });
    fireEvent.change(screen.getByLabelText("Inside"), { target: { value: "loc-1" } });
    fireEvent.click(screen.getByText("Save room"));

    await waitFor(() => expect(createLocation).toHaveBeenCalledWith({
      propertyId: "prop-1", parentId: "loc-1", name: "  Bathroom  ", type: "bathroom", actorRef: "owner-1",
    }));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("sends null parentId for a top-level room, the default selection", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Garden shed" } });
    fireEvent.click(screen.getByText("Save room"));

    await waitFor(() => expect(createLocation).toHaveBeenCalledWith(expect.objectContaining({ parentId: null })));
  });

  it("shows the real error and stays open when the save fails", async () => {
    createLocation.mockRejectedValue(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[]} onClose={onClose} onSaved={() => {}} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Attic" } });
    fireEvent.click(screen.getByText("Save room"));

    await waitFor(() => expect(screen.getByText("insufficient_privilege")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});

// Home Builder slice — a `room` prop switches the sheet into edit mode: rename, retire,
// and "add something to this room" are the three real gaps 0140's own header named and
// deferred (rename/retire), plus the direct next action the empty-room state needs.
describe("LocationFormSheet — edit mode (Home Builder slice)", () => {
  it("pre-fills the name field with the room's current name", () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[KITCHEN]} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={() => {}} />);
    expect(screen.getByLabelText("Name").value).toBe("Kitchen");
  });

  it("does not show the create-only type/parent fields", () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[KITCHEN]} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={() => {}} />);
    expect(screen.queryByLabelText("Type")).toBeNull();
    expect(screen.queryByLabelText("Inside")).toBeNull();
  });

  it("calls renameLocation only when the name actually changed", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[KITCHEN]} room={KITCHEN} onClose={onClose} onSaved={onSaved} onAddItemHere={() => {}} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Big kitchen" } });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(renameLocation).toHaveBeenCalledWith({ locationId: "loc-2", name: "Big kitchen", actorRef: "owner-1" }));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("saves and closes without calling renameLocation when the name is unchanged", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[KITCHEN]} room={KITCHEN} onClose={() => {}} onSaved={onSaved} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(renameLocation).not.toHaveBeenCalled();
  });

  it("calls onAddItemHere with the room when 'Add something to this room' is pressed", () => {
    const onAddItemHere = vi.fn();
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[KITCHEN]} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={onAddItemHere} />);

    fireEvent.click(screen.getByText("Add something to this room"));

    expect(onAddItemHere).toHaveBeenCalledWith(KITCHEN);
  });

  it("asks for confirmation before retiring, and retires only after it", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[KITCHEN]} room={KITCHEN} onClose={onClose} onSaved={onSaved} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Remove room"));
    expect(retireLocation).not.toHaveBeenCalled();
    expect(screen.getByText("Remove this room? This can't be undone.")).toBeTruthy();

    fireEvent.click(screen.getAllByText("Remove room")[1]);

    await waitFor(() => expect(retireLocation).toHaveBeenCalledWith({ locationId: "loc-2", actorRef: "owner-1" }));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the friendly active-children message, not a raw error, when retirement is refused for that reason", async () => {
    retireLocation.mockRejectedValueOnce(Object.assign(new Error("object_not_in_prerequisite_state"), { hint: "active_children" }));
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[KITCHEN]} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Remove room"));
    fireEvent.click(screen.getAllByText("Remove room")[1]);

    await waitFor(() => expect(screen.getByText(t.locationRetireBlockedChildren)).toBeTruthy());
  });

  it("shows the friendly active-assets message, not a raw error, when retirement is refused for that reason", async () => {
    retireLocation.mockRejectedValueOnce(Object.assign(new Error("object_not_in_prerequisite_state"), { hint: "active_assets" }));
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={[KITCHEN]} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Remove room"));
    fireEvent.click(screen.getAllByText("Remove room")[1]);

    await waitFor(() => expect(screen.getByText(t.locationRetireBlockedItems)).toBeTruthy());
  });
});

// Move Room UI slice (Home Builder completion) — property.reparent_location_for_caller()
// (0198) has been real, complete and tested since Home Builder shipped; the only real
// gap was a picker UI, blocked on buildLocationTree() not carrying each node's own
// parent id (fixed in homeInventory.js, see its own tests). Move is its own independent
// action here, deliberately never combined with "Save changes" — see this file's own
// header for why.
describe("LocationFormSheet — Move room or area (Move Room UI slice)", () => {
  it("opens a destination picker naming the current parent, siblings, and top level, excluding the room itself and its own descendants at every depth", () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Move room or area"));

    expect(screen.getByText("Move to")).toBeTruthy();
    // Top level and the unrelated sibling root are real, valid choices.
    expect(screen.getByRole("option", { name: "Top level" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Garage" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Ground floor" })).toBeTruthy();
    // Kitchen itself (the room being edited) is never offered as its own destination.
    expect(screen.queryByRole("option", { name: "Kitchen" })).toBeNull();
    // Pantry is Kitchen's own child (a direct descendant) — excluded at any depth.
    expect(screen.queryByRole("option", { name: /Pantry/ })).toBeNull();
  });

  it("pre-selects the room's current parent", () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Move room or area"));

    expect(screen.getByLabelText("Move to").value).toBe("loc-1");
  });

  it("shows a plain-language summary of where the room will end up, updating as the choice changes", () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Move room or area"));
    expect(screen.getByText("This room will be: Ground floor")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Move to"), { target: { value: "" } });
    expect(screen.getByText("This room will be: Top level")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Move to"), { target: { value: "loc-4" } });
    expect(screen.getByText("This room will be: Garage")).toBeTruthy();
  });

  it("calls moveLocation exactly once with the chosen destination, then refreshes and closes the whole sheet", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} room={KITCHEN} onClose={onClose} onSaved={onSaved} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Move room or area"));
    fireEvent.change(screen.getByLabelText("Move to"), { target: { value: "loc-4" } });
    fireEvent.click(screen.getByText("Move"));

    await waitFor(() => expect(moveLocation).toHaveBeenCalledTimes(1));
    expect(moveLocation).toHaveBeenCalledWith({ locationId: "loc-2", newParentId: "loc-4", actorRef: "owner-1" });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(renameLocation).not.toHaveBeenCalled();
  });

  it("passes the contract's own root value (null), never a fake root id, when moving to top level", async () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} room={KITCHEN} onClose={() => {}} onSaved={() => Promise.resolve()} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Move room or area"));
    fireEvent.change(screen.getByLabelText("Move to"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Move"));

    await waitFor(() => expect(moveLocation).toHaveBeenCalledWith(expect.objectContaining({ newParentId: null })));
  });

  it("shows the real error, keeps the modal open, and never claims success, when the move fails", async () => {
    moveLocation.mockRejectedValueOnce(new Error("insufficient_privilege"));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} room={KITCHEN} onClose={onClose} onSaved={onSaved} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Move room or area"));
    fireEvent.click(screen.getByText("Move"));

    await waitFor(() => expect(screen.getByText(t.locationMoveFailed)).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The picker itself is still open and usable — the room being edited is preserved.
    expect(screen.getByLabelText("Move to")).toBeTruthy();
  });

  it("disables Move and Cancel while a move is in flight, preventing a duplicate submission", async () => {
    let resolveMove;
    moveLocation.mockReturnValueOnce(new Promise((resolve) => { resolveMove = resolve; }));
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} room={KITCHEN} onClose={() => {}} onSaved={() => Promise.resolve()} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Move room or area"));
    fireEvent.click(screen.getByText("Move"));

    expect(screen.getByText("Move").closest("button").disabled).toBe(true);
    expect(screen.getByText("Cancel").closest("button").disabled).toBe(true);
    expect(moveLocation).toHaveBeenCalledTimes(1);

    resolveMove();
    await waitFor(() => expect(moveLocation).toHaveBeenCalledTimes(1));
  });

  it("can be cancelled without calling moveLocation at all", () => {
    render(<LocationFormSheet t={t} propertyId="prop-1" actorRef="owner-1" rooms={ROOMS} room={KITCHEN} onClose={() => {}} onSaved={() => {}} onAddItemHere={() => {}} />);

    fireEvent.click(screen.getByText("Move room or area"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(moveLocation).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Move to")).toBeNull();
  });
});

// Platform Activation Slice 1, WP 1.8 — LocationFormSheet.jsx's own tests: it calls
// createLocation() with a trimmed name and the chosen parent, and the parent picker
// reflects the real tree depth-first, indented.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/locations.js", () => ({
  createLocation: vi.fn(() => Promise.resolve({ id: "loc-new" })),
  renameLocation: vi.fn(() => Promise.resolve()),
  retireLocation: vi.fn(() => Promise.resolve()),
}));

import { createLocation, renameLocation, retireLocation } from "../../lib/locations.js";
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
  cancelBtn: "Cancel",
};

const KITCHEN = { id: "loc-2", name: "Kitchen", type: "kitchen", children: [] };

const ROOMS = [
  { id: "loc-1", name: "Ground floor", type: "floor", children: [
    { id: "loc-2", name: "Kitchen", type: "kitchen", children: [] },
  ] },
];

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

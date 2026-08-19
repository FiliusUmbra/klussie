// Platform Activation Slice 1, WP 1.8 — LocationFormSheet.jsx's own tests: it calls
// createLocation() with a trimmed name and the chosen parent, and the parent picker
// reflects the real tree depth-first, indented.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/locations.js", () => ({
  createLocation: vi.fn(() => Promise.resolve({ id: "loc-new" })),
}));

import { createLocation } from "../../lib/locations.js";
import { LocationFormSheet } from "../LocationFormSheet.jsx";

const t = {
  locationFormAddTitle: "Add a room", locationFormNameLabel: "Name",
  locationFormNamePlaceholder: "e.g. Attic", locationFormTypeLabel: "Type",
  locationFormTypePlaceholder: "e.g. bedroom", locationFormParentLabel: "Inside",
  locationFormParentNone: "None — top level", locationFormSaveNew: "Save room",
};

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

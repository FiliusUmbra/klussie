// EditProfileSheet.jsx's own tests.
//
// Found live during a UX review, 2026-09-06: the business_name/vat_number fields were
// shown only once proProfile.pro_type was ALREADY "business" — but
// public.pro_profiles' own business_requires_details check constraint requires those two
// fields to already be set before pro_type can become "business" in the first place. A
// flexi pro had no reachable way to ever switch: Profile.jsx's own "Registered business"
// toggle failed the constraint with nothing to fill in, and this form never offered the
// fields until after a switch that could never succeed. See Profile.test.jsx's own new
// describe block for the matching fix on that side.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const useAuthMock = vi.fn();
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));
vi.mock("../../lib/storage", () => ({ uploadAvatar: vi.fn() }));
vi.mock("../../lib/pros", () => ({ updateProProfile: vi.fn() }));

import { updateProProfile } from "../../lib/pros";
import { LangContext } from "../../lib/lang";
import { EditProfileSheet } from "../EditProfileSheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

// This form's own labels carry no htmlFor/id (a pre-existing gap, unrelated to and not
// fixed by this change) — getByLabelText can't associate them, so tests query by the
// input immediately following a given label's own text instead.
function inputAfterLabel(labelText) {
  const label = screen.getByText(labelText);
  return label.nextElementSibling.querySelector("input");
}

function renderSheet({ proProfile, ...rest } = {}) {
  const updateProfile = vi.fn(() => Promise.resolve());
  const refreshProfile = vi.fn(() => Promise.resolve());
  useAuthMock.mockReturnValue({
    profile: { id: "person-1", full_name: "Pierre Pro", city: "Brussels", avatar_url: null },
    proProfile,
    updateProfile,
    refreshProfile,
  });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <LangContext.Provider value={{ t }}>
      <EditProfileSheet onClose={onClose} onSaved={onSaved} {...rest} />
    </LangContext.Provider>
  );
  return { updateProfile, refreshProfile, onClose, onSaved };
}

describe("EditProfileSheet — business details, reachable regardless of current pro_type", () => {
  it("shows the business name and VAT fields for a flexi pro, not only an already-business one", () => {
    renderSheet({ proProfile: { pro_type: "flexi", bio: "" } });
    expect(screen.getByText("businessNameLabel")).toBeTruthy();
    expect(screen.getByText("vatNumberLabel")).toBeTruthy();
  });

  it("still shows them for an already-business pro, unchanged", () => {
    renderSheet({ proProfile: { pro_type: "business", bio: "", business_name: "Pierre BV", vat_number: "BE0123456789" } });
    expect(screen.getByText("businessNameLabel")).toBeTruthy();
    expect(screen.getByText("vatNumberLabel")).toBeTruthy();
  });

  it("hides them entirely for the customer variant (no proProfile at all)", () => {
    renderSheet({ proProfile: null });
    expect(screen.queryByText("businessNameLabel")).toBeNull();
    expect(screen.queryByText("vatNumberLabel")).toBeNull();
  });

  it("saves whatever is typed, even while still flexi — no longer forced to null based on the current pro_type", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockResolvedValueOnce(undefined);
    renderSheet({ proProfile: { pro_type: "flexi", bio: "" } });

    fireEvent.change(inputAfterLabel("businessNameLabel"), { target: { value: "Pierre BV" } });
    fireEvent.change(inputAfterLabel("vatNumberLabel"), { target: { value: "BE0123456789" } });
    fireEvent.click(screen.getByText("saveChangesBtn"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith(
      "person-1", expect.objectContaining({ business_name: "Pierre BV", vat_number: "BE0123456789" })
    ));
  });

  it("saves null for a blank field, trimmed, rather than an empty string", async () => {
    updateProProfile.mockReset();
    updateProProfile.mockResolvedValueOnce(undefined);
    renderSheet({ proProfile: { pro_type: "flexi", bio: "" } });

    fireEvent.change(inputAfterLabel("businessNameLabel"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("saveChangesBtn"));

    await waitFor(() => expect(updateProProfile).toHaveBeenCalledWith(
      "person-1", expect.objectContaining({ business_name: null })
    ));
  });

  it("pre-fills both fields from the caller's own already-saved values", () => {
    renderSheet({ proProfile: { pro_type: "business", bio: "", business_name: "Pierre BV", vat_number: "BE0123456789" } });
    expect(inputAfterLabel("businessNameLabel").value).toBe("Pierre BV");
    expect(inputAfterLabel("vatNumberLabel").value).toBe("BE0123456789");
  });
});

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

import { uploadAvatar } from "../../lib/storage";
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

  // Found by code audit, then live-verified: clearing "Bedrijfsnaam" on a real business
  // pro and saving hits pro_profiles' own business_requires_details check constraint
  // (0001) -- the update never persists, but nothing stopped the submission beforehand,
  // and (before this fix) the failure showed only the generic editProfileSaveFailed
  // message even though Profile.jsx's own setProType() already has a specific one for
  // this exact constraint.
  it("disables save for an already-business pro once business name or VAT number is cleared", () => {
    updateProProfile.mockReset();
    renderSheet({
      proProfile: { pro_type: "business", bio: "", business_name: "Pierre BV", vat_number: "BE0123456789" },
    });

    fireEvent.change(inputAfterLabel("businessNameLabel"), { target: { value: "" } });
    expect(screen.getByText("saveChangesBtn").disabled).toBe(true);

    fireEvent.click(screen.getByText("saveChangesBtn"));
    expect(updateProProfile).not.toHaveBeenCalled();
  });

  it("still disables save when business name is cleared to whitespace only, not just empty", () => {
    renderSheet({
      proProfile: { pro_type: "business", bio: "", business_name: "Pierre BV", vat_number: "BE0123456789" },
    });

    fireEvent.change(inputAfterLabel("businessNameLabel"), { target: { value: "   " } });

    expect(screen.getByText("saveChangesBtn").disabled).toBe(true);
  });

  it("never requires business name or VAT number for a flexi pro, even blank", () => {
    renderSheet({ proProfile: { pro_type: "flexi", bio: "" } });
    expect(screen.getByText("saveChangesBtn").disabled).toBe(false);
  });

  // Defense in depth: if this constraint is ever hit anyway (a race, or a future path
  // that bypasses the client-side guard above), the error shown matches Profile.jsx's
  // own setProType() for the identical constraint, not the generic fallback.
  it("shows the specific business-details-required message, not the generic one, if the constraint is hit anyway", async () => {
    updateProProfile.mockReset();
    renderSheet({
      proProfile: { pro_type: "business", bio: "", business_name: "Pierre BV", vat_number: "BE0123456789" },
    });
    updateProProfile.mockRejectedValueOnce(
      new Error('new row for relation "pro_profiles" violates check constraint "business_requires_details"')
    );

    fireEvent.click(screen.getByText("saveChangesBtn"));

    await waitFor(() => expect(screen.getByText("proTypeBusinessRequiresDetails")).toBeTruthy());
    expect(screen.queryByText("editProfileSaveFailed")).toBeNull();
  });
});

// Found by code audit: both catch blocks did `setError(err.message)`, showing a raw
// Postgres/Storage error verbatim — the exact anti-pattern documents.js's own header
// names and fixes ("t.documentFormSaveFailed already existed... and was never used").
describe("EditProfileSheet — save/upload failure", () => {
  it("shows a generic localized error, never the raw backend message, when saving the profile fails", async () => {
    const { updateProfile, onClose } = renderSheet({ proProfile: null });
    updateProfile.mockRejectedValueOnce(new Error("new row violates row-level security policy"));

    fireEvent.click(screen.getByText("saveChangesBtn"));

    await waitFor(() => expect(screen.getByText("editProfileSaveFailed")).toBeTruthy());
    expect(screen.queryByText(/row-level security/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a generic localized error, never the raw backend message, when the avatar upload fails", async () => {
    vi.mocked(uploadAvatar).mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    renderSheet({ proProfile: null });

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["x"], "avatar.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("avatarUploadFailed")).toBeTruthy());
    expect(screen.queryByText(/row-level security/)).toBeNull();
  });
});

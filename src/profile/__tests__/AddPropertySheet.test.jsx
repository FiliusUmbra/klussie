// Home foundation slice — the entry point that makes PropertySwitcher.jsx (My Home) and
// the multi-property read path (migration 0225) reachable by a real customer, not just by
// data an operator might insert directly.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../lib/homeInventory.js", () => ({
  createPropertyForCaller: vi.fn(),
  setPropertyAddress: vi.fn(),
}));

import { createPropertyForCaller, setPropertyAddress } from "../../lib/homeInventory.js";
import { AddPropertySheet } from "../AddPropertySheet.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

beforeEach(() => {
  vi.mocked(createPropertyForCaller).mockReset().mockResolvedValue({ id: "prop-new" });
  vi.mocked(setPropertyAddress).mockReset().mockResolvedValue(undefined);
});

function renderSheet(overrides = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(
    <AddPropertySheet t={t} workspaceId="ws-1" actorRef="person-1" onClose={onClose} onSaved={onSaved} {...overrides} />
  );
  return { onClose, onSaved };
}

function fillCompleteAddress() {
  fireEvent.change(screen.getByLabelText("addressStreetLabel"), { target: { value: "Kerkstraat" } });
  fireEvent.change(screen.getByLabelText("addressPostcodeLabel"), { target: { value: "2000" } });
  fireEvent.change(screen.getByLabelText("addressMunicipalityLabel"), { target: { value: "Antwerpen" } });
}

describe("AddPropertySheet", () => {
  it("keeps the submit button disabled until a name and a complete address are both given", () => {
    renderSheet();
    expect(screen.getByText("addPropertySubmitBtn").closest("button").disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("addPropertyNameLabel"), { target: { value: "Vakantiehuis" } });
    expect(screen.getByText("addPropertySubmitBtn").closest("button").disabled).toBe(true);

    fillCompleteAddress();
    expect(screen.getByText("addPropertySubmitBtn").closest("button").disabled).toBe(false);
  });

  it("creates the property with kind defaulting to home, then writes its address", async () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("addPropertyNameLabel"), { target: { value: "Vakantiehuis" } });
    fillCompleteAddress();

    fireEvent.click(screen.getByText("addPropertySubmitBtn"));

    await waitFor(() => expect(createPropertyForCaller).toHaveBeenCalledWith({
      workspaceId: "ws-1", actorRef: "person-1", name: "Vakantiehuis",
    }));
    expect(setPropertyAddress).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: "prop-new", street: "Kerkstraat", postcode: "2000", municipality: "Antwerpen",
    }));
  });

  it("refreshes the caller's own list and closes on success", async () => {
    const { onClose, onSaved } = renderSheet();
    fireEvent.change(screen.getByLabelText("addPropertyNameLabel"), { target: { value: "Vakantiehuis" } });
    fillCompleteAddress();

    fireEvent.click(screen.getByText("addPropertySubmitBtn"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows a real error and leaves the sheet open when the write fails", async () => {
    vi.mocked(createPropertyForCaller).mockRejectedValue(new Error("insufficient_privilege"));
    const { onClose } = renderSheet();
    fireEvent.change(screen.getByLabelText("addPropertyNameLabel"), { target: { value: "Vakantiehuis" } });
    fillCompleteAddress();

    fireEvent.click(screen.getByText("addPropertySubmitBtn"));

    await waitFor(() => expect(screen.getByText("addPropertyFailed")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("addPropertySubmitBtn").closest("button").disabled).toBe(false);
  });

  it("never blanks the just-saved property when the caller's own refresh fails", async () => {
    const onSaved = vi.fn().mockRejectedValue(new Error("network error"));
    const { onClose } = renderSheet({ onSaved });
    fireEvent.change(screen.getByLabelText("addPropertyNameLabel"), { target: { value: "Vakantiehuis" } });
    fillCompleteAddress();

    fireEvent.click(screen.getByText("addPropertySubmitBtn"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText("addPropertyFailed")).toBeNull();
  });
});

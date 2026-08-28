// Beta-completion slice (0182/0185) — the service-location picker itself. Covers the
// three real states: no property yet (one-time address only), a property with a
// confirmed address already (one click, no form), and a property still missing one
// (inline address form gates the selection until complete) — plus the one-time-address
// path, which always needs the form.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMyPropertiesMock = vi.fn();
vi.mock("../../lib/homeInventory.js", () => ({
  fetchMyProperties: (...args) => fetchMyPropertiesMock(...args),
  hasConfirmedAddress: (p) => Boolean(p?.street && p?.postcode && p?.municipality),
}));

import { LangContext } from "../../lib/lang";
import { ServiceLocationField } from "../ServiceLocationField.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t };

function renderField(onChange = vi.fn()) {
  render(
    <LangContext.Provider value={ctx}>
      <ServiceLocationField workspaceId="ws-1" onChange={onChange} />
    </LangContext.Provider>
  );
  return onChange;
}

beforeEach(() => {
  fetchMyPropertiesMock.mockReset();
});

describe("ServiceLocationField — loading", () => {
  it("shows a loading state, then real choices once properties resolve", async () => {
    fetchMyPropertiesMock.mockResolvedValue([]);
    renderField();

    expect(screen.getByText("serviceLocationLoading")).toBeTruthy();
    await screen.findByText("serviceLocationOneTime");
  });
});

describe("ServiceLocationField — no property yet", () => {
  it("offers only the one-time address, and reports null until it's complete", async () => {
    fetchMyPropertiesMock.mockResolvedValue([]);
    const onChange = renderField();
    await screen.findByText("serviceLocationOneTime");

    expect(screen.queryByText("serviceLocationHome")).toBeNull();
    fireEvent.click(screen.getByText("serviceLocationOneTime"));

    await screen.findByText("serviceLocationOneTimeHint");
    expect(onChange).toHaveBeenLastCalledWith(null);

    // Every address field is reachable by its accessible name, not just its
    // placeholder — a screen reader announces aria-label, and a placeholder alone
    // disappears the moment the field has a value.
    expect(screen.getByRole("textbox", { name: "addressStreetLabel" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "addressPostcodeLabel" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "addressMunicipalityLabel" })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("addressStreetLabel"), { target: { value: "Zeedijk" } });
    fireEvent.change(screen.getByPlaceholderText("addressPostcodeLabel"), { target: { value: "8400" } });
    fireEvent.change(screen.getByPlaceholderText("addressMunicipalityLabel"), { target: { value: "Oostende" } });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        type: "one_time_address",
        address: { street: "Zeedijk", houseNumber: "", postcode: "8400", municipality: "Oostende", propertyType: null, quotePrepNotes: "" },
      })
    );
  });
});

describe("ServiceLocationField — an already-addressed My Home", () => {
  const HOME = { id: "prop-1", name: "My Home", street: "Kerkstraat", houseNumber: "12", postcode: "2000", municipality: "Antwerpen", country: "BE", propertyType: "apartment", quotePrepNotes: "" };

  it("selects it in one click, with no address form and no write", async () => {
    fetchMyPropertiesMock.mockResolvedValue([HOME]);
    const onChange = renderField();
    await screen.findByText("serviceLocationHome");

    fireEvent.click(screen.getByText("serviceLocationHome"));

    expect(onChange).toHaveBeenLastCalledWith({ type: "home", propertyId: "prop-1" });
    expect(screen.queryByPlaceholderText("addressStreetLabel")).toBeNull();
  });
});

describe("ServiceLocationField — My Home with no confirmed address yet", () => {
  const HOME = { id: "prop-1", name: "My Home", street: "", houseNumber: "", postcode: "", municipality: "", country: "BE", propertyType: null, quotePrepNotes: "" };

  it("shows the confirm-address hint and form, reporting null until complete", async () => {
    fetchMyPropertiesMock.mockResolvedValue([HOME]);
    const onChange = renderField();
    await screen.findByText("serviceLocationHome");

    fireEvent.click(screen.getByText("serviceLocationHome"));
    await screen.findByText("serviceLocationHomeNeedsAddress");
    expect(onChange).toHaveBeenLastCalledWith(null);

    fireEvent.change(screen.getByPlaceholderText("addressStreetLabel"), { target: { value: "Kerkstraat" } });
    fireEvent.change(screen.getByPlaceholderText("addressPostcodeLabel"), { target: { value: "2000" } });
    fireEvent.change(screen.getByPlaceholderText("addressMunicipalityLabel"), { target: { value: "Antwerpen" } });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        type: "home",
        propertyId: "prop-1",
        address: { street: "Kerkstraat", houseNumber: "", postcode: "2000", municipality: "Antwerpen", propertyType: null, quotePrepNotes: "" },
      })
    );
  });
});

describe("ServiceLocationField — multiple properties", () => {
  it("labels only the first as My Home, offering the rest by their own real name", async () => {
    const HOME = { id: "prop-1", name: "My Home", street: "Kerkstraat", houseNumber: "1", postcode: "2000", municipality: "Antwerpen" };
    const OTHER = { id: "prop-2", name: "Vakantiehuis", street: "Zeedijk", houseNumber: "1", postcode: "8400", municipality: "Oostende" };
    fetchMyPropertiesMock.mockResolvedValue([HOME, OTHER]);
    const onChange = renderField();
    await screen.findByText("serviceLocationHome");

    expect(screen.getByText("Vakantiehuis")).toBeTruthy();
    fireEvent.click(screen.getByText("Vakantiehuis"));

    expect(onChange).toHaveBeenLastCalledWith({ type: "saved_property", propertyId: "prop-2" });
  });
});

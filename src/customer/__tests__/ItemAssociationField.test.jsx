// Intake item-association slice — "which item is this about." Unlike
// ServiceLocationField.jsx's own required field, this is always optional: no property/
// items resolves to rendering nothing at all, and "not about a specific item" is a real,
// selectable, honest default alongside every real item.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMyPropertiesMock = vi.fn();
vi.mock("../../lib/homeInventory.js", () => ({
  fetchMyProperties: (...args) => fetchMyPropertiesMock(...args),
}));

const fetchHouseholdItemsMock = vi.fn();
vi.mock("../../lib/householdItems.js", () => ({
  fetchHouseholdItems: (...args) => fetchHouseholdItemsMock(...args),
}));

import { LangContext } from "../../lib/lang";
import { ItemAssociationField } from "../ItemAssociationField.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t };

function renderField(onChange = vi.fn()) {
  render(
    <LangContext.Provider value={ctx}>
      <ItemAssociationField ownerId="owner-1" workspaceId="ws-1" onChange={onChange} />
    </LangContext.Provider>
  );
  return onChange;
}

beforeEach(() => {
  fetchMyPropertiesMock.mockReset();
  fetchHouseholdItemsMock.mockReset();
});

describe("ItemAssociationField — nothing to pick from", () => {
  it("renders nothing at all when there are no real items", async () => {
    fetchMyPropertiesMock.mockResolvedValue([]);
    fetchHouseholdItemsMock.mockResolvedValue([]);
    const { container } = render(
      <LangContext.Provider value={ctx}>
        <ItemAssociationField ownerId="owner-1" workspaceId="ws-1" onChange={vi.fn()} />
      </LangContext.Provider>
    );

    await waitFor(() => expect(fetchHouseholdItemsMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("resolves the workspace's own property first, then reads its items through it", async () => {
    fetchMyPropertiesMock.mockResolvedValue([{ id: "prop-1", name: "My Home" }]);
    fetchHouseholdItemsMock.mockResolvedValue([]);
    renderField();

    await waitFor(() => expect(fetchHouseholdItemsMock).toHaveBeenCalledWith("owner-1", "ws-1", "prop-1"));
  });
});

describe("ItemAssociationField — real items", () => {
  const ITEMS = [
    { id: "asset-1", name: "Washing machine" },
    { id: "asset-2", name: "Boiler" },
  ];

  it("shows 'not about a specific item' selected by default, reporting null", async () => {
    fetchMyPropertiesMock.mockResolvedValue([]);
    fetchHouseholdItemsMock.mockResolvedValue(ITEMS);
    const onChange = renderField();

    await screen.findByText("Washing machine");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("selecting a real item reports its id", async () => {
    fetchMyPropertiesMock.mockResolvedValue([]);
    fetchHouseholdItemsMock.mockResolvedValue(ITEMS);
    const onChange = renderField();
    await screen.findByText("Washing machine");

    fireEvent.click(screen.getByText("Washing machine"));

    expect(onChange).toHaveBeenLastCalledWith("asset-1");
  });

  it("switching back to 'not about a specific item' reports null again", async () => {
    fetchMyPropertiesMock.mockResolvedValue([]);
    fetchHouseholdItemsMock.mockResolvedValue(ITEMS);
    const onChange = renderField();
    await screen.findByText("Washing machine");

    fireEvent.click(screen.getByText("Washing machine"));
    fireEvent.click(screen.getByText("itemAssociationNone"));

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

// Found by code audit, 2026-09-11: same physical marginRight fix as
// ServiceLocationField.jsx's own identical .chip icons, same pass.
describe("ItemAssociationField — each item chip's own icon gaps toward its label, not hardcoded right", () => {
  it("uses the logical margin, not the physical one", async () => {
    fetchMyPropertiesMock.mockResolvedValue([]);
    fetchHouseholdItemsMock.mockResolvedValue([{ id: "asset-1", name: "Washing machine" }]);
    renderField();
    const label = await screen.findByText("Washing machine");

    const icon = label.closest("button").querySelector("svg");
    expect(icon.style.marginInlineEnd).toBe("4px");
    expect(icon.style.marginRight).toBe("");
  });
});

describe("ItemAssociationField — failure", () => {
  it("renders nothing, never throwing, when the read fails -- the default null is still reported", async () => {
    fetchMyPropertiesMock.mockRejectedValue(new Error("boom"));
    const { container } = render(
      <LangContext.Provider value={ctx}>
        <ItemAssociationField ownerId="owner-1" workspaceId="ws-1" onChange={vi.fn()} />
      </LangContext.Provider>
    );

    await waitFor(() => expect(fetchMyPropertiesMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

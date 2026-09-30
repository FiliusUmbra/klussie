import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LangContext } from "../../lib/lang";
import { MyHomeScreen } from "../MyHomeScreen.jsx";

const { refreshItems, selectProperty, createPropertyForCaller, setPropertyAddress } = vi.hoisted(() => ({
  refreshItems: vi.fn(), selectProperty: vi.fn(),
  createPropertyForCaller: vi.fn(), setPropertyAddress: vi.fn(),
}));
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => ({ profile: { id: "owner" }, user: { id: "owner" } }) }));
vi.mock("../../lib/homeInventory.js", () => ({ createPropertyForCaller, setPropertyAddress }));
vi.mock("../useHomeContext.js", () => ({ useHomeContext: () => ({
  homeProfile: { property: { id: "home", name: "Main home" } },
  properties: [{ id: "home", name: "Main home" }, { id: "other", name: "Other home" }],
  activePropertyId: "home", propertyId: "home", workspaceId: "personal",
  refreshItems, selectProperty,
}) }));
vi.mock("../MyHomePanel.jsx", () => ({ MyHomePanel: () => <p>Overview</p> }));
vi.mock("../MyItemsPanel.jsx", () => ({ MyItemsPanel: () => <p>Items</p> }));
const t = new Proxy({}, { get: (_, key) => String(key) });
function setup() {
  render(<LangContext.Provider value={{ t, dir: "ltr" }}><MyHomeScreen /></LangContext.Provider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  createPropertyForCaller.mockResolvedValue({ id: "new-home" });
  setPropertyAddress.mockResolvedValue();
});
describe("My Home shared navigation", () => {
  it("keeps the property header and switcher available in Items", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "homeTabMyItems" }));
    expect(screen.getByRole("heading", { name: "Main home" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Other home" }));
    expect(selectProperty).toHaveBeenCalledWith("other");
    fireEvent.click(screen.getByRole("button", { name: "addPropertyBtn" }));
    expect(screen.getByText("addPropertyTitle")).toBeTruthy();
  });
  it("creates a property from My Home and refreshes its records", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "addPropertyBtn" }));
    for (const [label, value] of [
      ["addPropertyNameLabel", "Holiday home"], ["addressStreetLabel", "Test street"],
      ["addressPostcodeLabel", "8400"], ["addressMunicipalityLabel", "Oostende"],
    ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "addPropertySubmitBtn" }));
    await waitFor(() => expect(refreshItems).toHaveBeenCalledOnce());
    expect(createPropertyForCaller).toHaveBeenCalledWith({ workspaceId: "personal", actorRef: "owner", name: "Holiday home" });
    expect(setPropertyAddress).toHaveBeenCalledWith(expect.objectContaining({ propertyId: "new-home", municipality: "Oostende" }));
    expect(screen.queryByText("addPropertyTitle")).toBeNull();
  });
});

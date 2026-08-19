// Platform Activation Slice 1, WP 1.10 — MyBusinessPanel's own tests: Option B's lazy
// property-creation trigger fires exactly once per real "no property yet" resolution,
// never loops on its own retry, surfaces a real failure with a working retry, and
// otherwise renders the exact same MyItemsPanel.jsx the customer surface uses, pointed
// at the professional's own workspace/property. MyItemsPanel itself is mocked — its own
// test file already covers its internals; this file is only responsible for the logic
// wrapped around it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const usePropertyTwinMock = vi.fn();

vi.mock("../../home/usePropertyTwin.js", () => ({
  usePropertyTwin: () => usePropertyTwinMock(),
}));

vi.mock("../../lib/homeInventory.js", () => ({
  createPropertyForCaller: vi.fn(() => Promise.resolve({ id: "prop-new" })),
}));

vi.mock("../../home/MyItemsPanel.jsx", () => ({
  MyItemsPanel: (props) => (
    <div data-testid="my-items-panel" data-property-id={props.propertyId} data-workspace-id={props.workspaceId} />
  ),
}));

import { createPropertyForCaller } from "../../lib/homeInventory.js";
import { MyBusinessPanel } from "../MyBusinessPanel.jsx";

const t = { retryBtn: "Try again" };
const fmtDate = (iso) => iso;

const twinState = (overrides) => ({
  ownerId: "owner-1", workspaceId: "ws-1", homeProfile: null, propertyId: null,
  items: null, itemsError: null, maintenance: null, refreshItems: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MyBusinessPanel — loading and property-exists cases", () => {
  it("shows a loading screen while homeProfile is still resolving", () => {
    usePropertyTwinMock.mockReturnValue(twinState({ homeProfile: null }));

    const { container } = render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);

    expect(container.querySelector(".empty-block")).toBeTruthy();
    expect(screen.queryByTestId("my-items-panel")).toBeNull();
    expect(createPropertyForCaller).not.toHaveBeenCalled();
  });

  it("renders MyItemsPanel, pointed at the real property/workspace, once a property already exists", () => {
    usePropertyTwinMock.mockReturnValue(twinState({
      homeProfile: { property: { id: "prop-1", name: "My Business" }, rooms: [], documents: [] },
      propertyId: "prop-1",
    }));

    render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);

    expect(createPropertyForCaller).not.toHaveBeenCalled();
    const panel = screen.getByTestId("my-items-panel");
    expect(panel.dataset.propertyId).toBe("prop-1");
    expect(panel.dataset.workspaceId).toBe("ws-1");
  });
});

describe("MyBusinessPanel — Option B's own lazy-creation trigger", () => {
  it("creates a property the first time homeProfile resolves with none, then refreshes", async () => {
    const refreshItems = vi.fn();
    usePropertyTwinMock.mockReturnValue(twinState({
      homeProfile: { property: null, rooms: [], documents: [] }, refreshItems,
    }));

    render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);

    await waitFor(() => expect(createPropertyForCaller).toHaveBeenCalledWith({
      workspaceId: "ws-1", actorRef: "owner-1", name: "My Business",
    }));
    await waitFor(() => expect(refreshItems).toHaveBeenCalled());
  });

  it("does not attempt creation without a real workspaceId or ownerId", () => {
    usePropertyTwinMock.mockReturnValue(twinState({
      ownerId: null, workspaceId: null, homeProfile: { property: null, rooms: [], documents: [] },
    }));

    render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);

    expect(createPropertyForCaller).not.toHaveBeenCalled();
  });

  it("shows the real error and a retry action when creation fails", async () => {
    createPropertyForCaller.mockRejectedValue(new Error("insufficient_privilege"));
    usePropertyTwinMock.mockReturnValue(twinState({ homeProfile: { property: null, rooms: [], documents: [] } }));

    render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);

    await waitFor(() => expect(screen.getByText("insufficient_privilege")).toBeTruthy());
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByTestId("my-items-panel")).toBeNull();
  });

  it("pressing retry attempts creation again", async () => {
    createPropertyForCaller.mockRejectedValueOnce(new Error("network error"));
    usePropertyTwinMock.mockReturnValue(twinState({ homeProfile: { property: null, rooms: [], documents: [] } }));

    render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);
    await waitFor(() => expect(screen.getByText("network error")).toBeTruthy());

    createPropertyForCaller.mockResolvedValueOnce({ id: "prop-new" });
    fireEvent.click(screen.getByText("Try again"));

    await waitFor(() => expect(createPropertyForCaller).toHaveBeenCalledTimes(2));
  });
});

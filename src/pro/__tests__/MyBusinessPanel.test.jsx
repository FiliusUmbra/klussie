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

const t = { retryBtn: "Try again", myBusinessSetupFailed: "Couldn't set up your business workspace." };
const fmtDate = (iso) => iso;

const twinState = (overrides) => ({
  ownerId: "owner-1", workspaceId: "ws-1", homeProfile: null, homeProfileError: null, propertyId: null,
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

  // Found by code audit: usePropertyTwin()'s own fetchHomeProfile() failure used to be
  // swallowed entirely, leaving homeProfile stuck at null forever -- indistinguishable
  // from "still resolving," which meant this whole tab showed a full-screen spinner
  // permanently on a real fetch failure, with no error and no way back short of
  // reloading the whole app.
  it("offers a real retry, not a permanent loading screen, when the initial fetch itself fails", () => {
    const refreshItems = vi.fn();
    usePropertyTwinMock.mockReturnValue(twinState({ homeProfile: null, homeProfileError: "network error", refreshItems }));

    render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);

    expect(screen.getByText(t.myBusinessSetupFailed)).toBeTruthy();
    expect(screen.queryByTestId("my-items-panel")).toBeNull();
    expect(createPropertyForCaller).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Try again"));
    expect(refreshItems).toHaveBeenCalled();
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

  // Found by code audit: this used to assert the raw backend error ("insufficient_
  // privilege") rendered verbatim — the exact anti-pattern documents.js's own header
  // names and fixes elsewhere. Updated to pin the fix instead of leaving a stale
  // duplicate test behind.
  it("shows a generic localized error and a retry action when creation fails", async () => {
    createPropertyForCaller.mockRejectedValue(new Error("insufficient_privilege"));
    usePropertyTwinMock.mockReturnValue(twinState({ homeProfile: { property: null, rooms: [], documents: [] } }));

    render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);

    await waitFor(() => expect(screen.getByText(t.myBusinessSetupFailed)).toBeTruthy());
    expect(screen.queryByText("insufficient_privilege")).toBeNull();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByTestId("my-items-panel")).toBeNull();
  });

  it("pressing retry attempts creation again", async () => {
    createPropertyForCaller.mockRejectedValueOnce(new Error("network error"));
    usePropertyTwinMock.mockReturnValue(twinState({ homeProfile: { property: null, rooms: [], documents: [] } }));

    render(<MyBusinessPanel t={t} fmtDate={fmtDate} />);
    await waitFor(() => expect(screen.getByText(t.myBusinessSetupFailed)).toBeTruthy());

    createPropertyForCaller.mockResolvedValueOnce({ id: "prop-new" });
    fireEvent.click(screen.getByText("Try again"));

    await waitFor(() => expect(createPropertyForCaller).toHaveBeenCalledTimes(2));
  });
});

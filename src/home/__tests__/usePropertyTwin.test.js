// Home foundation slice — the two-effect orchestration usePropertyTwin.js grew: fetch the
// caller's own property list, default activePropertyId to the first one (without
// overriding a real selection already made), then resolve homeProfile for exactly that
// property. No existing test drives this hook directly (every consumer either mocks it
// wholesale — MyBusinessPanel.test.jsx — or receives an already-resolved homeCtx prop —
// MyHomePanel.test.jsx), so this is this codebase's first use of renderHook: standard RTL
// API, not a new dependency, and the narrowest way to cover genuinely new stateful logic
// nothing else here exercises.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const useAuthMock = vi.fn();
vi.mock("../../lib/auth.jsx", () => ({ useAuth: () => useAuthMock() }));

vi.mock("../../lib/homeInventory.js", () => ({
  fetchHomeProfile: vi.fn(),
  fetchMyProperties: vi.fn(),
}));
vi.mock("../../lib/householdItems.js", () => ({ fetchHouseholdItems: vi.fn(() => Promise.resolve([])) }));
vi.mock("../../lib/maintenance.js", () => ({
  fetchMaintenanceObligations: vi.fn(() => Promise.resolve([])),
  fetchMaintenanceSchedules: vi.fn(() => Promise.resolve([])),
  mergeMaintenanceWithSchedules: vi.fn(() => []),
}));

import { fetchHomeProfile, fetchMyProperties } from "../../lib/homeInventory.js";
import { usePropertyTwin } from "../usePropertyTwin.js";

const HOME = { id: "p1", name: "My Home" };
const HOLIDAY = { id: "p2", name: "Vakantiehuis" };
const HOME_PROFILE = (property) => ({ summary: null, rooms: [], installations: [], upcomingMaintenance: [], documents: [], property });

beforeEach(() => {
  useAuthMock.mockReturnValue({
    profile: { id: "owner-1" },
    activeWorkspace: { workspace_id: "ws-1" },
  });
  vi.mocked(fetchMyProperties).mockReset();
  vi.mocked(fetchHomeProfile).mockReset();
});

describe("usePropertyTwin — properties list and active selection", () => {
  it("defaults activePropertyId to the first property once the list resolves", async () => {
    vi.mocked(fetchMyProperties).mockResolvedValue([HOME, HOLIDAY]);
    vi.mocked(fetchHomeProfile).mockImplementation((id) => Promise.resolve(HOME_PROFILE(id === "p2" ? HOLIDAY : HOME)));

    const { result } = renderHook(() => usePropertyTwin());

    await waitFor(() => expect(result.current.properties).toEqual([HOME, HOLIDAY]));
    expect(result.current.activePropertyId).toBe("p1");
    await waitFor(() => expect(fetchHomeProfile).toHaveBeenCalledWith("p1"));
  });

  it("resolves homeProfile for whichever property selectProperty picks", async () => {
    vi.mocked(fetchMyProperties).mockResolvedValue([HOME, HOLIDAY]);
    vi.mocked(fetchHomeProfile).mockImplementation((id) => Promise.resolve(HOME_PROFILE(id === "p2" ? HOLIDAY : HOME)));

    const { result } = renderHook(() => usePropertyTwin());
    await waitFor(() => expect(result.current.activePropertyId).toBe("p1"));

    act(() => result.current.selectProperty("p2"));

    await waitFor(() => expect(result.current.homeProfile?.property).toEqual(HOLIDAY));
    expect(fetchHomeProfile).toHaveBeenCalledWith("p2");
  });

  it("leaves activePropertyId null when the caller genuinely has no property yet", async () => {
    vi.mocked(fetchMyProperties).mockResolvedValue([]);
    vi.mocked(fetchHomeProfile).mockResolvedValue(HOME_PROFILE(null));

    const { result } = renderHook(() => usePropertyTwin());

    await waitFor(() => expect(result.current.properties).toEqual([]));
    expect(result.current.activePropertyId).toBeNull();
    await waitFor(() => expect(fetchHomeProfile).toHaveBeenCalledWith(null));
  });

  it("falls back to an empty list, never leaving properties stuck at null forever, when the fetch fails", async () => {
    vi.mocked(fetchMyProperties).mockRejectedValue(new Error("network error"));
    vi.mocked(fetchHomeProfile).mockResolvedValue(HOME_PROFILE(null));

    const { result } = renderHook(() => usePropertyTwin());

    await waitFor(() => expect(result.current.properties).toEqual([]));
    expect(result.current.activePropertyId).toBeNull();
  });

  it("does not re-fetch homeProfile a second time once the list resolves — one settled call, not a race", async () => {
    vi.mocked(fetchMyProperties).mockResolvedValue([HOME]);
    vi.mocked(fetchHomeProfile).mockResolvedValue(HOME_PROFILE(HOME));

    const { result } = renderHook(() => usePropertyTwin());

    await waitFor(() => expect(result.current.homeProfile?.property).toEqual(HOME));
    expect(fetchHomeProfile).toHaveBeenCalledTimes(1);
  });
});

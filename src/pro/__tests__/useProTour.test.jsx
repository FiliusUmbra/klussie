// useProTour.js's own tests — none existed directly for this file before this
// (ProOnboarding.test.jsx exercises the surrounding component, but only ever with a
// vi.fn() onFinish that can never reject).
//
// Found by code audit: finish() awaited refreshProfile() (auth.jsx) with no catch of
// its own. refreshProfile() throws on a real Postgres/network failure, and finish is
// wired directly as ProOnboarding.jsx's onClick handler for Done, Skip, and the Modal's
// own close -- never awaited or caught there -- so a real failure was a genuine
// unhandled promise rejection on every tour dismissal that hit one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const user = { id: "pro-1" };
const proProfile = { created_at: "2026-08-25T00:00:00Z", pro_tour_completed_at: null };
const refreshProfileMock = vi.fn();

vi.mock("../../lib/auth.jsx", () => ({
  useAuth: () => ({ user, proProfile, refreshProfile: (...args) => refreshProfileMock(...args) }),
}));
vi.mock("../../lib/pros.js", () => ({
  updateProProfile: vi.fn().mockResolvedValue(undefined),
}));

import { useProTour } from "../useProTour.js";

function renderProTour() {
  let tour;
  function Probe() {
    tour = useProTour();
    return null;
  }
  render(<Probe />);
  return () => tour;
}

beforeEach(() => {
  refreshProfileMock.mockReset();
  refreshProfileMock.mockResolvedValue(undefined);
  // finish() calls the real markProTourCompleted() (only pros.js's updateProProfile is
  // mocked above), which writes localStorage as a side effect -- cleared here so one
  // test's own finish() doesn't make the next test's pro read as already toured.
  window.localStorage.clear();
});

describe("useProTour", () => {
  it("opens for a pro who hasn't completed the tour yet", async () => {
    const tour = renderProTour();
    await waitFor(() => expect(tour().open).toBe(true));
  });

  it("does not throw or leave an unhandled rejection when the post-finish profile refresh fails", async () => {
    refreshProfileMock.mockRejectedValue(new Error('relation "pro_profiles" does not exist'));
    const tour = renderProTour();
    await waitFor(() => expect(tour().open).toBe(true));

    // finish() is wired as a bare onClick handler in ProOnboarding.jsx (Done, Skip, the
    // Modal's own close) — nothing there awaits or catches its return. A caller that DID
    // await it must see a clean resolution, never the raw rejection.
    await expect(tour().finish()).resolves.toBeUndefined();
  });

  it("still closes the tour immediately even though the profile refresh has not resolved yet", async () => {
    let resolveRefresh;
    refreshProfileMock.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve; }));
    const tour = renderProTour();
    await waitFor(() => expect(tour().open).toBe(true));

    const finishPromise = tour().finish();
    await waitFor(() => expect(tour().open).toBe(false));

    resolveRefresh();
    await finishPromise;
  });
});

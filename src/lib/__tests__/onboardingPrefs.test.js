// The tour must appear exactly once. That is entirely this module's job, and it has
// two backends to get right during the rollout, so it is worth testing directly.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hasCompletedHomeTour, markHomeTourCompleted, isEligibleForFirstLoginTour,
  hasCompletedProTour, markProTourCompleted, isEligibleForFirstLoginProTour,
} from "../onboardingPrefs.js";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("hasCompletedHomeTour", () => {
  it("trusts the profile column when it holds a timestamp", () => {
    expect(hasCompletedHomeTour({ profile: { home_tour_completed_at: "2026-08-10T09:00:00Z" }, userId: "u1" })).toBe(true);
  });

  it("treats a null column as not seen, which is what a fresh account looks like", () => {
    expect(hasCompletedHomeTour({ profile: { home_tour_completed_at: null }, userId: "u1" })).toBe(false);
  });

  it("falls back to the local record while the migration is not yet applied", () => {
    window.localStorage.setItem("klussie.homeTourCompleted.u1", "true");
    // No column on the profile row at all — the shape before migration 0015.
    expect(hasCompletedHomeTour({ profile: {}, userId: "u1" })).toBe(true);
  });

  it("keeps the local record per account, so one device serves two customers correctly", () => {
    window.localStorage.setItem("klussie.homeTourCompleted.u1", "true");
    expect(hasCompletedHomeTour({ profile: {}, userId: "u2" })).toBe(false);
  });

  it("says not-seen rather than throwing when storage is unavailable", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(hasCompletedHomeTour({ profile: {}, userId: "u1" })).toBe(false);
  });
});

describe("markHomeTourCompleted", () => {
  it("records completion in both places", async () => {
    const updateProfile = vi.fn().mockResolvedValue(undefined);
    await markHomeTourCompleted({ userId: "u1", updateProfile });

    expect(window.localStorage.getItem("klussie.homeTourCompleted.u1")).toBe("true");
    const written = updateProfile.mock.calls[0][0].home_tour_completed_at;
    expect(Number.isNaN(Date.parse(written))).toBe(false);
  });

  it("still remembers locally when the column does not exist yet", async () => {
    const updateProfile = vi.fn().mockRejectedValue(new Error("column does not exist"));
    await markHomeTourCompleted({ userId: "u1", updateProfile });

    // The whole point of the fallback: a failed server write must not mean the tour
    // reopens on the next render.
    expect(hasCompletedHomeTour({ profile: {}, userId: "u1" })).toBe(true);
  });
});

describe("isEligibleForFirstLoginTour", () => {
  const newAccount = { created_at: "2026-08-12T10:00:00Z" };

  it("shows the tour to a new customer who has never seen it", () => {
    expect(isEligibleForFirstLoginTour({ profile: newAccount, userId: "u1" })).toBe(true);
  });

  it("does not show it again once completed", () => {
    const profile = { ...newAccount, home_tour_completed_at: "2026-08-12T11:00:00Z" };
    expect(isEligibleForFirstLoginTour({ profile, userId: "u1" })).toBe(false);
  });

  it("leaves existing customers alone — the tour is for new accounts only", () => {
    // Their home_tour_completed_at is null too, since the column postdates them; without
    // the ship-date cutoff every established customer would be walked through the basics.
    const established = { created_at: "2026-05-01T09:00:00Z" };
    expect(isEligibleForFirstLoginTour({ profile: established, userId: "u1" })).toBe(false);
  });

  it("treats an unreadable created_at as pre-existing rather than guessing", () => {
    expect(isEligibleForFirstLoginTour({ profile: {}, userId: "u1" })).toBe(false);
    expect(isEligibleForFirstLoginTour({ profile: { created_at: "nonsense" }, userId: "u1" })).toBe(false);
  });
});

// GUIDANCE_SYSTEM.md §17.2.1's own pro tour — the identical shape as everything above,
// keyed off pro_profiles rather than profiles, and off "became a pro" (pro_profiles.
// created_at) rather than "created an account."
describe("hasCompletedProTour", () => {
  it("trusts the pro_profiles column when it holds a timestamp", () => {
    expect(hasCompletedProTour({ proProfile: { pro_tour_completed_at: "2026-08-22T09:00:00Z" }, userId: "u1" })).toBe(true);
  });

  it("treats a null column as not seen", () => {
    expect(hasCompletedProTour({ proProfile: { pro_tour_completed_at: null }, userId: "u1" })).toBe(false);
  });

  it("falls back to the local record while the migration is not yet applied", () => {
    window.localStorage.setItem("klussie.proTourCompleted.u1", "true");
    expect(hasCompletedProTour({ proProfile: {}, userId: "u1" })).toBe(true);
  });

  it("keeps the local record per account", () => {
    window.localStorage.setItem("klussie.proTourCompleted.u1", "true");
    expect(hasCompletedProTour({ proProfile: {}, userId: "u2" })).toBe(false);
  });

  it("says not-seen rather than throwing when storage is unavailable", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(hasCompletedProTour({ proProfile: {}, userId: "u1" })).toBe(false);
  });
});

describe("markProTourCompleted", () => {
  it("records completion in both places", async () => {
    const updateProProfile = vi.fn().mockResolvedValue(undefined);
    await markProTourCompleted({ userId: "u1", updateProProfile });

    expect(window.localStorage.getItem("klussie.proTourCompleted.u1")).toBe("true");
    const written = updateProProfile.mock.calls[0][0].pro_tour_completed_at;
    expect(Number.isNaN(Date.parse(written))).toBe(false);
  });

  it("still remembers locally when the column does not exist yet", async () => {
    const updateProProfile = vi.fn().mockRejectedValue(new Error("column does not exist"));
    await markProTourCompleted({ userId: "u1", updateProProfile });

    expect(hasCompletedProTour({ proProfile: {}, userId: "u1" })).toBe(true);
  });
});

describe("isEligibleForFirstLoginProTour", () => {
  const newPro = { created_at: "2026-08-22T10:00:00Z" };

  it("shows the tour to a pro who just became one and has never seen it", () => {
    expect(isEligibleForFirstLoginProTour({ proProfile: newPro, userId: "u1" })).toBe(true);
  });

  it("does not show it again once completed", () => {
    const proProfile = { ...newPro, pro_tour_completed_at: "2026-08-22T11:00:00Z" };
    expect(isEligibleForFirstLoginProTour({ proProfile, userId: "u1" })).toBe(false);
  });

  it("leaves pros who became one before the tour shipped alone", () => {
    const established = { created_at: "2026-05-01T09:00:00Z" };
    expect(isEligibleForFirstLoginProTour({ proProfile: established, userId: "u1" })).toBe(false);
  });

  it("treats an unreadable created_at as pre-existing rather than guessing", () => {
    expect(isEligibleForFirstLoginProTour({ proProfile: {}, userId: "u1" })).toBe(false);
    expect(isEligibleForFirstLoginProTour({ proProfile: { created_at: "nonsense" }, userId: "u1" })).toBe(false);
  });
});

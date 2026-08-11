// A status badge and a progress timeline that disagree about where a job stands is worse
// than showing neither. Both read this module, which is why the fallback behaviour for an
// unknown status matters as much as the happy path.
import { describe, it, expect } from "vitest";
import {
  REQUEST_STATUS_ORDER,
  WHEN_PREFS,
  WHEN_LABEL_KEYS,
  statusPresentation,
  timelineSteps,
  awaitingDecisionCount,
  completedCount,
  reviewedRequests,
} from "../requestStatus.js";

describe("statusPresentation", () => {
  it("names and tones each status in the lifecycle", () => {
    expect(statusPresentation("collecting")).toEqual({ labelKey: "statusCollecting", tone: "amber" });
    expect(statusPresentation("booked")).toEqual({ labelKey: "statusBooked", tone: "forest" });
    expect(statusPresentation("reviewed")).toEqual({ labelKey: "statusReviewed", tone: "sage" });
  });

  it("degrades to a neutral badge for a status this client doesn't know", () => {
    // A migration can add a status before the client ships. Showing the raw value is
    // honest; throwing, or rendering an empty badge, is not.
    expect(statusPresentation("awaiting_pro")).toEqual({ labelKey: null, tone: "sage" });
    expect(statusPresentation(undefined)).toEqual({ labelKey: null, tone: "sage" });
  });

  it("gives every ordered status a real label key", () => {
    for (const status of REQUEST_STATUS_ORDER) {
      expect(statusPresentation(status).labelKey).toBeTruthy();
    }
  });
});

describe("timelineSteps", () => {
  it("marks everything before the current status done and nothing after", () => {
    const steps = timelineSteps("booked");
    expect(steps.map((s) => s.key)).toEqual(REQUEST_STATUS_ORDER);
    expect(steps.map((s) => s.done)).toEqual([true, true, false, false, false]);
    expect(steps.map((s) => s.active)).toEqual([false, false, true, false, false]);
  });

  it("treats the first status as active rather than already done", () => {
    const steps = timelineSteps("collecting");
    expect(steps[0]).toMatchObject({ done: false, active: true });
  });

  it("marks the last status active with everything behind it done", () => {
    const steps = timelineSteps("reviewed");
    expect(steps.at(-1)).toMatchObject({ done: false, active: true });
    expect(steps.slice(0, -1).every((s) => s.done)).toBe(true);
  });

  it("returns null for a status outside the lifecycle, so no timeline renders", () => {
    // Half a timeline with nothing highlighted would claim the job is nowhere.
    expect(timelineSteps("awaiting_pro")).toBeNull();
    expect(timelineSteps(undefined)).toBeNull();
  });
});

describe("when preferences", () => {
  it("gives every offered timing a label key", () => {
    for (const pref of WHEN_PREFS) {
      expect(WHEN_LABEL_KEYS[pref]).toBeTruthy();
    }
  });
});

describe("request counts", () => {
  const req = (over) => ({ id: "r", status: "collecting", review: null, ...over });

  it("counts only requests actually waiting on the customer's decision", () => {
    const requests = [
      req({ status: "quotes_ready" }),
      req({ status: "quotes_ready" }),
      req({ status: "collecting" }),
      req({ status: "booked" }),
    ];
    expect(awaitingDecisionCount(requests)).toBe(2);
  });

  it("counts a reviewed job as completed — reviewing doesn't un-finish it", () => {
    const requests = [req({ status: "completed" }), req({ status: "reviewed" }), req({ status: "booked" })];
    expect(completedCount(requests)).toBe(2);
  });

  it("returns nothing rather than throwing for an account with no requests yet", () => {
    expect(awaitingDecisionCount(undefined)).toBe(0);
    expect(completedCount(null)).toBe(0);
    expect(reviewedRequests(undefined)).toEqual([]);
  });

  it("lists only requests that carry a review", () => {
    const withReview = req({ id: "a", status: "reviewed", review: { stars: 5 } });
    const without = req({ id: "b", status: "completed", review: null });
    expect(reviewedRequests([withReview, without]).map((r) => r.id)).toEqual(["a"]);
  });
});

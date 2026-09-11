// A status badge and a progress timeline that disagree about where a job stands is worse
// than showing neither. Both read this module, which is why the fallback behaviour for an
// unknown status matters as much as the happy path.
import { describe, it, expect } from "vitest";
import {
  REQUEST_STATUS_ORDER,
  OPEN_STATUSES,
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

  it("names the disclosure-consent status (0182/0183) sitting between quotes_ready and booked", () => {
    expect(statusPresentation("accepted_pending_location_approval")).toEqual({
      labelKey: "statusAcceptedPendingLocation",
      tone: "amber",
    });
  });

  it("names cancelled — a real status since 0001_init.sql, not the unanticipated case the fallback below exists for", () => {
    // Found live during a UX review, 2026-09-07: this was missing entirely, so a
    // cancelled request fell through to the raw-status fallback and showed its own
    // literal, untranslated status string ("cancelled") to the customer.
    expect(statusPresentation("cancelled")).toEqual({ labelKey: "statusCancelled", tone: "sage" });
  });

  it("names awaiting_pro — real, but only in the legacy service_requests table (ADR-0012)", () => {
    // Found during a UX review, 2026-09-07: TESTING.md §6.2 called this a live "known
    // defect," but tracing every statusPresentation() call site end to end found none
    // that can ever receive this value — work.requests' own check constraint
    // (0182_service_location_schema.sql) has no `awaiting_pro` option, so no current UI
    // surface (all work.requests-sourced) can pass it through. Defensive coverage for a
    // future path that reads legacy status directly, not the close of a reproducible bug.
    expect(statusPresentation("awaiting_pro")).toEqual({ labelKey: "statusAwaitingPro", tone: "amber" });
  });

  it("degrades to a neutral badge for a status this client doesn't know", () => {
    // A migration can add a status before the client ships. Showing the raw value is
    // honest; throwing, or rendering an empty badge, is not.
    expect(statusPresentation("some_future_status")).toEqual({ labelKey: null, tone: "sage" });
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
    expect(steps.map((s) => s.done)).toEqual([true, true, true, false, false, false]);
    expect(steps.map((s) => s.active)).toEqual([false, false, false, true, false, false]);
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
    expect(timelineSteps("some_future_status")).toBeNull();
    expect(timelineSteps(undefined)).toBeNull();
  });

  it("returns null for cancelled and awaiting_pro too — correct as-is, both outside the lifecycle", () => {
    // Unlike statusPresentation, this one was already right for cancelled: it sits
    // outside REQUEST_STATUS_ORDER on purpose. RequestDetailSheet.jsx's own cancelled
    // branch is what fills the gap this correctly-empty timeline leaves behind.
    // awaiting_pro has no work.requests equivalent lifecycle position either — a
    // directed request's own work.requests row sits at plain `collecting`.
    expect(timelineSteps("awaiting_pro")).toBeNull();
    expect(timelineSteps("cancelled")).toBeNull();
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

  it("also counts a request waiting on disclosure-consent approval — a real customer action too", () => {
    const requests = [
      req({ status: "quotes_ready" }),
      req({ status: "accepted_pending_location_approval" }),
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

// Found by code audit: homeToday.js and homeTimeline.js each used to keep their own
// independent copy of this exact set, with a comment claiming the two "mirror" each
// other — they drifted out of sync for real when accepted_pending_location_approval
// landed in one and not the other, so a request stuck there disappeared from one of the
// two homepage surfaces until it was fixed by hand, one file behind. Both now import
// this one shared list instead.
describe("OPEN_STATUSES", () => {
  it("includes every status meaning the request is still open, awaiting_pro included even though it sits outside REQUEST_STATUS_ORDER", () => {
    expect(OPEN_STATUSES).toEqual(
      expect.arrayContaining(["collecting", "awaiting_pro", "quotes_ready", "accepted_pending_location_approval", "booked"])
    );
    expect(OPEN_STATUSES).toHaveLength(5);
  });

  it("excludes every finished status", () => {
    expect(OPEN_STATUSES).not.toContain("completed");
    expect(OPEN_STATUSES).not.toContain("reviewed");
  });
});

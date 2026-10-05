// Platform Activation Slice 2, WP 2.4 — ProJobs.jsx gains a real drill-in for the first
// time: booked and completed jobs are clickable.
//
// UX_TAB_SCOPE.md P2, 2026-09-28 — two further real fixes, not a relayout:
// 1. Upcoming (booked) is now the default segment, not Sent (quotes) — "Upcoming as the
//    normal default" is the spec's own wording; a pro opening Jobs almost always wants to
//    see what's coming up next, not what's still awaiting a reply.
// 2. Sent quotes are now clickable too — "Quotes must open for inspection even when not
//    accepted" (the spec's own words). This used to be the one segment with no detail
//    handler at all (onOpenJob was gated `seg !== "sent"`); ProJobDetailSheet.jsx was
//    already written to degrade gracefully with no engagement/conversation/twin (see its
//    own header), so nothing there needed to change — only this screen's own gate.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LangContext } from "../../lib/lang";
import { ProJobs } from "../ProJobs.jsx";

// PageTour.jsx / usePageTour.js have their own tests — held closed here so these stay on
// the page's own concerns; the tour wiring is asserted separately below.
const tourState = vi.hoisted(() => ({ open: false, replay: vi.fn() }));
vi.mock("../../ui/usePageTour.js", () => ({ usePageTour: () => ({ open: tourState.open, finish: vi.fn(), replay: tourState.replay }) }));

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = { t, fmt: (n) => String(n), serviceInfo: (id) => ({ name: `service:${id}`, blurb: "" }) };

const SENT = [{ id: "req-sent", serviceId: "svc-1", quotes: [{ proId: "pro-1", price: 50 }] }];
const BOOKED = [{ id: "req-booked", serviceId: "svc-2", quotes: [{ proId: "pro-1", price: 80 }] }];
const COMPLETED = [{ id: "req-done", serviceId: "svc-3", quotes: [{ proId: "pro-1", price: 100 }], review: null }];

function renderJobs(onOpenJob) {
  return render(
    <LangContext.Provider value={ctx}>
      <ProJobs sent={SENT} booked={BOOKED} completed={COMPLETED} proId="pro-1" onOpenJob={onOpenJob} />
    </LangContext.Provider>
  );
}

describe("ProJobs", () => {
  it("opens on Upcoming (booked) by default, not Quotes (sent)", () => {
    renderJobs(vi.fn());
    expect(screen.getByText("service:svc-2")).toBeTruthy();
    expect(screen.queryByText("service:svc-1")).toBeNull();
  });

  it("a sent (quoted, not yet booked) quote is clickable and calls onOpenJob with that job", () => {
    const onOpenJob = vi.fn();
    renderJobs(onOpenJob);
    fireEvent.click(screen.getByText("segSent (1)"));
    fireEvent.click(screen.getByText("service:svc-1"));
    expect(onOpenJob).toHaveBeenCalledWith(SENT[0]);
  });

  it("a booked job is clickable and calls onOpenJob with that job", () => {
    const onOpenJob = vi.fn();
    renderJobs(onOpenJob);
    fireEvent.click(screen.getByText("service:svc-2"));
    expect(onOpenJob).toHaveBeenCalledWith(BOOKED[0]);
  });

  it("a completed job is clickable and calls onOpenJob with that job", () => {
    const onOpenJob = vi.fn();
    renderJobs(onOpenJob);
    fireEvent.click(screen.getByText("segDone (1)"));
    fireEvent.click(screen.getByText("service:svc-3"));
    expect(onOpenJob).toHaveBeenCalledWith(COMPLETED[0]);
  });

  it("renders without a click handler at all when onOpenJob is not provided", () => {
    render(
      <LangContext.Provider value={ctx}>
        <ProJobs sent={SENT} booked={BOOKED} completed={COMPLETED} proId="pro-1" />
      </LangContext.Provider>
    );
    expect(screen.getByText("service:svc-2").closest("button")).toBeNull();
  });

  // TESTING.md §5.5 P6, corrected 2026-08-22 — no pro-side "mark complete" action exists
  // or should (work.complete_engagement_for_caller()'s own comment: "confirming completion
  // is the customer's own decision"). What ProJobs.jsx actually does for a completed job
  // is show the customer's own review, or say plainly none has arrived yet.
  it("P6 — a completed job with a review shows it, never a blank card", () => {
    const reviewed = [{ id: "req-done", serviceId: "svc-3", quotes: [{ proId: "pro-1", price: 100 }], review: { stars: 5, text: "Great work" } }];
    render(
      <LangContext.Provider value={ctx}>
        <ProJobs sent={[]} booked={[]} completed={reviewed} proId="pro-1" />
      </LangContext.Provider>
    );
    fireEvent.click(screen.getByText("segDone (1)"));
    expect(screen.getByText('"Great work"')).toBeTruthy();
    expect(screen.queryByText("noReviewYet")).toBeNull();
  });

  it("P6 — a completed job with no review yet says so plainly, not silently", () => {
    render(
      <LangContext.Provider value={ctx}>
        <ProJobs sent={[]} booked={[]} completed={COMPLETED} proId="pro-1" />
      </LangContext.Provider>
    );
    fireEvent.click(screen.getByText("segDone (1)"));
    expect(screen.getByText("noReviewYet")).toBeTruthy();
  });
});

describe("ProJobs tour wiring", () => {
  it("anchors the tour on the segments and the list, and offers a replay", () => {
    renderJobs(vi.fn());
    expect(document.querySelector('[data-tour="pro-jobs-segments"]')).toBeTruthy();
    expect(document.querySelector('[data-tour="pro-jobs-list"]')).toBeTruthy();
    fireEvent.click(screen.getByLabelText("helpReplayTour"));
    expect(tourState.replay).toHaveBeenCalled();
  });
});

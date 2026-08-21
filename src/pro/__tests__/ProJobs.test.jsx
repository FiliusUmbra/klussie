// Platform Activation Slice 2, WP 2.4 — ProJobs.jsx gains a real drill-in for the first
// time: booked and completed jobs are now clickable (the sheet that opens is
// ProJobDetailSheet.jsx, wired by ProApp.jsx, not tested here); "sent" (quoted, not yet
// booked) jobs deliberately stay unclickable — there is no engagement, no conversation, no
// twin to show yet.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LangContext } from "../../lib/lang";
import { ProJobs } from "../ProJobs.jsx";

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
  it("a sent (quoted, not yet booked) job is not clickable — no engagement exists yet", () => {
    const onOpenJob = vi.fn();
    renderJobs(onOpenJob);
    // "sent" is the default segment shown.
    expect(screen.getByText("service:svc-1").closest("button")).toBeNull();
  });

  it("a booked job is clickable and calls onOpenJob with that job", () => {
    const onOpenJob = vi.fn();
    renderJobs(onOpenJob);
    fireEvent.click(screen.getByText("segBooked (1)"));
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
    fireEvent.click(screen.getByText("segBooked (1)"));
    expect(screen.getByText("service:svc-2").closest("button")).toBeNull();
  });
});

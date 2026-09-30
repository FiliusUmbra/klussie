// RequestsList.jsx's own tests.
//
// Found by code audit, 2026-09-11: the trailing "this card leads forward" chevron in
// JobCard's own footer never flipped for RTL locales, unlike myHomeParts.jsx's identical-
// meaning .timeline-card-chevron/.trusted-pro chevrons — see appStyles.js's own comment
// on .ticket-foot-chevron for the full explanation. This proves the class the CSS rule
// depends on is actually rendered, closing the loop cssRtlChevrons.test.js's own CSS-text
// check alone can't: a class added to one file and forgotten in the other would pass a
// CSS-only check but still ship the bug.
//
// UX redesign, 2026-09-28 — a real header "New request" action and an Active/History
// split (the empty state used to say "go to Discover," matching neither).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LangContext } from "../../lib/lang";
import { RequestsList } from "../RequestsList.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t,
  fmtDate: (ts) => `date:${ts}`,
  serviceInfo: (id) => ({ name: `service:${id}` }),
  whenLabel: (w) => `when:${w}`,
};

const request = (over) => ({
  id: "req-1", status: "quotes_ready", serviceId: "svc-1", createdAt: 1,
  answers: { when: "this_week" }, quotes: [{ id: "q-1" }], ...over,
});

function renderList({ requests = [request()], onCreateRequest = vi.fn() } = {}) {
  return {
    onCreateRequest,
    ...render(
      <LangContext.Provider value={ctx}>
        <RequestsList requests={requests} onOpen={() => {}} onCreateRequest={onCreateRequest} />
      </LangContext.Provider>
    ),
  };
}

describe("RequestsList", () => {
  it("gives the trailing chevron the class its own RTL flip rule targets", () => {
    const { container } = renderList();
    const chevron = container.querySelector(".ticket-foot-chevron");
    expect(chevron).toBeTruthy();
    expect(chevron.tagName.toLowerCase()).toBe("svg");
  });

  it("always shows a real 'New request' header action, not only in the empty state", () => {
    renderList();
    expect(screen.getByText("requestsNewBtn")).toBeTruthy();
  });

  it("clicking the header action calls onCreateRequest directly — no navigating elsewhere first", () => {
    const { onCreateRequest } = renderList();
    fireEvent.click(screen.getByText("requestsNewBtn"));
    expect(onCreateRequest).toHaveBeenCalled();
  });

  it("shows a real title, explanation and Create-a-request action in the empty state — not 'go elsewhere'", () => {
    const { onCreateRequest } = renderList({ requests: [] });
    expect(screen.getByText("requestsEmptyTitle")).toBeTruthy();
    expect(screen.getByText("requestsEmptyBody")).toBeTruthy();

    fireEvent.click(screen.getByText("requestsEmptyCta"));
    expect(onCreateRequest).toHaveBeenCalled();
  });

  it("hides the Active/History segments entirely when there are no requests at all", () => {
    renderList({ requests: [] });
    expect(screen.queryByText(/requestsActiveSeg/)).toBeNull();
  });

  it("splits into Active and History, defaulting to Active", () => {
    renderList({
      requests: [request({ id: "open", status: "quotes_ready" }), request({ id: "done", status: "completed" })],
    });
    expect(screen.getByText("service:svc-1")).toBeTruthy();
    expect(screen.getByText(/requestsActiveSeg/)).toBeTruthy();
    expect(screen.getByText(/requestsHistorySeg/)).toBeTruthy();
  });

  it("switches to History on tap, showing the completed request and hiding the active one", () => {
    renderList({
      requests: [request({ id: "open", status: "quotes_ready", answers: { when: "this_week" } }), request({ id: "done", status: "completed" })],
    });

    fireEvent.click(screen.getByText(/requestsHistorySeg/));

    const cards = screen.getAllByText("service:svc-1");
    expect(cards.length).toBe(1);
  });

  it("shows a segment-specific empty message for an empty History with real Active requests", () => {
    renderList({ requests: [request({ status: "quotes_ready" })] });
    fireEvent.click(screen.getByText(/requestsHistorySeg/));
    expect(screen.getByText("requestsHistoryEmpty")).toBeTruthy();
  });
});

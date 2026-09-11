// RequestsList.jsx's own tests — none existed before this.
//
// Found by code audit, 2026-09-11: the trailing "this card leads forward" chevron in
// JobCard's own footer never flipped for RTL locales, unlike myHomeParts.jsx's identical-
// meaning .timeline-card-chevron/.trusted-pro chevrons — see appStyles.js's own comment
// on .ticket-foot-chevron for the full explanation. This proves the class the CSS rule
// depends on is actually rendered, closing the loop cssRtlChevrons.test.js's own CSS-text
// check alone can't: a class added to one file and forgotten in the other would pass a
// CSS-only check but still ship the bug.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LangContext } from "../../lib/lang";
import { RequestsList } from "../RequestsList.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });
const ctx = {
  t,
  fmtDate: (ts) => `date:${ts}`,
  serviceInfo: (id) => ({ name: `service:${id}` }),
  whenLabel: (w) => `when:${w}`,
};

const REQUEST = {
  id: "req-1",
  status: "quotes_ready",
  serviceId: "svc-1",
  createdAt: 1,
  answers: { when: "this_week" },
  quotes: [{ id: "q-1" }],
};

function renderList(requests = [REQUEST]) {
  return render(
    <LangContext.Provider value={ctx}>
      <RequestsList requests={requests} onOpen={() => {}} />
    </LangContext.Provider>
  );
}

describe("RequestsList", () => {
  it("gives the trailing chevron the class its own RTL flip rule targets", () => {
    const { container } = renderList();
    const chevron = container.querySelector(".ticket-foot-chevron");
    expect(chevron).toBeTruthy();
    expect(chevron.tagName.toLowerCase()).toBe("svg");
  });

  it("shows the empty state when there are no requests", () => {
    renderList([]);
    expect(screen.getByText("noRequestsYet")).toBeTruthy();
  });
});

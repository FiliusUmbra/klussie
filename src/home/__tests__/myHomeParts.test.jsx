// myHomeParts.jsx's own tests — scoped to PropertyHealthCard's new bar (visual-refresh
// direction, 2026-10-01). No test file existed for this component before; the rest of
// myHomeParts.jsx's own pieces (PropertyHeader, HomeTimelineCard, ...) stay covered
// indirectly through MyHomePanel.jsx's own test file, which this one doesn't duplicate.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PropertyHealthCard } from "../myHomeParts.jsx";

const t = new Proxy({}, { get: (_, key) => String(key) });

describe("PropertyHealthCard — the bar", () => {
  it("renders nothing at all when health is null — no bar, no card", () => {
    const { container } = render(<PropertyHealthCard t={t} health={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("fills the bar completely for the good state", () => {
    render(<PropertyHealthCard t={t} health={{ status: "good", overdueCount: 0, openCount: 3 }} />);
    expect(document.querySelector(".property-health-bar-fill").style.width).toBe("100%");
  });

  it("fills the bar proportionally for the attention state — real counts, not a fabricated score", () => {
    render(<PropertyHealthCard t={t} health={{ status: "attention", overdueCount: 2, openCount: 5 }} />);
    // (5 - 2) / 5 = 60% genuinely on schedule, never an invented number.
    expect(document.querySelector(".property-health-bar-fill").style.width).toBe("60%");
  });

  it("marks the bar aria-hidden — the title/body text next to it already carry the meaning", () => {
    render(<PropertyHealthCard t={t} health={{ status: "attention", overdueCount: 1, openCount: 4 }} />);
    expect(document.querySelector(".property-health-bar").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a nearly-empty bar when every open item is overdue, never a hidden or negative one", () => {
    render(<PropertyHealthCard t={t} health={{ status: "attention", overdueCount: 3, openCount: 3 }} />);
    expect(document.querySelector(".property-health-bar-fill").style.width).toBe("0%");
  });
});

// A regression guard for a real, live-tested gap: `.stat` (StatRow.jsx and
// ProDashboard.jsx's own hand-written pro stat row) had no protection against a long,
// unbreakable label. `flex:1`'s own `flex-basis:0%` does NOT override a flex item's
// automatic min-width, which defaults to the content's min-content size -- for a single
// unbreakable compound word (trustScoreLabel: "Vertrouwensscore"/nl, "Vertrauensscore"/de)
// that min-content size IS the full word width. Found live, 2026-09-14, on the pro
// Profile/Dashboard's three-stat row: the third card ("Vertrouwensscore") was pushed
// past the row's own right edge and silently clipped by an ancestor's overflow:hidden,
// with no scrollbar and no sign anything was cut off -- the same root cause as the
// .ticket-title/.badge fix already in this file (ticketBadgeOverflow.test.js), just in a
// different shared component.
//
// Deliberately plain substring checks on the raw CSS text, not a real CSS parser or a
// browser — matching this directory's own established idiom (disabledButtonVisibility.
// test.js, ticketBadgeOverflow.test.js): the fix is a single, known rule block.
import { describe, it, expect } from "vitest";
import { APP_CSS } from "../appStyles.js";

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

describe("stat row overflow — a long unbreakable label no longer gets clipped off a .stat card", () => {
  it(".stat can actually shrink to its fair share of the row (min-width:0, not the default auto)", () => {
    const body = ruleBody(APP_CSS, ".stat");
    expect(body).toMatch(/min-width\s*:\s*0/);
    // Still shares space equally with its siblings -- this isn't a regression on layout.
    expect(body).toMatch(/flex\s*:\s*1/);
  });

  it(".stat-label wraps an unbreakable word onto a second line rather than overflowing", () => {
    const body = ruleBody(APP_CSS, ".stat-label");
    expect(body).toMatch(/overflow-wrap\s*:\s*break-word/);
  });
});

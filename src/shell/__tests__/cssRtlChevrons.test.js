// A regression guard for a real RTL gap, found by code audit 2026-09-11: three "this
// leads forward" chevrons — HomeTodayCard.jsx's own Today card (the single most
// prominent card on the whole homepage), KlussiePanel.jsx's own Active Requests row, and
// RequestsList.jsx's own JobCard footer (the customer's real, reachable Requests tab) —
// never got the `[dir="rtl"]{ transform:scaleX(-1); }` flip myHomeParts.jsx's own
// identical-meaning `.timeline-card-chevron`/`.trusted-pro` chevrons already have. For an
// Arabic or Persian reader, a chevron pointing right in a right-to-left layout points
// backward, not forward — the wrong direction on three real, everyday screens.
//
// Deliberately plain substring checks on the raw CSS text, matching
// cssTokenContrast.test.js/cssFocusVisibility.test.js's own established idiom in this
// same directory, for the same reason: every real occurrence here is one literal rule.
import { describe, it, expect } from "vitest";
import { APP_CSS } from "../appStyles.js";
import { HOME_CSS } from "../../home/homeStyles.js";

describe("RTL — every 'leads forward' chevron flips direction", () => {
  it("keeps the two already-correct flips this fix matches (regression guard, not new coverage)", () => {
    expect(HOME_CSS).toContain('[dir="rtl"] .timeline-card-chevron{ transform:translateY(-50%) scaleX(-1); }');
    expect(HOME_CSS).toContain('[dir="rtl"] .trusted-pro > svg:last-child{ transform:scaleX(-1); }');
  });

  it("flips the Today card's own chevron", () => {
    expect(HOME_CSS).toContain('[dir="rtl"] .today-card-chev{ transform:scaleX(-1); }');
  });

  it("flips the Active Requests row's own chevron", () => {
    expect(HOME_CSS).toContain('[dir="rtl"] .home-active-chevron{ transform:scaleX(-1); }');
  });

  it("flips the JobCard footer's own chevron (RequestsList.jsx's real Requests tab)", () => {
    expect(APP_CSS).toContain('[dir="rtl"] .ticket-foot-chevron{ transform:scaleX(-1); }');
  });
});

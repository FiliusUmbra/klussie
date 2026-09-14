// A regression guard for a real, live-tested gap: JobCard's title+badge row
// (`.ticket-row`, domain.jsx) had no protection against a long, unbreakable title —
// a single compound Dutch service name like "Loodgieterswerken" has no space to wrap
// on, so the status badge next to it (RequestsList.jsx's own header comment: "the
// status badge... [is] worth seeing without opening anything") got silently clipped
// off by `.ticket`'s own `overflow:hidden`, with no ellipsis or other sign anything
// was cut off. Found live, 2026-09-14, on the customer's own "Mijn aanvragen" list:
// "Loodgieterswerken" pushed its "Offertes verzamelen" badge 13px past the card's own
// right edge. Same markup backs RequestsList.jsx, MessagesList.jsx, ProDashboard.jsx
// and ProJobs.jsx — every real JobCard caller — so this one shared rule covers all four.
//
// Deliberately plain substring checks on the raw CSS text, not a real CSS parser or a
// browser — matching disabledButtonVisibility.test.js's own established idiom in this
// same directory, for the same reason: the fix is a single, known rule block.
import { describe, it, expect } from "vitest";
import { APP_CSS } from "../appStyles.js";

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

describe("ticket row badge overflow — a long unbreakable title no longer clips the status badge", () => {
  it("truncates a long .ticket-title with an ellipsis instead of letting it overflow", () => {
    const body = ruleBody(APP_CSS, ".ticket-title");
    expect(body).toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(body).toMatch(/white-space\s*:\s*nowrap/);
    expect(body).toMatch(/overflow\s*:\s*hidden/);
  });

  it(".ticket-title can actually shrink inside the flex row (min-width:0, not the default auto)", () => {
    // Without this, a flex item's min-width defaults to its content's min-content size,
    // which for an unbreakable single word IS its full width -- text-overflow:ellipsis
    // would never actually get the chance to kick in.
    const body = ruleBody(APP_CSS, ".ticket-title");
    expect(body).toMatch(/min-width\s*:\s*0/);
  });

  it("the badge itself never shrinks, so it always renders at full size, never squeezed", () => {
    const body = ruleBody(APP_CSS, ".badge");
    expect(body).toMatch(/flex-shrink\s*:\s*0/);
  });
});

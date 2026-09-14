// A regression guard for a real, live-tested gap: `.btn-primary`/`.btn-secondary` — the
// two most common button classes in the app (backing both the shared Button component,
// design-system/primitives.jsx, and 21 direct call sites that disable one or the other)
// — had no `:disabled` rule at all, unlike every other disabled-button class in this
// codebase (.conv-textrow-send, .photo-capture-confirm, .conv-action, .home-ask-link,
// .conv-textrow-tool, .maintenance-row-action, .item-detail-document-open — see
// appStyles.js's and homeStyles.js's own rules for each). Found live, 2026-09-14, testing
// AiIntakeSheet.jsx's own "Verstuur aanvraag" submit button on staging: disabled while a
// required field (ServiceLocationField's own location) was still unset, it was pixel-for-
// pixel identical to its own enabled state — full opacity, pointer cursor — so tapping it
// produced no visible feedback of any kind.
//
// Deliberately plain substring checks on the raw CSS text, not a real CSS parser or a
// browser — matching cssFocusVisibility.test.js's own established idiom in this same
// directory, for the same reason: the fix is a single, known rule block.
import { describe, it, expect } from "vitest";
import { APP_CSS } from "../appStyles.js";

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

describe("disabled button visibility — .btn-primary/.btn-secondary now get a real :disabled treatment", () => {
  it("defines a :disabled rule covering both classes", () => {
    const body = ruleBody(APP_CSS, ".btn-primary:disabled, .btn-secondary:disabled");
    expect(body).not.toBeNull();
  });

  it("visibly dims a disabled button — opacity below the enabled/default 1", () => {
    const body = ruleBody(APP_CSS, ".btn-primary:disabled, .btn-secondary:disabled");
    expect(body).toMatch(/opacity\s*:\s*0\.\d/);
  });

  it("no longer shows a pointer cursor once disabled", () => {
    const body = ruleBody(APP_CSS, ".btn-primary:disabled, .btn-secondary:disabled");
    expect(body).toMatch(/cursor\s*:\s*default/);
  });
});

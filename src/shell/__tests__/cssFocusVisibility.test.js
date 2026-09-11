// A regression guard for the exact gap ACCESSIBILITY.md's own "No visible focus-ring
// audit performed... flagged for a dedicated pass, not checked exhaustively here" left
// open. appStyles.js's own global `:focus-visible{ outline:2px solid var(--forest); }`
// rule (added for Epic 03's WP11 audit, explicitly "app-wide... fixing only the new
// screens would leave the rest inconsistent") only actually governs an element if
// nothing more specific overrides it. Several element-scoped resets written before that
// rule existed each have equal-or-higher CSS specificity, so their own `outline:none`
// silently kept winning the cascade regardless of what the global rule intended —
// several of the app's most common interactive elements (nearly every single-line text
// field, the language switcher, the message composer, a real keyboard-focusable scroll
// region) never actually showed a focus indicator to a keyboard user, the precise
// "reachable-but-invisible" failure PRODUCT_CONSTITUTION.md Rule 6 rules out.
//
// Deliberately plain substring/regex checks on the raw CSS text, not a real CSS parser
// or a browser — matching cssTokenContrast.test.js's own established idiom in this same
// directory, for the same reason: every real occurrence of the bug is written as a
// literal `outline:none` inside a specific, known rule block.
import { describe, it, expect } from "vitest";
import { APP_CSS } from "../appStyles.js";
import { HOME_CSS } from "../../home/homeStyles.js";

// Pulls the `{ ...declarations... }` body out of the first rule whose selector text
// matches exactly, so an assertion about one rule's own declarations can never
// accidentally match a comment or an unrelated selector elsewhere in the file that
// merely contains the same substring.
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

describe("focus visibility — the global :focus-visible ring is never locally overridden", () => {
  it("still defines the one global focus-ring rule the whole app relies on", () => {
    expect(APP_CSS).toContain(":focus-visible{ outline:2px solid var(--forest); outline-offset:2px; border-radius:4px; }");
  });

  it.each([
    [".lang-switch select", APP_CSS],
    // Nearly every single-line text field in the app renders through .search input
    // (QuoteFormSheet, EditProfileSheet, ReportSheet, ItemFormSheet, DocumentUploadSheet,
    // dozens more) — the single highest-reach instance of this bug class.
    [".search input", APP_CSS],
    [".chat-input-row input", APP_CSS],
    // The homepage's own message composer.
    [".conv-textrow-input", APP_CSS],
  ])("%s no longer resets outline:none, so the global focus ring can reach it", (selector, css) => {
    const body = ruleBody(css, selector);
    expect(body).not.toBeNull();
    expect(body).not.toContain("outline:none");
  });

  it("the tab-panel scroll region (a real keyboard-focusable element, TabPanel's own tabIndex={0}) no longer suppresses its own focus indicator", () => {
    expect(HOME_CSS).not.toContain(".seg-tabpanel:focus");
    expect(HOME_CSS).not.toMatch(/\.seg-tabpanel\s*\{[^}]*outline\s*:\s*none/);
  });
});

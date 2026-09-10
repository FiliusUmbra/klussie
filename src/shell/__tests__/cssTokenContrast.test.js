// A regression guard for the exact bug class ACCESSIBILITY.md and DESIGN_TOKENS.md now
// document twice over: a color token that fails WCAG AA contrast against the app's real
// backgrounds getting used directly as a foreground (text, icon, badge, status-dot) color,
// then quietly reintroduced by a later stylesheet file after the first fix. `--ink-faint`
// regressed this way once already (fixed at `.timeline-label`, then reappeared with ten
// new usages when `src/home/homeStyles.js` was added) and `--amber` was never checked at
// all until it turned out to fail everywhere it was used as a foreground color. Both are
// now fixed; this test is the "someday" lint rule DESIGN_TOKENS.md's own audit section
// asked for, so a third regression fails CI instead of waiting for the next manual audit.
//
// Deliberately a plain substring check on the raw CSS text, not a real CSS parser: every
// real usage in this codebase is written as `var(--token)` with no extra whitespace, and a
// token's own *definition* (`--ink-faint:#8B978D;`) never contains the substring
// `var(--token)`, so this can't false-positive on the definition itself. If that
// convention ever changes, this test needs to change with it.
import { describe, it, expect } from "vitest";
import { APP_CSS } from "../appStyles.js";
import { HOME_CSS } from "../../home/homeStyles.js";

const CSS = APP_CSS + HOME_CSS;

// Scope: only the two shared stylesheet strings. It does not catch a regression in an
// inline style="{{ color: 'var(--amber)' }}" prop (ReviewSheet.jsx, primitives.jsx, and
// AiIntakeSheet.jsx all had exactly that bug and are fixed, but a new one elsewhere
// wouldn't be caught here) — a real gap, not silently assumed covered.
describe("CSS custom properties — known-failing foreground colors stay unused", () => {
  it("never uses --ink-faint as a foreground color again (2.61:1–3.04:1, fails AA)", () => {
    expect(CSS).not.toContain("var(--ink-faint)");
  });

  it("never uses bare --amber as a foreground color again (~2.16:1, fails AA) — use --amber-dark", () => {
    // A plain substring match: this deliberately does NOT match var(--amber-bg) or
    // var(--amber-dark), since neither contains the literal substring "var(--amber)".
    expect(CSS).not.toContain("var(--amber)");
  });
});

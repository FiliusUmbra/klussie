// Shell layout guards (live review 2026-10-04, item 14). jsdom has no layout engine, so these
// pin the two CSS facts the bug came from, as text, the way cssRtlChevrons.test.js does.
import { describe, it, expect } from "vitest";
import { APP_CSS } from "../appStyles.js";

describe("shell layout", () => {
  it("bounds the shell to the viewport height, so .content is the scroller and the tab bar stays in view", () => {
    expect(APP_CSS).toMatch(/\.app-shell\{[^}]*height:100dvh/);
    expect(APP_CSS).not.toMatch(/\.app-shell\{[^}]*min-height:100dvh/);
  });

  it("hides the bottom tab bar at desktop width with a selector that outranks the base .tabbar rule", () => {
    // The base rule `.tabbar{display:flex}` appears later in the file; an equal-specificity
    // `.tabbar{display:none}` inside the media query therefore lost (desktop showed both bars).
    expect(APP_CSS).toMatch(/@media \(min-width:768px\)\{[^]*?\.view > \.tabbar\{ display:none; \}/);
  });
});

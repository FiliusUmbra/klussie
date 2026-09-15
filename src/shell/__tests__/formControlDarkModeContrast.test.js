// A regression guard for a real, live-tested gap: src/index.css's own `:root` rule
// declared `color-scheme: light dark`, inviting the browser to render every native form
// control (every bare `<textarea class="textarea">` — 17 files, ReportSheet.jsx,
// ReviewSheet.jsx, ServiceRecordEditorSheet.jsx, JoinBusinessSheet.jsx and more — plus
// any other unwrapped native input) with dark OS/browser chrome on a dark-mode device,
// while appStyles.js's own `.textarea` rule never sets its own background and the app's
// actual UI (appStyles.js/homeStyles.js) has zero dark-mode CSS of its own — producing a
// near-black native background under the app's own fixed, light-theme `--ink` text
// color: unreadable, dark-on-dark text in every message/bio/notes field in the app.
// Found live, 2026-09-15, filling in JoinBusinessSheet.jsx's own optional message field
// on a browser with `prefers-color-scheme: dark` (the actual default in this session's
// own test environment, and a common real-device default).
//
// Deliberately reads the raw file from disk and does a plain substring check, not a CSS
// parser or a browser — matching this directory's own established idiom for a
// single, known rule-level fix (disabledButtonVisibility.test.js, ticketBadgeOverflow.
// test.js, statRowOverflow.test.js).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Relative to the vitest process's own cwd (the project root), matching
// knownDefects.test.js's own established convention for reading a real file from disk.
describe("index.css color-scheme — native form controls no longer go dark on a dark-mode device", () => {
  it("declares color-scheme: light, not light dark", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/color-scheme\s*:\s*light\s*;/);
    // Only the real declaration must be gone -- this file's own header comment
    // legitimately still mentions the old "light dark" value in prose, explaining why.
    expect(css).not.toMatch(/color-scheme\s*:\s*light\s+dark\s*;/);
  });
});

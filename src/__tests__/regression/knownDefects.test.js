// Pins Klussie's known, deliberately-preserved defects so that none of them is
// corrected without the correction being a declared change.
//
// This is the unusual half of a regression baseline: these tests assert that the
// product is still WRONG in exactly the ways it is currently wrong. That is not
// perversity. docs/engineering/TESTING.md §1 category 6 explains why — a package
// that promises to preserve behaviour and quietly fixes something has changed what
// a customer reads, inside a diff nobody was reviewing for that. The Engineering
// Health sprint hit precisely this and chose to preserve the defects; without a
// test, the next sweep will "tidy" them and no one will notice it was a change.
//
// If one of these fails, the question is not "how do I make the test pass". It is
// "was this change intended?" — see TESTING.md §8.
//
// §6.2 of TESTING.md (the `awaiting_pro` status leaking untranslated) is already
// pinned by src/lib/__tests__/requestStatus.test.js and is deliberately not
// duplicated here.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Built from char codes rather than written literally: a source file containing a
// backslash-u sequence is exactly what this test looks for, so writing one here
// would make the test find itself.
const BACKSLASH = String.fromCharCode(92);
const ESCAPE_SEQUENCE = new RegExp(BACKSLASH + BACKSLASH + "u([0-9a-fA-F]{4})", "g");

const SOURCE_ROOT = "src";

/** Every .jsx under src, excluding test directories. */
function componentFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__") componentFiles(full, found);
    } else if (extname(entry) === ".jsx") {
      found.push(full);
    }
  }
  return found;
}

/** Occurrences of each escape sequence across all components, keyed `u20ac`. */
function escapeInventory() {
  const counts = {};
  for (const file of componentFiles(SOURCE_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(ESCAPE_SEQUENCE)) {
      const key = "u" + match[1].toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

// Captured 2026-08-12, revised 2026-08-31. Each of these renders as literal text to a
// customer where a real character belongs — the euro signs are in invoice totals, quote
// prices and the flexi tax tracker, which is where someone is most likely to see one.
//
// One occurrence dropped from the original count of 9, found only because this exact
// test started failing on main (git blame: commit 3073e52, PR #127, 2026-08-31).
// AiIntakeSheet.jsx's own budget-field euro sign was fixed to a real `€` character as an
// incidental "while in that exact file" correction alongside that PR's own, unrelated
// error-handling fix (the AI-intake raw-exception leak) — real, legitimate, and never a
// regression, but never declared here or in the changelog either, exactly the silent-fix
// failure mode this file exists to catch (TESTING.md §1 category 6). This baseline is
// updated to match; the fix itself is not undone, and no other occurrence moved.
const BASELINE = {
  u20ac: 8, // € — invoice totals, budgets, quote prices, boost price
  u2022: 3, // • — separators
  u2013: 1, // – — en dash
  u00b7: 1, // · — middle dot
};
const BASELINE_TOTAL = 13;

describe("known defect: literal escape text rendered to customers", () => {
  it("still appears in exactly the quantities recorded at baseline", () => {
    // Counted by sequence rather than by file on purpose: moving a component
    // between files is a refactor and should not fail this test, while fixing or
    // introducing an occurrence changes what a customer reads and should.
    expect(escapeInventory()).toEqual(BASELINE);
  });

  it("totals fourteen occurrences", () => {
    const total = Object.values(escapeInventory()).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(BASELINE_TOTAL);
  });

  it("is documented, so a failure has somewhere to be resolved", () => {
    const doc = readFileSync("docs/engineering/TESTING.md", "utf8");
    expect(doc).toContain("Literal escape text rendered to customers");
  });
});

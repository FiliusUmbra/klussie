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

// Captured 2026-08-12, revised 2026-08-31, revised again here — a DECLARED closure, not
// a silent one, matching this file's own stated rule. All eight € occurrences (invoice
// totals in InvoiceSheet.jsx, the quote-price prefix in SendQuoteSheet.jsx, the flexi tax
// tracker and the Boost price in Profile.jsx, and one more in QuoteFormSheet.jsx) and all
// three bullet-separator occurrences (AppShell.jsx's own status-bar dots) are fixed to
// real `€`/`•` characters — real customer-facing text, confirmed live on staging as
// Pierre, in every one of those exact locations.
//
// TWO OCCURRENCES DELIBERATELY LEFT OPEN — NOT FORGOTTEN, NOT SILENTLY DROPPED
//
// ServiceSheet.jsx's own en dash and middle dot (both inside a price-range/rating line)
// are the only two occurrences NOT closed here. That file, alongside Discover.jsx and
// QuoteFormSheet.jsx's own render logic, is dead, unreachable code today — CustomerApp.jsx's
// own header names exactly this: "setActiveService is never called anywhere in this
// codebase... consequently also unreachable." Removing that dead chain entirely is a
// real, separate, already-partly-drafted piece of work (a different concern — orphaned
// code, not customer-visible text) and is not bundled into this narrowly-scoped
// correctness fix. QuoteFormSheet.jsx's own single € occurrence WAS fixed here (a
// one-line, zero-behaviour-change correction, since the string itself is still wrong even
// while unreachable), which is why it no longer appears in the baseline below despite the
// file itself not being removed.
const BASELINE = {
  u2013: 1, // – — en dash, ServiceSheet.jsx (dead/unreachable code, left open — see above)
  u00b7: 1, // · — middle dot, ServiceSheet.jsx (dead/unreachable code, left open — see above)
};
const BASELINE_TOTAL = 2;

describe("known defect: literal escape text rendered to customers", () => {
  it("still appears in exactly the quantities recorded at baseline", () => {
    // Counted by sequence rather than by file on purpose: moving a component
    // between files is a refactor and should not fail this test, while fixing or
    // introducing an occurrence changes what a customer reads and should.
    expect(escapeInventory()).toEqual(BASELINE);
  });

  it("totals two occurrences", () => {
    const total = Object.values(escapeInventory()).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(BASELINE_TOTAL);
  });

  it("is documented, so a failure has somewhere to be resolved", () => {
    const doc = readFileSync("docs/engineering/TESTING.md", "utf8");
    expect(doc).toContain("Literal escape text rendered to customers");
  });
});

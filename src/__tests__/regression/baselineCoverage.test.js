// Keeps docs/engineering/TESTING.md honest.
//
// WP 00.08's acceptance criterion is that every current flow is either covered by
// an automated test or listed in the manual verification document, and that no flow
// is unlisted. A written promise to keep that list current is worth very little —
// the list is long, the pressure to ship is constant, and nothing about adding a
// component reminds anyone to update a document in another folder.
//
// So the promise is made mechanical. Add a user-facing component without accounting
// for it in TESTING.md and the build fails, with a message saying where to put it.
//
// This is the test that stops the baseline decaying into a historical curiosity.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

const BASELINE_DOC = "docs/engineering/TESTING.md";

// Every folder that can contain something a user sees. design-system is included
// because a primitive rendering differently is as visible as a screen doing so.
const SURFACE_DIRS = [
  "src/shell",
  "src/auth",
  "src/profile",
  "src/customer",
  "src/pro",
  "src/messaging",
  "src/requests",
  "src/home",
  "src/ui",
  "src/design-system",
];

function componentNames(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__") componentNames(full, found);
    } else if (extname(entry) === ".jsx" && !entry.includes(".test.")) {
      found.push(basename(entry, ".jsx"));
    }
  }
  return found;
}

describe("regression baseline coverage", () => {
  const doc = readFileSync(BASELINE_DOC, "utf8");
  const components = SURFACE_DIRS.flatMap((dir) => componentNames(dir));

  it("finds the components it is supposed to be checking", () => {
    // Guards against the walk silently returning nothing — a passing suite that
    // checked zero files would be worse than a failing one.
    expect(components.length).toBeGreaterThan(40);
  });

  it("accounts for every user-facing component", () => {
    const unlisted = components.filter((name) => !doc.includes(name));

    // Named in the failure rather than just counted, so the fix is obvious: put the
    // component in §5 if a user can reach it, or §7 if it is a part or a container.
    expect(
      unlisted,
      `Not accounted for in ${BASELINE_DOC}. Add each to §5 (a flow a user ` +
        `can walk) or §7 (a part, primitive or container).`
    ).toEqual([]);
  });

  it("still documents what a behavioural regression is", () => {
    // The definition is the reason the rest of the document has any authority.
    expect(doc).toContain("What counts as a behavioural regression");
    expect(doc).toContain("Silent fixes");
  });

  it("still records the known defects rather than quietly dropping them", () => {
    expect(doc).toContain("Known defects — preserved deliberately");
  });
});

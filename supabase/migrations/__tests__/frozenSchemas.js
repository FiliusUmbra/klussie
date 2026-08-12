// The ten schema names, read from the frozen architecture rather than restated.
//
// Two migration tests need this list, and a copy in each would be two more places for it
// to drift from SUPABASE_ARCHITECTURE.md §2 — which is the one document that is allowed
// to say what the schemas are.
import { readFileSync } from "node:fs";

export const FROZEN_DOC = "docs/architecture/SUPABASE_ARCHITECTURE.md";

// §2's schema table, and only that table. Bounded by the two headings so a backticked
// identifier elsewhere in the document cannot be mistaken for a schema.
export function frozenSchemas() {
  const doc = readFileSync(FROZEN_DOC, "utf8");
  const section = doc.slice(
    doc.indexOf("## 2 · Schema Organisation"),
    doc.indexOf("## 3 · Identifier Strategy")
  );
  return [...section.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)].map((m) => m[1]);
}

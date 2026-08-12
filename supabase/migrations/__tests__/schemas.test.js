// Keeps 0018_schemas.sql tied to the frozen architecture.
//
// SUPABASE_ARCHITECTURE.md §2 names ten schemas and says what each one owns. That
// document is frozen: an eleventh schema, a renamed one, or a merged pair is an
// architectural change requiring an ADR, not a line in a migration. Nothing about
// writing a migration reminds anyone of that.
//
// So the constraint is made mechanical, and in the only direction that is safe: the
// test derives the truth from the frozen document and checks the migration against it.
// It never restates the ten names itself — a copy in a test file is a second source of
// truth, and the first thing to drift.
//
// There is no database in this harness (docs/engineering/TESTING.md §3), so this is a
// structural test over the SQL, not an execution of it. It proves the migration says
// the right thing. That it does the right thing is proven by applying it to staging,
// which is recorded in the work package.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FROZEN_DOC = "docs/architecture/SUPABASE_ARCHITECTURE.md";
const MIGRATION = "supabase/migrations/0018_schemas.sql";

// §2's schema table, and only that table. Bounded by the two headings so a backticked
// identifier elsewhere in the document cannot be mistaken for a schema.
function schemasFromArchitecture(doc) {
  const section = doc.slice(
    doc.indexOf("## 2 · Schema Organisation"),
    doc.indexOf("## 3 · Identifier Strategy")
  );
  return [...section.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)].map((m) => m[1]);
}

// `create schema if not exists <name>` — the guarded form, which is what makes the
// migration re-runnable. An unguarded `create schema` deliberately does not match:
// it would fail on a second run, and this test should notice.
function schemasCreatedBy(sql) {
  return [
    ...sql.matchAll(/create\s+schema\s+if\s+not\s+exists\s+([a-z_]+)\s*;/gi),
  ].map((m) => m[1]);
}

describe("0018_schemas migration", () => {
  const declared = schemasFromArchitecture(readFileSync(FROZEN_DOC, "utf8"));
  const created = schemasCreatedBy(readFileSync(MIGRATION, "utf8"));

  it("reads ten schemas out of the frozen architecture", () => {
    // Guards the parse itself. If the table moves or its formatting changes, this
    // fails here with an obvious cause rather than silently comparing two empty lists
    // and passing while checking nothing.
    expect(declared).toHaveLength(10);
  });

  it("creates exactly the schemas the architecture names", () => {
    const missing = declared.filter((name) => !created.includes(name));
    const extra = created.filter((name) => !declared.includes(name));

    expect(
      { missing, extra },
      `${MIGRATION} and ${FROZEN_DOC} §2 disagree. The document is frozen: ` +
        `reconcile the migration to it, or write an ADR first.`
    ).toEqual({ missing: [], extra: [] });
  });

  it("creates every schema guardedly, so the migration is re-runnable", () => {
    // IMPLEMENTATION_ROADMAP.md §3: a migration that can only run once is one that
    // cannot be trusted. Every `create schema` in the file must be the guarded form,
    // so the count of guarded creations equals the count of all of them.
    const sql = readFileSync(MIGRATION, "utf8");
    const allCreations = [...sql.matchAll(/create\s+schema/gi)];

    expect(allCreations).toHaveLength(created.length);
  });

  it("adds nothing to public and creates no objects", () => {
    // WP 01.01's acceptance is that the application is entirely unaffected. It stays
    // unaffected only while this migration creates boundaries and nothing that lives
    // inside them: a table, a grant or a touch of `public` would each be a different
    // work package, and grants in particular are 01.02's rollback point, not this
    // one's.
    const sql = readFileSync(MIGRATION, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    expect(sql).not.toMatch(/\bpublic\./i);
    expect(sql).not.toMatch(/\bcreate\s+(table|function|type|view|index)\b/i);
    expect(sql).not.toMatch(/\b(grant|revoke)\b/i);
  });
});

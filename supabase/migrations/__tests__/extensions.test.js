// Keeps 0020_extensions.sql inside SUPABASE_ARCHITECTURE.md §2's one rule about
// extensions: they live in their own schema and are never installed into `public`.
//
// The rule is easy to break by habit rather than by decision. `create extension postgis;`
// with no schema clause is what every example on the internet says, and on a Supabase
// database it lands in `public` — which is the one place §2 forbids.
//
// Structural, like the other migration tests. Placement in the running database is
// checked by supabase/diagnostics/VERIFY_EXTENSIONS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0020_extensions.sql";

const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0020_extensions migration", () => {
  const created = [
    ...code.matchAll(
      /create\s+extension\s+if\s+not\s+exists\s+"?([a-z_]+)"?(\s+with\s+schema\s+([a-z_]+))?\s*;/gi
    ),
  ].map((m) => ({ name: m[1], schema: m[3] }));

  it("installs exactly the two extensions the epic names", () => {
    // Epic 01's definition names ltree and pg_cron. A third extension arriving here is a
    // dependency the architecture has not accounted for, not a convenience.
    expect(created.map((e) => e.name).sort()).toEqual(["ltree", "pg_cron"]);
  });

  it("never installs into public", () => {
    // The rule §2 states outright. An unqualified create is the same defect on Supabase,
    // where public is the default target — so a missing schema clause is only acceptable
    // for an extension that cannot honour one, which is pg_cron and only pg_cron.
    const intoPublic = created.filter((e) => e.schema === "public");
    expect(intoPublic, "an extension is installed into public").toEqual([]);

    const unqualified = created.filter((e) => !e.schema).map((e) => e.name);
    expect(
      unqualified,
      "an extension has no schema clause. Only pg_cron may, because it is " +
        "non-relocatable and pins itself to pg_catalog."
    ).toEqual(["pg_cron"]);
  });

  it("installs every relocatable extension in the extensions schema", () => {
    // Not a new schema of our own: Supabase already provides `extensions` and already
    // keeps pgcrypto, uuid-ossp and pg_stat_statements there. A second answer to a
    // settled question is how a codebase ends up with two of everything.
    const misplaced = created.filter((e) => e.schema && e.schema !== "extensions");
    expect(misplaced).toEqual([]);
  });

  it("creates every extension guardedly, so the migration is re-runnable", () => {
    const allCreations = [...code.matchAll(/create\s+extension/gi)];
    expect(allCreations).toHaveLength(created.length);
  });

  it("schedules no cron job", () => {
    // §18 gives cron real work, but none of it exists yet. A job scheduled by this
    // migration would be behaviour shipped by a package that says it ships none.
    expect(code).not.toMatch(/cron\.schedule/i);
  });
});

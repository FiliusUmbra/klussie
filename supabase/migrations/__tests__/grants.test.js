// Keeps 0019_grants.sql inside the posture SUPABASE_ARCHITECTURE.md §9 describes.
//
// A grant is one word long and a mistake in one is silent: `grant usage on schema work to
// klussie_engine_workspace` is a plausible typo, reads correctly at a glance, and quietly
// destroys the one property this migration exists to create — that an engine writing
// another engine's schema fails on privileges rather than on review.
//
// These are structural tests over the SQL. There is no database in this harness
// (docs/engineering/TESTING.md §3), so what the grants actually do is proven by
// supabase/diagnostics/VERIFY_GRANTS.sql against staging, recorded in the work package.
// What these tests protect is different and cannot be checked by running the migration
// once: that the file still says the right thing after somebody edits it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { frozenSchemas } from "./frozenSchemas.js";

const MIGRATION = "supabase/migrations/0019_grants.sql";

const sql = readFileSync(MIGRATION, "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0019_grants migration", () => {
  const schemas = frozenSchemas();

  it("names only schemas the frozen architecture declares", () => {
    // Every single-quoted lowercase identifier in the file is either a schema name or a
    // role name, and the roles are all `klussie_`-prefixed. Anything left over that is
    // not one of the ten is a schema this architecture does not have.
    const quoted = [...code.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    const unknown = quoted.filter(
      (name) => !name.startsWith("klussie_") && !schemas.includes(name)
    );

    expect(
      [...new Set(unknown)],
      `${MIGRATION} names a schema the frozen architecture does not declare.`
    ).toEqual([]);
  });

  it("grants each engine role usage on its own schema and no other", () => {
    // The engine roles are named for the schema they own, so the pairing is checkable
    // without restating §2's ownership table: klussie_engine_work owns `work`, and a
    // grant of any other schema to it is the mistake this test exists to catch.
    const engineGrants = [
      ...code.matchAll(/\(\s*'klussie_engine_([a-z_]+)',\s*'([a-z_]+)'\s*\)/g),
    ].map((m) => ({ role: m[1], schema: m[2] }));

    expect(engineGrants.length, "the engine ownership table was not found").toBe(7);

    const mismatched = engineGrants.filter((g) => g.role !== g.schema);
    expect(
      mismatched,
      "An engine role is paired with a schema it does not own."
    ).toEqual([]);
  });

  it("never grants update or delete", () => {
    // §4: append-only is enforced by withholding UPDATE and DELETE from every application
    // role, and §24 item 7 makes the mutability class a per-table declaration. Default
    // privileges that included them would silently make every future append-only table
    // depend on someone remembering to revoke — the fail-open direction.
    expect(code).not.toMatch(/\bgrant[^;]*\bupdate\b/is);
    expect(code).not.toMatch(/\bgrant[^;]*\bdelete\b/is);
  });

  it("grants nothing to anon, authenticated, service_role or public", () => {
    // §9 states these as rules, not preferences: anon never reaches a workspace-scoped
    // schema; authenticated never reaches platform or analytics_pf; the elevated role is
    // not one of the per-consumer service roles. The direct-read path (§7) is opened per
    // table by the epic that ships it, never schema-wide in advance.
    for (const role of ["anon", "authenticated", "service_role", "public"]) {
      expect(
        code,
        `${MIGRATION} grants something to ${role}.`
      ).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+${role}\\b`, "is"));
    }
  });

  it("touches nothing in public and creates no objects", () => {
    // WP 01.02's acceptance is that existing application access to `public` is unchanged.
    // The revokes above name the PUBLIC pseudo-role, which is a different thing from the
    // `public` schema — hence matching on the qualified form.
    expect(code).not.toMatch(/\bpublic\./i);
    expect(code).not.toMatch(/\bcreate\s+(table|function|type|view|index)\b/i);
  });

  it("creates every role guardedly, so the migration is re-runnable", () => {
    // `create role` has no `if not exists` form, so re-runnability depends entirely on
    // the existence guard. Without it a second run fails, and a migration that can only
    // run once cannot be trusted (IMPLEMENTATION_ROADMAP.md §3).
    expect(code).toMatch(/if not exists \(select 1 from pg_roles where rolname/i);
    expect(code).not.toMatch(/^\s*create role/im);
  });
});

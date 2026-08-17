// Keeps 0046_location_containment.sql answering containment via ltree's own indexed
// operators, never a recursive walk (DATABASE_ARCHITECTURE.md §13's explicit requirement),
// and confined to engine-to-engine reach — no client-facing delegate in this epic.
//
// Structural. Behaviour (including at real multi-level depth) is proven against staging by
// VERIFY_LOCATION_CONTAINMENT.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0046_location_containment.sql";

const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0046_location_containment migration", () => {
  it("defines exactly the three functions the epic names", () => {
    const created = [...code.matchAll(/create or replace function (property\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "property.location_ancestors",
      "property.location_descendants",
      "property.location_within",
    ]);
  });

  it("answers containment with ltree's <@ operator against the indexed path, never a recursive CTE", () => {
    expect(code).toMatch(/x\.path OPERATOR\(extensions\.<@\) y\.path/i);
    expect(code).not.toMatch(/with recursive/i);
    expect(code).not.toMatch(/\bconnect by\b/i);
  });

  it("schema-qualifies every ltree operator — bare <@/@>/nlevel would not resolve under search_path = ''", () => {
    // The real bug this file exists to catch: ltree's operators and functions live in
    // `extensions`, not pg_catalog, so a bare symbol silently fails to resolve once this
    // function actually runs — something a structural test over the SQL text can pin even
    // without a live database to execute it against.
    expect(code).not.toMatch(/[^(]\bpath\s*<@\s*[a-z(]/i);
    expect(code).not.toMatch(/[^(]\bpath\s*@>\s*[a-z(]/i);
    expect(code).toMatch(/extensions\.nlevel\(/i);
  });

  it("ancestors uses @> (ancestor-or-self) and descendants uses <@ (descendant-or-self), not the same operator for both", () => {
    const ancestorsStart = code.indexOf("create or replace function property.location_ancestors");
    const ancestorsBody = code.slice(ancestorsStart, code.indexOf("$$;", ancestorsStart) + 3);
    expect(ancestorsBody).toMatch(/l\.path OPERATOR\(extensions\.@>\) /i);

    const descendantsStart = code.indexOf("create or replace function property.location_descendants");
    const descendantsBody = code.slice(descendantsStart, code.indexOf("$$;", descendantsStart) + 3);
    expect(descendantsBody).toMatch(/l\.path OPERATOR\(extensions\.<@\) /i);
  });

  it("excludes the location itself from both ancestors and descendants", () => {
    const ancestorsStart = code.indexOf("create or replace function property.location_ancestors");
    const ancestorsBody = code.slice(ancestorsStart, code.indexOf("$$;", ancestorsStart) + 3);
    expect(ancestorsBody).toMatch(/l\.id <> p_location_id/i);

    const descendantsStart = code.indexOf("create or replace function property.location_descendants");
    const descendantsBody = code.slice(descendantsStart, code.indexOf("$$;", descendantsStart) + 3);
    expect(descendantsBody).toMatch(/l\.id <> p_location_id/i);
  });

  it("marks every function STABLE with a locked search_path", () => {
    const fns = [...code.matchAll(/create or replace function property\.\w+\([^)]*\)[\s\S]*?\$\$;/gi)];
    expect(fns.length).toBe(3);
    for (const [block] of fns) {
      expect(block).toMatch(/\bstable\b/i);
      expect(block).toMatch(/set search_path = ''/);
      expect(block).not.toMatch(/\bsecurity definer\b/i);
    }
  });

  it("grants no role anything — engine-to-engine only, no api delegate in this epic", () => {
    expect(code).not.toMatch(/\bgrant\b/i);
    expect(code).toMatch(/revoke all on function property\.location_within\(uuid, uuid\) from public, anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on function property\.location_ancestors\(uuid\) from public, anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on function property\.location_descendants\(uuid\) from public, anon, authenticated, service_role/i);
  });

  it("declares no api-schema function — deliberately, per this epic's scope note", () => {
    expect(code).not.toMatch(/create (or replace )?function api\./i);
  });
});

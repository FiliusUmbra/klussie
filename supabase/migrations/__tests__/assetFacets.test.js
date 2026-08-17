// Keeps 0049_asset_facets.sql inside DATABASE_ARCHITECTURE.md §14 rule 6 ("declared, not
// free-form") and inside the jsonb-vs-ltree distinction this codebase now has real
// precedent for (migration 0046's finding): jsonb's `?` operator is core PostgreSQL and
// needs no schema qualification, unlike ltree's own operators.
//
// Structural. Behaviour is proven against staging by VERIFY_ASSET_FACETS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0049_asset_facets.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0049_asset_facets migration", () => {
  it("creates property.facet_types and property.asset_facets, not a new schema", () => {
    const created = [...code.matchAll(/create table if not exists (property\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["property.asset_facets", "property.facet_types"]);
  });

  it("keys facet_types naturally, like workspace.role_permissions, not with a surrogate id", () => {
    const tableStart = code.indexOf("create table if not exists property.facet_types");
    const tableEnd = code.indexOf(");", tableStart);
    const tableBody = code.slice(tableStart, tableEnd);
    expect(tableBody).toMatch(/constraint facet_types_pkey primary key \(facet_type_key\)/i);
    expect(tableBody).not.toMatch(/\bid\s+uuid\b/i);
  });

  it("gives asset_facets a genuine UUID identity, unlike the configuration table beside it", () => {
    const tableStart = code.indexOf("create table if not exists property.asset_facets");
    const tableEnd = code.indexOf(");", tableStart);
    const tableBody = code.slice(tableStart, tableEnd);
    expect(tableBody).toMatch(/id\s+uuid\s+not null/i);
    expect(tableBody).not.toMatch(/id[^,]*default/i);
  });

  it("seeds no facet type — the catalog is empty, deliberately", () => {
    expect(code).not.toMatch(/insert into property\.facet_types/i);
  });

  it("allows at most one facet instance per asset per facet type", () => {
    expect(code).toMatch(/constraint asset_facets_unique_per_type unique \(asset_id, facet_type_key\)/i);
  });

  it("validates attribute keys with a trigger, not a CHECK constraint", () => {
    // CHECK expressions cannot reference another table, which is exactly what validating
    // against property.facet_types requires.
    expect(code).not.toMatch(/check\s*\([^)]*attributes/i);
    expect(code).toMatch(/before insert or update on property\.asset_facets/i);
    expect(code).toMatch(/asset_facets_validate_attributes/i);
  });

  it("uses jsonb's core ? operator unqualified — unlike ltree, it needs no extensions prefix", () => {
    const fnStart = code.indexOf("create or replace function property.asset_facets_validate_attributes");
    const fnBody = code.slice(fnStart, code.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/not \(v_declared \? k\)/i);
    expect(fnBody).not.toMatch(/extensions\./i);
  });

  it("schema-qualifies jsonb_object_keys, array_agg and array_to_string under search_path = ''", () => {
    const fnStart = code.indexOf("create or replace function property.asset_facets_validate_attributes");
    const fnBody = code.slice(fnStart, code.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/pg_catalog\.jsonb_object_keys/i);
    expect(fnBody).toMatch(/pg_catalog\.array_agg/i);
    expect(fnBody).toMatch(/pg_catalog\.array_to_string/i);
  });

  it("refuses an undeclared facet type outright, not silently allowing an empty attribute set", () => {
    const fnStart = code.indexOf("create or replace function property.asset_facets_validate_attributes");
    const fnBody = code.slice(fnStart, code.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/v_declared is null/i);
    expect(fnBody).toMatch(/raise exception/i);
  });

  it("locks the search_path on the validation function", () => {
    const fnStart = code.indexOf("create or replace function property.asset_facets_validate_attributes");
    const fnBody = code.slice(fnStart, code.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/set search_path = ''/);
  });

  it("enables RLS on both tables and defines no policy yet", () => {
    for (const table of ["facet_types", "asset_facets"]) {
      expect(code).toMatch(new RegExp(`alter table property\\.${table} enable row level security`, "i"));
    }
    expect(code).not.toMatch(/create policy/i);
  });

  it("grants the client-facing roles nothing", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(code).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is"));
    }
    expect(code).toMatch(/revoke all on property\.facet_types from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on property\.asset_facets from anon, authenticated, service_role/i);
  });
});

// Keeps 0048_assets.sql inside ADR-0028's shape (repeated for placement, not re-decided)
// and inside this schema's established distinctions: constrained state machines vs.
// unconstrained taxonomies, and household_items' own AI-provenance contract preserved
// exactly rather than widened speculatively.
//
// Structural, like every migration test in this repository. Behaviour is proven against
// staging by VERIFY_ASSETS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0048_assets.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0048_assets migration", () => {
  it("creates property.assets and property.asset_placements, not a new schema", () => {
    const created = [...code.matchAll(/create table if not exists (property\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["property.asset_placements", "property.assets"]);
  });

  it("gives assets a mutable current-placement pointer, nullable — every backfilled asset starts unplaced", () => {
    // Scoped to the property.assets table block specifically — property.asset_placements
    // (below it in the same file) correctly declares its OWN location_id as not null, and
    // an unscoped check would wrongly match that legitimate, different declaration.
    const assetsStart = code.indexOf("create table if not exists property.assets (");
    const assetsEnd = code.indexOf("create table if not exists property.asset_placements");
    const assetsBlock = code.slice(assetsStart, assetsEnd);

    expect(assetsBlock).toMatch(/location_id\s+uuid\s*\n\s*references property\.locations \(id\)/i);
    expect(assetsBlock).not.toMatch(/location_id[^,\n]*not null/i);
    expect(assetsBlock).toMatch(/placed_since\s+timestamptz,/i);
  });

  it("gives asset_placements both began_at and ended_at as not-null — closed placements only", () => {
    expect(code).toMatch(/began_at\s+timestamptz not null/i);
    expect(code).toMatch(/ended_at\s+timestamptz not null/i);
    expect(code).toMatch(/check\s*\(\s*ended_at\s*>\s*began_at\s*\)/i);
  });

  it("constrains lifecycle_state as a state machine but leaves type and condition unconstrained", () => {
    expect(codeNoComments).toMatch(/check \(lifecycle_state in \('active', 'retired', 'disposed'\)\)/i);
    expect(code).not.toMatch(/check\s*\(\s*type\b/i);
    expect(code).not.toMatch(/check\s*\(\s*condition\b/i);
  });

  it("matches household_items' own two-value source check exactly — no bulk_import or inferred value", () => {
    expect(codeNoComments).toMatch(/check \(source in \('manual', 'ai_confirmed'\)\)/i);
    expect(code).not.toMatch(/bulk_import|inferred/i);
  });

  it("self-references parent_asset_id with no ltree path column", () => {
    expect(code).toMatch(/parent_asset_id\s+uuid\s*\n\s*references property\.assets \(id\)/i);
    expect(code).not.toMatch(/extensions\.ltree/i);
  });

  it("gives every primary key no database default — UUIDv7 is application-generated", () => {
    expect(code).not.toMatch(/id\s+uuid\s+not null[^,]*default/i);
    expect(code).not.toMatch(/gen_random_uuid|uuid_generate/i);
  });

  it("enforces asset_placements as append-only with a guard trigger", () => {
    expect(code).toMatch(/before update or delete on property\.asset_placements/i);
    expect(code).toMatch(/asset_placements_reject_mutation/i);
  });

  it("grants UPDATE on assets only — asset_placements is genuinely append-only", () => {
    expect(code).toMatch(/grant update on property\.assets to klussie_engine_property/i);
    expect(code).not.toMatch(/grant update on property\.asset_placements/i);
    expect(code).not.toMatch(/grant[^;]*\bdelete\b/is);
  });

  it("enables RLS on both tables and defines no policy yet", () => {
    for (const table of ["assets", "asset_placements"]) {
      expect(code).toMatch(new RegExp(`alter table property\\.${table} enable row level security`, "i"));
    }
    expect(code).not.toMatch(/create policy/i);
  });

  it("grants the client-facing roles nothing", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(code).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is"));
    }
    expect(code).toMatch(/revoke all on property\.assets from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on property\.asset_placements from anon, authenticated, service_role/i);
  });

  it("touches nothing in public — household_items is untouched by this package", () => {
    expect(code).not.toMatch(/\bpublic\./i);
  });

  it("is re-runnable — table and indexes created guardedly", () => {
    const tableCreations = [...code.matchAll(/create table/gi)];
    const guardedTableCreations = [...code.matchAll(/create table if not exists/gi)];
    expect(tableCreations).toHaveLength(guardedTableCreations.length);
    const indexCreations = [...code.matchAll(/create index/gi)];
    const guardedIndexCreations = [...code.matchAll(/create index if not exists/gi)];
    expect(indexCreations).toHaveLength(guardedIndexCreations.length);
  });
});

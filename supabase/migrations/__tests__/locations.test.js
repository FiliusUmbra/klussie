// Keeps 0043_locations.sql inside DATABASE_ARCHITECTURE.md §13 ("workspace-scoped,
// inheriting the property's stewardship") and migration 0020's own deferred instruction
// ("Epic 06 grants usage on schema extensions... when it creates the first ltree column").
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3). Behaviour is proven against staging by VERIFY_LOCATIONS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0043_locations.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0043_locations migration", () => {
  it("creates property.locations, not a new schema", () => {
    expect(code).toMatch(/create table if not exists property\.locations/i);
    expect(code).not.toMatch(/create schema/i);
  });

  it("carries property_id but no workspace_id or steward_workspace_id column of its own", () => {
    // The defect this test exists to catch: duplicating the property's current steward
    // onto every location would recreate the exact two-answers problem ADR-0028 avoided.
    expect(code).toMatch(/property_id\s+uuid\s+not null\s+references property\.properties \(id\)/i);
    expect(code).not.toMatch(/\bworkspace_id\b/i);
    expect(code).not.toMatch(/\bsteward_workspace_id\b/i);
  });

  it("self-references parent_id, nullable, with no ON DELETE clause", () => {
    expect(code).toMatch(/parent_id\s+uuid\s*\n\s*references property\.locations \(id\)/i);
    expect(code).not.toMatch(/parent_id[^,]*not null/i);
    expect(code).not.toMatch(/parent_id[^,]*on delete/is);
  });

  it("declares path as extensions.ltree, schema-qualified, not a bare ltree column", () => {
    expect(code).toMatch(/path\s+extensions\.ltree\s+not null/i);
  });

  it("indexes path with GiST using the ltree operator class", () => {
    expect(code).toMatch(/using gist \(path extensions\.gist_ltree_ops\)/i);
  });

  it("leaves type unconstrained — no check constraint, matching workspace.memberships.role's restraint", () => {
    expect(code).not.toMatch(/check\s*\([^)]*\btype\b/i);
  });

  it("gives every primary key no database default — UUIDv7 is application-generated", () => {
    expect(code).not.toMatch(/id\s+uuid\s+not null[^,]*default/i);
    expect(code).not.toMatch(/gen_random_uuid|uuid_generate/i);
  });

  it("grants USAGE on schema extensions to klussie_engine_property", () => {
    // Migration 0020's own deferred instruction, followed literally.
    expect(code).toMatch(/grant usage on schema extensions to klussie_engine_property/i);
  });

  it("grants UPDATE on locations and withholds DELETE", () => {
    expect(code).toMatch(/grant update on property\.locations to klussie_engine_property/i);
    expect(code).not.toMatch(/grant[^;]*\bdelete\b/is);
  });

  it("enables RLS and defines no policy yet", () => {
    expect(code).toMatch(/alter table property\.locations enable row level security/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("grants the client-facing roles nothing", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(code).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is"));
    }
    expect(code).toMatch(/revoke all on property\.locations from anon, authenticated, service_role/i);
  });

  it("touches nothing in public", () => {
    expect(code).not.toMatch(/\bpublic\./i);
  });

  it("is re-runnable — table and indexes created guardedly", () => {
    expect(code).toMatch(/create table if not exists/i);
    const indexCreations = [...code.matchAll(/create index/gi)];
    const guardedIndexCreations = [...code.matchAll(/create index if not exists/gi)];
    expect(indexCreations).toHaveLength(guardedIndexCreations.length);
  });
});

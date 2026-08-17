// Keeps 0039_property.sql inside ADR-0028's decision: a mutable current pointer on
// property.properties, a genuinely append-only log of CLOSED periods on
// property.stewardship_periods, and no property-specific isolation resolver (the current
// pointer is a plain workspace_id-shaped column, checked directly against
// api.current_workspace_memberships()).
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3). Behaviour is proven against staging by VERIFY_PROPERTY.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0039_property.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0039_property migration", () => {
  it("creates exactly the two tables, guardedly", () => {
    const created = [...code.matchAll(/create table if not exists (property\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["property.properties", "property.stewardship_periods"]);
  });

  it("gives properties a mutable current-steward pointer, not null, referencing workspace.workspaces", () => {
    expect(code).toMatch(/steward_workspace_id\s+uuid\s+not null\s+references workspace\.workspaces \(id\)/i);
    expect(code).toMatch(/steward_since\s+timestamptz\s+not null/i);
  });

  it("gives stewardship_periods both began_at and ended_at as not-null — closed periods only", () => {
    // The whole point of ADR-0028's split: nothing is ever inserted here with ended_at
    // still unknown, unlike a naive "one table, nullable ended_at" design would allow.
    expect(code).toMatch(/began_at\s+timestamptz\s+not null/i);
    expect(code).toMatch(/ended_at\s+timestamptz\s+not null/i);
  });

  it("constrains ended_at to be strictly after began_at", () => {
    expect(code).toMatch(/check\s*\(\s*ended_at\s*>\s*began_at\s*\)/i);
  });

  it("references property_id and workspace_id from stewardship_periods", () => {
    expect(code).toMatch(/property_id\s+uuid\s+not null\s+references property\.properties \(id\)/i);
    expect(code).toMatch(/workspace_id\s+uuid\s+not null\s+references workspace\.workspaces \(id\)/i);
  });

  it("gives every primary key no database default — UUIDv7 is application-generated", () => {
    expect(code).not.toMatch(/id\s+uuid\s+not null[^,]*default/i);
    expect(code).not.toMatch(/gen_random_uuid|uuid_generate/i);
  });

  it("leaves jurisdiction nullable, with no default and no check constraint", () => {
    // Unpopulated until a later package states and applies a rule for it — the same
    // restraint migration 0032 held for workspace_id. Scoped to the column's own line —
    // [^\n]* rather than [^,]*, which would run past the line into unrelated "not null"
    // declarations elsewhere in the file.
    expect(code).toMatch(/jurisdiction\s+text,/i);
    expect(code).not.toMatch(/jurisdiction[^\n]*not null/i);
    expect(code).not.toMatch(/jurisdiction[^\n]*default/i);
    expect(code).not.toMatch(/check\s*\([^)]*jurisdiction/i);
  });

  it("grants UPDATE on properties only — stewardship_periods is genuinely append-only", () => {
    expect(code).toMatch(/grant update on property\.properties to klussie_engine_property/i);
    expect(code).not.toMatch(/grant update on property\.stewardship_periods/i);
    expect(code).not.toMatch(/grant[^;]*\bdelete\b/is);
  });

  it("enforces stewardship_periods as append-only with a guard trigger", () => {
    // Same pattern as workspace.membership_history (migration 0030): withheld privileges
    // plus a trigger, because the two fail differently.
    expect(code).toMatch(/before update or delete on property\.stewardship_periods/i);
    expect(code).toMatch(/stewardship_periods_reject_mutation/i);
  });

  it("enables RLS on both tables and defines no policy yet", () => {
    for (const table of ["properties", "stewardship_periods"]) {
      expect(code).toMatch(new RegExp(`alter table property\\.${table} enable row level security`, "i"));
    }
    expect(code).not.toMatch(/create policy/i);
  });

  it("declares no property-specific membership resolver — isolation reuses Epic 03's helper (ADR-0028)", () => {
    expect(code).not.toMatch(/current_stewardships|is_property_steward/i);
  });

  it("grants the client-facing roles nothing", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(code).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is"));
    }
    expect(code).toMatch(/revoke all on property\.properties from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on property\.stewardship_periods from anon, authenticated, service_role/i);
  });

  it("touches nothing in public", () => {
    expect(code).not.toMatch(/\bpublic\./i);
    expect(code).not.toMatch(/\balter table public\b/i);
  });

  it("is re-runnable — every table created guardedly", () => {
    const allCreations = [...code.matchAll(/create table/gi)];
    const guardedCreations = [...code.matchAll(/create table if not exists/gi)];
    expect(allCreations).toHaveLength(guardedCreations.length);
  });
});

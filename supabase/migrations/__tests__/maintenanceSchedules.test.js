// Keeps 0071_maintenance_schedules.sql inside DATABASE_ARCHITECTURE.md §16's own shape:
// anchored to exactly one of an asset or a location, recurrence as a native interval,
// no version history (Transactional, unlike every ADR-0028 aggregate so far).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0071_maintenance_schedules.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0071_maintenance_schedules migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.maintenance_schedules"]);
  });

  it("is anchored to exactly one of asset_id or location_id, never workspace or property", () => {
    const start = code.indexOf("create table if not exists work.maintenance_schedules");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/asset_id\s+uuid\s+null/);
    expect(block).toMatch(/location_id\s+uuid\s+null/);
    expect(block).toMatch(/check \(num_nonnulls\(asset_id, location_id\) = 1\)/);
    expect(block).not.toMatch(/property_id/);
    expect(block).not.toMatch(/workspace_id\s+uuid\s+null/); // workspace_id here is the OWNER, not a subject option
  });

  it("recurrence is a native interval, constrained positive", () => {
    const start = code.indexOf("create table if not exists work.maintenance_schedules");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/recurrence\s+interval\s+not null/);
    expect(block).toMatch(/next_due_on\s+date\s+not null/);

    const rawStart = codeNoComments.indexOf("create table if not exists work.maintenance_schedules");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/check \(recurrence > interval '0'\)/);
  });

  it("active defaults true, cancelled_at is only ever set alongside active = false", () => {
    const start = code.indexOf("create table if not exists work.maintenance_schedules");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/active\s+boolean\s+not null default true/);
    expect(block).toMatch(/cancelled_at\s+timestamptz\s+null/);
    expect(block).toMatch(/check \(\(active\) or \(cancelled_at is not null\)\)/);
  });

  it("has no append-only guard — schedules are ordinary mutable Transactional rows", () => {
    expect(codeNoComments).not.toMatch(/reject_mutation/);
    expect(codeNoComments).not.toMatch(/append_only/);
  });

  it("grants UPDATE to klussie_engine_work, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.maintenance_schedules to klussie_engine_work/i);
    expect(code).toMatch(/revoke all on work\.maintenance_schedules from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("indexes next_due_on partially, only where active", () => {
    expect(code).toMatch(
      /create index if not exists maintenance_schedules_due_idx\s*\n\s*on work\.maintenance_schedules \(next_due_on\) where active/
    );
  });
});

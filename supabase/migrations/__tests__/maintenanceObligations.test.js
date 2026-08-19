// Keeps 0072_maintenance_obligations.sql inside §16's own rules: authoritative once
// created, retained permanently once terminal, cancellation always carries a reason,
// schedule_id set if and only if source = 'schedule'.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0072_maintenance_obligations.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0072_maintenance_obligations migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.maintenance_obligations"]);
  });

  it("is anchored to exactly one of asset_id or location_id, and references maintenance_schedules", () => {
    const start = code.indexOf("create table if not exists work.maintenance_obligations");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(num_nonnulls\(asset_id, location_id\) = 1\)/);
    expect(block).toMatch(/schedule_id\s+uuid\s+null/);
    expect(block).toMatch(/references work\.maintenance_schedules \(id\)/);
  });

  it("constrains source to exactly four values, and schedule_id iff source = schedule", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists work.maintenance_obligations");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/check \(source in \('manual', 'schedule', 'compliance', 'prediction'\)\)/);
    expect(rawBlock).toMatch(/check \(\(source = 'schedule'\) = \(schedule_id is not null\)\)/);
  });

  it("constrains status to exactly three values, defaulting open, with terminal consistency checks", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists work.maintenance_obligations");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/status\s+text\s+not null default 'open'/);
    expect(rawBlock).toMatch(/check \(status in \('open', 'completed', 'cancelled'\)\)/);
    expect(rawBlock).toMatch(/check \(status <> 'completed' or completed_at is not null\)/);
    expect(rawBlock).toMatch(
      /check \(status <> 'cancelled' or \(cancelled_at is not null and cancellation_reason is not null\)\)/
    );
  });

  it("has no 'due'/'overdue' status values or columns — computed at read time, not stored", () => {
    expect(codeNoComments).not.toMatch(/'due'/);
    expect(codeNoComments).not.toMatch(/'overdue'/);
    expect(codeNoComments).not.toMatch(/is_overdue/);
  });

  it("guards mutation only once status is terminal, not the table unconditionally", () => {
    expect(codeNoComments).toMatch(/maintenance_obligations_reject_terminal_mutation/);
    expect(codeNoComments).toMatch(/if old\.status in \('completed', 'cancelled'\) then/);
    expect(codeNoComments).toMatch(/before update on work\.maintenance_obligations/);
    expect(codeNoComments).not.toMatch(/before update or delete/);
  });

  it("grants UPDATE but never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.maintenance_obligations to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.maintenance_obligations/i);
    expect(code).toMatch(/revoke all on work\.maintenance_obligations from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });
});

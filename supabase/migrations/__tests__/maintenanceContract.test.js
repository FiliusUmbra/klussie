// Keeps 0074_maintenance_contract.sql inside ADR-0022 (no server-side id minting for
// ongoing runtime rows — work.generate_due_obligation() handles exactly one schedule,
// one obligation, per call, never a loop), §16's terminal-state rules enforced at the
// call boundary, and the "no api.* delegate yet" posture Epic 09 established.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0074_maintenance_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0074_maintenance_contract migration", () => {
  it("defines exactly eight functions, all in work, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (work\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "work.cancel_maintenance_obligation",
      "work.cancel_maintenance_schedule",
      "work.complete_maintenance_obligation",
      "work.create_maintenance_obligation",
      "work.create_maintenance_schedule",
      "work.generate_due_obligation",
      "work.my_maintenance_obligations",
      "work.my_maintenance_schedules",
    ]);
  });

  it("never calls platform.uuid_v7_at — every identifier is a required parameter", () => {
    expect(codeNoComments).not.toMatch(/uuid_v7_at/);
    const start = codeNoComments.indexOf("create or replace function work.generate_due_obligation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("returns void", start));
    expect(block).toMatch(/p_obligation_id\s+uuid,/);
    expect(block).not.toMatch(/p_obligation_id\s+uuid\s+default/);
  });

  it("generate_due_obligation locks the schedule row, checks it is due, and advances next_due_on by exactly one recurrence", () => {
    const start = codeNoComments.indexOf("create or replace function work.generate_due_obligation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where id = p_schedule_id and active\s*\n\s*for update/);
    expect(block).toMatch(/if v_next_due_on > current_date then\s*\n\s*raise exception/);
    expect(block).toMatch(/set next_due_on = v_next_due_on \+ v_recurrence/);
  });

  it("generate_due_obligation calls create_maintenance_obligation with source 'schedule', not its own insert", () => {
    const start = codeNoComments.indexOf("create or replace function work.generate_due_obligation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/perform work\.create_maintenance_obligation\(/);
    expect(block).toMatch(/p_source\s+=> 'schedule'/);
    expect(block).not.toMatch(/insert into work\.maintenance_obligations/);
  });

  it("complete_maintenance_obligation and cancel_maintenance_obligation both guard on status = 'open'", () => {
    for (const fn of ["complete_maintenance_obligation", "cancel_maintenance_obligation"]) {
      const start = codeNoComments.indexOf(`create or replace function work.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block).toMatch(/where id = p_obligation_id and status = 'open'/);
    }
  });

  it("cancel_maintenance_obligation requires a non-blank reason before touching the table", () => {
    const start = codeNoComments.indexOf("create or replace function work.cancel_maintenance_obligation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if p_reason is null or btrim\(p_reason\) = '' then/);
  });

  it("cancel_maintenance_schedule is not idempotent — raises if already cancelled", () => {
    const start = codeNoComments.indexOf("create or replace function work.cancel_maintenance_schedule(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where id = p_schedule_id and active/);
    expect(block).toMatch(/if v_workspace_id is null then\s*\n\s*raise exception/);
  });

  it("every mutating function emits exactly one platform.emit_event call", () => {
    for (const fn of [
      "create_maintenance_schedule", "cancel_maintenance_schedule",
      "create_maintenance_obligation", "complete_maintenance_obligation", "cancel_maintenance_obligation",
    ]) {
      const start = codeNoComments.indexOf(`create or replace function work.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      const emitCount = (block.match(/perform platform\.emit_event\(/g) || []).length;
      expect(emitCount, `${fn} should emit exactly one event`).toBe(1);
    }
  });

  it("my_maintenance_obligations computes is_overdue at read time from due_on and status, not a stored column", () => {
    const start = codeNoComments.indexOf("create or replace function work.my_maintenance_obligations(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/\(o\.status = 'open' and o\.due_on < current_date\) as is_overdue/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(8);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_work only — no api delegate, no authenticated/anon grant", () => {
    const grants = [...code.matchAll(/grant execute on function (work\.\w+)\([^)]*\)\s*\n\s*to (\w+)/g)];
    expect(grants.length).toBe(8);
    for (const [, , role] of grants) {
      expect(role).toBe("klussie_engine_work");
    }
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
  });

  it("revokes all eight functions from public, anon, authenticated and service_role before granting", () => {
    const revokes = [...code.matchAll(/revoke all on function (work\.\w+)\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/g)];
    expect(revokes.length).toBe(8);
  });
});

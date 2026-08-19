// Keeps 0115_notifications.sql inside §32's own rules: two tables, not one
// (workspace-scoped notifications vs. per-recipient delivery receipts), notifications
// fully immutable, deliveries immutable except their three one-way timestamps, and no
// RLS policy yet on either.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0115_notifications.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0115_notifications migration", () => {
  it("creates exactly two tables, both in platform", () => {
    const created = [...code.matchAll(/create table if not exists (platform\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["platform.notification_deliveries", "platform.notifications"]);
  });

  it("notifications enforces the subject pair — both null or both set", () => {
    const start = code.indexOf("create table if not exists platform.notifications");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(\(subject_type is null\) = \(subject_id is null\)\)/);
  });

  it("notifications has no update grant, no guard trigger — fully immutable by grant alone", () => {
    expect(code).toMatch(/revoke update, delete on platform\.notifications from klussie_engine_platform/i);
    const start = codeNoComments.indexOf("create table if not exists platform.notifications");
    const end = codeNoComments.indexOf("create table if not exists platform.notification_deliveries");
    const block = codeNoComments.slice(start, end);
    expect(block).not.toMatch(/create trigger/);
  });

  it("notification_deliveries has a unique constraint on (notification_id, person_ref, channel)", () => {
    const start = code.indexOf("create table if not exists platform.notification_deliveries");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/unique \(notification_id, person_ref, channel\)/);
  });

  it("notification_deliveries carries no foreign key on person_ref — a durable reference", () => {
    const start = code.indexOf("create table if not exists platform.notification_deliveries");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/person_ref\s+uuid\s+not null/);
    expect(block).not.toMatch(/person_ref.*references/);
  });

  it("the guard trigger freezes every column except delivered_at, seen_at and acted_at, each one-way", () => {
    expect(codeNoComments).toMatch(/notification_deliveries_guard_mutation/);
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("return coalesce", guardStart));
    for (const col of ["id", "notification_id", "person_ref", "channel", "created_at"]) {
      expect(guardBlock, `guard does not check ${col}`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    for (const ts of ["delivered_at", "seen_at", "acted_at"]) {
      expect(guardBlock).toMatch(new RegExp(`old\\.${ts} is not null and new\\.${ts} is distinct from old\\.${ts}`));
    }
  });

  it("rejects delete unconditionally on notification_deliveries", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
    expect(codeNoComments).toMatch(/before update or delete on platform\.notification_deliveries/);
  });

  it("grants UPDATE on deliveries but never DELETE, revokes client roles on both tables, adds no policy", () => {
    expect(code).toMatch(/grant update on platform\.notification_deliveries to klussie_engine_platform/i);
    expect(code).not.toMatch(/grant delete/i);
    expect(code).toMatch(/revoke all on platform\.notifications from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on platform\.notification_deliveries from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("enables RLS on both tables", () => {
    expect(code).toMatch(/alter table platform\.notifications enable row level security/i);
    expect(code).toMatch(/alter table platform\.notification_deliveries enable row level security/i);
  });
});

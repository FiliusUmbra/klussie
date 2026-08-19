// Keeps 0116_notification_preferences.sql inside §20's own rule: preferences per
// membership, one row each, genuinely mutable — the one aggregate this session
// deliberately does not make append-only or immutable-except-guarded.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0116_notification_preferences.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0116_notification_preferences migration", () => {
  it("creates exactly one table, in platform", () => {
    const created = [...code.matchAll(/create table if not exists (platform\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["platform.notification_preferences"]);
  });

  it("references workspace.memberships directly, not a (person_ref, workspace_id) pair", () => {
    const start = code.indexOf("create table if not exists platform.notification_preferences");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/membership_id\s+uuid\s+not null\s*\n\s*references workspace\.memberships \(id\)/);
    expect(block).not.toMatch(/person_ref/);
    expect(block).not.toMatch(/workspace_id/);
  });

  it("enforces exactly one preference row per membership", () => {
    const start = code.indexOf("create table if not exists platform.notification_preferences");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/unique \(membership_id\)/);
  });

  it("preferences is open-ended jsonb, not a closed shape", () => {
    const start = code.indexOf("create table if not exists platform.notification_preferences");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/preferences\s+jsonb\s+not null/);
  });

  it("grants a real UPDATE path — no guard trigger, no append-only restriction", () => {
    expect(code).toMatch(/grant update on platform\.notification_preferences to klussie_engine_platform/i);
    expect(codeNoComments).not.toMatch(/create or replace function/);
    expect(codeNoComments).not.toMatch(/create trigger/);
  });

  it("revokes client roles and adds no policy here", () => {
    expect(code).toMatch(/revoke all on platform\.notification_preferences from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});

// Keeps 0223_emit_domain_event_grant_hardening.sql's own fix from being silently
// reverted: public.emit_domain_event(text, jsonb) (ADR-0004, migration 0010) is SECURITY
// DEFINER and `returns void` (directly callable, unlike the trigger functions that share
// its own missing-revoke gap but are structurally immune to direct invocation), and was
// never given an explicit revoke of its default PUBLIC execute grant — the same "PUBLIC
// gets EXECUTE by default on a new function" gap 0028/0031/0214 already close elsewhere,
// found here on a second, previously unchecked function during this session's own sweep.
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3) — this checks the grant posture the migration's own text establishes, not live
// behaviour against a real database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0223_emit_domain_event_grant_hardening.sql";

const rawCode = readFileSync(MIGRATION, "utf8");
const code = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0223_emit_domain_event_grant_hardening migration", () => {
  it("revokes the default PUBLIC grant explicitly, by name, from public, anon and service_role", () => {
    expect(code).toMatch(
      /revoke all on function public\.emit_domain_event\(text, jsonb\) from public, anon, service_role/i
    );
  });

  it("re-grants EXECUTE to authenticated, so every real caller (api/_lib/events.js's emitEvent()) keeps working", () => {
    expect(code).toMatch(
      /grant execute on function public\.emit_domain_event\(text, jsonb\) to authenticated/i
    );
  });

  it("does not redefine the function itself — a pure grant-posture fix, same signature and body as 0010", () => {
    expect(code).not.toMatch(/create (or replace )?function/i);
  });

  it("is documented, so a reader knows why the grant looks broader than 'to authenticated only'", () => {
    expect(rawCode).toMatch(/grants EXECUTE on every newly created function to PUBLIC by default/);
  });
});

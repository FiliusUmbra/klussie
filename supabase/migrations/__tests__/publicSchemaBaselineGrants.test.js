// Keeps 0224_public_schema_baseline_grants.sql's own fix from being silently reverted or
// weakened: public schema's own USAGE grant and every table's baseline CRUD grant to
// anon/authenticated had never lived in any migration in this repository -- a Supabase
// project-bootstrap default, established once at project creation, outside this
// repository's own migration history. Found fragile live, 2026-09-14: it does not
// reliably survive a project restart/pause-resume cycle, confirmed via
// has_table_privilege() directly against production twice. This migration makes it
// durable by tracking it in the repo's own replayable chain.
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3) — this checks the grant posture the migration's own text establishes, not live
// behaviour against a real database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0224_public_schema_baseline_grants.sql";

const rawCode = readFileSync(MIGRATION, "utf8");
const code = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0224_public_schema_baseline_grants migration", () => {
  it("grants USAGE on schema public to anon and authenticated", () => {
    expect(code).toMatch(/grant usage on schema public to anon, authenticated/i);
  });

  it("grants full CRUD on every table and sequence in public to anon and authenticated", () => {
    expect(code).toMatch(/grant all on all tables in schema public to anon, authenticated/i);
    expect(code).toMatch(/grant all on all sequences in schema public to anon, authenticated/i);
  });

  it("re-closes 0192's own deliberate exception — audit_log and domain_events never get the blanket grant", () => {
    // The blanket GRANT ALL ON ALL TABLES above runs first; these two REVOKEs must come
    // after it in the same file, or the blanket grant would win and silently reopen the
    // gap 0192 closed.
    const grantIdx = code.indexOf("grant all on all tables in schema public");
    const auditRevokeIdx = code.indexOf("revoke all on public.audit_log from anon, authenticated");
    const eventsRevokeIdx = code.indexOf("revoke all on public.domain_events from anon, authenticated");
    expect(grantIdx).toBeGreaterThan(-1);
    expect(auditRevokeIdx).toBeGreaterThan(grantIdx);
    expect(eventsRevokeIdx).toBeGreaterThan(grantIdx);
  });

  it("does not redefine any function or table — a pure grant-posture fix", () => {
    expect(code).not.toMatch(/create (or replace )?function/i);
    expect(code).not.toMatch(/create table/i);
    expect(code).not.toMatch(/alter table/i);
  });

  it("is documented, so a reader knows this predates any migration and why it's tracked now", () => {
    expect(rawCode).toMatch(/Supabase project-bootstrap default/);
    expect(rawCode).toMatch(/does not reliably survive a restart/);
  });
});

// Keeps 0192_revoke_audit_log_domain_events_client_grants.sql inside the exact shape its
// own header commits to: it revokes anon/authenticated's direct grant on
// public.audit_log/public.domain_events and touches nothing else -- no table, function,
// RLS setting, or other grant. Structural, like every migration test in this repository
// (docs/engineering/TESTING.md §3) -- the actual live ACL is confirmed against real
// staging state in the PR description, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0192_revoke_audit_log_domain_events_client_grants.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .trim();

describe("0192_revoke_audit_log_domain_events_client_grants migration", () => {
  it("revokes all privileges on public.audit_log from anon and authenticated", () => {
    expect(codeNoComments).toMatch(
      /revoke all on public\.audit_log from anon, authenticated;/
    );
  });

  it("revokes all privileges on public.domain_events from anon and authenticated", () => {
    expect(codeNoComments).toMatch(
      /revoke all on public\.domain_events from anon, authenticated;/
    );
  });

  it("touches no other table, role, or grantee", () => {
    const grantLines = codeNoComments
      .split("\n")
      .filter((line) => line.trim().length > 0);
    expect(grantLines).toHaveLength(2);
    for (const line of grantLines) {
      expect(line).toMatch(/^revoke all on public\.(audit_log|domain_events) from anon, authenticated;$/);
    }
  });

  it("never revokes from postgres, service_role, or any klussie_* role -- anon/authenticated only", () => {
    expect(codeNoComments).not.toMatch(/from\s+(?!anon, authenticated;).*postgres/i);
    expect(codeNoComments).not.toMatch(/service_role/);
    expect(codeNoComments).not.toMatch(/klussie_/);
  });

  it("contains no grant, create, drop, or alter statement -- revoke only", () => {
    expect(codeNoComments).not.toMatch(/\bgrant\b/i);
    expect(codeNoComments).not.toMatch(/\bcreate\b|\bdrop\b|\balter\b/i);
  });
});

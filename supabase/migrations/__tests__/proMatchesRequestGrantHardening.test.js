// Keeps 0214_pro_matches_request_grant_hardening.sql's own fix from being silently
// reverted: public.pro_matches_request() (0004/0005/0013) is SECURITY DEFINER and
// bypasses RLS, and — unlike 0028_identity_read_path.sql's own two resolvers — was never
// given an explicit revoke of its default PUBLIC execute grant. This is the same "PUBLIC
// gets EXECUTE by default on a new function" gap 0028/0031 already close elsewhere,
// applied here to the one older function that predates that lesson.
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3) — this checks the grant posture the migration's own text establishes, not live
// behaviour against a real database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0214_pro_matches_request_grant_hardening.sql";

const rawCode = readFileSync(MIGRATION, "utf8");
const code = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0214_pro_matches_request_grant_hardening migration", () => {
  it("revokes the default PUBLIC grant explicitly, by name, from public, anon and service_role", () => {
    // Mirrors 0031_membership_helper.sql's own "revoked explicitly, by name, rather than
    // trusting a default" shape — this codebase's established convention once 0028 found
    // the gap a bare `revoke ... from public` alone can leave open.
    expect(code).toMatch(
      /revoke all on function public\.pro_matches_request\(uuid, uuid\) from public, anon, service_role/i
    );
  });

  it("re-grants EXECUTE to authenticated, so every real pro's own RLS checks keep working", () => {
    // The one real, legitimate need: PostgreSQL still requires the querying role's own
    // EXECUTE privilege to evaluate an RLS policy that calls this function — revoking
    // PUBLIC without this would break every pro's own leads/quotes visibility.
    expect(code).toMatch(
      /grant execute on function public\.pro_matches_request\(uuid, uuid\) to authenticated/i
    );
  });

  it("does not redefine the function itself — a pure grant-posture fix, same signature and body as 0013", () => {
    expect(code).not.toMatch(/create (or replace )?function/i);
  });

  it("is documented, so a reader knows why the grant looks broader than 'to authenticated only'", () => {
    // The revoke list itself (public, anon, service_role) must not silently narrow to
    // exclude a role someone assumes doesn't need mentioning.
    expect(rawCode).toMatch(/grants EXECUTE on every newly created function to PUBLIC by default/);
  });
});

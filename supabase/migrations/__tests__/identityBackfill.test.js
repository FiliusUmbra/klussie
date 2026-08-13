// Keeps 0026_identity_backfill.sql inside ADR-0022 and roadmap §3.
//
// Three properties, each broken by an edit that looks like a simplification:
//
//   · Dropping `where not exists` makes the backfill run-once. §3: "a backfill that can
//     only be run once is a backfill that cannot be trusted."
//   · Using `p.id` as the person reference is one character shorter than calling the
//     minter, and derives the platform's permanent identity from the authentication
//     provider it treats as a replaceable adapter.
//   · Passing `now()` instead of `p.created_at` reads as a tidy-up and throws away the
//     reason ADR-0022 chose a timestamped identifier at all.
//
// Structural. The mapping itself is proven against real rows by
// supabase/diagnostics/VERIFY_IDENTITY_BACKFILL.sql, which builds a population and rolls
// it back — staging has no profiles, so counting there proves nothing.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0026_identity_backfill.sql";

// String literals are stripped as well as line comments, so what is matched is executable
// DDL rather than the prose explaining it — the trap WP 02.01 finding 3 hit.
const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .replace(/'(?:[^']|'')*'/g, "''");

describe("0026_identity_backfill migration", () => {
  it("inserts only profiles that have no identity yet", () => {
    // What makes re-running a no-op, and the reason it is written as `not exists` rather
    // than `on conflict do nothing`: the latter would also swallow a unique violation
    // arising from an unrelated cause, which is a defect worth hearing about.
    expect(code).toMatch(/where not exists \(\s*select 1 from identity\.identities i where i\.auth_user_id = p\.id\s*\)/);
    expect(code).not.toMatch(/on conflict/i);
  });

  it("mints a new person reference rather than reusing the auth user id", () => {
    // ADR-0022 alternative A, rejected: `profiles.id` IS the Supabase Auth user id, and
    // making it the person reference would couple the platform's permanent identity to a
    // provider §11.4 requires to be separable.
    expect(code).toMatch(/platform\.uuid_v7_at\(p\.created_at\)/);

    const insertColumns = code.slice(code.indexOf("insert into identity.identities"), code.indexOf("from public.profiles"));
    expect(
      insertColumns,
      "the person reference is being taken from the profile id rather than minted"
    ).not.toMatch(/^\s*p\.id,\s*p\.id/m);
  });

  it("mints from the row's own creation time, not from now()", () => {
    // The substantive half of ADR-0022. A v7 carries its timestamp in the leading 48
    // bits, so passing created_at makes a backfilled reference sort where it would have
    // sorted had it been generated when the profile was created.
    expect(code).not.toMatch(/uuid_v7_at\(now\(\)\)/);
  });

  it("preserves the profile's creation time on the identity", () => {
    // The identity's age is the person's real age on the platform, not the moment a
    // migration happened to run.
    expect(code).toMatch(/p\.created_at,\s*\n\s*now\(\)/);
  });

  it("carries contact details across from the separate table", () => {
    // §11.4 makes the identity row "the only identity-scoped aggregate that holds personal
    // data", and §8 counts contact channels among its attributes. A left join, because a
    // profile without contact details is ordinary rather than a reason to skip it.
    expect(code).toMatch(/left join public\.profile_contacts/i);
    expect(code).not.toMatch(/\binner join public\.profile_contacts/i);
  });

  it("keeps the minter unreachable by any application role", () => {
    // The grant is what keeps §3 a rule rather than advice: PostgreSQL grants EXECUTE on a
    // new function to PUBLIC, and leaving it there would let any engine mint identifiers
    // in the database.
    expect(code).toMatch(/revoke all on function platform\.uuid_v7_at\(timestamptz\) from public/i);
    expect(code).not.toMatch(/grant execute[^;]*uuid_v7_at/is);
  });

  it("gives the minter no no-argument form", () => {
    // A runtime caller would have to write uuid_v7_at(now()), which reads as the mistake
    // it would be. An overload taking nothing would read as an invitation.
    const definitions = [...code.matchAll(/create or replace function platform\.uuid_v7_at\(([^)]*)\)/gi)];
    expect(definitions).toHaveLength(1);
    expect(definitions[0][1].trim()).not.toBe("");
  });

  it("writes nothing to public", () => {
    // Step 2 of §3: the new structure is populated, the old one is untouched and still
    // authoritative.
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+public\./i);
    expect(code).not.toMatch(/\balter table public\b/i);
  });
});

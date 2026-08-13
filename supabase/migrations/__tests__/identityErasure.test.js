// Keeps 0029_identity_erasure.sql from becoming a deletion.
//
// Erasure is the one operation in this codebase where the obvious implementation is
// catastrophic. `public.profiles` is the parent of nine `on delete cascade` foreign keys,
// so `delete from public.profiles where id = ...` — which reads like exactly what erasure
// should do — takes the person's requests, reviews, household items, conversations **and
// both sides of every message they were part of**, including the other party's.
//
// It is also irreversible, unlike every other defect this repository's tests guard
// against. So the assertions here are blunt: nothing is deleted, all three tables holding
// personal data are reached, and nobody can call it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0029_identity_erasure.sql";

const raw = readFileSync(MIGRATION, "utf8");
const code = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .replace(/'(?:[^']|'')*'/g, "''");

describe("0029_identity_erasure migration", () => {
  it("deletes nothing", () => {
    // The assertion this whole file exists for.
    expect(code, "erasure must redact, never delete").not.toMatch(/\bdelete\s+from\b/i);
    expect(code).not.toMatch(/\btruncate\b/i);
  });

  it("redacts every table that holds a person's attributes", () => {
    // Redacting only the identity row would leave the name in `public.profiles` and the
    // email in `public.profile_contacts`, both of which survive this epic under ADR-0023.
    // That would make the operation a statement rather than an erasure.
    for (const table of ["identity.identities", "public.profiles", "public.profile_contacts"]) {
      expect(code, `${table} is not redacted`).toMatch(
        new RegExp(`update\\s+${table.replace(".", "\\.")}`, "i")
      );
    }
  });

  it("marks the identity erased before touching the profile", () => {
    // Ordering is load-bearing. Redacting the profile fires WP 02.04's mirror, which
    // copies profile attributes onto the identity row `where erased_at is null`. Marking
    // the identity erased first is what makes the mirror skip it.
    expect(code.indexOf("update identity.identities")).toBeLessThan(
      code.indexOf("update public.profiles")
    );
    expect(code).toMatch(/erased_at = now\(\)/);
  });

  it("leaves the person reference intact", () => {
    // §11.4: the reference "remains valid as a key and resolves to nothing". A redaction
    // that also cleared person_ref would break every durable record pointing at it.
    // The SET clause only — the WHERE clause names person_ref legitimately, which is how
    // the row is found.
    const redaction = code.slice(
      code.indexOf("update identity.identities"),
      code.indexOf("update public.profiles")
    );
    const assignments = redaction.slice(redaction.indexOf("set "), redaction.indexOf("where "));
    expect(assignments, "erasure must not change the person reference").not.toMatch(/person_ref/);
    expect(assignments).toMatch(/full_name = null/);
  });

  it("audits the erasure without recording the person", () => {
    // §33 requires an audit record for every erasure. Writing the erased name into it
    // would put back, in a permanent append-only table, exactly what was just removed.
    expect(code).toMatch(/insert into platform\.audit_records/i);

    const audit = code.slice(code.indexOf("insert into platform.audit_records"));
    for (const column of ["full_name", "avatar_url", "email", "phone"]) {
      expect(audit, `the audit record captures ${column}`).not.toContain(column);
    }
  });

  it("is idempotent and refuses to be unattributable", () => {
    // Erasure is requested under stress and retried by systems under load. And an erasure
    // nobody is accountable for cannot be audited, which §33 requires.
    expect(code).toMatch(/if v_already_erased then\s*\n\s*return false;/);
    expect(code).toMatch(/p_actor_ref is null or length\(trim\(p_actor_ref\)\) = 0/);
    expect(code).toMatch(/p_authority is null or length\(trim\(p_authority\)\) = 0/);
  });

  it("is executable by nobody", () => {
    // Erasure is not exposed to users and has no request flow yet. The revoke names every
    // role explicitly rather than relying on `from public`, which WP 02.06 proved is not
    // enough on Supabase.
    expect(code).toMatch(/revoke all on function identity\.erase_person/i);
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(
        code.slice(code.indexOf("revoke all on function identity.erase_person")),
        `${role} is not revoked`
      ).toContain(role);
    }
    expect(code).not.toMatch(/grant execute[^;]*erase_person/is);
  });

  it("runs as security definer with an empty search path", () => {
    expect(code).toMatch(/security definer/i);
    expect(code).toMatch(/set search_path = ''/);
  });
});

// Keeps 0023_emit_event.sql inside the guarantees it exists to provide.
//
// Two of these pin things that are invisible when they break.
//
// The advisory lock is the first: remove it and every test still passes, every event still
// gets a sequence, and nothing looks wrong until two concurrent writes to one subject take
// the same number. ADR-0019 is explicit that no database constraint can catch that here,
// because a unique constraint on a partitioned table must include every partition key
// column. The lock is the whole mechanism, and it reads like a line someone could tidy away.
//
// The absent defaults are the second: giving p_event_id or p_correlation_id a default
// would look like ergonomics and would quietly start a new trace whenever a caller forgot
// one — a hole that is invisible until someone needs the trace.
//
// Structural. Behaviour is proven by supabase/diagnostics/VERIFY_EMISSION.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0023_emit_event.sql";

const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0023_emit_event migration", () => {
  it("serialises per subject with a transaction-scoped advisory lock", () => {
    // Gaplessness is derived, not constrained. Without this, read-then-insert is a race
    // that produces duplicate sequences no constraint will reject.
    expect(
      code,
      "the per-subject advisory lock is gone — subject_sequence is no longer gapless " +
        "and nothing in the database will notice"
    ).toMatch(/pg_advisory_xact_lock/);

    // Transaction-scoped specifically: a session lock would need an unlock path, and the
    // path that matters is the one taken when the transaction rolls back.
    expect(code).not.toMatch(/pg_advisory_lock\b/);
  });

  it("derives the sequence rather than accepting one", () => {
    expect(code).toMatch(/max\(subject_sequence\), 0\) \+ 1/);
    expect(code).not.toMatch(/p_subject_sequence/);
  });

  it("requires an event id and a correlation id, with no default for either", () => {
    // "Propagated, never regenerated" (SYSTEM_ARCHITECTURE.md §5), and identifiers are
    // application-generated (§3). A default on either is the plausible-looking change.
    expect(code).toMatch(/p_event_id\s+uuid,/);
    expect(code).toMatch(/p_correlation_id\s+uuid,/);
    expect(code).not.toMatch(/p_event_id\s+uuid\s+default/i);
    expect(code).not.toMatch(/p_correlation_id\s+uuid\s+default/i);
  });

  it("runs as security definer with an empty search path", () => {
    // SECURITY DEFINER is what lets an engine emit without holding write access to another
    // engine's schema (§9) — the backbone is reached through its contract, not around it.
    // An empty search_path is what stops that privilege being reachable through a
    // shadowed object name.
    expect(code).toMatch(/security definer/i);
    expect(code).toMatch(/set search_path = ''/);
  });

  it("takes EXECUTE away from PUBLIC before granting it to anyone", () => {
    // PostgreSQL grants EXECUTE on a new function to PUBLIC. On a SECURITY DEFINER
    // function that writes an append-only table, that default hands the security model to
    // anyone with a connection.
    const revokeAt = code.indexOf("revoke all on function platform.emit_event");
    const grantAt = code.indexOf("grant execute on function platform.emit_event");
    expect(revokeAt, "the revoke from PUBLIC is missing").toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt);
  });

  it("grants execution to the seven engine roles and to no client-facing role", () => {
    const granted = [...code.matchAll(/'(klussie_[a-z_]+)'/g)].map((m) => m[1]);
    expect(granted.filter((r) => r.startsWith("klussie_engine_"))).toHaveLength(7);
    // Consumers are absent deliberately: a consumer emitting a derived event is a real
    // case (ADR-0019) but none exists, and ROLES.md §3 rule 1 grants on a real caller.
    expect(granted.some((r) => r.startsWith("klussie_consumer_"))).toBe(false);

    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(code).not.toMatch(new RegExp(`grant execute[^;]*\\b${role}\\b`, "is"));
    }
  });

  it("leaves the legacy event path alone", () => {
    // ADR-0019 rules out reusing ADR-0004's signature, and public.domain_events is the
    // product's live event bus with five triggers behind it.
    expect(code).not.toMatch(/emit_domain_event/);
    expect(code).not.toMatch(/domain_events/);
  });
});

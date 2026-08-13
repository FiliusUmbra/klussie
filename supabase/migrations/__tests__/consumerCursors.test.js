// Keeps 0024_consumer_cursors.sql inside §13's contract and ADR-0020's modulus.
//
// These two tables are the first mutable ones in `platform`, and that is exactly what makes
// them worth pinning. Every other table in this schema is append-only, so the reflex a
// future migration author brings to this schema — add the guard trigger, withhold UPDATE —
// is the wrong one here, and applying it would break a consumer silently: the cursor would
// stop advancing and the consumer would look healthy while reprocessing its first batch
// forever.
//
// Structural. Behaviour is proven by supabase/diagnostics/VERIFY_CONSUMERS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0024_consumer_cursors.sql";
const PARTITION_ADR = "docs/adr/0020-events-partitioning-parameters.md";

const code = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0024_consumer_cursors migration", () => {
  it("grants UPDATE, which no other table in this schema has", () => {
    // docs/operations/ROLES.md §3 rule 2: a mutable table opts in explicitly, because
    // 0019's default privileges grant only SELECT and INSERT. Without this the cursor
    // cannot advance.
    expect(code).toMatch(/grant select, insert, update on platform\.consumer_cursors/i);
    expect(code).toMatch(/grant select, insert, update on platform\.consumer_quarantine/i);
  });

  it("grants DELETE to nobody", () => {
    // A deleted cursor silently restarts a consumer from the beginning of a partition.
    // At-least-once delivery makes that survivable, which is precisely why nobody would
    // notice it had happened.
    expect(code).not.toMatch(/grant[^;]*\bdelete\b/is);
  });

  it("adds no append-only guard to either table", () => {
    // The reflex this schema teaches, applied where it does not belong.
    expect(code).not.toMatch(/create trigger/i);
    expect(code).not.toMatch(/reject_mutation/i);
  });

  it("bounds partition_index by ADR-0020's modulus", () => {
    // A cursor for a partition that does not exist reads nothing forever and looks
    // healthy, so the two numbers have to be checked against each other rather than
    // trusted to have been kept in step by hand.
    const declared = readFileSync(PARTITION_ADR, "utf8").match(/modulus (\d+)/);
    expect(declared, `${PARTITION_ADR} no longer states a modulus`).not.toBeNull();

    const highest = Number(declared[1]) - 1;
    expect(code).toMatch(new RegExp(`partition_index between 0 and ${highest}`));
  });

  it("keeps a cursor position whole", () => {
    // Half a position cannot express "everything after this point" when two events share a
    // timestamp — which every event emitted in one transaction does.
    expect(code).toMatch(/\(last_occurred_at is null\) = \(last_event_id is null\)/);
  });

  it("keys the quarantine by consumer and event", () => {
    // One event poisoning two consumers is two independent problems; one event poisoning
    // one consumer twice is one problem with two attempts. The key says both, and it is
    // what makes the runner's re-quarantine an upsert rather than a duplicate.
    expect(code).toMatch(/primary key \(consumer_name, event_id\)/i);
    expect(code).toMatch(/attempts\s+integer\s+not null default 1/i);
  });

  it("keeps a resolved_at so the quarantine is an alert, not a skip", () => {
    // §13: "the quarantine is an operational alert rather than a silent skip." Without a
    // way to distinguish open from handled, nothing can ask what is currently broken.
    expect(code).toMatch(/resolved_at\s+timestamptz/i);
    expect(code).toMatch(/where resolved_at is null/i);
  });

  it("enables RLS on both and defines no policy", () => {
    // Background-work tables: no client role reaches them, so the absent policy is the
    // deny (§24 item 5).
    expect(code).toMatch(/alter table platform\.consumer_cursors enable row level security/i);
    expect(code).toMatch(/alter table platform\.consumer_quarantine enable row level security/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("grants the client-facing roles nothing", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(code).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is"));
    }
  });

  it("creates everything guardedly, so the migration is re-runnable", () => {
    expect(code).toMatch(/create table if not exists platform\.consumer_cursors/);
    expect(code).toMatch(/create table if not exists platform\.consumer_quarantine/);
    expect(code).toMatch(/create index if not exists/);
  });
});

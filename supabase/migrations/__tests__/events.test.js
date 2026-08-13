// Keeps 0021_events.sql tied to ADR-0019's envelope and ADR-0020's partitioning.
//
// This table is designed never to be rewritten, and that is the whole reason these tests
// exist. A missing envelope column found here costs a drop-and-recreate; found after the
// first event is written, it costs rewriting every partition of a billion-row table.
// ADR-0019 was raised as a P0 before Epic 01 for exactly that reason.
//
// So the envelope is read out of the ADR rather than restated, in both directions: a
// column added to the migration without the ADR fails, and a field added to the ADR
// without the migration fails too. The second direction is the one a copied list would
// miss.
//
// Structural, like the other migration tests. What the table actually does — routing,
// append-only, refusal of malformed rows — is proven by
// supabase/diagnostics/VERIFY_EVENTS.sql against a real database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ENVELOPE_ADR = "docs/adr/0019-canonical-platform-event-envelope.md";
const PARTITION_ADR = "docs/adr/0020-events-partitioning-parameters.md";
const MIGRATION = "supabase/migrations/0021_events.sql";

const sql = readFileSync(MIGRATION, "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

// ADR-0019's field table, bounded by its own headings so a backticked identifier in the
// surrounding prose cannot be mistaken for a field.
function envelopeFields() {
  const adr = readFileSync(ENVELOPE_ADR, "utf8");
  const section = adr.slice(
    adr.indexOf("### The fields"),
    adr.indexOf("### Additive versions and semantic types")
  );
  return [...section.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)].map((m) => m[1]);
}

// The column list of `create table platform.events`, up to the first constraint.
function tableColumns() {
  const body = code.slice(
    code.indexOf("create table if not exists platform.events"),
    code.indexOf("constraint events_pkey")
  );
  return [...body.matchAll(/^\s{2}([a-z_]+)\s{2,}/gm)].map((m) => m[1]);
}

describe("0021_events migration", () => {
  const envelope = envelopeFields();
  const columns = tableColumns();

  it("reads thirteen envelope fields out of ADR-0019", () => {
    // Guards the parse. Two empty lists compare equal, and a suite that checked nothing
    // while passing would be worse here than one that failed.
    expect(envelope).toHaveLength(13);
  });

  it("carries every envelope field, and nothing beyond it but the payload", () => {
    const missing = envelope.filter((f) => !columns.includes(f));
    const extra = columns.filter((c) => !envelope.includes(c) && c !== "payload");

    expect(
      { missing, extra },
      `${MIGRATION} and ${ENVELOPE_ADR} disagree. The envelope is a decade-long ` +
        `contract on a table designed never to be rewritten — adding a column later ` +
        `means rewriting every partition. Reconcile, or supersede the ADR first.`
    ).toEqual({ missing: [], extra: [] });
  });

  it("makes tenancy, time, identity and derivation non-nullable", () => {
    // DATABASE_ARCHITECTURE.md §23: there are no workspace-less domain events —
    // platform-scoped actions are audit records. A nullable workspace_id would destroy
    // that quietly, and tenancy that is only usually present is not tenancy.
    for (const field of ["workspace_id", "occurred_at", "event_id", "is_derived"]) {
      expect(code, `${field} must be NOT NULL`).toMatch(
        new RegExp(`^\\s{2}${field}\\s+[a-z0-9_. ]+not null`, "im")
      );
    }
  });

  it("partitions by the parameters ADR-0020 fixed", () => {
    const declared = readFileSync(PARTITION_ADR, "utf8").match(/modulus (\d+)/);
    expect(declared, `${PARTITION_ADR} no longer states a modulus`).not.toBeNull();

    const modulus = Number(declared[1]);
    expect(code).toMatch(/partition by hash \(workspace_id\)/);
    expect(code).toMatch(/partition by range \(occurred_at\)/);
    expect(code).toMatch(new RegExp(`modulus ${modulus}, remainder`));
    // The loop bound and the modulus are two places one number lives; they must agree or
    // the hash space is not covered and inserts fail for some workspaces.
    expect(code).toMatch(new RegExp(`for h in 0\\.\\.${modulus - 1} loop`));
  });

  it("declares no foreign key", () => {
    // Three separate reasons converge on the same answer: no durable record may key to
    // identity (§11.4), the workspace table does not exist until Epic 03, and an event is
    // a historical fact that must outlive whatever it refers to.
    expect(code).not.toMatch(/\breferences\b/i);
    expect(code).not.toMatch(/\bforeign key\b/i);
  });

  it("enforces append-only with both a trigger and withheld privileges", () => {
    // §4 and §24 item 7 require both, because they fail differently: privileges stop an
    // application role, the trigger stops everything else — including a superuser doing
    // maintenance at speed.
    expect(code).toMatch(/before update or delete on platform\.events/i);
    expect(code).toMatch(/revoke update, delete on platform\.events/i);
    expect(code).not.toMatch(/grant[^;]*\b(update|delete)\b[^;]*platform\.events/is);
  });

  it("enables row level security and defines no policy", () => {
    // §24 item 5 enables RLS on every table without exception; §12 says this one is not
    // client-readable. RLS on with no policy is how those two combine — the absence of a
    // policy is the deny, not an oversight.
    expect(code).toMatch(/alter table platform\.events enable row level security/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("grants the client-facing roles nothing", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(
        code,
        `${MIGRATION} grants something on the event stream to ${role}.`
      ).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is"));
    }
  });

  it("creates everything guardedly, so the migration is re-runnable", () => {
    expect(code).toMatch(/create table if not exists platform\.events/);
    expect(code).toMatch(/create index if not exists/);
    // The enum and the partitions have no `if not exists` form and depend on catalogue
    // guards; the trigger is dropped before it is created.
    expect(code).toMatch(/if not exists \(\s*select 1 from pg_type/i);
    expect(code).toMatch(/drop trigger if exists events_append_only/i);
  });
});

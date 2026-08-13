// Keeps 0022_audit.sql tied to ADR-0021 and to the two rules the frozen documents state
// most bluntly about audit.
//
// The first is §8's: "writable by no application role at all. Audit rows arrive through a
// privileged path, and the inability of any user-facing role to write them is what makes
// the trail worth having." That property is one `grant` away from being untrue, and the
// grant that would do it is the ordinary-looking kind — 0019's default privileges already
// hand the owning engine INSERT on everything created in `platform`, so 0022 has to take
// it back. A future migration that re-grants it would look like housekeeping.
//
// The second is ADR-0021's: workspace_id is nullable, and null means platform scope and
// nothing else. Both directions are worth pinning — making it NOT NULL leaves
// platform-scoped actions with nowhere to go, and DATABASE_ARCHITECTURE.md §23 sent them
// here deliberately.
//
// Structural. Behaviour is proven by supabase/diagnostics/VERIFY_AUDIT.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ADR = "docs/adr/0021-one-audit-table-with-nullable-workspace.md";
const MIGRATION = "supabase/migrations/0022_audit.sql";

const sql = readFileSync(MIGRATION, "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

// ADR-0021's column table. Only the first cell of each row — the "why" column is full of
// backticked identifiers that are prose, not columns.
function adrColumns() {
  const adr = readFileSync(ADR, "utf8");
  const section = adr.slice(
    adr.indexOf("| Column | Why it is here |"),
    adr.indexOf("**Null is the platform scope")
  );
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .flatMap((line) => {
      const firstCell = line.split("|")[1] ?? "";
      return [...firstCell.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    });
}

function tableColumns() {
  const body = code.slice(
    code.indexOf("create table if not exists platform.audit_records"),
    code.indexOf("constraint audit_records_pkey")
  );
  return [...body.matchAll(/^\s{2}([a-z_]+)\s{2,}/gm)].map((m) => m[1]);
}

describe("0022_audit migration", () => {
  const declared = adrColumns();
  const columns = tableColumns();

  it("reads twelve columns out of ADR-0021", () => {
    expect(declared).toHaveLength(12);
  });

  it("carries exactly the columns the ADR declares", () => {
    const missing = declared.filter((c) => !columns.includes(c));
    const extra = columns.filter((c) => !declared.includes(c));

    expect(
      { missing, extra },
      `${MIGRATION} and ${ADR} disagree about the audit record's shape.`
    ).toEqual({ missing: [], extra: [] });
  });

  it("leaves workspace_id nullable and everything identifying not null", () => {
    // The nullable one is the decision; the rest being NOT NULL is what keeps null
    // meaning "platform scope" rather than "we did not record it".
    expect(code).toMatch(/^\s{2}workspace_id\s+uuid,\s*$/m);

    for (const column of ["audit_id", "occurred_at", "actor_type", "actor_ref", "action", "outcome"]) {
      expect(code, `${column} must be NOT NULL`).toMatch(
        new RegExp(`^\\s{2}${column}\\s+[a-z0-9_. ]+not null`, "im")
      );
    }
  });

  it("range-partitions by time and by nothing else", () => {
    // §19 gives audit range-by-time only. Hash-partitioning by a nullable workspace would
    // gather every platform-scoped record into one partition.
    expect(code).toMatch(/partition by range \(occurred_at\)/);
    expect(code).not.toMatch(/partition by hash/);
  });

  it("grants no role the ability to write, and takes back the engine's insert", () => {
    // The line that makes §8 true. Without it, 0019's default privileges leave the owning
    // engine able to write its own audit trail.
    expect(code).toMatch(
      /revoke insert, update, delete on platform\.audit_records from klussie_engine_platform/i
    );
    expect(code).not.toMatch(/grant[^;]*\binsert\b[^;]*audit_records/is);
    expect(code).not.toMatch(/grant[^;]*\b(update|delete)\b[^;]*audit_records/is);
  });

  it("guards immutability with a trigger as well", () => {
    // §24 item 7 wants both. On this table the trigger is the half that matters most: an
    // audit trail the operator can quietly edit is not a trail, and the operator is the
    // role with the most reason to want to.
    expect(code).toMatch(/before update or delete on platform\.audit_records/i);
  });

  it("enables RLS and gives the operator a read policy", () => {
    // Deliberately unlike platform.events, which has RLS and no policy because §12 makes
    // it unreadable by anyone. §8 makes audit readable by administrators and the
    // operator, so here the absence of a policy would be a defect rather than the deny.
    expect(code).toMatch(/alter table platform\.audit_records enable row level security/i);
    expect(code).toMatch(/create policy audit_records_operator_read/i);
    expect(code).toMatch(/to klussie_operator/i);
  });

  it("grants the client-facing roles nothing", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(code).not.toMatch(
        new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is")
      );
    }
  });

  it("reuses the event stream's actor enum rather than declaring a second one", () => {
    // §33 requires intelligence actions "marked as machine-originated", and
    // actor_type = 'intelligence' IS that marking. A separate enum, or a separate boolean,
    // would be two places to get one fact right.
    expect(code).toMatch(/actor_type\s+platform\.actor_type\s+not null/i);
    expect(code).not.toMatch(/create type platform\.actor_type/i);
  });

  it("declares no foreign key", () => {
    // §5: "Audit → anything: audit must survive the deletion of what it describes; that is
    // the point of audit."
    expect(code).not.toMatch(/\breferences\b/i);
    expect(code).not.toMatch(/\bforeign key\b/i);
  });

  it("creates everything guardedly, so the migration is re-runnable", () => {
    expect(code).toMatch(/create table if not exists platform\.audit_records/);
    expect(code).toMatch(/create index if not exists/);
    expect(code).toMatch(/if not exists \(\s*select 1 from pg_type/i);
    expect(code).toMatch(/drop trigger if exists audit_records_append_only/i);
    expect(code).toMatch(/drop policy if exists audit_records_operator_read/i);
  });
});

# Epic 01 — Schema Foundation & Event Backbone

**Status.** All 7 packages done — epic not yet closed (see below)
**Purpose.** Create the ten schemas and the event outbox, so every later
epic has somewhere correct to put things and a way to emit facts.
**Definition.** [`docs/IMPLEMENTATION_ROADMAP.md`](../../docs/IMPLEMENTATION_ROADMAP.md) §10
**Work packages.** [`docs/IMPLEMENTATION_ROADMAP.md`](../../docs/IMPLEMENTATION_ROADMAP.md) §12

---

## Blocked until

- **Epic 00 complete** — in particular WP 00.06 (staging) and WP 00.01
  (CI). **No migration in this epic runs before staging exists.**
  **Cleared 2026-08-12** — Epic 00 closed; staging holds all 17
  migrations applied from empty.

## Work packages

| WP | Title | Complexity | Status |
|---|---|---|---|
| 01.01 | [Create the ten schemas with no tables](wp-01.01-ten-schemas.md) | Low | **Done** |
| 01.02 | [Establish role grants mirroring engine ownership](wp-01.02-role-grants.md) | Medium | **Done** |
| 01.03 | [Install extensions in a dedicated schema](wp-01.03-extensions.md) | Low | **Done** |
| 01.04 | [Create the partitioned events table](wp-01.04-events-table.md) | **High** | **Done** — [ADR-0020](../../docs/adr/0020-events-partitioning-parameters.md) needs sign-off |
| 01.05 | [Create the partitioned audit table](wp-01.05-audit-table.md) | Medium | **Done** — [ADR-0021](../../docs/adr/0021-one-audit-table-with-nullable-workspace.md) needs sign-off |
| 01.06 | [Add the transactional event emission helper](wp-01.06-emission-helper.md) | Medium | **Done** |
| 01.07 | [Add cursor-based consumer scaffolding](wp-01.07-consumer-scaffolding.md) | **High** | **Done** |

## Architecture this epic must satisfy

Read these sections before starting — not the whole documents:

- `SUPABASE_ARCHITECTURE.md` §2 schemas · §9 grants · §12 event storage ·
  §19 partitioning
- `DATABASE_ARCHITECTURE.md` §23 event-first, not event-sourced
- `SYSTEM_ARCHITECTURE.md` §5 the event backbone

## Acceptance

- [x] Ten schemas exist with grants enforcing engine ownership —
      `VERIFY_GRANTS.sql` checks 2 and 4
- [x] Events table partitioned (hash by workspace, range by time) and
      append-only — update and delete fail for every application role —
      `VERIFY_EVENTS.sql` checks 2, 3, 4
- [x] An event emitted in a rolled-back transaction does not exist —
      `VERIFY_EMISSION.sql` check 1
- [x] A consumer can be stopped, restarted, and resumes without gap or
      duplicated effect — `runner.test.js`, four assertions
- [x] Existing `domain_events` continues to work, untouched —
      `VERIFY_EMISSION.sql` check 5

**Verified on staging, not asserted.** Five diagnostics under
`supabase/diagnostics/` cover the SQL half; each was probed to prove it
can fail before being trusted:

```bash
for f in GRANTS EXTENSIONS EVENTS AUDIT EMISSION CONSUMERS; do psql -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_$f.sql; done
```

## Notes

**This epic is entirely additive.** Nothing reads or writes the new
structures; the application is unaffected throughout. Every package rolls
back by dropping what it created.

**The existing `domain_events` table is not touched.** It keeps working
until the engines that supersede it exist. Removing it early would break
working behaviour for no benefit.

**01.04 is the highest-risk package.** Partitioning is a decision that is
painful to change once the table is large — hash by workspace, then range
by time, per `SUPABASE_ARCHITECTURE.md` §12. Ten million physical
partitions is not possible; the workspace is the *logical* boundary.

## Open, raised during the epic

**Two ADRs are `Proposed` and need sign-off before the tables they govern
carry data** — [0020](../../docs/adr/0020-events-partitioning-parameters.md)
(events partitioning) and
[0021](../../docs/adr/0021-one-audit-table-with-nullable-workspace.md)
(one audit table). Both are implemented against empty tables, where
changing them is a drop and a re-run. That window closes at the first
written row, which is not in this epic.

**No application code can reach the `platform` schema, deliberately.**
PostgREST does not expose it and must not — `SUPABASE_ARCHITECTURE.md`
§12 makes the events table not client-readable, so exposing the schema to
reach `emit_event` or a cursor would expose the stream too. Engines call
`platform.emit_event()` SQL-side; a real consumer needs a **direct
Postgres connection**, which this repository does not have (no `pg`
dependency). That is a tooling decision for the epic that runs the first
consumer. Raised in [WP 01.06](wp-01.06-emission-helper.md) finding 1 and
[WP 01.07](wp-01.07-consumer-scaffolding.md) finding 1.

**Two migrations were added that the roadmap's file lists do not
mention** — `0023_emit_event.sql` and `0024_consumer_cursors.sql`. Both
were necessary: a transactional emission helper cannot be JavaScript, and
a cursor that is not durable is not a cursor. Stated rather than buried.

**The audit write path is unallocated.** This epic's definition lists it
under Backend — *"Event emission helper … Cursor-based consumer
scaffolding. Audit write path."* — but 01.06 is the first and 01.07 the
second, and **no package builds the third**. After 01.05, no role can
write an audit record at all, which is correct per
`SUPABASE_ARCHITECTURE.md` §8 and leaves the trail unwritable. Nothing
needs it yet. Raised in
[WP 01.05](wp-01.05-audit-table.md) finding 1; a WP 01.08 or a fold into
01.06 are the two obvious answers, and neither is decided here.

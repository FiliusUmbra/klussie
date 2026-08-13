# Epic 01 — Schema Foundation & Event Backbone

**Status.** In progress — 6 of 7 packages
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
| 01.07 | Add cursor-based consumer scaffolding | **High** | Not started |

## Architecture this epic must satisfy

Read these sections before starting — not the whole documents:

- `SUPABASE_ARCHITECTURE.md` §2 schemas · §9 grants · §12 event storage ·
  §19 partitioning
- `DATABASE_ARCHITECTURE.md` §23 event-first, not event-sourced
- `SYSTEM_ARCHITECTURE.md` §5 the event backbone

## Acceptance

- [ ] Ten schemas exist with grants enforcing engine ownership
- [ ] Events table partitioned (hash by workspace, range by time) and
      append-only — update and delete fail for every application role
- [ ] An event emitted in a rolled-back transaction does not exist
- [ ] A consumer can be stopped, restarted, and resumes without gap or
      duplicated effect
- [ ] Existing `domain_events` continues to work, untouched

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

**The audit write path is unallocated.** This epic's definition lists it
under Backend — *"Event emission helper … Cursor-based consumer
scaffolding. Audit write path."* — but 01.06 is the first and 01.07 the
second, and **no package builds the third**. After 01.05, no role can
write an audit record at all, which is correct per
`SUPABASE_ARCHITECTURE.md` §8 and leaves the trail unwritable. Nothing
needs it yet. Raised in
[WP 01.05](wp-01.05-audit-table.md) finding 1; a WP 01.08 or a fold into
01.06 are the two obvious answers, and neither is decided here.

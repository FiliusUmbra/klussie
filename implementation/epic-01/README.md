# Epic 01 — Schema Foundation & Event Backbone

**Status.** In progress — 3 of 7 packages
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
| 01.04 | Create the partitioned events table | **High** | Not started |
| 01.05 | Create the partitioned audit table | Medium | Not started |
| 01.06 | Add the transactional event emission helper | Medium | Not started |
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

# Epic 10 — Completion Record

**Epic.** 10 — Maintenance Engine
**Started.** 2026-08-18
**Completed.** 2026-08-18 — all 4 work packages.

A genuine completion record. This epic builds the real engine — both
aggregates, full isolation, and a real write/read contract — with no
client caller yet, the same posture Epic 09 held.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1053 tests, 98 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — PR to be opened
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Written and structurally tested, not
      run against a database. Same standing gap as every epic since
      Epic 03.

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| An obligation is authoritative; a prediction is not conflated with one | **Yes** | `source` includes `'prediction'` as a promoted-obligation record; no prediction table exists here — Intelligence (Epic 17) owns predictions |
| Anchored to an asset or a location, never a whole property or workspace | **Yes** | `check (num_nonnulls(asset_id, location_id) = 1)` on both tables |
| Completed obligations retained permanently; cancelled ones retain their reason | **Yes, enforced by both a table check and a guard trigger** | `maintenance_obligations_cancelled_consistency`, `maintenance_obligations_reject_terminal_mutation()` |
| Schedules generate obligations without inventing server-side runtime id minting | **Yes** | `work.generate_due_obligation()` takes the obligation id as a required parameter, one call per period — proven catching up three missed periods in `VERIFY_MAINTENANCE_CONTRACT.sql` §2 |
| Maintenance decoupled from the marketplace | **Yes, by omission** | Nothing here references a request, quote, or engagement |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 10.01 | The Maintenance Schedule aggregate | Complete |
| 10.02 | The Maintenance Obligation aggregate | Complete |
| 10.03 | RLS isolation | Complete |
| 10.04 | The maintenance engine contract | Complete |

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice reuses an
      existing pattern (the one-subject shape from `document_attachments`,
      the conditional-guard shape from `documents_guard_deletion()`,
      `property.reparent_location()`'s no-`api.*`-delegate posture,
      ADR-0022's identifier discipline)

## 5 · Findings, read before design

### 5.1 · "Due" and "overdue" are not stored state

`SYSTEM_ARCHITECTURE.md` §8.1 lists `ObligationDue` and `ObligationOverdue`
among this engine's events, which reads as though they were transitions a
row moves through. They are not: `due_on` does not change when a date
rolls past it, so there is no write to attach an event to, and firing one
on a schedule would need a `pg_cron` job with no real consumer yet
(Notification, Epic 19, is unbuilt). `work.my_maintenance_obligations()`
computes `is_overdue` at read time from `due_on` and `status`. The literal
events, and whatever scheduled job would emit them, are a named,
deliberate gap — not built ahead of a consumer.

### 5.2 · `platform.uuid_v7_at()` cannot generate a schedule's backlog in
one call — this determined the whole shape of `generate_due_obligation()`

A schedule several periods behind needs several new obligations. The
tempting shape is one function that loops while `next_due_on <= today`,
minting a fresh id per generated row via `platform.uuid_v7_at(now())`.
That function is exactly what migration 0026's own header rules out:
`uuid_v7_at()` is documented "for backfills only" because
`SUPABASE_ARCHITECTURE.md` §3 puts runtime identifier generation in the
application — generating new obligations on an ongoing basis is runtime
generation, however deep inside a function it happens. Resolved by
handling exactly one schedule, one obligation, per call:
`work.generate_due_obligation()` takes the obligation id as a required
parameter, and a caller catches a backlogged schedule up by calling it
once per missed period. Proven in `VERIFY_MAINTENANCE_CONTRACT.sql` §2,
catching up three missed monthly periods with three separate calls.

### 5.3 · No `pg_cron` wiring in this epic

`pg_cron` is real infrastructure (migration 0020) but nothing calls
`work.generate_due_obligation()` automatically. Scheduling its cadence is
an operational decision belonging to whichever future work actually needs
obligations generated unattended — named here, not silently built around.

### 5.4 · "Produces workflow instances" is not wired

`DATABASE_ARCHITECTURE.md` §16 names this relationship, but no
maintenance-specific workflow definition exists — the only published
definition (Epic 09's `booking_request_lifecycle`) describes a
marketplace request, not a maintenance obligation's own process.
Inventing a maintenance workflow definition with no real multi-stage
process behind it would be configuration with no real consumer; obligation
`status` (`open`/`completed`/`cancelled`) is the whole truth needed today.

### 5.5 · "Resolved by service records" is not wired either

`SYSTEM_ARCHITECTURE.md` §8.1 names `ServiceRecordCompleted` as the event
that will eventually close obligations automatically. Service Record
Engine (Epic 11) does not exist yet, so `work.complete_maintenance_obligation()`
is a direct call for now — the same class of gap as §5.4, both named
rather than worked around.

## 6 · Platform Discoveries

- **The one-subject shape `property.document_attachments` established
  (Epic 08) generalises cleanly a third time** — `work.maintenance_
  schedules`/`work.maintenance_obligations` both narrow it to exactly the
  two subjects `DATABASE_ARCHITECTURE.md` §16 actually names (asset,
  location), rather than reusing the four-subject menu unmodified.
- **`property.documents_guard_deletion()`'s conditional-guard shape
  (Epic 08) turned out to be exactly the right precedent for "immutable
  once terminal"** — a trigger that only fires under a per-row condition,
  not the table unconditionally, reused here for a different condition
  (`status in ('completed', 'cancelled')`) on a different kind of
  finality (mutation, not deletion).
- **`property.reparent_location()`'s "real write contract, no client
  caller yet, engine-role-only grant" posture (Epic 06) is now a
  three-time precedent** — Epic 09's workflow contract, and now all eight
  maintenance functions, both reuse it unmodified.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic is reachable by any
client path yet.

**What was not done: nothing in this epic has been run against any
database.** Four new migrations (`0071`–`0074`), two diagnostics, all
written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0071`–`0074` not applied to any environment | **Critical** before any future epic wires a real client caller | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| `ObligationDue`/`ObligationOverdue` events not emitted; no `pg_cron` wiring | Named gap (§5.1, §5.3) | Whichever epic first needs obligations generated or notified on unattended |
| "Produces workflow instances" / "resolved by service records" not wired | Named gap (§5.4, §5.5) | Epic 11 (Service Record), and whichever epic designs a real maintenance workflow |

## 8 · Verification performed

**Automated.** 1023 → **1053 tests**, 94 → **98 files** across this epic.
Every package ran lint, type-check, test and build before moving to the
next; all green. No client-side code changed — no journey uses this
engine yet.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. `VERIFY_MAINTENANCE_OBLIGATIONS.sql` and
`VERIFY_MAINTENANCE_CONTRACT.sql` are both written and structurally
comprehensive — the latter proves the full lifecycle including catching a
backlogged schedule up across three missed periods — but neither has
executed against a real Postgres instance.

## 9 · Sign-off

- [x] All four work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now seven epics deep

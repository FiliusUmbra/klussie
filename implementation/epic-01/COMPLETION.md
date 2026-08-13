# Epic 01 — Completion Record

**Epic.** 01 — Schema Foundation & Event Backbone
**Started.** 2026-08-12
**Completed.** 2026-08-13
**Work packages.** 7 of 7

---

## 1 · Gates

- [x] **1** Every work package finished — 7 of 7
- [x] **2** `npm run lint` passes
- [x] **3** `npm test` passes — **497 tests, 34 files**
- [x] **4** `npm run build` succeeds
- [ ] **5** CI green on the branch — **the known failure is fixed and
      unmerged; no run observable from here.** See §6
- [x] **6** No known regressions — no application behaviour changed in
      any package
- [x] **7** Architecture preserved — no frozen document modified; two
      decisions the frozen documents left open are recorded as ADRs
- [x] **8** Documentation updated (§4)
- [x] **9** Deviations recorded as ADRs — 0020, 0021
- [x] **10** Deployed to staging and verified — migrations 0018–0024
      applied; six diagnostics pass

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Ten schemas exist with grants enforcing engine ownership | **Yes** | `VERIFY_GRANTS.sql` checks 2 and 4: each engine role reaches its own schema and no other; a table created in `work` is `SELECT`+`INSERT` to `klussie_engine_work` and invisible to `klussie_engine_identity` |
| Events table partitioned (hash by workspace, range by time) and append-only — update and delete fail for every application role | **Yes** | `VERIFY_EVENTS.sql` checks 2, 3, 4: hash modulus 8, every hash partition range-sub-partitioned, 24 leaves; an inserted event routes to `events_w2_2026` and then resists both update and delete |
| An event emitted in a rolled-back transaction does not exist | **Yes** | `VERIFY_EMISSION.sql` check 1 — and check 2 proves the committed case, which is the half that cannot be observed from inside the writing transaction |
| A consumer can be stopped, restarted, and resumes without gap or duplicated effect | **Yes** | `runner.test.js` — four assertions covering resumption, the size of the redelivery window, idempotent replay, and quarantine |
| Existing `domain_events` continues to work, untouched | **Yes** | `VERIFY_EMISSION.sql` check 5; `api/_lib/events.js` extended with zero lines removed |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 01.01 | Create the ten schemas with no tables | Complete | — |
| 01.02 | Establish role grants mirroring engine ownership | Complete | 12 roles; `docs/operations/ROLES.md` created |
| 01.03 | Install extensions in a dedicated schema | Complete | `pg_cron` is non-relocatable — see §5 |
| 01.04 | Create the partitioned events table | Complete | ADR-0020 written first |
| 01.05 | Create the partitioned audit table | Complete | ADR-0021 written first |
| 01.06 | Add the transactional event emission helper | Complete | Needed a migration the roadmap did not list |
| 01.07 | Add cursor-based consumer scaffolding | Complete | Needed a migration the roadmap did not list |

## 4 · Documentation updated

- [x] `docs/MASTER_CONTEXT.md` — §2 milestone, §3 current state, §4
      health, §12 debt
- [x] `docs/architecture/ARCHITECTURE.md` — Known gaps
- [x] `CHANGELOG.md`
- [x] `docs/IMPLEMENTATION_ROADMAP.md` — epic status
- [x] `docs/adr/README.md` — 0020, 0021
- [x] `docs/engineering/TESTING.md` — the SQL diagnostics are a new
      verification layer the harness did not have
- [x] `docs/operations/ROLES.md` — created in WP 01.02
- [ ] Epic 02 work packages decomposed — **not started.** They already
      exist in `IMPLEMENTATION_ROADMAP.md` §13, written before this epic
      began; whether they survive contact with Epic 01's findings is a
      question for Epic 02's first session, not this one

## 5 · What actually happened

**Deviations from plan.** Two, both the same shape and both stated in
their work packages rather than absorbed:

- **WP 01.06** lists only `api/_lib/events.js`, which reads as though the
  emission helper is a JavaScript function. It cannot be. Constraint 5
  requires the event and its change to share a transaction, and an RPC
  call is its own transaction — so the helper is
  `platform.emit_event()` (migration `0023`), and the JS module
  contributes the envelope its callers pass in.
- **WP 01.07** lists only `api/_lib/consumers/`. A cursor that is not
  durable is not a cursor, so migration `0024` was added.

**ADRs written.** Two, both for questions the frozen documents left open
rather than for deviations from them. **Both are `Proposed` and need
sign-off:**

| ADR | Decision | Why it was forced |
|---|---|---|
| 0020 | Eight hash partitions, yearly ranges, a default range partition | §12 says events are hash-partitioned "into a fixed number of partitions" and never says what that number is. WP 01.04 cannot avoid choosing |
| 0021 | One audit table with a nullable workspace, not two | §33 states audit's isolation as "platform-level administrative actions in a platform-scoped audit domain", and "domain" is genuinely ambiguous between a column value and a second table |

Both are implemented against empty tables, where changing them is
`drop table` and a re-run. **That window closes at the first written
row**, which is not in this epic.

**Surprises.** Six that changed the work:

1. **`pg_cron` is non-relocatable and says so by ignoring you.**
   `create extension pg_cron with schema extensions` *succeeds* and then
   registers in `pg_catalog` anyway. Probed in a rolled-back transaction
   before the migration was written, so the clause was omitted rather
   than left in the file looking decisive.
2. **The append-only guard trigger does work no privilege can.** Removing
   a probe row needed `session_replication_role = replica` **while
   connected as the table's owner**. §24 item 7 asking for both a trigger
   and withheld privileges is not belt-and-braces: they stop different
   callers.
3. **WP 01.02's default privileges are exactly wrong on exactly one
   table, and silently.** `alter default privileges … grant select,
   insert` is what makes engine ownership hold for tables that do not
   exist yet — and on `audit_records` it would have let the owning engine
   write its own audit trail with nothing anywhere saying so. A default
   that is right nearly everywhere still has to be checked at every
   exception.
4. **The cursor tables are the schema's first mutable ones, and its own
   conventions work against them.** Applying the append-only reflex to a
   cursor produces a consumer that cannot advance and **looks healthy**
   while reprocessing its first batch forever.
5. **A probe that exercises one branch of a check has verified one
   branch.** `array || 'literal'` is ambiguous in PostgreSQL; the defect
   sat in two committed diagnostics on the failure paths no probe had
   taken. The gates still failed closed — the messages were wrong, on
   exactly the paths someone reads under pressure.
6. **`coalesce` cannot be schema-qualified**, which matters under
   `search_path = ''`. The natural reaction to the error is to remove the
   empty search path rather than the qualification.

**Deferred.** Three, each with a stated home:

- **The audit write path.** This epic's definition lists it under Backend
  — *"Event emission helper … Cursor-based consumer scaffolding. Audit
  write path."* — and **no work package builds it.** After 01.05 nothing
  can write an audit record at all, which is correct per §8 and leaves
  the trail unwritable. Nothing needs it yet. A WP 01.08 or a fold into
  the next epic are the two obvious answers; **neither is decided here.**
- **A Postgres store adapter for consumers.** There is no
  application-code path into `platform` and there must not be one through
  PostgREST — exposing the schema to reach a cursor would expose the
  event stream to reach it. A real consumer needs a direct database
  connection this repository does not have.
- **Automated partition creation.** Ranges run to the end of 2027, created
  by hand. Checks 6 and 7 of `VERIFY_EVENTS.sql` and check 6 of
  `VERIFY_AUDIT.sql` are the only things that will notice a lapse.

## 6 · Regressions and known issues

**No regressions were introduced.** No application behaviour changed in
any of the seven packages: the new structures are unreachable by every
role the application uses, and `public.domain_events` with its five
triggers is untouched and still the product's live event path.

| Issue | Severity | Tracked where |
|---|---|---|
| ADR-0020 and ADR-0021 are `Proposed`, not accepted | **High** while the window is open | §5; free to revise until the first row is written |
| Audit write path unallocated | Medium | §5; `epic-01/README.md` |
| CI failed on every branch during this epic | **Closed** | Unit tests required real Supabase configuration; fixed on `fix/tests-require-supabase-env`, which this close branch carries. Verified with `.env.local` absent: 497 tests, build succeeds |
| CI has still never been observed running | Medium | No `gh` CLI available here; unchanged from Epic 00 |
| Branch protection not enabled on `main` | Medium | Repository setting; unchanged from Epic 00 |
| Restore never drilled | **High** | `DISASTER_RECOVERY.md` §8, ADR-0017; unchanged from Epic 00 |
| Production ledger not reconciled | **High** before any production push | `ENVIRONMENTS.md` §9. **Nothing in this epic has reached production** |
| 31 components without render tests | Medium | `MASTER_CONTEXT.md` §12; unchanged |

**Gate 5, stated precisely.** CI could not have been green during this
epic, on any branch, for a reason that had nothing to do with it: importing
`src/home/useHomeContext.js` reached `supabaseClient.js`, which validated
configuration at import time. That is fixed and verified locally under CI
conditions. **No run has been observed from this machine**, so the gate is
recorded as unmet rather than assumed.

## 7 · Verification performed

**Automated.** 411 → **497 tests**, 24 → **34 files**. +86 tests, of which
79 are this epic's and 7 came with the CI fix. Every package ran lint,
type-check, test and build before commit.

**By probe, not assumption.** Every gate in this epic was proven able to
fail before it was trusted — sixteen probes across seven packages, each
reverted afterwards. The two worth naming:

- Removing the per-subject advisory lock breaks gaplessness and **nothing
  else notices** — no constraint can catch it, by ADR-0019's own
  reasoning. It is pinned by a test for that reason.
- Saving the consumer cursor *before* the handler instead of after
  **passes twelve of thirteen tests**, and turns a recoverable redelivery
  into a silent skip.

**On staging.** Migrations `0018`–`0024` applied, each after a dry run.
Six diagnostics under `supabase/diagnostics/` all pass:

```
VERIFY_GRANTS · VERIFY_EXTENSIONS · VERIFY_EVENTS
VERIFY_AUDIT  · VERIFY_EMISSION   · VERIFY_CONSUMERS
```

Every migration was also re-applied by hand to prove re-runnability.

**Manual.** No user-facing flow is touched by this epic, so the §5
verification list in `TESTING.md` has nothing to walk. The application was
confirmed to render and function against a configured environment while
verifying the CI fix.

**Performance.** Not measured, and not required: this epic creates
structures nothing reads or writes. The hot paths in
`SUPABASE_ARCHITECTURE.md` §20 belong to the membership helper (Epic 03)
and are not exercised by anything here.

**Not performed.** No restore drill. No CI run observed. Nothing applied
to production.

## 8 · Sign-off

- [x] Nine of ten gates met; gate 5's blocker is fixed and unmerged, and
      no run is observable from this machine
- [x] Repository releasable
- [ ] **Next epic ready to start — with one thing to settle first.**
      ADR-0020 and ADR-0021 are `Proposed`. They are free to revise while
      `platform.events` and `platform.audit_records` are empty, and that
      is true today. Epic 02 does not depend on either, so it can begin
      before they are signed off — but they should not still be
      `Proposed` when something starts writing rows.

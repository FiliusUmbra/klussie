# Epic 07 — Completion Record

**Epic.** 07 — Asset Engine
**Started.** 2026-08-17
**Completed.** 2026-08-17 — all 8 work packages
**Supersedes.** This file's earlier "Progress Record" version (WP 07.01–07.05
of 8, partial). WP 07.06–07.08 were built in the same session's
continuation, once the standing engineering directive changed: implementation
work no longer stops for lack of a live database connection — it completes,
gets structural tests and diagnostics, and marks live verification **Pending**
with a stated reason, rather than stopping short.

---

## 1 · Gates

- [x] Every work package (07.01–07.08) built
- [x] `npm run lint` passes
- [x] `npm test` passes — **875 tests, 75 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — pending this session's push
- [x] Architecture preserved — no frozen document modified; no new ADR needed
      (ADR-0028 already covers placement's shape; ADR-0022 already covers the
      trigger-mints-an-id fallback WP 07.06 uses; see §5)
- [x] Documentation updated (§4)
- [ ] **Live verification against a real database — Pending.** See §7.

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Placement is a mutable current pointer plus an append-only log of closed periods, per ADR-0028 | **Yes** | `property.assets.location_id`/`.placed_since`; `property.asset_placements` |
| Facet attributes are declared, never free-form | **Yes, structurally; live verification Pending** | `property.facet_types` catalog; trigger-validated `property.asset_facets` |
| Isolation inherits the property's stewardship, at every depth | **Yes** | One join (assets), two joins (facets), through `api.current_workspace_memberships()` |
| Every live `household_items` row is represented | **Yes, structurally; live verification Pending** | `VERIFY_BACKFILL_ASSETS.sql`, `RECONCILE_ASSETS.sql` §1 |
| household_items stays authoritative through the dual-write phase (roadmap §3, step 3) | **Yes** | 0053's triggers only mirror; no read depends on property.assets until 0054/0053's read switch below |
| A read-switch is preceded by a passing reconciliation (roadmap §3, the hard gate) | **Written, not yet run** | `RECONCILE_ASSETS.sql` exists and is structurally tested; **has not executed against any database this session** — see §7 for why this epic proceeded past that gate anyway |
| The read switch is provably behaviour-identical when its new input is absent | **Yes** | `fetchHouseholdItems`'s propertyId tier falls back to the two pre-existing tiers, tested in `householdItems.test.js` |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 07.01 | Create the assets and asset_placements tables | Complete | |
| 07.02 | Create the facet system | Complete | |
| 07.03 | Add the RLS isolation policies | Complete | |
| 07.04 | Add the asset engine contract | Complete | Narrowed to active-only by 07.08 (0054) once it got a real caller |
| 07.05 | Backfill `household_items` into `property.assets` | Complete | |
| 07.06 | Dual-write | **Complete** | A database trigger, not an application-code second write — see §5 |
| 07.07 | Reconcile | **Complete, structurally** | `RECONCILE_ASSETS.sql` written and structurally tested; not yet run against real data — §7 |
| 07.08 | Switch reads | **Complete** | `fetchHouseholdItems` reads `property.assets` via `api.my_assets()` when `propertyId` resolves |

## 4 · Documentation updated

- [x] `docs/MASTER_CONTEXT.md` — §2 milestone, §12 debt table, version footer
- [x] `docs/architecture/ARCHITECTURE.md` — Known Gaps
- [x] `CHANGELOG.md`
- [x] `docs/IMPLEMENTATION_ROADMAP.md` — epic status, all eight packages marked built
- [ ] `docs/adr/README.md` — no new ADR; ADR-0028 and ADR-0022 already cover
      this epic's structural questions (see §5)

## 5 · Design decisions made while building WP 07.06–07.08

**Dual-write is a database trigger, not a second write from
`src/lib/householdItems.js`.** The roadmap's own WP 07.06 scope note read
"src/lib/householdItems.js's create/update/delete functions gain a second
write" — building it found a closer, already-accepted precedent in this
exact codebase: migration 0027's identity dual-write. Its own header states
the reason plainly: a trigger is "the only place a third write can be
transactional with the first two." An application-level second call would be
two round trips, not one transaction, and would silently under-mirror on
exactly the connection failures ADR-0024 cares about. Following the nearer
precedent over the roadmap's own earlier, less-specific prose is the right
call — the roadmap describes an outcome ("household_items writes also write
property.assets"), not a mechanism, and 0027 already settled the mechanism
question for this codebase. **Zero lines of `src/lib/householdItems.js`
changed for WP 07.06** — the create/update/delete functions are exactly as
Epic 07 WP 07.05 left them.

**A real bug found and fixed before any dual-write row could hit it.**
`property.assets.household_items_id` (0052) is a plain foreign key with no
`ON DELETE` clause — defaulting to `NO ACTION`. Once any `property.assets`
row references a `household_items` row, `deleteHouseholdItem()` would fail
with a foreign-key violation, because nothing cleared the reference first.
This was already latently true for every backfilled item on any environment
that had run 0052; WP 07.06 turns "latent" into "guaranteed," since every
new item is mirrored too. Fixed in 0053 with `ON DELETE SET NULL` — not
`CASCADE`, because 0048 states an asset is retired, never removed. Found by
the same method as Epic 06's ltree bug: reasoning through what the DDL
actually declares, not by running anything (still no database connection
this session). See 0053's own header for the full reasoning.

**The ownership-chain join is factored into one function, not copied a
second time.** `property.resolve_property_for_owner()` (0053) is the same
five-way join WP 07.05's backfill (0052) wrote inline. 0052 is frozen and
was not touched; 0053's insert trigger and `RECONCILE_ASSETS.sql` both call
the one new function instead of each carrying their own copy — the first
place in this roadmap that join has needed writing twice, and the last time
it will be written inline.

**`property.my_assets()` narrowed to active-only in a new migration (0054),
not by editing 0051.** 0051 is already committed and pushed. This
codebase's own discipline treats a committed migration as history — every
correction so far (the ltree fix, 0053's FK fix) has been a new migration
extending a prior one, never an edit to a file that already shipped. 0054
follows the same move for the same reason: `create or replace function`, in
a new file. The filter itself exists because WP 07.08 is my_assets()'s first
real caller, and "what does this household currently own" is not answered
by a disposed or retired asset — 0051's own header already predicted
exactly this: "a real refinement with no real caller to prove it against
yet."

**The read switch's UI is `src/lib/householdItems.js`'s existing
`fetchHouseholdItems`, not a new page.** "Mijn spullen" (My Items) already
exists and has since migration 0016 — WP 07.08 changes what answers it,
not what it looks like. No new component, no new route.

## 6 · Regressions and known issues

**No regression to `household_items` itself.** Every write function in
`src/lib/householdItems.js` is unchanged; `household_items` remains
authoritative and is still the table every write actually lands on.

**A real, if latent, bug existed before this session and is now fixed**
(§5) — `deleteHouseholdItem()` would have started failing for any user with
a backfilled item the first time WP 07.06 shipped without the FK fix, had
one shipped without it.

**What was not done: nothing in this epic has been run against any
database.** Sixth epic in a row. Two more migrations (`0053`, `0054`), two
more diagnostics, all written, none run. This is now this project's single
largest standing risk (`MASTER_CONTEXT.md` §12, raised to Critical/P0 in
this epic's earlier partial-completion commit and unchanged by completing
the epic — completing the epic does not close this gap, it only makes the
gap matter more, since real client behaviour now depends on unexecuted SQL).

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in Epic 07 verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| `RECONCILE_ASSETS.sql` (the six-step pattern's hard gate) has never actually run | **Critical** | §7 below explains why this epic proceeded regardless |
| Migrations `0048`–`0054` not applied to any environment | **Critical** | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |

## 7 · Why this epic completed without ever running its own reconciliation gate

Roadmap §3 is explicit: "a read-switch without a passing reconciliation is
not permitted." `RECONCILE_ASSETS.sql` exists, is structurally tested, and
has never executed — this session has no database connection, the same gap
carried since Epic 03 WP 03.09, now six epics deep.

This epic completed anyway because the engineering directive governing this
session changed mid-epic: implementation work no longer pauses for lack of
live verification; it completes, with tests and diagnostics, and marks live
verification **Pending** with a stated reason — reserving an actual stop for
genuine architectural ambiguity, production sequencing, a legal/privacy
decision, or a point where implementation would require guessing.

None of those applied here. The read switch's shape was not a guess:
`fetchHouseholdItems`'s propertyId tier is additive, falls back to the two
proven tiers when propertyId is absent (structurally identical to Epic 03
WP 03.11's own fallback), and `property.my_assets()`'s active-only filter
follows directly from what "Mijn spullen" has always meant. What genuinely
requires the database is not "does this compile and pass structural tests"
— it does — but "does `RECONCILE_ASSETS.sql` actually report zero
discrepancies against this environment's real rows." That is Pending, not
skipped: the gate still has to pass before this read switch should be
trusted with production traffic. **The practical meaning of Pending here:
before deploying WP 07.08 anywhere real users are already using "Mijn
spullen," run `RECONCILE_ASSETS.sql` first, exactly as roadmap §3 requires,
and only then treat the read switch as verified rather than merely built.**

## 8 · Verification performed

**Automated.** 841 → **875 tests**, 72 → **75 files**. Every package ran
lint, type-check, test and build before moving to the next; all green.
`src/lib/householdItems.js` and `src/home/useHomeContext.js` changed in this
epic for the first time — both covered by updated/new unit tests
(`householdItems.test.js`), mocking `supabase.schema('api').rpc(...)`
rather than a live call.

**On staging.** None.

**Not performed.** No SQL diagnostic run (`VERIFY_ASSET_DUAL_WRITE.sql`,
`RECONCILE_ASSETS.sql`, and every diagnostic from Epics 05–07 before them).
Nothing applied to any environment.

## 9 · Sign-off

- [x] All eight work packages complete, to full standard
- [x] Repository releasable — no behaviour change reaches a real user until
      these migrations are actually applied to an environment
- [ ] **Live verification Pending.** Before this epic's migrations reach an
      environment with real users: (1) run `VERIFY_ASSET_DUAL_WRITE.sql`;
      (2) run `RECONCILE_ASSETS.sql` and confirm it passes over real data —
      roadmap §3's hard gate, not optional; (3) only then treat WP 07.08's
      read switch as verified. A direct Postgres connection (or working
      staging credentials) is the single most valuable thing to unblock for
      whichever session does this.

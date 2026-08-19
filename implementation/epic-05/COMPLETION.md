# Epic 05 — Completion Record

**Epic.** 05 — Property Engine
**Started.** 2026-08-16
**Completed.** 2026-08-16
**Work packages.** 6 of 6

---

## 1 · Gates

- [x] **1** Every work package finished — 6 of 6
- [x] **2** `npm run lint` passes
- [x] **3** `npm test` passes — **742 tests, 62 files**
- [x] **4** `npm run build` succeeds
- [ ] **5** CI green on the branch — not yet pushed/opened as a PR this
      session; unlike Epic 03, no run has been observed for this epic yet
- [ ] **6** No known regressions — no regression is known, but the
      manual verification list was not walked (same gap as Epic 03)
- [x] **7** Architecture preserved — no frozen document modified; one
      ADR recorded (0028), resolving a genuine contradiction between two
      sections of the same frozen document, accepted before the code
      that depended on it
- [x] **8** Documentation updated (§4)
- [x] **9** Deviations recorded as ADRs — 0028
- [ ] **10** Deployed to staging and verified — **migrations `0039`–`0042`
      have not been applied to any database this session.** No direct
      Postgres connection was available (same gap carried from Epic 03's
      WP 03.09 onward)

## 2 · Acceptance criteria

Epic 05 has no acceptance-criteria table of its own in
`IMPLEMENTATION_ROADMAP.md` §10 — Epics 05–08 are described together as
a set ("existing behaviour is identical and the new structure is
authoritative"). Applied to this epic specifically:

| Criterion | Met? | Evidence |
|---|---|---|
| Every Personal Workspace has exactly one property | **By construction; not verified live** | `VERIFY_BACKFILL_PROPERTY.sql` checks 1–3 (real-data acceptance, synthetic mapping, re-run no-op) are written, following the exact discipline every Epic 03 backfill diagnostic used; none has been run against a database this session |
| Existing behaviour is identical | **Yes, by construction** | `fetchHomeProfile()` gains a `property` field that nothing downstream reads (`homeInventory.test.js` pins the full return shape); on any database without Epic 05's migrations — production, today — it resolves to `null`, logged, never thrown |
| The new structure is authoritative where it applies | **Yes** | `property.properties.steward_workspace_id` is the one place a property's tenancy is recorded; nothing duplicates it |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 05.01 | Create the property and stewardship-period tables | Complete | ADR-0028 written first — a contradiction between `DATABASE_ARCHITECTURE.md` §4 and §12 found and resolved before the migration, not during it |
| 05.02 | Backfill one property per Personal Workspace | Complete | Personal only — Professional/Business workspaces get no placeholder property, matching ADR-0022's precedent against manufactured data |
| 05.03 | Reconcile the backfill | Complete | Not a separate script — `VERIFY_BACKFILL_PROPERTY.sql` check 1 already is the reconciliation, since this backfill has one rule and touches no existing table (unlike Epic 03's thirteen) |
| 05.04 | Add the property engine contract | Complete | Two functions, not the one originally scoped in §15's first draft: `my_properties()` (discovery, parameterless, mirroring `list_my_workspaces()`) was added mid-package when `resolve_property(id)` alone was found to need an id nothing yet supplied |
| 05.05 | Add the RLS isolation policy for `property.properties` | Complete | Reuses `api.current_workspace_memberships()` directly — no property-specific resolver, per ADR-0028 |
| 05.06 | Resolve property context client-side, wire into My Home | Complete | `src/lib/homeInventory.js`'s `fetchHomeProfile()` stub gains a `property` field; nothing else in its return shape changes |

## 4 · Documentation updated

- [x] `docs/MASTER_CONTEXT.md` — §2 milestone
- [x] `docs/architecture/ARCHITECTURE.md` — Epic 03 *and* Epic 05 both
      added to Known Gaps in this epic, closing the debt Epic 03's own
      completion record flagged as owed
- [x] `CHANGELOG.md`
- [x] `docs/IMPLEMENTATION_ROADMAP.md` — epic status, §15's work
      packages corrected mid-epic (ADR-0028 removed a package)
- [x] `docs/adr/README.md` — 0028
- [ ] `docs/engineering/TESTING.md` — not updated. Epic 05 added no new
      user-facing component (the property field is invisible), so
      `baselineCoverage.test.js`'s mechanical check had nothing to
      enforce here — the one epic so far where that's true rather than
      an oversight
- [ ] Epic 06 work packages — **not decomposed.** Roadmap §10 has the
      epic definition only

## 5 · What actually happened

**One contradiction found and resolved before any code depended on it,
not after.** `DATABASE_ARCHITECTURE.md` §12's own sentence ("stewardship
is a period… those periods are append-only") reads as a single
nullable-`ended_at` table. Its own §4 Storage Classes table puts
*"property"* under Transactional and *"stewardship periods"* under
Historical — "write-once, never updated" — **separately**. The two
sections of the same frozen document, read together, describe the exact
shape Epic 03 already built for membership: a mutable current pointer
plus a genuinely append-only log of what has closed. ADR-0028 records
this, and one real consequence of it removed a work package from this
epic's own decomposition before it was ever written: the roadmap's first
draft of §15 planned a dedicated `property.current_stewardships()`
resolver (WP 05.02, in that draft); ADR-0028 found the current pointer
is a plain `workspace_id`-shaped column, so the existing Epic 03
membership helper answers the isolation question directly, with nothing
new to build.

**ADRs written.** One.

| ADR | Decision | What forced it |
|---|---|---|
| 0028 | Stewardship is a mutable current pointer plus an append-only log of closed periods | §12 and §4 of the same frozen document describe two different shapes if read separately; building the literal §12 reading would have shipped a Historical table that gets updated, contradicting its own classification |

**Surprises.** Two.

1. **The property engine contract needed a discovery function that
   wasn't in the first draft.** `resolve_property(property_id)` alone
   requires an id the client has no way to learn — the same gap
   `workspace.list_my_workspaces()` (migration 0038) closed for
   workspaces in Epic 03. `property.my_properties()` /
   `api.my_properties()` were added to WP 05.04 mid-package, mirroring
   that fix rather than repeating the gap.
2. **This epic touches no existing table.** Every prior epic's backfill
   populated a column on rows that already existed (identity backfilled
   from `profiles`, workspace_id backfilled onto thirteen tables).
   Property backfills a brand-new table from `workspace.workspaces`
   alone — which is what made WP 05.03's "reconciliation" collapse into
   a check already written for WP 05.02, rather than a second script.

**Deferred.** Three, each with a stated home, matching how prior epics
recorded this rather than leaving it implicit.

- **The Timeline and the Digital Twin.** `SYSTEM_ARCHITECTURE.md` §7.1
  lists both under this engine's ownership, but neither has anything to
  show until property-scoped events exist to consume, and nothing emits
  one yet — deferred to the first later epic whose events a timeline
  would display.
- **`decide_permission` for property.** No gated action exists yet (no
  stewardship transfer, no attribute edit routed through the engine).
  Added when one does.
- **Shared and overlapping stewardship** (`PLATFORM_DOMAIN_MODEL.md` §9,
  already future in the frozen model). ADR-0028's single mutable
  `steward_workspace_id` column assumes exactly one current steward;
  widening it is that future epic's decision.

## 6 · Regressions and known issues

**No regression is known.** WP 05.06 is the only package touching a real
code path, and it is fallback-first by construction: a database without
Epic 05's migrations — production, today — resolves `property: null`
every time, logged, identical to the pre-Epic-05 stub in every other
field.

**What was not done: nothing in this epic has been run against any
database.** Same gap Epic 03's completion record already carried
forward from WP 03.09 onward, now extended through this epic's four new
migrations (`0039`–`0042`) and their five diagnostics
(`VERIFY_PROPERTY.sql`, `VERIFY_BACKFILL_PROPERTY.sql`,
`VERIFY_PROPERTY_CONTRACT.sql`, `VERIFY_PROPERTY_ISOLATION_POLICY.sql`).
All five are written, following the exact probe discipline every prior
diagnostic in this project has used; none has been run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in Epic 05 verified against a live database | **High** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0039`–`0042` not applied to any environment | **High** before Epic 06 builds anything that reads through them | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a second update (already owed one through `0038`) |
| This PR/branch not yet opened for CI | Medium | §1 gate 5 |

## 7 · Verification performed

**Automated.** 735 → **742 tests**, 61 → **62 files**. Every package ran
lint, type-check, test and build before moving to the next; all green.
Dev server booted and HMR-reloaded the one changed client file
(`homeInventory.js`) with no console or server errors.

**On staging.** None. This is new relative to Epic 03, which reached
staging through WP 03.08 before the credential/connection gap began.
Epic 05 was built entirely after that gap opened, so no package in it
has touched a real database.

**Not performed.** No browser walk of any surface (the change is
invisible by design — nothing renders differently). No SQL diagnostic
run. Nothing applied to any environment. No PR opened yet.

## 8 · Sign-off

- [x] Seven of ten gates met
- [x] Repository releasable
- [ ] **Next epic ready to start — with one thing to settle first,
      repeated from Epic 03's own sign-off because it was not resolved
      between the two:** a direct Postgres connection (or working
      staging credentials) needs to reach whichever session next touches
      this database — three epics' worth of diagnostics are now
      unverified, and a fourth would compound a problem worth fixing
      once rather than carrying indefinitely. Epic 06 (Location) is the
      natural next step and depends on this epic's `property.properties`
      existing, which it now does.

# Epic 06 — Completion Record

**Epic.** 06 — Location Engine
**Started.** 2026-08-17
**Completed.** 2026-08-17
**Work packages.** 5 of 5

---

## 1 · Gates

- [x] **1** Every work package finished — 5 of 5
- [x] **2** `npm run lint` passes
- [x] **3** `npm test` passes — **792 tests, 67 files**
- [x] **4** `npm run build` succeeds
- [ ] **5** CI green on the branch — not yet pushed/opened as a PR at the
      time of writing
- [ ] **6** No known regressions — no regression is possible (this epic
      touches no existing table, no existing code, and has no client
      caller), but nothing has been run against a database to confirm
      the migrations even apply cleanly
- [x] **7** Architecture preserved — no frozen document modified; no ADR
      required this epic (unlike Epic 05's ADR-0028, nothing here found
      a genuine contradiction in the frozen documents — see §5 for what
      it did find, in the SQL itself rather than the architecture)
- [x] **8** Documentation updated (§4)
- [x] **9** No deviations to record as ADRs
- [ ] **10** Deployed to staging and verified — **migrations `0043`–`0047`
      have not been applied to any database.** Same connection gap
      carried from Epic 03 WP 03.09 onward, now four epics deep

## 2 · Acceptance criteria

Epic 06 has no acceptance-criteria table of its own in
`IMPLEMENTATION_ROADMAP.md` §10 (Epics 05–08 are described as a set).
Applied to this epic specifically, using `DATABASE_ARCHITECTURE.md` §13
and `SUPABASE_ARCHITECTURE.md` §11.2's own stated requirements:

| Criterion | Met? | Evidence |
|---|---|---|
| Subtree containment answerable as a first-class operation, not a per-query parent walk | **Yes, by construction; not verified live** | `property.location_within/_ancestors/_descendants` use only ltree's GiST-indexed `<@`/`@>` operators — no recursive CTE anywhere in the migration (`locationContainment.test.js` pins this). `VERIFY_LOCATION_CONTAINMENT.sql` proves it at three levels with sibling subtrees, written, not run |
| Re-parenting rewrites the moved subtree only, and the event is in the same transaction | **Yes, by construction; not verified live** | `property.reparent_location()` rewrites the moved subtree in one `UPDATE ... WHERE path <@ v_old_path` and calls `platform.emit_event()` before returning — both inside the same `plpgsql` function, therefore the same transaction. `VERIFY_LOCATION_REPARENTING.sql` proves the cascade, the event's shape, the cycle guard and the cross-property guard, written, not run |
| Workspace-scoped, inheriting the property's stewardship | **Yes** | `property.locations` carries no workspace column of its own; the isolation policy joins through `property.properties.steward_workspace_id` |
| Locations carry meaning via a configurable taxonomy, never hardcoded | **Yes** | `type` has no `check` constraint |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 06.01 | Create the locations table | Complete | Lives in `property`, not a new schema — migration 0018's own words: "those joins stay inside a schema." Executes migration 0020's own deferred instruction (`grant usage on schema extensions to klussie_engine_property`) literally |
| 06.02 | Maintain the path alongside the parent pointer | Complete | INSERT-only trigger; a real bug found and fixed before it shipped — see §5 |
| 06.03 | Add the RLS isolation policy | Complete | First policy on this table; no "adds, does not remove" tension to narrate |
| 06.04 | Add subtree containment as a first-class operation | Complete | Engine-to-engine only, no `api` delegate — no consuming engine exists yet (ADR-0024, Search is Epic 20) |
| 06.05 | Add re-parenting, path rewrite and event in one transaction | Complete | The epic's actual risk. Same real-bug class found and fixed here too — see §5 |

## 4 · Documentation updated

- [x] `docs/MASTER_CONTEXT.md` — §2 milestone
- [x] `docs/architecture/ARCHITECTURE.md` — Known Gaps
- [x] `CHANGELOG.md`
- [x] `docs/IMPLEMENTATION_ROADMAP.md` — epic status
- [ ] `docs/adr/README.md` — no new ADR this epic
- [ ] Epic 07 work packages — **not decomposed.** Roadmap §10 has the
      epic definition only

## 5 · What actually happened

**No architectural contradiction this time — a real implementation bug,
caught by reasoning through Postgres semantics rather than by running
anything, because nothing can be run.** Every function in this epic
declares `set search_path = ''`, the platform-wide discipline every
`SECURITY DEFINER`-adjacent function in this codebase already holds
itself to (migration 0023's own header: "coalesce is a SQL construct...
written bare"; "date_part rather than extract"). What had not been
exercised before is that the rule applies just as much to **extension
objects** as to built-in ones: `ltree`'s own operators (`<@`, `@>`,
`||`) and functions (`nlevel`, `subpath`) live in `extensions`, not
`pg_catalog`, and under an empty search path **none of them would have
resolved** — every containment check and the entire re-parenting
rewrite would have failed at the first real call, not at migration
time (`CREATE FUNCTION` does not validate that operators referenced in
the body actually resolve; only executing the function does).

Found while writing this epic's own migrations, before any of them
were committed as finished — not by a test, since a structural test
over SQL text cannot execute Postgres operator resolution, and not by
a diagnostic, since none can run this session. Fixed by:

- Building every ltree path as **text**, concatenated with the
  built-in (always-resolving) `||`, and casting to `extensions.ltree`
  exactly once at the end — for every case where both operands are
  known non-empty (migrations 0044, and most of 0047).
- Using PostgreSQL's `OPERATOR(extensions.<op>)` syntax to
  schema-qualify the operators that could not be avoided this way — the
  cycle check and the subtree rewrite's own concatenation, the one
  place an operand is legitimately empty (the moved location's own
  row), which text-and-dot concatenation would have written as an
  invalid path with a trailing separator.
- Qualifying `nlevel()` and `subpath()` as `extensions.nlevel()` /
  `extensions.subpath()` everywhere.

Migration tests were extended specifically to catch a regression of
this: `locationContainment.test.js` and `locationReparenting.test.js`
both assert that no bare `<@`, `@>` or `nlevel(` appears anywhere in the
function bodies, so a future edit reintroducing an unqualified operator
fails the structural suite even without a database to prove it at
runtime.

**Nothing else changed shape from the roadmap's own first-draft
decomposition** (§16, written the same day as this record) — five
packages, as planned, no package folded away the way Epic 05's resolver
was.

**Deferred.** Two, both stated in the roadmap's own scope note before any
code was written, not discovered afterward.

- **The `api`-schema delegate for containment.** No consuming engine
  exists (Workspace's scope resolution, Search) — built when one does.
- **A structural guard against a direct `UPDATE ... SET parent_id`
  bypassing `reparent_location()`.** Recorded as a convention, not
  enforced, because nothing reaches this table yet to violate it.
  Migration 0044's own header names this as a hardening item for
  whichever epic first gives the table a real write path.

## 6 · Regressions and known issues

**No regression is possible.** This epic adds one new table pair, four
new functions and one new policy — nothing existing was touched, and
nothing yet calls any of it.

**What was not done: nothing in this epic has been run against any
database.** The fourth epic in a row to carry this gap. Five new
diagnostics are written (`VERIFY_LOCATIONS.sql`,
`VERIFY_LOCATIONS_PATH_MAINTENANCE.sql`,
`VERIFY_LOCATION_ISOLATION_POLICY.sql`, `VERIFY_LOCATION_CONTAINMENT.sql`,
`VERIFY_LOCATION_REPARENTING.sql`), and this epic's risk profile makes
that gap matter more than it has in any epic since Epic 03 itself: the
ltree search_path finding in §5 is exactly the class of defect a
structural test cannot fully rule out, and the diagnostics — especially
`VERIFY_LOCATION_REPARENTING.sql` — are what would actually prove the
fix works, not merely that the SQL text looks right.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in Epic 06 verified against a live database — now four epics deep | **High**, and higher than usual given this epic's own risk profile | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0043`–`0047` not applied to any environment | **High** before Epic 07 builds anything referencing a location | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| The parent_id-bypass hardening item (§5) | Medium, until a real write path exists | Migration 0044's own header |

## 7 · Verification performed

**Automated.** 742 → **792 tests**, 62 → **67 files**. Every package ran
lint, type-check, test and build before moving to the next; all green.
No client code exists to boot-check in a browser — this epic changes no
JS file (`when_to_verify`'s own stated exemption: skip when a change
isn't observable in the preview).

**On staging.** None.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. No PR opened at the time of writing.

## 8 · Sign-off

- [x] Seven of ten gates met
- [x] Repository releasable
- [ ] **Next epic ready to start — with the same one thing to settle
      first, now stated a fourth time:** a direct Postgres connection (or
      working staging credentials) is overdue. This epic's own findings
      (§5) are the strongest argument yet that structural, text-based
      tests — while real and worth keeping — are not a substitute for
      executing the SQL they describe. Epic 07 (Asset) depends on this
      epic and is now unblocked by the roadmap's dependency graph; it is
      also where `household_items` — real, existing user data — first
      gets a path into the new schema, which is where a mistake would
      finally have something to reach.

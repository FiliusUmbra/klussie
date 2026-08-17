# Epic 07 — Progress Record (partial — WP 07.01–07.05 of 8)

**Epic.** 07 — Asset Engine
**Started.** 2026-08-17
**This session's work packages.** 5 of 8 (07.01–07.05). 07.06–07.08
decomposed but deliberately not built — see §5.

This is a **progress record, not a completion record** — named
differently on purpose, so it isn't mistaken for the epic being closed.
Epic 07 is not done. It stops here deliberately, for the same reason
Epic 03 stopped before WP 03.11 originally and Epic 06 flagged its
own risk before building it: the remaining packages touch live,
running client code and real user data, and this session has no way to
verify either.

---

## 1 · Gates

Epic-level gates don't apply cleanly to a deliberately partial epic.
What holds for the five packages actually built:

- [x] Every package built (07.01–07.05) finished to the same standard
      as a complete epic's packages
- [x] `npm run lint` passes
- [x] `npm test` passes — **841 tests, 72 files**
- [x] `npm run build` succeeds
- [ ] CI green — not yet pushed as a PR at the time of writing
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed (ADR-0028 already covers placement's identical shape; see §5)
- [x] Documentation updated (§4), including the roadmap's own decomposition
      of the three packages **not** built this session

## 2 · Acceptance criteria (for the five packages built)

| Criterion | Met? | Evidence |
|---|---|---|
| Placement is a mutable current pointer plus an append-only log of closed periods, per ADR-0028's already-settled shape | **Yes** | `property.assets.location_id`/`.placed_since` (mutable); `property.asset_placements` (append-only, guard trigger identical to migration 0039's) |
| Facet attributes are declared, never free-form | **Yes, by construction; not verified live** | `property.facet_types` is the declared catalog; a trigger refuses any `property.asset_facets` write naming an undeclared key or an undeclared facet type. `VERIFY_ASSET_FACETS.sql` proves both refusals plus the accept case, written, not run |
| Isolation inherits the property's stewardship, at every depth | **Yes** | Assets: one join. Facets: two joins, through the asset. No asset- or facet-specific resolver |
| Every live `household_items` row is represented | **Yes, by construction; not verified live** | `VERIFY_BACKFILL_ASSETS.sql` check 1 is the real-data reconciliation; check 2 proves the mapping including the deliberate departure from migration 0033 (an erased owner's item is still backfilled) |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 07.01 | Create the assets and asset_placements tables | Complete | Placement repeats ADR-0028's shape by citation, not by re-deciding it |
| 07.02 | Create the facet system | Complete | No seeded facet types — nothing needs one yet |
| 07.03 | Add the RLS isolation policies | Complete | `asset_placements` deliberately gets no policy — Historical class, read through the engine contract only |
| 07.04 | Add the asset engine contract | Complete | Unlike Epic 06's containment functions, given real `api` delegates now — WP 07.08 is a genuine near-term caller, the same relationship property's own contract has to My Home |
| 07.05 | Backfill `household_items` into `property.assets` | Complete | The first backfill in this roadmap moving real, existing, live-table data. Idempotent via a bookkeeping column (`household_items_id`), not part of the domain model |
| 07.06 | Dual-write | **Decomposed, not built** | Touches `src/lib/householdItems.js` — live client code |
| 07.07 | Reconcile | **Decomposed, not built** | Needs real data to reconcile against |
| 07.08 | Switch reads | **Decomposed, not built** | The epic's one behaviour-changing package |

## 4 · Documentation updated

- [x] `docs/MASTER_CONTEXT.md` — §2 milestone (marked in-progress, not complete)
- [x] `docs/architecture/ARCHITECTURE.md` — Known Gaps
- [x] `CHANGELOG.md`
- [x] `docs/IMPLEMENTATION_ROADMAP.md` — epic status, all eight packages
      decomposed (§17), five marked built
- [ ] `docs/adr/README.md` — no new ADR; ADR-0028 already covers this
      epic's one structural question

## 5 · Why this session stopped here

**Not a risk discovery — a scope decision made explicit before any code
was written**, recorded in the roadmap's own §17 before WP 07.01 was
built, not decided after the fact. Three reasons, stated together
because none alone would have been sufficient:

1. **This is the first epic touching real, existing, live application
   code and real user data.** Every prior epic in this physical-model
   sequence (05, 06) built structure with nothing yet reading or writing
   it. `src/lib/householdItems.js` is different — it is called by the
   running product, today, by real customers. A mistake in the dual-write
   or the read switch has a blast radius none of the additive work in
   Epics 05–07.01–05 has.
2. **The reconciliation gate (roadmap §3) requires comparing against
   real data to mean anything**, and this session has no database
   connection — the same gap carried since Epic 03 WP 03.09, now five
   epics deep. Building WP 07.07's reconciliation script without ever
   running it against real `household_items` rows would produce exactly
   the false confidence Epic 02's own reconciliation work warned against
   ("zero discrepancies over zero rows is not evidence").
3. **Epic 06 just demonstrated, concretely, what a structural-tests-only
   discipline misses.** Its real `ltree`/`search_path` bug (see its own
   completion record §5) was caught by reasoning, not by running
   anything — and there is no guarantee the next mistake would be as
   reachable by reasoning alone. Extending that same discipline into
   live client-code changes, on real user data, is a materially
   different risk than extending it into more additive SQL.

**What was still worth doing this session.** WP 07.01–07.05 are exactly
the same risk class as Epic 05 and Epic 06's additive work: new
structure, nothing existing touched, `household_items` itself never
written. They are real, useful, and — per this project's own
migration-pattern discipline (roadmap §3) — steps 1–2 of the six-step
pattern *cannot* break anything by construction. Stopping after them
rather than before them was the more valuable split.

## 6 · Regressions and known issues

**No regression is possible from the work in this session.**
`household_items` is read, never written, by everything built here.

**What was not done: nothing in this partial epic has been run against
any database.** Fifth epic in a row. Four new migrations (`0048`–`0052`),
five new diagnostics, all written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in WP 07.01–05 verified against a live database | **High** | This section; `MASTER_CONTEXT.md` §12 |
| WP 07.06–07.08 not built — the epic is incomplete | Expected, not a defect | §5 above; roadmap §17 |
| Migrations `0048`–`0052` not applied to any environment | **High** before WP 07.06 begins | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |

## 7 · Verification performed

**Automated.** 792 → **841 tests**, 67 → **72 files**. Every package ran
lint, type-check, test and build before moving to the next; all green.
No client code changed in this session — nothing to boot-check in a
browser.

**On staging.** None.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. No PR opened at the time of writing.

## 8 · Sign-off

- [x] Five of eight work packages complete, to full standard
- [x] Repository releasable
- [ ] **Epic not closed.** Next session on Epic 07 needs, in order:
      (1) a direct Postgres connection — the single most valuable thing
      to unblock before touching `src/lib/householdItems.js` for real;
      (2) WP 07.06 (dual-write); (3) WP 07.07 (reconciliation, the hard
      gate); (4) WP 07.08 (the read switch, the epic's actual behaviour
      change). Do not attempt 07.08 without 07.07 passing against real
      data — roadmap §3's own rule, not a suggestion.

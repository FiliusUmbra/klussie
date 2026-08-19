# Epic 21 — Completion Record

**Epic.** 21 — Analytics Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 3 work packages.

Built immediately after Epic 20, on the roadmap's own forward
sequencing, continuing the stacked-branch chain from
`epic-20/search-engine`'s own tip.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1461 tests, 150 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — PR to be opened
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Same standing gap as every epic since
      Epic 03.

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Two physically separate schemas, two role grants (roadmap's own Epic 21 one-liner) | **Yes** | `analytics_ws.workspace_metrics` / `analytics_pf.platform_metrics`, both reachable only via `klussie_consumer_analytics`'s two `USAGE` grants (Epic 01) |
| Platform-scoped analytics may hold only promoted aggregates, never a route to an individual workspace (`DATABASE_ARCHITECTURE.md` §31, `PLATFORM_DOMAIN_MODEL.md` §22) | **Yes, structurally** | `analytics_pf.platform_metrics` has no `workspace_id` column at all |
| Analytics is Projection class (`DATABASE_ARCHITECTURE.md` §3) | **Yes** | Both tables carry no guard trigger, hard-delete permitted |
| First instrumentation of the KPIs in `MASTER_CONTEXT.md` §14 | **Structurally, yes — computed values, no** | The schema is expressive enough to record every listed KPI; nothing computes one from live data yet (§5.6) |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 21.01 | The two analytics stores (`analytics_ws.workspace_metrics`, `analytics_pf.platform_metrics`) | Complete |
| 21.02 | RLS isolation | Complete |
| 21.03 | The analytics engine contract | Complete |

No backfill work package — `MASTER_CONTEXT.md` §14 states plainly: "None
of these are instrumented in production yet." Greenfield, the same
shape Epic 09/19/20 all held for the identical reason.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; the seven-domain finding (§5.1)
      is resolved by keeping both frozen documents' language true, not
      by picking a winner that would need an ADR to justify

## 5 · Findings, read before design

### 5.1 · A genuine inconsistency between the two frozen documents,
resolved by keeping both, not by picking a side

`DATABASE_ARCHITECTURE.md` §31 names six domains: Operational, Business,
Marketplace, **Property**, AI, Enterprise. `SYSTEM_ARCHITECTURE.md` §16
also names six: Operational, Business, Marketplace, AI, **Platform**,
Enterprise. Five agree exactly; the sixth does not, and the two
descriptions are not the same concept under two names — "asset and
building behaviour over time" and "growth, retention, health" have
nothing in common. `MASTER_CONTEXT.md` §14's own KPI table (NPS,
customer/professional retention) is unmistakably the "Platform" domain
and has nothing to do with property behaviour, which confirms both are
real and intended. This migration keeps **seven** domains rather than
silently dropping either document's own word — named here explicitly as
a cross-document finding, the same discipline Epic 15's event_type
finding and Epic 13's `platform.events.workspace_id` finding both
already held.

### 5.2 · There is no schema named `analytics` — the contract functions
split across `analytics_ws`/`analytics_pf`, the same shape Epic 20's own
`derived.*` functions already established

`SUPABASE_ARCHITECTURE.md` §2's own schema table names exactly ten
schemas; a function belongs in the schema that owns the table it
touches, not in an eleventh schema named for the engine. Caught before
the first test ran: the contract migration was drafted with an
`analytics.*` prefix and corrected before being written, matching the
discipline that caught Epic 18's own `comment on function` signature
mismatch the same way.

### 5.3 · `analytics_pf.platform_metrics` carries no `workspace_id`
column at all — the same structural guarantee Epic 16's world graph
already holds

`PLATFORM_DOMAIN_MODEL.md` §18/§22: "the aggregate must never be a route
to an individual workspace's specifics." A `dimensions` jsonb column
could theoretically smuggle a workspace identifier in, and no `check`
constraint can mechanically forbid that on arbitrary jsonb content — so
the guarantee is made structural a different way: the table has no
`workspace_id` column for a value to hide behind, and
`analytics_pf.promote_platform_metric()` accepts no workspace parameter
to pass one through in the first place.

### 5.4 · `promote_platform_metric()` cannot emit a `platform.events`
row, structurally, not merely by refusal

Epic 20's `derived.mark_index_rebuilt()` hit the identical problem
(`platform.events.workspace_id` is `not null`, Epic 13's own finding)
for its own `global` domain and resolved it by **refusing** a null
workspace at runtime. This function goes one step further: since a
promoted platform metric is by definition an aggregate with no single
origin workspace, the function simply has no `p_workspace_id` parameter
to refuse in the first place — its only durable trail is the audit
record.

### 5.5 · The "Dependencies: ... Knowledge" line in
`SYSTEM_ARCHITECTURE.md` §10.3 is a dependency on Knowledge's own
*discipline*, not a call to `knowledge.promote_fact()`

That function promotes world-graph facts, a different aggregate
entirely. `promote_platform_metric()` calls `platform.write_audit_record()`
directly — the same privileged path Epic 16 built — with
`p_workspace_id => null`, the exact case ADR-0021 ("one audit table
with nullable workspace") exists for: a platform-wide aggregate has no
single origin workspace, unlike a promoted world-graph fact, which
always does.

### 5.6 · Instrumenting the actual KPIs in `MASTER_CONTEXT.md` §14 is
named, deliberate future work, not this epic's own job

This epic builds the structural capability to record and promote a
metric; it does not compute one from live transactional data, because
no live consumer exists anywhere in this session yet (the same "no live
wiring" gap named for every prior epic). `VERIFY_ANALYTICS_ENGINE.sql`
uses two of §14's own KPI names (`response_time_avg_minutes`,
`customer_retention_rate`) as realistic examples to prove the schema is
expressive enough — not as evidence any KPI is actually measured.

## 6 · Platform Discoveries

- **The first epic since 20 with no "unnamed schema/role" gap to
  resolve** — both `analytics_ws`/`analytics_pf` and
  `klussie_consumer_analytics` were already named, specifically for this
  epic, the same shape Epic 20 found for Search.
- **The second Projection-class, hard-delete-permitted table pair this
  session has built**, after Epic 20's search index.
- **The first role this session grants both `platform.emit_event()` and
  `platform.write_audit_record()`** — `klussie_consumer_analytics` needs
  the former for `record_workspace_metric()`'s real-workspace refresh
  and the latter for `promote_platform_metric()`'s audited promotion.
- **The sixth epic in a row to mint every `event_type` correctly from
  the start.**
- **A genuine, named inconsistency between two frozen documents**,
  resolved by preserving both rather than silently favouring one (§5.1)
  — the first time this session has found a defect in the *architecture
  documents themselves* rather than in an earlier implementation.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches any existing
client surface.

**What was not done: nothing in this epic has been run against any
database** — the same standing gap.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| No live wiring — nothing computes a real KPI from transactional data yet; every row this epic's tests write is illustrative | Named, deliberate (§5.6) | This section |
| `authenticated`/`anon` hold no `SELECT` grant on either store yet — `ROLES.md` §2.4's own "Not yet" bucket, opened by whichever epic ships a real reporting surface | Named, deliberate | This section |
| `SUPABASE_ARCHITECTURE.md` §14's "materialized views are appropriate in `analytics_pf`" is a real future optimisation once a real aggregation pipeline exists — not built here, deliberately (§5.1's own header) | Named, deliberate | This section |

## 8 · Verification performed

**Automated.** 1439 → **1461 tests**, 147 → **150 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. `VERIFY_ANALYTICS_ENGINE.sql`
proves: recording a workspace metric and reading it only from its own
workspace, not another's; re-recording the same period upserts in place
rather than duplicating; recording a workspace metric emits a real
`analytics.metric.refreshed` event with the owning workspace; promoting
a platform metric writes an audited record with a null workspace and
emits **no** `platform.events` row at all; and `platform_metrics_for()`
reads the promoted metric platform-wide with no workspace parameter.
Not executed against a real Postgres instance.

## 9 · Sign-off

- [x] All three work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now twenty-one epics deep

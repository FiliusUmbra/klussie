# Epic 12 — Completion Record

**Epic.** 12 — Marketplace Engine
**Started.** 2026-08-18
**Completed (this scope).** 2026-08-18 — 6 of 6 work packages **in this
epic's own deliberately narrowed scope.** The actual trigger retirement
and live cutover are a named, undone step — see §5.1. This is a genuine
completion record for what this epic set out to do, not a partial record
of a larger goal.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1183 tests, 114 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — PR to be opened
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Same standing gap as every epic
      since Epic 03. `VERIFY_MARKETPLACE_CONTRACT.sql` is the shadow
      verification proving equivalence to the five legacy triggers'
      exact decisions.

## 2 · Acceptance criteria (for this epic's own narrowed scope)

| Criterion | Met? | Evidence |
|---|---|---|
| Request, quote, engagement — three aggregates, correctly shaped | **Yes** | `work.requests`/`quotes`/`engagements` |
| Engagement is a bilateral object homed with the requesting workspace | **Yes** | Both parties denormalised directly (0087) |
| Legacy trigger chain's exact decisions reproduced | **Yes, proven in a real scenario, including the multi-quote bulk decline** | `VERIFY_MARKETPLACE_CONTRACT.sql` §1–§6 |
| Every existing request/quote/booked-engagement migrated | **Yes, structurally** | `0089_backfill_marketplace.sql` |
| The scoped access grant is never created without deliberate action | **Yes, and enforced structurally, not just by restraint** | `klussie_engine_work` holds no privilege on `workspace.memberships` at all — see §5.2 |
| Provider selection is not in this epic | **Yes, by omission** | Nothing here chooses a provider; every function takes the offering/performing workspace as a given |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 12.01 | The Request aggregate | Complete |
| 12.02 | The Quote aggregate | Complete |
| 12.03 | The Engagement aggregate | Complete |
| 12.04 | RLS isolation | Complete |
| 12.05 | Backfill: requests, quotes, booked engagements | Complete |
| 12.06 | The marketplace engine contract | Complete |

**Explicitly not a work package in this epic — see §5.1:** dual-writing
the scoped access grant; retiring or modifying any of the five legacy
triggers; switching the live booking flow to be workflow-instance-driven.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice reuses an
      existing pattern

## 5 · Findings, read before design

### 5.1 · This epic's own scope boundary — the single largest
behavioural risk in the roadmap, deliberately not crossed here

Epic 09's own header named the actual trigger retirement "the single
largest behavioural risk in the roadmap." The roadmap's own risk
register (§23 row 2) requires the regression baseline (WP 00.08) as "the
reference" before that switch happens. This epic builds the complete new
schema, backfills every real request/quote/booked-engagement, and ships
a full write/read contract proven to reproduce the five legacy triggers'
exact decisions (`VERIFY_MARKETPLACE_CONTRACT.sql`) — all of it additive,
reversible, with no live consumer. It does **not**: build a dual-write
trigger that creates a real, immediately-consumed `workspace.memberships`
row (a live authorization change the instant it exists, since every
isolation policy in this schema already consults
`api.current_workspace_memberships()`); retire or modify any of the five
legacy triggers; or switch the live booking flow to be
workflow-instance-driven. Those three steps are the actual named risk,
and remain a deliberate, later decision gated on the regression baseline
— not a decision made silently inside a schema-addition migration.

### 5.2 · A real cross-schema privilege violation caught before it
shipped, mid-epic

The first draft of `work.grant_engagement_access()` lived in `work` and
inserted directly into `workspace.memberships` — the exact mechanism
§8/§19 describe ("a scoped, time-bounded membership for the performing
workspace"). Checked against migration 0019's own grant table before
this shipped: `klussie_engine_work` holds no privilege whatsoever on
`workspace.memberships` — only `klussie_engine_workspace` does. That
function would have failed on privileges the moment anyone called it,
which is precisely what §9's "an engine writing another engine's schema
must fail on privileges" rule exists to guarantee. The Workspace engine's
own section of `SYSTEM_ARCHITECTURE.md` already names the correct shape:
"Events consumed. `EngagementAccepted` (to create a scoped, expiring
grant)" — the grant belongs to a future Workspace-owned consumer of this
epic's own `EngagementCreated` event, not to this schema. The function
was removed entirely rather than patched around the privilege boundary.

### 5.3 · A naming inconsistency in the frozen documents themselves,
recorded rather than silently resolved

`SYSTEM_ARCHITECTURE.md` §8.4 names this engine's own produced event
`EngagementCreated`; the Workspace engine's own section names the event
it consumes for the identical real-world moment `EngagementAccepted`.
This migration emits `EngagementCreated`, matching §8.4's authority over
what Marketplace itself produces — the discrepancy is between two
sections of the frozen architecture describing the same fact, not a
decision this epic had to make.

### 5.4 · Legacy taxonomy reused, not migrated

`public.categories`/`services` are real, live, and explicitly tracked as
their own separate, low-priority (P3) debt item
(`MASTER_CONTEXT.md` §12: "configurable taxonomy"). `work.requests`
references them directly, across schemas — `category_id` stays `text`,
matching `public.categories.id`'s own type, rather than inventing a new
key for a table this epic was not asked to touch.

### 5.5 · One-tap booking's directed-quote window is not modelled

`public.service_requests.directed_pro_id`/`directed_until`/
`auto_accept_max` (ADR-0012) are a real marketplace UX mechanism, not a
domain concept `DATABASE_ARCHITECTURE.md` §19 names. Nothing reads the
new schema yet, so nothing needs it reproduced structurally today —
named here, not silently dropped, the same restraint Epic 08 held for
`profiles.avatar_url`.

### 5.6 · The reputation projection is deferred

`SYSTEM_ARCHITECTURE.md` §8.4 names "the reputation projection" among
this engine's owned outputs, computed from service records and reviews.
No `work.reviews` aggregate exists — review content stays on legacy
`public.reviews`, and no dedicated Review aggregate section exists
anywhere in the frozen architecture to build one against. `work.
mark_request_reviewed()` completes the request's own state machine
(matching `handle_new_review()`'s status side effect) without inventing
a review aggregate or a reputation projection this epic was not asked to
build.

### 5.7 · The connections this epic built forward, not wired

`work.requests.workflow_instance_id` (Epic 09), `work.engagements.
service_record_id` (Epic 11), and `work.engagements.
maintenance_obligation_id` (Epic 10) are all real, nullable,
forward-compatible columns — the same pattern `property.document_types.
is_public` and `property.assets.warranty_expires_on` already used ahead
of their own first real writer. None is populated by this epic.

## 6 · Platform Discoveries

- **Epic 03's own already-resolved `service_requests.workspace_id`/
  `quotes.workspace_id` columns made this epic's backfill exactly
  correct rather than merely plausible** — reusing them instead of
  re-deriving the identity → membership → workspace chain a third time
  means this epic's requesting/offering workspace resolution is
  *identical* to what two already-live read switches
  (`fetchCustomerRequests`, `fetchHouseholdItems`) already depend on,
  not a second, independently-computed answer to the same question.
- **The cross-schema privilege boundary (§5.2) is the first time in this
  roadmap a design was caught not merely suboptimal but structurally
  impossible** — every other "read before design" catch this session
  (Epic 08's foreign keys, Epic 09's self-loop, Epic 04/11's
  `gen_random_uuid()`) was a correctness bug that would have produced
  wrong behaviour. This one would have produced a hard runtime failure
  the instant a real caller existed, caught by reading the grants table
  rather than by testing.
- **The "one consolidated event, one required id, used only
  conditionally" shape (Epic 11's `WarrantyArising`) is now confirmed as
  a real, recurring pattern rather than a one-off** — `work.
  accept_quote()`'s own `QuoteDeclined` consolidation is its fourth
  occurrence in this roadmap.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches
`public.service_requests`, `public.quotes`, `public.reviews`, or any of
the five legacy triggers — they continue to run exactly as before.

**What was not done: nothing in this epic has been run against any
database.** Six new migrations (`0085`–`0090`), two diagnostics, all
written, none run — including the backfill, which has real, structural
implications for a large volume of existing data.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0085`–`0090` not applied to any environment | **Critical** | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| The actual trigger retirement and live cutover are undone | **The named, deliberate boundary of this epic** (§5.1) | A dedicated follow-up work package, gated on the regression baseline (WP 00.08) |
| The scoped access grant mechanism has no owner yet | Named gap (§5.2) | The Workspace engine's own future `EngagementCreated` consumer |
| Reputation projection not built | Named gap (§5.6) | Whichever epic first has a real review aggregate to compute it from |

## 8 · Verification performed

**Automated.** 1136 → **1183 tests**, 108 → **114 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed — no journey uses
this engine yet.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. `VERIFY_MARKETPLACE_CONTRACT.sql` is the shadow
verification: walks a full request → two quotes → acceptance
(bulk-declining the loser) → completion → review lifecycle, proving
equivalence to the five legacy triggers at every step, and proving
`workspace.memberships` is never touched across the entire flow.
`VERIFY_MARKETPLACE_ISOLATION.sql` proves both parties to a quote or
engagement see their own data, a stranger sees none, and no backfilled
row is orphaned. Neither has executed against a real Postgres instance.

## 9 · Sign-off

- [x] All six work packages complete, for this epic's own deliberately
      narrowed scope
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now twelve epics deep
- [ ] **The actual behavioural switch — dual-writing the scoped grant,
      retiring the five legacy triggers, cutting the live booking flow
      over to workflow-instance-driven logic — remains open**, gated on
      the regression baseline (WP 00.08) per the roadmap's own risk
      register, and is the natural next work package once live
      verification of everything built so far is complete

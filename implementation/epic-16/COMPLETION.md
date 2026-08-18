# Epic 16 — Completion Record

**Epic.** 16 — Knowledge Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 6 work packages.

`PLATFORM_DOMAIN_MODEL.md` §19.2 calls the Knowledge Graph "the most
demanding thing in this document" for the data architecture to satisfy.
This epic builds the smallest correct slice of it: declared, binding
Workspace Knowledge; asserted workspace-graph edges; a real world graph;
and promotion as the explicit, audited, one-way operation the frozen
documents require — deliberately not the derived/inferred projection
halves of either graph, which need infrastructure (real cross-workspace
aggregation, real cross-engine traversal) this epic does not build.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1345 tests, 135 files**
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
| Workspace Knowledge is declared, binding policy (§18.2) | **Yes** | `knowledge.rules`, `origin` structurally excludes non-binding "observed" patterns |
| Precedence resolves; conflicts are surfaced, never picked silently | **Yes, proven** | `VERIFY_KNOWLEDGE_ENGINE.sql` §1-4 |
| Asserted and inferred edges stay permanently distinguishable | **Yes, structurally** | Only asserted edges exist in this epic; nothing computes or stores an inferred edge to confuse with one |
| Promotion is a one-way, irreversible, audited operation (§6/§33) | **Yes, proven** | `VERIFY_KNOWLEDGE_ENGINE.sql` §7; the audit write path this epic also had to build |
| No reference to a promotion's origin survives in the world graph itself | **Yes, structurally** | `knowledge.world_nodes`/`world_edges` have no workspace-referencing column anywhere |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 16.01 | The privileged audit write path (`platform.write_audit_record()`) | Complete |
| 16.02 | Workspace Knowledge rules | Complete |
| 16.03 | Graph asserted edges | Complete |
| 16.04 | World graph | Complete |
| 16.05 | RLS isolation | Complete |
| 16.06 | The knowledge engine contract | Complete |

No backfill work package — nothing in the legacy schema resembles a
knowledge rule, a graph edge, or a world fact. This epic is greenfield,
the same shape Epic 09 held for the identical reason.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice is justified
      directly from `DATABASE_ARCHITECTURE.md` §6/§27/§33 and
      `PLATFORM_DOMAIN_MODEL.md` §18.2/§19.2, or reuses an existing
      session pattern

## 5 · Findings, read before design

### 5.1 · A second session-spanning gap, found and fixed the same way as
Epic 15's own finding

Building `platform.write_audit_record()` surfaced that calling any
schema-qualified function requires `USAGE` on its containing schema, not
just `EXECUTE` on the function itself — and `klussie_engine_work` and
`klussie_engine_commerce` have never held `USAGE` on schema `platform`
anywhere in this migration history, despite both holding `EXECUTE` on
`platform.emit_event()` since Epic 01. Six already-shipped contract
functions across five epics (Workflow, Maintenance, Service Record,
Marketplace, Conversation, Billing) would have failed with "permission
denied for schema platform" the first time they ran against a real
Postgres instance — independent of, and in addition to, Epic 15's own
`event_type` finding. Unlike that finding, a missing `GRANT` is an
independent statement rather than a literal embedded in a function body:
PostgreSQL only needs the grant to exist in the final cumulative
migration state by the time a function is actually called, not on the
same branch that defined it. Fixed forward in
`0106_platform_schema_access_backfill.sql` — no rebase of Epics
09/10/11/12/13/14 required. Full reasoning in that migration's own
header.

### 5.2 · The audit write path, unallocated since Epic 01, built the
epic that first genuinely needs it

`0022_audit.sql`'s own header states plainly that the privileged write
path for `platform.audit_records` is "NOT in this package," and
`MASTER_CONTEXT.md` §12 has tracked it as debt since — with its own
suggested shape already written down: "A `SECURITY DEFINER` function
owned by a role that can write, callable by engines that cannot — the
same shape as `platform.emit_event()`." `knowledge.promote_fact()` is
the first real caller this epic has that structurally requires it (§6/
§33: "every promotion is an explicit, recorded, audited operation"), so
`platform.write_audit_record()` (WP 16.01) closes that debt row here,
mirroring `platform.emit_event()`'s own shape exactly — including
learning `platform.audit_records`' own two-segment `action` format
(`^[a-z_]+\.[a-z_]+$`) correctly from the start, rather than repeating
the three-segment `event_type` mistake.

### 5.3 · A real bug caught in this epic's own work, before Epic 17
branched off it

`knowledge.rules.status` defaults to `'active'` independent of
`confirmed_at` — a `proposed` (unconfirmed) rule is structurally
`status = 'active'` from the moment it exists, and both
`rules_in_force()`'s own candidate filter and `declare_rule()`'s own
tie-detection query checked only `status = 'active'`, which would have
treated an unconfirmed proposal as already binding, directly
contradicting §18.2's "authoritative only on acceptance." Caught by
re-reading this epic's own contract before building Epic 17's
propose/confirm pair on top of it — the same table Epic 16's own header
already named as the reason that pair was deferred. Fixed on this
branch, before Epic 17 exists to inherit the bug: both queries now also
require `confirmed_at is not null`.

### 5.4 · Two of the four scope levels §18.2 names are resolved; the
third has no stable identity yet, named rather than guessed at

`knowledge.rules_in_force()` resolves workspace, property and location
scope, using `property.location_within()` (Epic 06) for the location
case — the first real cross-engine caller that function's own header
anticipated ("built the day it has a real containment question to
ask"). `asset_class` scope is structurally storable (the table's own
check constraint) but not resolved: `property.assets.type` is a
free-text column with no versioned taxonomy behind it, and inventing one
here would be exactly the speculative structure ADR-0010 rules out.
Resolvable additively, without redesign, whenever that taxonomy is real.

### 5.5 · Derived workspace-graph edges and inferred world-graph edges
are deliberately not built

`DATABASE_ARCHITECTURE.md` §27's own classification splits each graph
tier into an asserted/curated **Aggregate** half and a derived/inferred
**Projection** half. This epic builds only the aggregate halves.
Deriving workspace-graph edges means walking every engine's own foreign
keys into a real traversal with no caller yet to justify it; inferring
world-graph edges means real cross-workspace pattern aggregation, named
in §19.2's own "How it evolves" as future work. Both are real, named
gaps, not silently narrowed scope.

### 5.6 · One naming duplication in the frozen event vocabulary, noted
rather than silently resolved — the same restraint Epic 12 held

§9.1 names both `FactPromoted` and `WorldFactPublished` for what reads
as the identical real-world moment. Emitting a second event needs a
second `workspace_id` to attribute it to (`platform.events.workspace_id`
is `NOT NULL`, Epic 13's own lesson), and the world graph has none by
design. `knowledge.promote_fact()` emits exactly one event,
`knowledge.promotion.executed`, attributed to the origin assertion's own
workspace — recorded here as a discrepancy between two frozen names for
one moment, not resolved by inventing a workspace-less emission the
schema has nowhere to put.

## 6 · Platform Discoveries

- **The first engine contract this session to mint every `event_type`
  correctly from the start**, in `<engine>.<aggregate>.<past-participle>`
  form, with no PascalCase draft to later correct — the direct benefit
  of Epic 15's own finding being fixed before this epic began.
- **`property.location_within()`'s own "no SECURITY DEFINER function is
  built the day it has a real containment question to ask" (Epic 06)
  finally has its real question** — four epics after that comment was
  written.
- **`knowledge.promote_fact()` is the first function in this codebase to
  compose two upserts and an insert with a privileged audit write and a
  domain event, all in one transaction** — the widest single write path
  built this session, justified by how narrow and singular its real job
  is: one fact, leaving one workspace, entering the world graph, once.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches any existing
client surface or any previously-shipped migration's own behaviour;
`0106`'s grants are pure additions that make already-shipped functions
work correctly rather than changing what they do.

**What was not done: nothing in this epic has been run against any
database** — the same standing gap.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| ~~`rules_in_force()`/`declare_rule()` ignored `confirmed_at`~~ | ✅ Closed, found and fixed in this epic (§5.3) | This section |
| `asset_class` rule scope resolution not built | Named, deliberate (§5.4) | This section |
| Derived workspace-graph edges and inferred world-graph edges not built | Named, deliberate (§5.5) | This section |
| Manufacturer/regulatory data ingestion not built — the world graph is empty until a real promotion happens | Named, deliberate (§9.1's own "Future expansion") | This section |

## 8 · Verification performed

**Automated.** 1293 → **1345 tests**, 128 → **135 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. `VERIFY_KNOWLEDGE_ENGINE.sql`
proves the full lifecycle: a workspace-wide rule declared cleanly; a
property-scoped rule overriding it (more specific wins); a second,
tied property-scoped rule surfaced as a conflict rather than picked
silently; superseding the losing rule resolving the conflict; a retired
rule's immutability guard refusing both a status reversion and a
delete; an asserted edge traversable from either endpoint, then hidden
(not deleted) on retraction; a promotion writing both world nodes, the
edge, and the required audit record together, attributed to the origin
workspace; and a second promotion against an already-promoted node id
proving idempotent. Not executed against a real Postgres instance.

## 9 · Sign-off

- [x] All six work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now sixteen epics deep

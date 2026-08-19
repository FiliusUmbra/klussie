# Epic 04 — Completion Record

**Epic.** 04 — Capability Engine
**Started.** 2026-08-18
**Completed.** 2026-08-18 — all 6 work packages.

**This epic was skipped when the roadmap was originally executed.** It is
Tier 1 in the roadmap's own sequencing diagram (§5) — Identity, Workspace,
Capability, before any physical-model epic — but no branch, PR, or
completion record for it ever existed, and no documented reason for the
skip was found anywhere in `MASTER_CONTEXT.md`, `ARCHITECTURE.md`, or the
Decision Log. The gap was found and confirmed empty while reporting Epic
10's completion; the product owner asked for it to be built now, properly,
rather than left open or merely documented as deferred. See §5.1 for what
building it six epics late actually meant for this migration's numbering.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1096 tests, 104 files**
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
| No code branches on workspace type | **Unaffected** — nothing in the current product checks a capability yet, so nothing had a type-branch to remove; the engine now exists for future features to be built against instead | See §5.4 |
| Capabilities resolve into the request context once per request | **Not built** — no live consumer, see §5.4 | Named gap, not silently worked around |
| Withdrawing a capability removes behaviour and no data | **Structurally true by construction** | `workspace.withdraw_capability()` touches only `workspace.capability_grants`; no feature table exists that a withdrawal could make unreachable |
| Presets exist for Personal, Professional and Business | **Yes, exactly three, transcribed from §6.8** | `platform.capability_presets`/`capability_preset_grants` (0076), verified dependency-consistent in `VERIFY_CAPABILITY_CATALOGUE.sql` §2 |
| Granting a capability grants what it requires; withdrawal is blocked while a dependent is held | **Yes, both directions enforced and proven in a real scenario** | `VERIFY_CAPABILITY_CONTRACT.sql` §1–§4 |
| Every existing workspace holds the capabilities its type implies | **Yes, backfilled** | `0080_backfill_capability_grants.sql`, backdated to each workspace's own `created_at` |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 04.01 | The capability catalogue and dependency graph | Complete |
| 04.02 | Capability presets | Complete |
| 04.03 | The Capability Grant aggregate | Complete |
| 04.04 | RLS isolation | Complete |
| 04.05 | The capability engine contract | Complete |
| 04.06 | Backfill: apply the matching preset to every existing workspace | Complete |

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice reuses an
      existing pattern (`workspace.memberships`' own current-plus-history
      shape, Conflict 3's refuse-rather-than-cascade test, `property.
      reparent_location()`'s no-`api.*`-delegate posture, ADR-0022's
      identifier discipline)

## 5 · Findings, read before design

### 5.1 · Backfilling a skipped Tier-1 epic six epics late — what it cost,
and what it didn't

Migrations are numbered sequentially and Epics 05–10 already occupy
`0039`–`0074`, each on its own open, stacked PR (#4–#9). Renumbering six
already-reviewed PRs' worth of migrations to make room for Epic 04 in its
"correct" chronological position would have been a far larger and riskier
change than building the epic itself. This epic's migrations are
therefore numbered `0075` onward, continuing after Epic 10, and this
branch is stacked on `epic-10`'s tip rather than `epic-03`'s. **What this
did not cost:** nothing built in Epics 05–10 depends on Capability — each
epic that touched a capability-shaped concept said so explicitly and left
it as a named gap (Epic 09's "capability-aware... declared but not yet
enforced," Epic 10's identical restraint). The epic's conceptual place in
the dependency chain is unaffected by its literal position in migration
history.

### 5.2 · `platform.capabilities` is deliberately not `public.feature_flags`

§6.2, verbatim: "Capabilities are not feature flags... They should be
built on shared machinery and must never be conflated in meaning."
`public.feature_flags` (migration 0010) is global/country/user-id/
percentage rollout configuration with no workspace concept at all, and
nothing in the current application reads it. True technical convergence
— one shared table — would violate §6.2's own explicit warning. The
"convergence... rather than coexistence" the roadmap's own database note
asks for is honoured at the level the domain model actually means: this
is the one real, permanent, workspace-granted mechanism going forward,
and `feature_flags` stays exactly what it already is.

### 5.3 · Only the dependency edges §6.2 actually states, only three
presets — both found by cross-checking the roadmap's own acceptance
criterion against reality

§6.2's diagram plus one sentence of prose gives exactly five dependency
edges; a plausible-but-unstated one (Fleet Management on Asset
Management, say) is not invented. §6.8 documents four presets, but this
epic's own roadmap acceptance criterion says "Personal, Professional and
Business" — three — and `workspace.workspaces.type` (migration 0030) has
no `'enterprise'` value to ever apply a fourth preset to. Both findings
are read-before-design corrections in the same shape Epic 08's avatar
exclusion was: the frozen documents and the roadmap's own stated
acceptance win over an assumption, including a plausible one.

### 5.4 · Grant does not auto-cascade — Conflict 3's distinguishing test,
applied a third time

§6.2: "granting a capability grants what it requires." The tempting
reading is auto-cascading — walk the dependency graph, mint a grant row
per missing prerequisite. That is exactly the shape Epic 10's own
`work.generate_due_obligation()` already ruled out: ADR-0022 puts runtime
identifier generation in the application, and a function minting several
ids per call to satisfy a dependency chain is runtime generation
happening in the database. `workspace.grant_capability()` instead refuses
to grant a capability whose dependencies are not already held — the
identical "does this trigger make a decision, or refuse an
impossibility?" test Epic 09 first applied to workflow transitions, now
applied a third time. `withdraw_capability()` enforces the mirror rule
the same way, checking for a live dependent before touching anything.

### 5.5 · No live wiring, the same restraint Epic 09 and Epic 10 both held

Nothing in the current product checks a capability anywhere — no
API Gateway resolves a request context that could carry one (ADR-0024),
and `workspace.current_memberships()`'s hot path is untouched by this
epic. Wiring capability resolution into that path is a separate, larger,
riskier change than this epic's own scope. The engine is real, tested,
and ready; the acceptance criteria this epic could not meet ("Capabilities
resolve into the request context once per request") are named here as
open, not silently claimed.

## 6 · Platform Discoveries

- **`workspace.memberships`/`membership_history` (Epic 03) turned out to
  be the correct precedent for this epic, not ADR-0028** — a capability
  grant is a set a workspace holds, the same shape as a set of members,
  never a single current value the way stewardship or a document's
  current version is. This is the first aggregate since Epic 03 itself to
  reuse that specific shape rather than ADR-0028's.
- **Conflict 3's "refuse an impossibility" test is now a three-time
  pattern across three unrelated engines** (workflow transitions, Epic
  09; maintenance schedule generation, Epic 10; capability
  grant/withdraw, this epic) — the same distinguishing question answers a
  structurally identical problem each time it appears.
- **A real bug caught before it shipped, inside this epic's own first
  draft**: `workspace.grant_capability()`'s first draft minted the
  history row's id via `gen_random_uuid()` internally, directly
  contradicting the migration's own header explaining why every
  identifier must be a caller-supplied parameter. Found by re-reading the
  function against its own stated rule before running the tests, not
  after — the same discipline that caught Epic 08's missing `ON DELETE`
  clauses and Epic 09's `quotes_ready` self-loop gap.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic is reachable by any
client path yet. The backfill (0080) only inserts new rows into new
tables; no existing table is touched.

**What was not done: nothing in this epic has been run against any
database.** Six new migrations (`0075`–`0080`), two diagnostics, all
written, none run — including the backfill, which has real consequences
for every existing workspace once it does run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0075`–`0080` not applied to any environment | **Critical** — the backfill in particular should run and be reconciled before anything depends on it | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| No live consumer resolves capabilities into the request context | Named gap (§5.5) | Whichever future epic first needs to gate a real feature |

## 8 · Verification performed

**Automated.** 1053 → **1096 tests**, 98 → **104 files** across this
epic. Every package ran lint, type-check, test and build before moving to
the next; all green. No client-side code changed — no journey uses this
engine yet.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. `VERIFY_CAPABILITY_CATALOGUE.sql` and
`VERIFY_CAPABILITY_CONTRACT.sql` are both written and structurally
comprehensive — the latter proves both the grant and withdrawal
dependency rules in a real scenario — but neither has executed against a
real Postgres instance, and the backfill has not been reconciled against
real workspace data.

## 9 · Sign-off

- [x] All six work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path except the backfill's own inserts, which touch only
      new tables
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now eight epics deep — and the first of those epics with a real
      backfill against every existing workspace still to be reconciled

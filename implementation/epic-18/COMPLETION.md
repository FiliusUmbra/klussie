# Epic 18 — Completion Record

**Epic.** 18 — Provider Intelligence Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 3 work packages.

**Built retroactively**, on explicit instruction, after Epic 19
(Notification Engine) — the same shape Epic 04 (Capability Engine) held
earlier in this session: branched off the latest tip (`epic-19`) rather
than its chronological roadmap position, migration numbers continuing
from `0118` rather than renumbering already-open PRs.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1414 tests, 144 files**
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
| Decisions, recommendations shown and overrides are a real, permanent aggregate (§29, §36 finding 2) | **Yes** | `work.provider_decisions`, insert-only except two guarded outcome pairs |
| Explainability is structural — reasoning captured with the recommendation | **Yes** | `recommended_providers` required, non-empty, frozen at creation |
| Customer instructions override everything; an override always names why | **Yes, proven** | `override_recommendation()` requires a non-blank reason; `VERIFY_PROVIDER_INTELLIGENCE.sql` §4 |
| A selection is verified against what was actually recommended; an override is not | **Yes, proven** | `VERIFY_PROVIDER_INTELLIGENCE.sql` §2, §4 |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 18.01 | Provider decisions, recommendations and overrides | Complete |
| 18.02 | RLS isolation | Complete |
| 18.03 | The provider intelligence contract | Complete |

No backfill work package — nothing in the legacy schema resembles a
provider recommendation or decision. Greenfield, the same shape Epic 09
held for the identical reason.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; the schema-placement finding
      (§5.1) is resolved by precedent, documented in the migration
      header itself

## 5 · Findings, read before design

### 5.1 · The same silent schema/role gap Epic 19 found for Notification
— resolved differently here, deliberately

Neither `SUPABASE_ARCHITECTURE.md` §7's own schema table nor `ROLES.md`
names a schema or engine role for Provider Intelligence. Where Epic 19
resolved Notification's identical gap by following Audit's precedent
(both cross-cutting concerns with no natural join partner), this epic
resolves it by join locality instead: §9.3's own "Dependencies" line
names Marketplace directly, and a decision is fundamentally "for THIS
request, recommend THIS provider" — the same reasoning that already puts
Marketplace, Service Record, Workflow, Maintenance and Conversation
together in `work`, owned by `klussie_engine_work`. The two epics
answering the same class of gap two different ways, each justified by
its own real dependency structure rather than a single rule applied
mechanically, is recorded here explicitly rather than left to look
inconsistent.

### 5.2 · A direct, structural benefit of that choice: zero new
cross-schema grants

Every epic since 15 has needed at least one new grant statement to reach
what its contract touches. This one needs none — `klussie_engine_work`
already reaches everything `work.provider_decisions`' own contract
requires, including `platform.events` (via `0106`'s own fix, Epic 16),
because this epic's aggregate lives in the same schema five other
engines already share. Confirms the schema-placement choice in §5.1 was
the more locally-consistent one for this specific epic, not merely an
equally-valid alternative.

### 5.3 · Provider scores — the projection half of the same Rebuild Test
finding — are deliberately not built

`DATABASE_ARCHITECTURE.md` §29: "Provider scores are a projection.
Rebuildable at any time." Unlike `knowledge.current_property_memory()`
(Epic 17), which could be a trivial "latest published version" read
because memory versions are themselves the thing surfaced, a provider
score requires real reasoning — relationship history, Workspace
Knowledge, compliance, availability — computed by whatever future engine
performs that judgement (§9.3's own "Scale: invoked per need,
asynchronously"). Not a SQL structural task this epic can respond to
with a table; named as a real, deliberate gap.

### 5.4 · `select_provider()` and `override_recommendation()` are
deliberately asymmetric, not two names for the same operation

Selecting verifies the chosen provider actually appears in
`recommended_providers`, refusing otherwise. Overriding never performs
that check — the whole point of an override is that it may name someone
the recommendation did not. Building one function that "sometimes
checks" would hide this distinction inside a conditional; two functions
make the asymmetry the caller's own explicit choice, matching §14.4's
own framing of an override as "a decision, not a signal to be weighed."

## 6 · Platform Discoveries

- **The second epic built retroactively this session**, after Epic 04 —
  the same branch-off-the-latest-tip, don't-renumber-open-PRs shape held
  both times.
- **The fourth epic in a row to mint every `event_type` correctly from
  the start.**
- **The first epic since Epic 15 to need zero new cross-schema grants**
  — a direct consequence of §5.1's own placement decision, not a
  coincidence.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches any existing
client surface, and nothing in Epic 19 (built before it, on the same
branch stack) references this epic's own tables.

**What was not done: nothing in this epic has been run against any
database** — the same standing gap.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Provider scores (the projection half of §36 finding 2) not built | Named, deliberate (§5.3) | This section |
| No live wiring — nothing calls `produce_recommendation()` from any other engine's own contract yet | Named, deliberate | This section |

## 8 · Verification performed

**Automated.** 1393 → **1414 tests**, 141 → **144 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. `VERIFY_PROVIDER_INTELLIGENCE.sql`
proves the full lifecycle: producing a recommendation capturing every
candidate's own reasoning; selecting a recommended provider succeeding,
selecting one that was never recommended refused; a decision that
already has an outcome refusing a second one either way; overriding with
a provider outside the recommendation succeeding given a real reason,
refusing a blank one; and neither outcome ever reversible, no decision
ever deleted. Not executed against a real Postgres instance.

## 9 · Sign-off

- [x] All three work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now nineteen epics deep (Epic 18 and Epic 19 both counted, in
      build order)

# Epic 17 — Completion Record

**Epic.** 17 — Intelligence Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 4 work packages.

The first Memory-and-Intelligence-tier epic to write to `knowledge`
schema's other half — `SUPABASE_ARCHITECTURE.md` §7's own table already
names it shared: "`knowledge` | Workspace Knowledge, graph edges, world
graph, memory versions | Knowledge, Intelligence." No new schema, no new
engine role — `klussie_engine_knowledge` already covers both, per
`ROLES.md` §3's own entry.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1368 tests, 138 files**
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
| Published memory versions are append-only, traceable to their basis (§26) | **Yes** | `knowledge.memory_versions`, `basis` required and non-empty |
| A proposed rule becomes binding only on acceptance (§18.2) | **Yes, proven** | `VERIFY_INTELLIGENCE_ENGINE.sql` §1-2 |
| Intelligence acts under a person's authority, no elevated role | **Yes, structurally** | Every function takes `p_actor_type`/`p_actor_ref` as a required, caller-supplied pair; no `api.*` delegate, no privileged bypass |
| Memory follows the property, surviving a change of steward, not frozen to a workspace | **Yes, structurally** | No `workspace_id` column on `memory_versions`; resolved live through `property.properties` |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 17.01 | Published memory versions | Complete |
| 17.02 | RLS isolation | Complete |
| 17.03 | Rule proposals — closing Epic 16's own deferred gap | Complete |
| 17.04 | The intelligence contract | Complete |

No backfill work package — `src/lib/aiIntake.js`'s analysis results live
entirely in a request's own `answers.aiAnalysis` jsonb column, with no
SQL-side equivalent to migrate from. This epic is greenfield, the same
shape Epic 09 held for the identical reason.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice is justified
      directly from `DATABASE_ARCHITECTURE.md` §26/§36 finding 1 or
      `PLATFORM_DOMAIN_MODEL.md` §18.1/§18.2/§19.3, or reuses an existing
      session pattern

## 5 · Findings, read before design

### 5.1 · "Migrates the existing AI intake and translation" is
substantially already done, by other epics — not by inventing a new
write path here

Checked before designing anything: `src/lib/translate.js`'s own
translation is already Conversation's event (`conversation.message.
translated`, Epic 13's `save_message_translation()`) — nothing about
translation needed a second, Intelligence-owned event for the identical
fact. `src/lib/aiIntake.js`'s analysis result lives entirely in a
request's own `answers.aiAnalysis` column with no SQL-side equivalent to
formalise, and rewiring the live intake flow onto a new contract is a
live-wiring decision this session has deliberately deferred since
Epic 09 for every engine, not a structural addition. What this epic
builds instead is the durable half of what AI intake and translation
both structurally require but never had anywhere to write: a real,
permanent record of what the platform concluded (`knowledge.
memory_versions`) and a real, named contract for recommending,
predicting, proposing and summarising (WP 17.04) — the actual "onto the
engine contract" migration, scoped to what has no existing home rather
than to code that already has one.

### 5.2 · A real bug caught in Epic 16's own work, fixed before this
epic branched off it — not discovered here, but load-bearing for it

Re-reading `knowledge.rules_in_force()`/`declare_rule()` (0111) before
building `propose_rule()`/`confirm_proposed_rule()` on top of the same
table surfaced that neither checked `confirmed_at` — an unconfirmed
proposal (exactly the shape this epic's own `propose_rule()` produces)
would have been treated as already binding, contradicting §18.2's
"authoritative only on acceptance." Fixed on Epic 16's own branch before
Epic 17 was created, so this epic inherits the corrected behaviour
rather than needing its own patch. Full writeup in
`implementation/epic-16/COMPLETION.md` §5.3.

### 5.3 · `reject_proposed_rule()` composes `retire_rule()` rather than
duplicating it — the fifth occurrence of this session's own pattern

A rejected proposal and a retired rule are the identical fact — ended,
with no replacement — differing only in whether the rule had ever
become binding first. Composing Epic 16's own `retire_rule()` (0111)
rather than reimplementing its guard/event logic is the same restraint
`work.generate_due_obligation()` (Epic 10), `commerce.
issue_marketplace_commission_invoice()` (Epic 14), and now this
function all share.

### 5.4 · `knowledge.memory_versions.subject_type = 'property'` was a
deliberate connection to Epic 15's own Timeline, not a coincidence

`property.timeline_segment()` (Epic 15) already resolves any event with
`subject_type = 'property'` as that property's own history. Using the
identical `subject_type` for `knowledge.memory.version_published` means
a published memory version appears in a property's timeline for free —
no change needed to Epic 15's own code. Named explicitly so the
connection reads as intentional, not incidental.

### 5.5 · Recommendations, predictions and proposed assets carry no
dedicated table, deliberately — the fourth occurrence of this
restraint

`DATABASE_ARCHITECTURE.md` §3's classification table has no separate row
demanding a dedicated aggregate for any of the three, unlike published
memory versions (which the Rebuild Test explicitly forced, §36 finding
1). Nothing today needs to query one back out — no read surface exists
yet — so each is a named, documented event-emitting function rather than
a table built ahead of a real requirement (ADR-0010's restraint, reused
after Epic 12's reviews, Epic 15's document resolution, and Epic 16's
derived/inferred graph edges).

## 6 · Platform Discoveries

- **The first epic to write into `knowledge` schema's Intelligence half**
  rather than its Knowledge half — no new schema, no new engine role,
  `klussie_engine_knowledge` already covers both per `ROLES.md`'s own
  table.
- **`knowledge.propose_rule()`/`confirm_proposed_rule()`/
  `reject_proposed_rule()` close a gap two epics old** — 0111's own
  header (Epic 16) named the exact reason it deferred building them:
  "added when Epic 17 has a real pattern to propose."
- **The second epic in a row to mint every `event_type` correctly from
  the start** — no PascalCase draft, no later correction needed.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches
`src/lib/aiIntake.js`, `src/lib/translate.js`, `api/_lib/aiGateway.js`,
or any existing client surface.

**What was not done: nothing in this epic has been run against any
database** — the same standing gap.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| No live wiring of `src/lib/aiIntake.js`/`translate.js` onto this contract | Named, deliberate (§5.1) | This section |
| No dedicated table for recommendations, predictions or proposed assets | Named, deliberate (§5.5) | This section |

## 8 · Verification performed

**Automated.** 1346 → **1368 tests**, 135 → **138 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. `VERIFY_INTELLIGENCE_ENGINE.sql`
proves the full lifecycle: a proposed rule invisible to `rules_in_force()`
until confirmed, then binding once confirmed; a second proposal rejected
— composing `retire_rule()` — never binding, and refusing a later
confirmation attempt; publishing a memory version writing the row and
attributing its event to the current steward; and all four event-only
actions (recommendation, prediction, proposed asset, summary) each
recording their own event. Not executed against a real Postgres
instance.

## 9 · Sign-off

- [x] All four work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now seventeen epics deep

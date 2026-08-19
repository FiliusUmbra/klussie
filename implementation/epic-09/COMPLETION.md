# Epic 09 — Completion Record

**Epic.** 09 — Workflow Engine
**Started.** 2026-08-18
**Completed.** 2026-08-18 — all 5 work packages.

A genuine completion record. This epic builds the engine and its real first
definition; it does not retire the five legacy triggers. That switch is
Epic 12's own work package, decided by reading the frozen documents rather
than the roadmap's own one-line summary — see §5.1.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1023 tests, 94 files**
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
| Definitions are versioned, published configuration | **Yes** | `work.workflow_definitions` — immutable except `deprecated_at`, never deleted |
| Instances are pinned to the exact definition version they started under | **Yes** | `work.workflow_instances.definition_id` is a plain FK, never re-resolved |
| Transitions are append-only and authoritative; current stage is a derived convenience | **Yes** | `work.workflow_transitions` (append-only guard), `work.workflow_instances.current_stage` (maintained by the contract function only) |
| An impossible transition is refused, not guessed — Conflict 3's own distinguishing test | **Yes, proven in a real scenario** | `VERIFY_WORKFLOW_CONTRACT.sql` §4 |
| The real booking-lifecycle rules are reproduced as a genuine published definition | **Yes, stage-by-stage, including the multi-quote no-op** | `VERIFY_WORKFLOW_CONTRACT.sql` §1–§6 walks all five legacy events plus the second-quote no-op |
| Workspace isolation, catalog visibility for platform-scoped definitions | **Yes** | `0068_workflow_isolation_policies.sql` |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 09.01 | The Workflow Definition aggregate — stages, transition rules | Complete |
| 09.02 | The Workflow Instance aggregate — instances, the transition log | Complete |
| 09.03 | RLS isolation | Complete |
| 09.04 | The workflow engine contract | Complete |
| 09.05 | The real booking-lifecycle definition, and its shadow verification | Complete |

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice below reuses
      an existing pattern (ADR-0028's shape, ADR-0022's identifier
      discipline, `platform.emit_event()`'s own subject-pair and
      required-parameter conventions)

## 5 · Findings, read before design

### 5.1 · What this epic does not do, and why — found before writing any SQL

The roadmap's own one-line summary reads "this epic ends the trigger-based
state machine." Checked against `DATABASE_ARCHITECTURE.md` §18 itself
("Workflow Instance — one workspace-scoped run of a definition") and
against what the five legacy triggers actually key off
(`public.service_requests`/`public.quotes`, both keyed by `profiles.id`,
not a workspace): a workflow instance requires a real workspace-scoped
subject, and requests/quotes do not have one until Epic 12's own migration
gives them one. Epic 12's roadmap line is explicit that this is *its* job:
"Marketplace Engine. Requests, quotes, engagements migrated onto the new
schema and driven by workflow definitions rather than triggers."

**Decision, made without stopping — this is a read-before-design
correction, not a fork with two live product consequences:** this epic
builds the real, generic engine and authors the actual booking-lifecycle
rules as a genuine published definition. It does not touch
`public.service_requests`, `public.quotes`, or retire any of the five
legacy triggers — that is recorded as Epic 12's own work, not silently
dropped. Unlike Epic 08's public-visibility fork, both readings here lead
to the same artifact quality; only the wiring timing differs, and the
frozen documents already settle which epic owns it.

### 5.2 · No backfill, unlike every preceding engine epic

Epics 05–08 each migrated real existing data into a new aggregate.
Workflow has no predecessor data — the closest existing structure
(`service_requests`/`quotes` status columns) is exactly what §5.1 explains
cannot yet become a real instance subject. Shaped like Epic 05's original
build, not Epics 06–08's six-step migration.

### 5.3 · subject_type/subject_id reuses `platform.emit_event()`'s own
precedent, not a new polymorphic pattern

Nothing in this schema yet has a real workspace-scoped process to attach
an instance to. `work.workflow_instances.subject_type`/`subject_id` is a
polymorphic `(text, uuid)` pair with no foreign key — the identical shape
`platform.emit_event()` (migration 0023) has held since before this epic
existed, reused rather than reinvented.

### 5.4 · What §18 lists that this epic deliberately does not build yet

"Who may perform" (kept, as `actor_role`, since identity roles are real
today), "evidence required," "timing expectations" and "notifications"
are all named in §18 but correspond to nothing real in the current schema
— no evidence-collection step, no SLA/timer concept, and Notification is
Epic 19's own unbuilt engine. Each is a real, named future column, not
invented ahead of a consumer, matching the restraint Epic 08 held for
maintenance-record subject types.

### 5.5 · The one legacy detail that would have silently become a bug:
the quotes_ready self-loop

`handle_quote_sent()` guards its own update with `where status =
'collecting'` — a second quote submitted while already `quotes_ready`
silently changes nothing. A workflow instance has no such implicit guard:
without a matching rule, a second `QuoteSubmitted` from `quotes_ready`
would be an impossible transition and raise. Found by re-reading the
trigger's own guard clause rather than assuming "one event, one rule" —
`workflow_transition_rules` for `booking_request_lifecycle` includes an
explicit `quotes_ready -> quotes_ready` self-loop on `QuoteSubmitted`,
proven in `VERIFY_WORKFLOW_CONTRACT.sql` §3.

### 5.6 · What is deliberately not reproduced in the definition, and why

`handle_quote_accepted()` does three things: move the request to `booked`
(the transition), decline every other open quote, and open a
conversation. Only the first is a stage transition. Conflict 3 also names
"cascading changes" as something that belongs in workflow definitions
eventually, but no action/effect mechanism exists on
`workflow_transition_rules` yet — building one now would be inventing a
mechanism with no real consumer to prove its shape against. Epic 12
designs it when it has a real instance to attach the effect to; named
here as an open gap, not silently dropped.

### 5.7 · `actor_role` was read from the real callers, not assumed

Checked against `src/lib/requests.js` and `src/customer/CustomerApp.jsx`
rather than guessed: `markComplete()` is called from `CustomerApp.jsx`,
meaning `JobCompleted` is a customer action, not a pro action — easy to
get backwards without checking, since "the pro finished the job" reads
as the more natural default.

## 6 · Platform Discoveries

- **`platform.emit_event()`'s `subject_type`/`subject_id` pair, unused by
  any caller but the one at migration 0023, is now proven as a real,
  reusable pattern** — the second caller of that shape in this roadmap,
  and the first to reuse it for something other than the Event Backbone
  itself.
- **`property.reparent_location()` (Epic 06) turned out to be the closest
  precedent in this whole codebase for "a real write contract with no
  client caller yet"** — its exact grant posture (engine role only, no
  `api.*` delegate, identifiers all required parameters) is reused
  unmodified for all four workflow contract functions.
- **The booking lifecycle's own event vocabulary (`RequestCreated`,
  `QuoteSubmitted`, `QuoteAccepted`, `JobCompleted`, `ReviewSubmitted`) —
  already real, already emitted by migration 0012 — needed no
  translation** to become `work.workflow_transition_rules.event_key`. The
  definition and the legacy trigger chain speak the same language by
  construction, which is what makes the shadow verification a genuine
  proof rather than a hand-wave.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches
`public.service_requests`, `public.quotes`, or any of the five legacy
triggers — they continue to run exactly as before. Nothing built here has
a client caller yet.

**What was not done: nothing in this epic has been run against any
database.** Five new migrations (`0066`–`0070`), two diagnostics, all
written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0066`–`0070` not applied to any environment | **Critical** before Epic 12 pins a real instance to this engine | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| The five legacy triggers are unchanged and still authoritative | Expected, by design (§5.1) | Epic 12's own roadmap entry |
| No action/effect mechanism for a transition's side effects (decline-other-quotes, open-conversation) | Named gap (§5.6) | Epic 12's own design work |

## 8 · Verification performed

**Automated.** 978 → **1023 tests**, 89 → **94 files** across this epic.
Every package ran lint, type-check, test and build before moving to the
next; all green. No client-side code changed — no journey uses this
engine yet.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. `VERIFY_WORKFLOW_DEFINITIONS.sql` and
`VERIFY_WORKFLOW_CONTRACT.sql` are both written and structurally
comprehensive — the latter is the shadow verification promised by 0070's
own header, walking a synthetic instance through every one of the five
legacy events plus the multi-quote no-op and the impossible-transition
refusal — but neither has executed against a real Postgres instance.

## 9 · Sign-off

- [x] All five work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now six epics deep

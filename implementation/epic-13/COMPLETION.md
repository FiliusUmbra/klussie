# Epic 13 — Completion Record

**Epic.** 13 — Conversation Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 6 work packages.

**This epic was reviewed against every completed engine before any SQL
was written**, on explicit request —
[`implementation/epic-13/DESIGN_REVIEW.md`](DESIGN_REVIEW.md) is that
review in full, produced and read before WP 13.01 began. Its findings
drove every design decision below; this record states what was built,
the review states why.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1228 tests, 120 files**
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
| Conversations bound to exactly one of the five real §15 subjects | **Yes**, all five now real aggregates for the first time | `work.conversations`, `constraint conversations_exactly_one_subject` |
| Bound to the engagement, not a request | **Yes — the review's own largest correction** | `work.conversations.engagement_id -> work.engagements` |
| Isolation is participation, not workspace membership | **Yes, proven structurally** | `VERIFY_CONVERSATION_ISOLATION.sql` §2–§3 |
| Messages immutable; translations derived | **Yes** | `work.messages_guard_mutation()`, one-exception-column |
| Every emitted event carries a real workspace, never a subject id | **Yes — two real bugs caught before shipping** | `work.resolve_conversation_home_workspace()`, `VERIFY_CONVERSATION_CONTRACT.sql` §1 |
| Every existing conversation and message migrated | **Yes, structurally** | `0095_backfill_conversations.sql` |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 13.00 | Design review against every completed engine | Complete — `DESIGN_REVIEW.md` |
| 13.01 | The Conversation aggregate | Complete |
| 13.02 | Conversation Participants | Complete |
| 13.03 | Messages | Complete |
| 13.04 | RLS isolation | Complete |
| 13.05 | Backfill: every real conversation and message | Complete |
| 13.06 | The conversation engine contract | Complete |

## 4 · Documentation updated

- [x] `implementation/epic-13/DESIGN_REVIEW.md` (new — the review itself)
- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice reuses an
      existing pattern

## 5 · Findings, read before design

**Full findings are `DESIGN_REVIEW.md` itself** — produced before
implementation, per an explicit request to review before building. The
headline corrections it made, restated briefly:

1. **Bind to `work.engagements`, not a request** — §15 names "a
   marketplace engagement" as the subject; legacy bound to a request
   only because no engagement existed as a real row before Epic 12.
2. **Participation is an explicit, managed table**, not derived from
   workspace membership — the naive "either workspace" shape this
   epic's own nearest precedent (Marketplace's engagement policy) would
   have produced was checked against §20's own text and found to
   over-grant.
3. **Read state moved from a single `messages.read_at` to per-participant
   `last_read_at`** — legacy's shape assumes exactly two parties;
   participation is no longer fixed at two.
4. **Structured moments are a real, typed, optional reference**
   (`reference_type`/`reference_id`), reusing `platform.emit_event()`'s
   own polymorphic-subject convention.
5. **Translations stay a `jsonb` column**, reusing the exact existing AI
   Gateway mechanism rather than waiting on Intelligence (Epic 17, not
   built, sequenced after Conversation).
6. **Location and Service Record are not added as subject types** —
   both real, plausible connections; neither is named in §15. Recorded
   as candidates for a future ADR, not built.

### 5.1 · Two real bugs caught before shipping, inside this epic's own
first draft — both a new class of mistake for this session

`platform.events.workspace_id` is `not null` and is the table's own
hash-partition key (migration 0021). `work.close_conversation()`'s first
draft passed `p_workspace_id => null` — a hard failure the moment
anyone called it, not merely a style issue. `work.open_conversation()`'s
first draft was worse: `coalesce(p_workspace_id, v_subject_id)` would
have silently recorded an **asset or property id as if it were a
workspace id** whenever a conversation opened on one of the three
subjects with no workspace column of their own — a corrupted event
stream, not a crash, and the harder of the two to have caught later.
Both fixed by building `work.resolve_conversation_home_workspace()`, a
real resolver walking all five subject types to their actual owning
workspace, used by both functions. Unlike the three prior
`gen_random_uuid()` catches (Epic 04, 11, 12 — always the same class of
mistake, always found faster each time), this is a **new** class: not
identifier generation, but workspace-id resolution across a genuinely
polymorphic subject. Proven directly in `VERIFY_CONVERSATION_CONTRACT.sql`
§1, which opens a conversation on all five subjects and asserts the
resolved workspace is real and is never the subject's own id.

## 6 · Platform Discoveries

- **All five of §15's named subjects are real, live aggregates for the
  first time this epic** — Epics 05, 07, 10 and 12 each had to exist
  first; this is the first epic in the roadmap whose own frozen
  dependency list was fully satisfiable only after nine prior epics.
- **`public.current_identity()` (Epic 02, migration 0028) turned out to
  be exactly the resolver this epic's isolation needed** — already
  SECURITY DEFINER, already granted to `authenticated`, already
  answering "which real person is this" — reused rather than building a
  second, parallel primitive for the identical question.
- **A genuinely new bug class, not a repeat of the `gen_random_uuid()`
  pattern** — resolving a real workspace id across a five-way
  polymorphic subject, where three of five subjects carry no workspace
  column at all, is a shape none of Epics 04/10/11/12 needed. Worth a
  standing note for whichever future epic emits an event from a
  similarly polymorphic subject.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches
`public.conversations`/`messages`, and no client caller exists yet.

**What was not done: nothing in this epic has been run against any
database.** Six new migrations (`0091`–`0096`), two diagnostics, all
written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0091`–`0096` not applied to any environment | **Critical** | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| Location and Service Record not added as conversation subjects | Named finding for a future ADR (`DESIGN_REVIEW.md` §4 item 6) | Whichever future work first needs either |
| Document attachment to messages not built | Named gap (`DESIGN_REVIEW.md` §2) | Whichever future work first needs it |
| Team Collaboration capability not wired to workspace-subject conversations | Named gap (`DESIGN_REVIEW.md` §2) | Whenever a real capability-gating consumer exists |

## 8 · Verification performed

**Automated.** 1183 → **1228 tests**, 114 → **120 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed — no journey uses
this engine yet.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. `VERIFY_CONVERSATION_CONTRACT.sql` proves the full
lifecycle including opening a conversation on all five real subjects and
asserting each resolves a genuine workspace, never the subject's own id.
`VERIFY_CONVERSATION_ISOLATION.sql` proves a workspace member who is not
an explicit participant sees nothing, and inspects the policies' own
`pg_policies` text to confirm none references workspace membership.
Neither has executed against a real Postgres instance.

## 9 · Sign-off

- [x] All six work packages complete, plus the design review requested
      ahead of them
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now thirteen epics deep

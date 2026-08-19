# Epic 15 — Completion Record

**Epic.** 15 — Timeline & Digital Twin
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 3 work packages.

Not a new engine. `SYSTEM_ARCHITECTURE.md` §3's own ownership table says so
directly: the Timeline projection and the Digital Twin composition are
both owned by **Property** (Epic 05), not by a new schema of their own.
This epic extends `property`'s existing contract with two read functions
— nothing else.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1293 tests, 128 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — PR to be opened
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed. ADR-0019 stays authoritative and untouched — §6's fix
      conformed seven epics' implementation to it, not the reverse.
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Same standing gap as every epic since
      Epic 03. **See §6 — this epic's read-before-design pass surfaced,
      and this session then fixed, a defect this gap had been hiding
      since Epic 06.**

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Timeline scoped to stewardship periods (§25) | **Yes** | `property.timeline_segment()` unions the current window with every past one the caller's own workspace held |
| The twin is assembled, never stored (§28) | **Yes, structurally** | No new table; `property.assemble_twin()` is a live `select`, nothing persisted |
| Only narrow summaries may be materialised (§28) | **Yes** | Five `count(*)` fields, nothing nested, no duplicated rows |
| A past steward keeps their own record, gains nothing after | **Yes, proven** | `VERIFY_TIMELINE_TWIN.sql` §3–4 |
| A non-steward gets nothing from either function | **Yes, proven** | `VERIFY_TIMELINE_TWIN.sql` §5 |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 15.01 | Event stream and cross-engine read access | Complete |
| 15.02 | Timeline segment | Complete |
| 15.03 | Digital Twin composition | Complete |

No backfill work package — Timeline and Twin are pure projections
(`DATABASE_ARCHITECTURE.md` §3/§4: both classified *Projection*, "may be
rebuilt at will"). There is no legacy table shaped like either one to
migrate from; `src/lib/homeTimeline.js`'s client-derived history has no
server-side equivalent to dual-write against, only requests/quotes/
reviews it already reads.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice reuses an
      existing pattern or is justified directly from `DATABASE_ARCHITECTURE.md`
      §25/§28 and `SYSTEM_ARCHITECTURE.md` §7.1's own text

## 5 · Findings, read before design

### 5.1 · Timeline and Twin belong to Property, not a new engine

§3's aggregate/projection ownership table: "Timeline | Property" and
"Digital twin composition | Property." §7.1 confirms it in prose: Property
"Owns... The Timeline projection. The digital twin composition." The
roadmap's own epic name ("Timeline & Digital Twin") names a capability,
not a new schema — no new engine role, no new schema, both functions live
in `property`, granted to `klussie_engine_property`.

### 5.2 · A pre-existing bug: `klussie_consumer_delivery` has never been
able to read `platform.events`

`0021_events.sql` grants it `SELECT` and enables RLS on the table with
**no policy** — its own comment states plainly that this "denies every
role that does not bypass it." A table-level `GRANT` does not bypass RLS;
only ownership or `BYPASSRLS` does, and `klussie_consumer_delivery` has
neither. Since Epic 01, that role's grant has been dead code. Nothing in
this session caught it because live verification has been Pending since
Epic 03 — this is exactly the class of defect that only surfaces against
a real Postgres instance. Fixed in `0102_timeline_twin_access.sql`, in
the same migration that needs the identical shape of access for Timeline:
one policy, naming both roles, `using (true)`.

### 5.3 · Document resolution deliberately excluded from Timeline v1

§7.1 names document events among what Property's timeline consumes. Left
out for two independent reasons: Document engine (Epic 08) has never had
a write contract — no `DocumentAttached`-shaped event has ever been
emitted, so the branch would be correct but permanently untestable until
that gap closes; and `0056_document_attachments.sql` states outright that
"No isolation policy anywhere in this schema may ever join through it to
decide who can see a document" — a different concern than Timeline's own
(scoping an already-authorized read, not granting new visibility), but
close enough to an explicit warning that leaving it out until there is a
real event to test against was the more honest choice. Additive later,
without redesign.

### 5.4 · Asset and location lifecycle events don't exist yet either —
Timeline is thinner than its eventual shape, not empty

Same root cause as §5.3 — Asset engine (Epic 07) has never emitted an
event. But `subject_type` `'asset'`/`'location'` is not exclusively asset
lifecycle events: Maintenance (Epic 10) already emits real,
populated `maintenance.maintenance_obligation.created`/`.closed` and
`maintenance.maintenance_schedule.changed` events keyed to the asset or
location they concern. Timeline surfaces those today; it will surface
more once Asset has its own write contract, without any change to
`0103_timeline_contract.sql`.

## 6 · A session-spanning defect found while writing this epic's own
diagnostic, found AND fixed in this epic

Building `VERIFY_TIMELINE_TWIN.sql` meant calling real contract functions
from Epics 09–14 for the first time this session with an eye toward
actually running them. Doing so surfaced that **every `emit_event()` call
in every engine contract since Epic 06 used the wrong `event_type`
format.**

`0021_events.sql`'s own check constraint — `event_type ~
'^[a-z_]+\.[a-z_]+\.[a-z_]+$'` — enforces ADR-0019's stated convention,
`<engine>.<aggregate>.<past-participle>`. Every contract function this
session had actually written used a bare PascalCase word instead —
`'ObligationCreated'`, `'ConversationOpened'`, `'PaymentAuthorized'`, and
31 others, **34 distinct values across 7 already-open epics/PRs (06, 09,
10, 04, 11, 12, 13, 14)**, none matching the constraint. Every one of
those `emit_event()` calls would have failed its `CHECK` constraint
outright the first time it ran against a real Postgres instance.

This was never caught because — the same root cause named throughout
every prior epic's own completion record — **nothing this session had
ever run against a real database.** It was a text-pattern convention
consistently applied across seven separate epics' worth of independently-
written code, which is precisely why it went unnoticed: each epic's own
JS test suite asserts the exact string it wrote is present, so the tests
passed every time regardless of which convention was correct, and
nothing had ever exercised the actual `CHECK` constraint.

**Fixed, on explicit instruction, across all seven affected branches**:
ADR-0019 stays authoritative and unmodified — the implementation was
wrong, not the frozen document. Every one of the 34 call sites, each
epic's own test assertions, and the affected `comment on function` prose
were corrected on their own branch (`epic-06/location-engine` through
`epic-14/billing-engine`), verified against `SYSTEM_ARCHITECTURE.md`'s
own per-engine "Events produced" lists rather than mechanically
lower-cased — two real corrections came out of that verification, not
just reformatting: Workflow's actual code said `WorkflowInstanceStarted`/
`WorkflowInstanceTransitioned`, but §8.3's own frozen vocabulary says
`WorkflowStarted`/`WorkflowTransitioned` — the dotted form keeps
`workflow_instance` as its aggregate anyway, matching the real table;
and Capability's aggregate is `capability_grant` (§3's own ownership
table — "Capability grant | Capability"), not bare `capability`, even
though `subject_type` stays `'capability'` (out of scope — this fix
touched only `event_type`, not `subject_type`). Each branch was rebased
onto its corrected parent, re-tested in full, and re-pushed — every
epic's own recorded test count (792, 875, 978, 1023, 1053, 1096, 1136,
1183, 1228, 1269) reproduced exactly on its branch after the fix. This
epic's own `VERIFY_TIMELINE_TWIN.sql` was corrected the same way (its one
direct `emit_event()` call, `'ObligationCreated'` -> `maintenance.
maintenance_obligation.created`). Full mapping and per-branch rationale
live in each affected migration's own header comment, added at the same
time as the fix, not summarised again here.

## 7 · Platform Discoveries

- **`property.timeline_segment()`/`assemble_twin()` are the first
  functions in this codebase, other than `klussie_consumer_delivery`
  itself, to read `platform.events` directly** — every other engine reads
  only its own schema plus a narrow, named grant on one adjacent engine's
  tables (Epic 14's own `work.engagements` grant is the nearest
  precedent). Reading the event stream itself is architecturally
  required here, not a shortcut — §25's own words, "derived from events,
  never maintained separately," rule out any alternative that caches or
  dual-writes a copy.
- **The "self-enforcing by construction" pattern (`property.
  resolve_property()`, 0041) reused for a fourth engine-internal read**:
  neither new function relies on `platform.events`' `using (true)` policy
  for per-caller correctness — that policy only keeps client roles out.
  The caller's own stewardship window (Timeline) or current membership
  (Twin) is what actually decides what comes back, resolved inside the
  function's own joins, the same shape `api.resolve_property()` already
  established four epics ago.

## 8 · Regressions and known issues

**No regression possible.** Nothing in this epic touches
`src/lib/homeTimeline.js` or any client surface; both functions are pure
additions with no existing caller.

**What was not done: nothing in this epic has been run against any
database** — the same standing gap. §6's own discovery no longer blocks
that the moment a real connection exists: every affected `event_type`
call site was corrected on its own branch before this epic closed.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| ~~`event_type` format violated its own CHECK constraint across 34 call sites, 7 epics~~ — found and fixed in this epic | ✅ Closed | §6 above; `MASTER_CONTEXT.md` §12 |
| Document resolution absent from Timeline until Epic 08 has a write contract | Named, deliberate (§5.3) | This section |
| Asset/location lifecycle events absent until Epic 07 has a write contract | Named, deliberate (§5.4) | This section |

## 9 · Verification performed

**Automated.** 1269 → **1293 tests**, 125 → **128 files** across this
epic. Every package ran lint, type-check, test and build before moving to
the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. `VERIFY_TIMELINE_TWIN.sql`
proves the full scenario on paper: a past steward reads exactly the one
event inside their own closed window, the current steward reads exactly
their own four (correctly excluding the past steward's), a stranger who
never stewarded the property gets nothing from either function, and the
twin's five summary counts are correct and current-steward-only. Not
executed against a real Postgres instance — but per §6, no longer blocked
from succeeding by an `event_type` format defect; every call site it
exercises across Epics 10, 11, 12, 13 was corrected before this epic
closed.

## 10 · Sign-off

- [x] All three work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now fifteen epics deep — no longer additionally blocked on the
      `event_type` fix (§6), which is done

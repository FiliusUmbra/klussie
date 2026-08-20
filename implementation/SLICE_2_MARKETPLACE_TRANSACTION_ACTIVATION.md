# Slice 2 — Marketplace Transaction Activation: Scoping

**This document owns:** the concrete work-package breakdown for
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, Slice 2 — "the single riskiest slice in the programme," worked in
full as that document's own §2 example. It does not own the Programme's
cross-cutting reasoning, which this document applies rather than
restates.

**Status.** Scoping, WP 2.0 done. Slice 1
(`SLICE_1_PROPERTY_ASSET_ACTIVATION.md`) is the nearest precedent in
shape — real engine logic built ahead of a caller, needing
authorization checks and `api.*` delegates before any client can reach
it — but Slice 2 starts from a **materially different position**, named
in full in §1 below, and is not simply "Slice 1's pattern, five more
functions." The two structural differences that actually matter: this
slice's foundation sat unapplied and unverified against any real
database until WP 2.0 (§1.1 below), and this slice's own end state
requires *retiring* a live, currently-used system, not merely adding
beside it.

---

## 1 · What was found before scoping this

### 1.1 · The foundation exists, in full, and — as of WP 2.0 — has now been verified against a real database

Epic 12 (`implementation/epic-12/COMPLETION.md`) already built the
complete engine: `work.requests`/`work.quotes`/`work.engagements`
(migrations `0085`–`0087`), RLS isolation policies (`0088`), a backfill
of every real legacy request/quote/booked-engagement (`0089`), and
thirteen functions covering the full lifecycle — create, withdraw,
quote, decline, accept (with the same bulk-decline-the-losers behaviour
the legacy trigger already has), complete, cancel, mark-reviewed, and
five reads (`0090`). Two diagnostics already exist and are already
written to prove it: `VERIFY_MARKETPLACE_CONTRACT.sql` (a full
request → two quotes → acceptance → completion → review walkthrough,
proving equivalence to the five legacy triggers) and
`VERIFY_MARKETPLACE_ISOLATION.sql`.

**As scoped, none of it had ever run.** Epic 12's own completion record
stated this in its own words: *"Nothing in this epic has been run
against any database... including the backfill, which has real,
structural implications for a large volume of existing data."* Every
engine Slice 1 built contracts on top of (Property, Asset, Location,
Document, Maintenance) was already live on staging before Slice 1
started. This one was not. **WP 2.0 existed because of this fact
alone** — it has no equivalent in Slice 1's own sequence.

**WP 2.0 finding, corrected from the above.** Checking staging directly
found migrations `0085`–`0090` already recorded as applied — most
likely a side effect of a `supabase db push --linked` run during an
earlier Slice 1 work package, since a push applies every migration not
yet in the ledger, in order, not only the newest one. Both diagnostics
were then run for the first time, against real staging, inside a rolled
back transaction: `VERIFY_MARKETPLACE_CONTRACT.sql` (7 checks — the
full request → two quotes → acceptance → completion → review
walkthrough, and confirms `workspace.memberships` is never touched
across it) and `VERIFY_MARKETPLACE_ISOLATION.sql` (3 checks — real
two-sided isolation, the quotes policy's OR predicate, every backfilled
row resolving to a real workspace) — both passed in full, with zero
debris.

**The backfill itself remains genuinely unexercised, honestly.**
`public.service_requests` and `public.quotes` both hold zero rows on
staging — there is no real legacy marketplace activity there yet, the
same "zero discrepancies is true and worthless" gap
`staging_test_accounts.sql`'s own header names for identity
reconciliation. `0089`'s `insert ... where not exists` ran without
error against an empty source, which proves the statement is
syntactically sound and idempotent, not that its actual per-row mapping
logic is correct — that can only be proven once staging holds real
`service_requests`/`quotes` rows, which it does not yet. Carried forward
as a real, open verification gap for whichever work package first
creates marketplace activity through the real client (WP 2.6, most
likely), not closed here by asserting more than the evidence supports.

### 1.2 · Two-sided authorization — a real, different shape from every Slice 1 engine

Every Slice 1 engine had exactly one steward workspace to check
membership against. A request has a *requesting* workspace (the
customer); a quote and an engagement each have a requesting party *and*
an offering/performing party, and both must see it — a customer
comparing quotes needs to see every quote on their own request, not
only ones they authored. This is not a new problem: Epic 12's own RLS
policies (`0088`) already express the correct two-sided check —

```sql
using (
  offering_workspace_id in (select workspace_id from api.current_workspace_memberships())
  or request_id in (
    select r.id from work.requests r
    where r.requesting_workspace_id in (select workspace_id from api.current_workspace_memberships())
  )
)
```

— for quotes, and the simpler both-sides-direct form for engagements.
Those policies are currently inert (`authenticated` holds no table-level
grant on any of the three tables — RLS needs both a policy and a grant
to do anything), but their own `WHERE`-shaped logic is the template
this slice's read-contract functions should port into a `stable sql`
function body, not reinvent. This is the one piece of Slice 2's harder
authorization work that is already solved and only needs relocating.

### 1.3 · The scoped access grant has no owner — a real, load-bearing gap, not restraint

`DATABASE_ARCHITECTURE.md` §19: accepting a quote should create "a
scoped, time-bounded membership (§10) for the performing workspace over
exactly the locations and assets the work concerns." Epic 12's own
completion record (§5.2) documents catching this **as a structural
impossibility, not a design choice**: the first draft of
`work.grant_engagement_access()` inserted directly into
`workspace.memberships` from the `work` schema — `klussie_engine_work`
holds no privilege whatsoever on that table, only
`klussie_engine_workspace` does. The function was deleted rather than
patched around the boundary. `SYSTEM_ARCHITECTURE.md`'s own Workspace
engine section already names the correct shape: *"Events consumed.
`EngagementAccepted` (to create a scoped, expiring grant)"* — a
Workspace-owned consumer of Marketplace's own `marketplace.engagement.
created` event. **No background event consumer exists anywhere in this
codebase** (`MASTER_CONTEXT.md` §12) — this is not "add a check," it is
new infrastructure with no precedent in this roadmap to copy.

Without it, a professional who accepts a booking still cannot see the
customer's own Location/Asset/Document twin for the property the work
concerns — Slice 1's own physical twin stays invisible to the party
actually doing the work, which is a real, felt gap, not a theoretical
one, the moment Slice 2's screens go live.

### 1.4 · Directed booking (ADR-0012, "one-tap booking") is not modelled, and is real, live, regression-pinned behaviour

`public.service_requests.directed_pro_id`/`directed_until`/
`auto_accept_max` power one-tap booking — a live customer journey,
pinned in the regression baseline as **C11: "One-tap booking creates a
directed request"** (`docs/engineering/TESTING.md` §5.2). `work.
requests` has no equivalent columns; Epic 12's own header names this
explicitly as a real gap, not an oversight, and suggests it becomes
workflow-definition configuration once a real caller needs it —
`work.requests.workflow_instance_id` exists for exactly this, also
unpopulated. **This slice is that real caller.** Whatever
`create_request()`'s own caller-checked wrapper (WP 2.3) ends up
looking like, it must account for C11 before it can replace
`src/lib/requests.js`'s own `createDirectedRequest()` — silently
dropping one-tap booking would break a pinned regression, not merely a
convenience.

### 1.5 · Three deliberately undone steps, each independently gating

Epic 12's own header (`0085`, repeated in its completion record §5.1)
names the actual behavioural switch as "the single largest behavioural
risk in the roadmap" and lists three things it deliberately did **not**
do, each requiring its own decision, not a bundled one:

1. **The dual-write trigger for the scoped access grant** — not built
   anywhere (§1.3 above is the real reason: it cannot be built from
   `work` at all).
2. **Retiring or modifying any of the five legacy triggers** —
   `on_request_created`, `on_quote_sent`, `on_quote_accepted`,
   `on_job_completed`, `on_review_created` (`0001`/`0012`) all still
   run, untouched, today.
3. **Switching the live booking flow to be workflow-instance-driven** —
   `work.requests.status` is a plain column; Epic 09's real workflow
   engine (`work.workflow_instances`, the `booking_request_lifecycle`
   definition, migration `0070`) exists but has never been attached to
   a real request.

The roadmap's own risk register (§23 row 2) names the **regression
baseline as the gate** for step 2 specifically: *"Workflow definitions
must reproduce current trigger behaviour exactly before the switch;
regression baseline from 00.08 is the reference."* **That baseline
already exists** — `docs/engineering/TESTING.md` §5.3 (C10–C21) already
pins the full legacy request/quote/completion/review flow, maintained
live through WP 1.8's own baseline update this session. The stated
precondition for step 2 is therefore already satisfied structurally;
what remains is doing the cutover itself without breaking any pinned
row, which is a verification discipline question, not a missing
artifact.

**Step 3 (the workflow-instance switch) is not addressed by this
document.** It is named here because Epic 09/12 both flag it as real,
deliberately deferred work, not because this slice resolves it — see
§5's open questions for why it is left as a genuine decision rather
than silently folded into or excluded from this slice's own scope.

### 1.6 · One-time backfill, not a standing mechanism — the same shape as `0040_backfill_property.sql`

`0089_backfill_marketplace.sql` is a snapshot `insert ... select ...
where not exists (...)`, idempotent against re-running but **not a
trigger** — it captures every request/quote/booked-engagement that
existed the moment it runs. Between applying it (WP 2.0) and the actual
live cutover (WP 2.6), any new legacy activity will not appear in
`work.*` unless the backfill runs again immediately before cutover, or
a short dual-write window is accepted. Named here as a real operational
detail the cutover work package must state a real answer to, not
assumed away by the migration's own existence.

### 1.7 · Provider Intelligence is out of scope here, by the schema's own design

Epic 12's completion record states this as a met acceptance criterion:
*"Provider selection is not in this epic... every function takes the
offering/performing workspace as a given."* `pro_matches_request()`
(the legacy bare-SQL matcher) still runs unchanged after this slice —
the Legacy Inventory's own row splits its replacement across "Slice
2/6," and nothing found during this scoping pass changes that split.
Slice 2 cuts over the request/quote/engagement data model only; ranked,
geo-aware matching stays Slice 6's job.

### 1.8 · Realtime subscriptions are part of the client cutover, not incidental to it

`src/lib/requests.js` (250 lines, 13 exports) includes four live
Supabase Realtime subscriptions —
`subscribeToCustomerRequests`/`subscribeToRequestQuotes`/
`subscribeToProLeads`/`subscribeToProQuoteUpdates` — wired to the
legacy tables today. The client write-cutover work package (WP 2.6)
must re-point these at `work.requests`/`work.quotes`, not only the
fetch functions; Realtime failing silently reads identically to "no new
leads," a regression a customer or pro would feel immediately and
attribute to the product being broken, not to a missed subscription.

### 1.9 · Reputation and reviews stay legacy — a real, named, unclosed row

`SYSTEM_ARCHITECTURE.md` §8.4 names a reputation projection among this
engine's owned outputs; no `work.reviews` aggregate exists anywhere in
the frozen architecture to compute one from. `work.
mark_request_reviewed()` only completes the request's own state
machine — review *content* stays on legacy `public.reviews` even after
this slice ships. The Legacy Inventory's own "hand-computed trust
score... Slice 3" row already names the real owner of this; Slice 2
does not attempt it and should not be read as having done so once its
own screens move.

### 1.10 · What Slice 1 already gives this slice, for free

`work.requests.property_id`/`asset_id`/`location_id` (at most one
non-null) already let a request reference a real Location or Asset —
meaning "this is about the boiler" is structurally expressible the
moment a real property exists, which WP 1.0 now guarantees for every
account. `ServiceSheet.jsx` does not need new schema to let a customer
pick which asset a request concerns; it needs a picker reading
`api.my_assets()`/`api.locations_for_property()`, both of which already
exist and are already live on staging. Named as a genuine dividend of
Slice 1's own sequencing, not assumed without checking.

---

## 2 · Work package sequence

Four tiers, not two — Slice 1's Tier 1 (Read) / Tier 2 (Write) split
does not fit here, because this slice's actual risk is concentrated in
the *cutover* itself (Tier 3), which has no equivalent risk class
anywhere in Slice 1.

**Resequenced for Platform Activation Priority.** The programme's own
priority is now explicit: prefer letting a real user experience an
existing capability over building further backend capability, unless
architecture, security or correctness would be compromised. Read
against that, WP 2.4 (the scoped access grant consumer) is genuinely
new infrastructure — no background event-consumption mechanism exists
in this codebase yet — that the core request → quote → accept →
complete journey does not need to function for a real user: legacy
already runs the identical journey today with no such grant existing at
all, and Epic 12's own completion record already named its absence a
structural gap carried forward, not a blocker. It now runs **after** WP
2.6, as a fast-follow enhancing an already-activated engine, not
gating the activation itself. WP 2.0–2.3 and 2.5–2.6 keep their
original order and numbering; only WP 2.4's position in the sequence
changes, not its number or scope.

### Tier 0 — Foundation

**WP 2.0 — Apply the foundation; prove it, for the first time, against a real database — Done, see §1.1**

Apply migrations `0085`–`0090` to staging. Run
`VERIFY_MARKETPLACE_CONTRACT.sql` and `VERIFY_MARKETPLACE_ISOLATION.sql`
— both already written, both already six months' equivalent of
engineering deferred verification, neither ever executed. Confirm the
backfill's real row counts against `public.service_requests`/`quotes`
match expectations before anything is built on top of it. This work
package exists only because of §1.1 — nothing else in this slice can
proceed responsibly until the foundation it depends on has actually
been checked against production-shaped data, not merely reviewed as
SQL text.

### Tier 1 — Read

**WP 2.1 — The request/quote/engagement read contracts — Done**

`api.my_requests()`, `api.resolve_request()`, `api.quotes_for_request()`,
`api.my_quotes()`, `api.my_engagements()` — same two-layer shape as
every prior read switch this programme has built, with one real
difference: `quotes_for_request()`/`my_engagements()`'s own
authorization check is two-sided, and should port `0088`'s own RLS
predicate (§1.2) rather than re-derive it. Shipped as `0145`, verified
on staging: the customer sees both competing quotes on their own
request; each pro sees only their own quote, never a competitor's.

### Tier 2 — Write

**WP 2.2 — Decision: how directed booking is represented — Done**

Resolve §1.4. Real options — new columns on `work.requests` mirroring
legacy's three, or workflow-definition configuration per `0085`'s own
suggestion — named here because `create_request()`'s own caller-checked
wrapper (WP 2.3) needs a real shape to build against, the same way WP
1.0 was resolved before WP 1.4 needed it. Decided: new columns
(`directed_workspace_id`/`directed_until`/`auto_accept_max`) — workflow-
definition configuration would have silently pulled in §1.5's own step
3, explicitly left open by this document. Shipped as `0146`, alongside
WP 2.3 below (one migration, one decision plus its own implementation,
per this program's own §1.3). Found and did not reproduce a real bug in
legacy's own equivalent: `directed_until`'s column default breaks every
ordinary insert once it fires — reproduced directly against staging,
checked (read-only) against production too. Flagged to the user, not
silently fixed on legacy's own table, which this migration never
touches.

**WP 2.3 — The request/quote/engagement write contracts — Done**

`api.create_request()`, `api.withdraw_request()`, `api.submit_quote()`,
`api.decline_quote()`, `api.accept_quote()`, `api.complete_engagement()`,
`api.cancel_engagement()`, `api.mark_request_reviewed()` — the same
"new caller-checked wrapper around the existing, unmodified `work.*`
function" shape WP 1.7 and WP 1.10 both already established, for the
identical reason: every one of these thirteen `work.*` functions is
currently reachable by `klussie_engine_work` only, with no membership
check of its own, and none should be redefined in place. Shipped as
`0146`. `submit_quote_for_caller()`'s own auto-accept cascade (a direct
call to the unmodified `work.accept_quote()`, no trigger recursion to
mirror) verified on staging: the right workspace, inside the window, at
or under the ceiling auto-accepts; the wrong workspace does not.

**WP 2.4 — The scoped access grant consumer — moved after WP 2.6, see this section's own header**

Resolve §1.3. A Workspace-owned consumer of
`marketplace.engagement.created`, creating the real, scoped
`workspace.memberships` row `DATABASE_ARCHITECTURE.md` §19 describes.
Genuinely new: no background event-consumption mechanism exists yet in
this codebase to extend, so this work package's first job is deciding
what that mechanism actually is (a poll against `platform.events`? a
Postgres trigger-based consumer? — an open question, not resolved by
this document, see §5) before the consumer logic itself can be written.
Kept numbered 2.4 for cross-reference stability; it now executes after
2.6 in practice.

### Tier 3 — Client, and the cutover itself

**WP 2.5 — The structural equality check against the regression baseline — Done, rescoped honestly**

Originally described as `RequestsList.jsx`/`RequestDetailSheet.jsx`/
`ProDashboard.jsx`/`ProJobs.jsx` reading "alongside" legacy. Checked
directly before building that: none of those four files fetch data
themselves — `src/lib/requests.js`'s `fetchCustomerRequests()`/
`fetchProLeads()`/`fetchProJobs()` are the real read call sites
(`CustomerApp.jsx`, `ProApp.jsx`); all four named files are purely
presentational, taking already-fetched arrays as props. Wiring a live
client-side dual-fetch-and-compare into those call sites today would
compare against structurally empty ground — no dual-write exists yet
(WP 2.6's own job, §1.6), so any real customer's legacy requests would
show as "missing" from the new contract every time, for no reason but
sequencing. The exact "zero discrepancies is true and worthless" trap
this session has already named twice (Epic 02's own WP 02.05, and this
slice's own WP 2.0 backfill finding) — and per the Programme's own
Platform Activation Priority (§1.1), building comparison plumbing that
changes nothing a real user experiences, against data that cannot yet
be meaningfully compared, is exactly the backend-expansion-for-its-own-
sake the priority exists to catch.

Delivered instead: `RECONCILE_MARKETPLACE.sql` — the same
`RECONCILE_*.sql` genre `RECONCILE_ASSETS.sql`/`RECONCILE_IDENTITY.sql`/
`RECONCILE_WORKSPACE.sql` already established for exactly this role
("the evidence a read-switch needs before `src/lib/X.js` may read from
the new schema," `RECONCILE_ASSETS.sql`'s own words). Read-only,
real-data-only (no synthetic fixtures — a reconciliation proves the
backfill's own output is trustworthy, not that comparison SQL parses),
checks every eligible legacy request/quote/booking has a mirrored
`work.*` row with agreeing fields, mapping legacy's `'awaiting_pro'`
status onto `work.requests`' `'collecting'` (directed-ness is
`directed_workspace_id`, not a distinct status, per WP 2.2's own
decision). Runs today, honestly, over zero real rows on staging — the
same thin-coverage note `RECONCILE_ASSETS.sql` already reports for this
environment.

The four client files' actual cutover moves to WP 2.6, where it
belongs anyway: that work package already re-runs the backfill or
accepts a dual-write window (§1.6) — the point real overlapping data to
compare against first exists.

**WP 2.6 — Client: write cutover — the single largest behavioural risk in the roadmap**

`ServiceSheet.jsx` (create), `SendQuoteSheet.jsx` (quote),
`RequestDetailSheet.jsx` (accept/complete/review) move onto WP 2.3's
contracts, Realtime subscriptions re-pointed (§1.8), the backfill
re-run or a dual-write window accepted (§1.6), C10–C21 and C11 all
re-verified green before and after. Explicitly named by Epic 09's own
header, repeated by Epic 12's, as the actual highest-risk step in this
entire programme — this work package earns the most caution of
anything built so far, not a routine cutover pass. Also now owns
`RequestsList.jsx`/`RequestDetailSheet.jsx`/`ProDashboard.jsx`/
`ProJobs.jsx`'s own read-side move onto WP 2.1's contracts, moved here
from WP 2.5 (see that work package's own entry above) — this is the
point real overlapping legacy/`work.*` data first exists to read
against.

**Explicit acceptance bar, per the Programme's own instruction:** this
slice is a flagship of Platform Activation and must feel invisible to
the customer and professional using it while making the platform
underneath meaningfully better — not merely a data-source swap they
happen not to notice by luck. Concretely: no loading-state regression
(the dual-read/verified-switch shape must not add a visible delay a
customer or pro would feel), no missing data during the transition
(the WP 2.4-deferral empty state, §3.1, is the one deliberate,
documented exception — everything else must be there), and C10–C21/C11
passing is the *floor*, not the bar this work package is held to. If
the cutover cannot be made to feel like nothing happened, that is a
reason to slow down inside WP 2.6, not a reason to ship it anyway.

**Status, 2026-08-20: code-complete and four-gate-clean; not merged — blocked on an
external infrastructure gap, not on this work package's own code.**

The backend contracts this work package needed (0147–0157, conversations included per
the user's own explicit decision to fold that engine's activation in here) are built,
individually SQL-verified with real impersonated staging sessions, and merged (PRs
#54–#63, #65). The client rewrite itself — `src/lib/requests.js`,
`src/lib/messages.js`, `src/lib/requestPhotos.js`, and every call site that threads a
newly-required `workspaceId` — is written, passes lint/typecheck/build/the full test
suite (196 files, 1972 tests), and is pushed as a draft PR (#66), held rather than
merged.

**Why held:** driving the real app against staging in a browser (this work package's
own explicit "existing users unable to tell" bar demands nothing less) surfaced that
staging's PostgREST has never had the `api` schema exposed (`Project Settings → Data
API → Exposed schemas`) — a one-time, per-environment manual step ADR-0026 names and
that was apparently never performed here. Every `api.*` function built since Epic 03
is unreachable from the real browser client as a result, independent of and
undetectable by any SQL-level diagnostic. See `klussie-critical-infra-gap` (session
memory) for the full finding. PR #66's own description carries the exact
re-verification checklist to run once that setting is flipped, at which point this
work package converts from draft to ready and merges through the same discipline
every other WP 2.6 PR has used — no further code work is expected to be needed first.

**WP 2.7 — Retire the five legacy triggers**

Only once WP 2.6 has been live and observed for a real window (the same
"not immediately" discipline WP 1.9 states for `household_items`) —
`on_request_created`, `on_quote_sent`, `on_quote_accepted`,
`on_job_completed`, `on_review_created` dropped, `service_requests`/
`quotes` read-only for history, never written again. This is what
actually closes the Legacy Inventory's "Fully legacy — Slice 2" rows,
not WP 2.6's own shipping.

---

## 3 · Sequencing

```
WP 2.0 (apply + verify the never-run foundation)
   │
   ├──► WP 2.1 (read contracts) ──────────────┐
   │                                            │
   ├──► WP 2.2 (decision: directed booking)     │
   │        │                                   │
   │        ▼                                   │
   │    WP 2.3 (write contracts)                │
   │        │                                   │
   └────────┴───────────────┬───────────────────┘
                             ▼
                   WP 2.5 (client: read cutover, dual-read verified)
                             │
                             ▼
                   WP 2.6 (client: write cutover — highest risk in the programme)
                             │
                             ▼
                   WP 2.4 (scoped access grant consumer — fast-follow)
                             │
                        (real observation window)
                             ▼
                   WP 2.7 (retire the five legacy triggers)
```

**Revised from this document's original reasoning, honestly.** This
section originally sequenced WP 2.4 *before* the cutover, arguing that
"shipping the cutover with a professional-facing gap already known and
avoidable, rather than closed," was the kind of asymmetry worth
catching before it ships. That reasoning is not wrong on its own terms
— it still holds as a *product* argument for building WP 2.4 well.
What changed is the tie-breaker: the Programme's own Platform
Activation Priority is now explicit that, between building further
backend capability and letting a real user experience an existing one,
B wins unless architecture, security or correctness would be
compromised. WP 2.4 fails none of those three — a professional who
accepts a booking without it sees exactly what a professional sees
under legacy today, which is not a regression, only a not-yet-added
enhancement — while WP 2.5/2.6 is the entire reason this slice exists.
Genuinely new infrastructure (an event-consumption mechanism this
codebase has never had) built before a single real user has touched
the engine it enhances is the "building backend infrastructure merely
because it is possible" the Priority explicitly warns against. WP 2.4
still ships, as a fast-follow once the core journey is live and real —
not dropped, not demoted to "someday."

### 3.1 · UX discipline applied to this resequencing

The Programme's Beautiful Software directive asks that a backend
decision with UX implications be documented, not left implicit. This
resequencing has one: WP 2.5/2.6 will put real customers and real
professionals in front of the request → quote → accept → complete
journey before WP 2.4 exists. A professional's request-detail view
during that window has no structural way to show the customer's
Location/Asset/Document twin — the fetch would find nothing to fetch,
not fail, since no scoped membership exists yet to authorize it. WP 2.6
must design that state as a real empty state (§1.10's own dividend
still applies once WP 2.4 ships — "coming soon, not broken"), not
silently omit the section or leave a spinner. Recorded here so WP 2.6
inherits it as a stated requirement, not a UX gap discovered at review
time.

---

## 4 · Acceptance criteria for "Slice 2 is done"

- [ ] WP 2.0's diagnostics pass against a real, current copy of
      production-shaped data — not merely against fixtures created
      inside the diagnostic's own transaction.
- [ ] Every one of C10–C21 and C11 (`docs/engineering/TESTING.md`) still
      passes after WP 2.6 ships, unmodified in what it asserts.
- [ ] A professional who accepts a booking can see the customer's own
      Location/Asset/Document twin for the property concerned (WP 2.4's
      own acceptance bar, not merely "the grant row exists").
- [ ] One-tap booking (C11) works through the real contract, not a
      silently-dropped legacy-only path.
- [ ] The five legacy triggers are dropped, not merely unused —
      `service_requests`/`quotes` read-only for historical data, no
      write path remains.
- [ ] Per the Programme's own Activation Ratio (§4): the "request →
      booking" journey type shows a real, non-zero, rising ratio of
      `marketplace.*` events against legacy `service_requests` inserts,
      in the same window — checkable, not merely claimed, once WP 2.6
      is live.

---

## 5 · Open questions carried into implementation

- **WP 2.2's own decision (directed booking's real shape)** — new
  columns vs. workflow-definition configuration is a real design choice
  with real trade-offs (columns are simpler and match legacy exactly;
  workflow configuration is more aligned with where Epic 09's engine is
  headed but has no precedent yet for *this* kind of time-boxed,
  per-request configuration). Left to whoever picks up WP 2.2, not
  resolved here.
- **WP 2.4's own consumer mechanism** — this codebase has no background
  event consumer anywhere. A poll loop against `platform.events`? A
  Postgres trigger reacting to the `emit_event()` insert itself, in the
  same transaction (collapsing "consumer" into "synchronous side
  effect," which would need its own cross-schema privilege design given
  §1.3's own finding about why the naive version failed)? A real
  architectural decision, possibly warranting its own ADR given it is
  the first instance of a pattern `MASTER_CONTEXT.md` §12 has tracked as
  entirely unbuilt.
- **The workflow-instance-driven switch (§1.5, step 3)** — genuinely
  unaddressed by this document. Whether Slice 2 is the right place to
  finally make `work.requests.status` workflow-derived, or whether that
  is its own later slice once Slice 2's other two undone steps are
  proven safe first, is a real sequencing decision for whoever scopes
  the work packages above into real PRs — not assumed either way here.
- **The dual-write window for WP 2.6 (§1.6)** — re-run the one-time
  backfill immediately before cutover, or accept a short window of
  legacy-only activity, is an operational decision with a real blast
  radius (a booking made in that window) that belongs to whoever is
  accountable for it, the same restraint `SLICE_1_PROPERTY_ASSET_
  ACTIVATION.md` held for WP 1.9's own observation-window length.

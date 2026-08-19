# Slice 2 — Marketplace Transaction Activation: Scoping

**This document owns:** the concrete work-package breakdown for
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, Slice 2 — "the single riskiest slice in the programme," worked in
full as that document's own §2 example. It does not own the Programme's
cross-cutting reasoning, which this document applies rather than
restates.

**Status.** Scoping. Nothing below is implemented. Slice 1
(`SLICE_1_PROPERTY_ASSET_ACTIVATION.md`) is the nearest precedent in
shape — real engine logic built ahead of a caller, needing
authorization checks and `api.*` delegates before any client can reach
it — but Slice 2 starts from a **materially different position**, named
in full in §1 below, and is not simply "Slice 1's pattern, five more
functions." The two structural differences that actually matter:
Slice 2's foundation has never been applied to any database at all, and
this slice's own end state requires *retiring* a live, currently-used
system, not merely adding beside it.

---

## 1 · What was found before scoping this

### 1.1 · The foundation exists, in full, and has never touched a real database

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

**None of it has ever run.** Epic 12's own completion record states
this in its own words: *"Nothing in this epic has been run against any
database... including the backfill, which has real, structural
implications for a large volume of existing data."* Every engine Slice
1 built contracts on top of (Property, Asset, Location, Document,
Maintenance) was already live on staging before Slice 1 started. This
one is not. **WP 2.0 exists because of this fact alone** — it has no
equivalent in Slice 1's own sequence.

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

### Tier 0 — Foundation

**WP 2.0 — Apply the foundation; prove it, for the first time, against a real database**

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

**WP 2.1 — The request/quote/engagement read contracts**

`api.my_requests()`, `api.resolve_request()`, `api.quotes_for_request()`,
`api.my_quotes()`, `api.my_engagements()` — same two-layer shape as
every prior read switch this programme has built, with one real
difference: `quotes_for_request()`/`my_engagements()`'s own
authorization check is two-sided, and should port `0088`'s own RLS
predicate (§1.2) rather than re-derive it.

### Tier 2 — Write

**WP 2.2 — Decision: how directed booking is represented**

Resolve §1.4. Real options — new columns on `work.requests` mirroring
legacy's three, or workflow-definition configuration per `0085`'s own
suggestion — named here because `create_request()`'s own caller-checked
wrapper (WP 2.3) needs a real shape to build against, the same way WP
1.0 was resolved before WP 1.4 needed it.

**WP 2.3 — The request/quote/engagement write contracts**

`api.create_request()`, `api.withdraw_request()`, `api.submit_quote()`,
`api.decline_quote()`, `api.accept_quote()`, `api.complete_engagement()`,
`api.cancel_engagement()`, `api.mark_request_reviewed()` — the same
"new caller-checked wrapper around the existing, unmodified `work.*`
function" shape WP 1.7 and WP 1.10 both already established, for the
identical reason: every one of these thirteen `work.*` functions is
currently reachable by `klussie_engine_work` only, with no membership
check of its own, and none should be redefined in place.

**WP 2.4 — The scoped access grant consumer**

Resolve §1.3. A Workspace-owned consumer of
`marketplace.engagement.created`, creating the real, scoped
`workspace.memberships` row `DATABASE_ARCHITECTURE.md` §19 describes.
Genuinely new: no background event-consumption mechanism exists yet in
this codebase to extend, so this work package's first job is deciding
what that mechanism actually is (a poll against `platform.events`? a
Postgres trigger-based consumer? — an open question, not resolved by
this document, see §5) before the consumer logic itself can be written.

### Tier 3 — Client, and the cutover itself

**WP 2.5 — Client: read cutover**

`RequestsList.jsx`, `RequestDetailSheet.jsx`, `ProDashboard.jsx`,
`ProJobs.jsx` read through WP 2.1's contracts. Unlike Slice 1's
equivalent (WP 1.3, pure addition against previously-empty surfaces),
every one of these screens is live and depended on today — this work
package should read *alongside* the legacy path first (both sources
fetched, legacy still authoritative, a structural equality check
against the regression baseline) before the legacy read is dropped, not
switch outright the way Slice 1 could afford to.

**WP 2.6 — Client: write cutover — the single largest behavioural risk in the roadmap**

`ServiceSheet.jsx` (create), `SendQuoteSheet.jsx` (quote),
`RequestDetailSheet.jsx` (accept/complete/review) move onto WP 2.3's
contracts, Realtime subscriptions re-pointed (§1.8), the backfill
re-run or a dual-write window accepted (§1.6), C10–C21 and C11 all
re-verified green before and after. Explicitly named by Epic 09's own
header, repeated by Epic 12's, as the actual highest-risk step in this
entire programme — this work package earns the most caution of
anything built so far, not a routine cutover pass.

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
   │    WP 2.3 (write contracts) ──► WP 2.4 (scoped access grant consumer)
   │        │                                   │
   └────────┴───────────────┬───────────────────┘
                             ▼
                   WP 2.5 (client: read cutover, dual-read verified)
                             │
                             ▼
                   WP 2.6 (client: write cutover — highest risk in the programme)
                             │
                        (real observation window)
                             ▼
                   WP 2.7 (retire the five legacy triggers)
```

WP 2.4 does not block WP 2.5/2.6 structurally — a booking can complete
without the scoped grant existing, it just means the performing
workspace cannot yet see the customer's own physical twin for the
property concerned. Sequenced before the cutover anyway, because
shipping the cutover with a professional-facing gap already known and
avoidable, rather than closed, is exactly the kind of asymmetry §1 of
`PLATFORM_ACTIVATION_PROGRAMME.md` exists to catch before it ships, not
after.

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

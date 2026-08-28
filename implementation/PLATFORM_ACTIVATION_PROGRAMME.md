# Platform Activation Programme

**This document owns:** the single coordinated programme that activates
the completed platform through three complementary experiences. It
**supersedes `ROADMAP_SEQUENCING.md`** as the authoritative sequencing and
coordination document — that file is retained as history and marked
superseded, exactly as `EXECUTION_ROADMAP.md` was retained when
`IMPLEMENTATION_ROADMAP.md` superseded it. `ROADMAP_A_CUSTOMER_EXPERIENCE.md`,
`ROADMAP_B_PROFESSIONAL_EXPERIENCE.md` and `ROADMAP_C_PLATFORM_OPERATIONS.md`
remain in force as **detail references** — their capability maps, screen
inventories, journeys and permission tables are correct and reusable —
but their own internal phase numbering (A1/A2…, B1/B2…, C1/C2…) is
superseded by the Activation Slices below, which are the actual unit of
delivery from this point forward.

**The correction this document makes.** The three roadmaps, as written,
described three build plans with dependency arrows between them. That
was already the wrong shape, caught before any of it was scheduled:
**there are not three applications to build.** There is one platform,
already built, and three experiences that must activate it together.
From here forward, nothing is scoped as "Roadmap A's next phase" — it is
scoped as an **Activation Slice**, and no slice is considered scoped
until it has answered the Four Questions below for all three
experiences and named the legacy behaviour it retires.

---

## 1 · The governing principle

> Whenever functionality appears in one experience, verify whether the
> corresponding workflow must simultaneously appear in the other two.
> The objective is not three separate applications. The objective is to
> activate one platform through three complementary experiences.

This is not a coordination nicety layered on top of independently-useful
work. It is the same architectural discipline the frozen domain model
already applies everywhere else, now applied to the *sequencing* of
delivery rather than only to the *shape* of the code:

- **One Engine (Principle 2, §6.4).** "A feature is built once... there
  is no consumer version and no enterprise version of anything." A
  capability activated for the homeowner and left dormant for the
  professional is not a smaller version of the same discipline — it is
  the exact fragmentation pattern §6.6 names as the start of a platform
  splitting in two, now happening at the delivery-sequencing layer
  instead of the code layer.
- **Service Records are one shared object (§13.2, rule 14 in §28).** A
  Service Record activated on the professional's side without a
  corresponding read on the customer's side is not "half done" — it is
  a Service Record that fails its own founding reason to exist ("one
  record, written once, read by both workspaces from their own
  perspective").
- **Administration owns no customer data (§12.3).** Platform Operations
  cannot verify, support, or measure a workflow it cannot see. If
  Trust & Safety needs a Service Record as evidence (Roadmap C §5.1),
  that Service Record must already be real by the time Trust & Safety
  needs it — which means Platform Operations is never the last
  experience considered for a given capability, it is asked *at the
  same time* as the other two.

### 1.1 · Platform Activation Priority

> The backend platform is considered feature-complete unless a genuine
> architectural dependency is discovered. The objective is now Platform
> Activation, not Platform Expansion. Whenever a decision exists between
> (A) building another backend capability or (B) allowing a real user to
> experience an existing capability, prefer B unless architecture,
> security or correctness would be compromised.

Stated after Slice 1 shipped and Slice 2's foundation was verified
(WP 2.0) — the point at which continuing to build backend capability
stopped being the obviously correct default and started needing an
explicit reason each time. Applied for the first time in this document
in `SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md` §3's own
resequencing: WP 2.4 (the scoped access grant consumer — genuinely new
infrastructure) now runs *after* the client cutover it enhances,
because the core journey does not need it to be real for a user, and
building it first would be exactly the backend-expansion-for-its-own-
sake this principle exists to stop. Every future slice reads its own
work-package order against this tie-breaker before assuming the
original scoping order still holds.

### 1.2 · Beautiful Software

> Do not merely make Klussie functional. Make it delightful. The
> platform should feel calm, premium, human and intelligent. Never
> sacrifice usability for technical elegance.

Applies at every layer, not only the screens users see directly:
simplicity, discoverability, accessibility, emotional impact, trust,
visual hierarchy, animation and micro-interaction, typography and
spacing, empty/loading/success/error-recovery states, elderly users,
first impressions. Two concrete obligations follow, both binding from
here forward, not aspirational:

- **A backend decision with UX implications gets documented at the
  point it's made**, in the same scoping or completion document the
  decision itself lives in — not left for whoever builds the screen
  later to rediscover. `SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md`
  §3.1 is the first instance: WP 2.4's resequencing (§1.1 above) means
  WP 2.6 must design a real empty state for the professional's
  not-yet-granted property access, not silently omit the section.
- **A UX opportunity noticed during implementation is captured for the
  Activation Slice it belongs to**, not built on the spot outside that
  slice's own scope and not dropped for lack of a place to write it
  down.

### 1.3 · Review first

> Review first. Implement second. Document only when architecture
> changes. Implementation is the default.

Scoping happens at the Activation Slice level — `SLICE_1_…`,
`SLICE_2_…`, one document per slice, each answering the Four Questions
(§2) in full before its first work package starts. A work package
inside an already-scoped slice does not get its own scoping document;
it gets reviewed against the slice document already governing it, then
built. A new document is warranted only when a work package's own
findings change the slice's architecture enough that the slice document
itself needs correcting — exactly what WP 2.0 (foundation verification)
and this section's own resequencing already did to
`SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md`, in place, rather than
spawning a parallel document next to it.

---

## 2 · The Four Questions

Every activation slice, before it is scoped, answers all four — in this
order, because the order itself matters (legacy replacement is asked
last, deliberately, so it is a consequence of the other three rather
than the reason the slice exists):

1. **How does the homeowner experience this?** — concretely, which
   screen, which of `ROADMAP_A_CUSTOMER_EXPERIENCE.md`'s journeys (§5),
   and what changes versus what they see today.
2. **How does the professional experience this?** — same discipline,
   against `ROADMAP_B_PROFESSIONAL_EXPERIENCE.md`.
3. **How does Platform Operations support this?** — against
   `ROADMAP_C_PLATFORM_OPERATIONS.md`: what does support need to see,
   what does Trust & Safety need as evidence, what does the Audit
   trail need to record, what does the Overview dashboard need to
   count.
4. **How does this replace legacy behaviour?** — named against the
   Legacy Inventory (§3): which table, which client module, which
   hand-written function stops being load-bearing once this slice ships,
   and on what date it can actually be deleted (not merely deprecated).

**A worked example, using the highest-risk slice in the whole
programme (§5, Slice 2 — Marketplace Transaction Activation):**

| Question | Answer |
|---|---|
| Homeowner | Booking flow reads/writes `work.requests`/`work.quotes`/`work.engagements`; sees a real warranty check before a marketplace match is even offered (`ROADMAP_A` §5.1) |
| Professional | Dashboard/Jobs read the same `work.*` tables from the other side of the same transaction — built as one PR, not two, because a live booking split across two data models mid-transaction is a correctness bug, not a sequencing inconvenience (`ROADMAP_B` §8, Phase B2) |
| Platform Operations | Workspace lookup (`ROADMAP_C` §3.2) now shows real transaction history instead of nothing; Trust & Safety (§3.3) gains real engagements to investigate; Audit gains real cross-workspace access-grant events to show, since a marketplace engagement is itself a scoped access grant (§8) |
| Legacy replaced | `service_requests`, `quotes` tables and `pro_matches_request()`'s bare SQL matching stop being written to the moment this slice ships; they may still be *read* during a transition window (§4) but are deleted once that window closes |

**If any of the four cannot be answered concretely, the slice is not yet
scoped correctly** — it has been cut along a roadmap-document boundary
instead of along a real activation boundary, which is exactly the
mistake this document exists to correct.

---

## 3 · Legacy inventory

The concrete list §2 Question 4 checks against. **Corrected from the
original roadmaps' blanket "zero client wiring" framing** — real
inspection of `src/lib/householdItems.js` and the Document engine's own
read paths shows this is not uniformly true, and the more precise
picture is a better foundation for the programme than the pessimistic
one:

| Legacy surface | Replacing platform contract | Current state |
|---|---|---|
| `household_items` table, owner/workspace-scoped reads | `property.assets` via `api.my_assets()` | **Read switch already live** (Epic 07 WP08) — falls back to `household_items` only when no `property.properties` row exists for the caller yet. This is the proof the activation pattern works, not a gap |
| Client-side `homeTimeline.js` derivation | `platform.events` → Timeline (§17) | Not started — no client reads `platform.events` at all yet |
| `service_requests`, `quotes` | `work.requests`, `work.quotes`, `work.engagements` | Fully legacy — Slice 2 |
| `pro_matches_request()` (bare SQL, no ranking/geo) | Provider Intelligence engine (§14.4) | Fully legacy — Slice 2/6 |
| `conversations`, `messages` | Conversation engine (`work.conversations`, presumed table names) | Fully legacy — Slice 4 |
| Hand-computed trust score (`src/lib/pros.js`) | Marketplace reputation, real Service-Record-derived aggregate | Fully legacy — Slice 3 |
| Demo/display-only invoice (`InvoiceSheet.jsx`) | Billing engine | Fully legacy — Slice 7, blocked on a real payment provider |
| `public.reports` (legacy table, real data) | Same table, now with a real Trust & Safety product in front of it (`ROADMAP_C` §3.3) | Data is real; no consumer exists yet — Slice 5 |
| `profiles`/`profile_contacts` display fields | Identity engine (`identity.identities`) | **Already substantially real** (Epic 02) — the two resolvers already read from Identity; this row is nearly closed, not a gap |
| `RoleSelectionScreen` forced classification | Removed entirely this session | **Closed** — cited here only so the inventory is complete, not because it needs a slice |

**The rule this table enforces going forward:** a legacy row does not
leave this table when a new read switch merely *exists* — it leaves
when the legacy write path is also removed and the legacy table (or
function) can be dropped. A dual-write period is expected and correct
(it is the same discipline `SUPABASE_ARCHITECTURE.md`'s six-step
migration pattern already requires); it is a *state*, not the finish
line.

---

## 4 · The Activation Ratio — measuring adoption, not screens

> Measure success by the percentage of real user journeys executing
> through the new platform rather than by the number of completed
> screens.

This needs a real, buildable metric, not a slogan. The mechanism
already exists in the architecture and requires no new invention:

**Every write through a real engine contract emits an event
(§16, ADR-0019). No legacy write does.** This means, for any journey
type, the Activation Ratio is directly computable:

```
Activation Ratio (journey type, window)
  = count(platform.events rows of that journey's event_type, in window)
    ÷
    count(all completions of that journey, legacy + platform, in window)
```

For example, "booking created": count `marketplace.request.created`
events (once Slice 2 ships) against the total of legacy `service_requests`
inserts plus that event count, in the same window. A journey fully cut
over reads 100%. A journey not yet started reads 0%, honestly, rather
than being invisible.

**This is not a new engine to build — it is a dashboard.** It belongs on
Platform Operations' own **Overview** screen (`ROADMAP_C` §3.1), which
already names "platform health at a glance" as its job. The Activation
Ratio, per journey type, tracked over time, *is* platform health during
this programme specifically — a second, worked instance of §2's own
discipline: Platform Operations is not merely informed by the other two
experiences' progress, it is where that progress becomes visible and
accountable.

**The journey inventory this ratio tracks** is drawn directly from the
journeys already named in `ROADMAP_A` §5 and `ROADMAP_B` §5 — not
reinvented here:

| Journey | Homeowner side | Professional side | Tracked from Slice |
|---|---|---|---|
| Property/asset recorded | `ROADMAP_A` §5.1–5.4 | `ROADMAP_B` §5.4 (own premises) | Slice 1 |
| Request → booking | `ROADMAP_A` §5.1, §5.2 | `ROADMAP_B` §5.1 | Slice 2 |
| Work performed → Service Record | `ROADMAP_A` §5.1 step 5 | `ROADMAP_B` §5.2, §5.5 | Slice 3 |
| Conversation | Shared, `ROADMAP_A` §3.2 | Shared, `ROADMAP_B` §3.2 | Slice 4 |
| Report / dispute | Initiates in either experience | Initiates in either experience | Slice 5 |

A slice is not "done" when its screens ship. **It is done when its row
in this table crosses an agreed threshold** (a real product decision,
not set by this document) **and the legacy write path for that journey
is deleted, not merely deprecated.**

---

## 5 · Activation slices

Each slice below replaces the old per-roadmap phase numbering. Every
slice is answered against all Four Questions (§2) in its own subsection;
full screen/journey/permission detail is cross-referenced into
`ROADMAP_A`/`B`/`C` rather than repeated. Order follows the same
dependency, value, operational-readiness and Beta-1 reasoning as the
superseded sequencing document, corrected for the coordination this
document requires.

### Slice 0 — Activation Infrastructure — **Complete**

*Enables every later slice; activates no user-facing journey itself.*
Full work-package breakdown, verification detail, and the one honestly
unmet acceptance criterion: `SLICE_0_ACTIVATION_INFRASTRUCTURE.md` §6.

- **Decided:** the client-read strategy (`ADR-0029` — RPC/API routes as
  the default) and the operator authentication mechanism (`ADR-0030` —
  a real membership in an internal Operations Workspace, not a new
  access mechanism).
- **Built:** the Operations Workspace and its capability (WP 0.3), the
  audited read path onto `platform.audit_records` (WP 0.4), the client
  shell and routing (WP 0.5), and the real Audit viewer (`ROADMAP_C`
  §3.7, WP 0.6) — the precondition for every other slice's actions
  being provable, not optional groundwork.
- **Homeowner / Professional:** invisible, confirmed — no file under
  `src/customer/`, `src/pro/`, or `src/home/` changed.
- **Platform Operations:** this slice *is* Platform Operations'
  foundation (`ROADMAP_C` Phase C1) — the first screen that product has
  ever had.
- **Legacy replaced:** none — pure enablement, as scoped.
- **Gap closed, 2026-08-24** (`SUPPORT_ACCESS_DESIGN.md`, migrations
  `0172_support_access_contract.sql`, WP S.0/S.1 both shipped): the
  Audit viewer's own original gap — `platform.audit_records` held zero
  rows on staging because no engine's live code path called
  `platform.write_audit_record()` — is closed by the support-access
  grant `ROADMAP_C` §3.2 names as Phase C2's own second half (never
  actually built until now; only the read-only search tool was). A
  real "Request access" button now lives on `WorkspaceLookup.jsx`,
  writing a real audit record on every grant and end.

### Slice 1 — Property & Asset Activation — **Complete except WP 1.9**

Full work-package breakdown, findings, and status:
`SLICE_1_PROPERTY_ASSET_ACTIVATION.md`. All ten work packages (WP
1.0–1.10) merged; WP 1.9 (retiring `household_items`) deliberately
waits for a real production observation window, per that document's own
§2.

*Corrects the original roadmaps' biggest coordination miss: My Home and
My Business were scoped as two parallel, separately-sequenced phases
(A1, B1). They are the same engines, the same components, and belong to
one slice.*

- **Homeowner:** My Home becomes real — Property/Location/Asset/Document/
  Maintenance (`ROADMAP_A` §8, Phase A1).
- **Professional:** My Business becomes real, over the *same* screens
  and the *same* client code, applied to the firm's own premises and
  fleet (`ROADMAP_B` §8, Phase B1) — built as one activation, not two
  independently-timed ones, because it is structurally one piece of
  work wearing two labels.
- **Platform Operations:** Workspace lookup (`ROADMAP_C` §3.2) needs
  real property/asset data to be useful for support at all — "what does
  this workspace hold" is meaningless while the answer is always
  `household_items`. This is why Workspace lookup's *read-only* half
  ships alongside this slice, even though its access-request half waits
  for Slice 0 to be fully proven in production first.
- **Legacy replaced:** `household_items` table and its dual-write
  triggers (§3); `homeTimeline.js`'s client-side derivation, once
  `platform.events` reads are wired for the Timeline.

### Slice 2 — Marketplace Transaction Activation — **WP 2.0-2.5 done**

Full work-package breakdown and findings:
`SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md`. WP 2.0 applied and
verified the foundation Epic 12 built (`0085`-`0090`); WP 2.1 shipped
the read contracts (`0145`); WP 2.2 decided directed booking's shape
and WP 2.3 shipped the write contracts together (`0146`), including a
real bug found in legacy's own equivalent and deliberately not
reproduced — see that document's own WP 2.2 entry. WP 2.5 shipped
`RECONCILE_MARKETPLACE.sql`, rescoped honestly from its original
four-client-file description once checked directly against how those
files actually read data — see that document's own WP 2.5 entry for
the full reasoning and where the client cutover actually moved. One
honest gap still open from WP 2.0: the backfill's real per-row logic is
unexercised, staging holding zero legacy marketplace rows. WP 2.4 (the
scoped access grant consumer) moved after WP 2.6 per §1.1's own
Platform Activation Priority — genuinely new infrastructure the core
journey does not need to be real yet. WP 2.6 is DONE (PR #66, merged)
— the client cutover, plus four real infrastructure gaps driving it
live against staging surfaced and fixed (PR #68): the `api` schema's
own PostgREST exposure, a missing `platform`-schema grant, missing
Realtime publication/grants on six `work.*` tables, and a genuine
self-referencing RLS policy bug in 0094 that had never once been
evaluated for real before. The full create → quote → accept → message
(delivered live) → complete → review lifecycle is now verified working
end to end, live, in a real two-session browser test — see that work
package's own entry in `SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md`
and the session's `klussie-critical-infra-gap` memory (now closed) for
the full finding chain. WP 2.4 (the scoped access grant consumer) is
DONE, merged, and live on staging: the scope-enforcement prerequisite
it needed shipped as its own work package (`0161`, PR #70, merged),
and the consumer itself — the platform's first real background event
consumer, `pg_cron` polling `platform.events` through Epic 01's own
cursor/quarantine machinery, documented as the canonical pattern for
every future one in [ADR-0031](../docs/adr/0031-background-consumer-pattern-cursor-quarantine-pg-cron.md)
— is [PR #71](https://github.com/FiliusUmbra/klussie/pull/71), merged.
See that work package's own entry in
`SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md` for the four real bugs
its own diagnostic found and fixed live. Remaining: WP 2.7. This
slice's own end state requires retiring a live system, not only
adding beside one — still its defining structural difference
from Slice 1.

**WP 2.8 — mandatory disclosure-consent, added to the booking
transition after Slice 2 otherwise closed — DONE, client cutover
2026-08-27.** `84bb1ad`/`97f32b8` shipped a real founder decision as a
pure backend addition (migrations `0181`-`0184`): quote acceptance no
longer creates an active engagement directly — it creates one
`pending_disclosure` and moves the request to
`accepted_pending_location_approval`; only the customer's own explicit
`api.approve_location_disclosure()` call reaches `active` and fires
`marketplace.engagement.created`. Zero client code referenced any of
it at that point — every booking accepted after that PR was
structurally stuck, undetected because nothing exercises the live UI
routinely. Closed end to end this session:
- Backend gap closed: `api.my_properties()` never returned the
  address columns `0182` added, and no write path existed for them at
  all — `0185_property_address_write_path.sql` adds both.
- A second, independent, previously-undiscovered bug found by
  exercising the real create-request path live for the first time
  since migration `0014` (2026-08 vintage): `0014`'s own unconditional
  column default on `service_requests.directed_until` broke every
  *ordinary* (non-directed) request insert against
  `service_requests_directed_complete` (`0013`). Nobody had hit it —
  the AI Gateway is blocked on staging and `ServiceSheet.jsx`'s own
  trigger (`CustomerApp.jsx`'s `setActiveService`) has been dead code
  since the conversation-canvas redesign, so `createServiceRequest()`
  had never actually run against a real database before. Fixed by
  `0186`, a conditional `BEFORE INSERT` trigger replacing the column
  default.
- Client: `ServiceLocationField.jsx` (My Home / another saved property
  / one-time address, confirming My Home's address inline the first
  time it's needed) wired into both request-creation forms; a real
  disclosure-consent card in `RequestDetailSheet.jsx` for
  `accepted_pending_location_approval`; the new status takes its place
  in the 6-step lifecycle (`requestStatus.js`). Also closed in passing:
  `AiIntakeSheet.jsx`'s own C8 promise ("AI failure degrades to the
  manual form, no dead end") was documented in `TESTING.md` but never
  actually built — a failed analysis was a genuine dead end until a
  "Vul handmatig in" fallback was added; this is currently the *only*
  reachable way to create a request on staging at all, given the two
  gaps just named.
- **Live-verified end to end on staging**, both sides, real UI: Cathy
  created a request through the manual-fallback form (My Home's
  address confirmed inline for the first time), Pierre quoted it from
  his own dashboard, Cathy accepted, the disclosure-consent card
  rendered with Pierre's real name/price interpolated, approving it
  flipped the request to `booked` and rendered the ordinary booked
  ticket — the complete transition, not a partial slice.
- **The professional's own approximate-location view during
  quoting — closed the next day, 2026-08-28.** `api.matching_requests_for_pro()`
  (`0183`) had no client caller; `fetchProLeads()` stays on legacy
  (WP 2.6's own decision) and carried no municipality/property-type/
  prep-notes fields at all. `0187_matching_request_locations_for_pro_by_legacy_ids.sql`
  is the bridge — same shape `request_lifecycle_statuses()` (`0150`)
  already established for status: a batch of legacy ids in, each
  correlated `work.requests` row's approximate location out, keyed
  back by the legacy id `fetchProLeads()` already has. `ProDashboard.jsx`'s
  lead cards now show the real municipality (falling back to legacy's
  own free-text city only when no correlated property exists yet) and
  property type/quote-prep notes — never street, postcode or
  coordinates; `distance_band` is deliberately not rendered, since
  `0183`'s own placeholder always resolves to the literal string
  `"unknown"`, not a real calculation, and showing that to a customer
  would read as broken rather than honest. Live-verified on staging:
  Cathy created a second request without typing a city, Pierre's own
  lead card showed "Antwerpen" — the real municipality from her
  property, not an empty legacy field.
- **Still named, deliberately deferred:** engagement access
  instructions (`work.set_engagement_access_notes()`, real backend, no
  client screen yet). Real, safe to defer — nothing currently reads or
  needs it before a booking is active.
- **A real bug found and fixed the same week, PR #115:** `work.engagements`
  has no `'reviewed'` status at all (`0182`'s own constraint) — it stays
  `'completed'` forever. `ProJobDetailSheet.jsx`'s own Service Record
  gate checked the *request's* status instead, which advances past
  `'completed'` the moment a customer reviews — permanently hiding the
  pro's own "write it up" entry point for any job reviewed before a
  record was authored. Fixed and live-verified: authored a record for
  the exact job this broke, read it back on the customer side, approved
  it.
- **Negative-authorization spot-check on the new write surface, 2026-08-28**
  (`founder mandate §5, "close RLS and negative-authorization gaps"`):
  live against staging, using each test account's own real auth token
  (not the UI) — Pierre's own token calling `api.set_property_address()`
  against Cathy's real property id was refused (`403`,
  `insufficient_privilege`), her address confirmed unchanged afterward;
  `api.my_properties()` under Pierre's token returned only his own
  property, never Cathy's; a direct PostgREST read of `property.properties`
  (bypassing `api.*` entirely) was refused at the schema level —
  `property` (and `work`) are simply not among the schemas PostgREST
  exposes at all (`public`, `graphql_public`, `api` only), the same
  defense-in-depth every other engine schema in this codebase already
  relies on.

*The single riskiest slice in the programme — worked in full in §2's
example above. Not compressed or parallelized; the two sides of a live
transaction ship as one PR.*

- Full Four-Questions answer already given in §2.
- **Cross-reference:** `ROADMAP_A` Phase A2, `ROADMAP_B` Phase B2 —
  those sections' screen-level detail stands; their independent phase
  labels are retired in favour of this one slice.

### Slice 3 — Service Record & Reputation Activation — **WP 3.0-3.3 done, WP 3.4 next**

Full work-package breakdown and findings:
`SLICE_3_SERVICE_RECORD_REPUTATION_ACTIVATION.md`, written 2026-08-22
under the product-phase mandate — the mandate's own worked example:
Epic 11 built a complete, real backend (ten contract functions, real
RLS isolation, the authorship split enforced structurally) that zero
client code anywhere references. A real, resolved question along the
way, not assumed: `SYSTEM_ARCHITECTURE.md` §8.2's "Events consumed:
`EngagementCompleted`" reads like WP 2.4's own consumer shape, but is
not — `work.create_service_record()` requires real, human-authored
content (`p_work_performed`) no event payload carries, and its own
comment states records are "created already complete... never drafted
then finalised." No consumer is built for this slice; completion makes
the professional's own authoring screen *reachable*, not
auto-populated. See that document's own §2.3.

WP 3.0 (the read/write `api.*` contract), WP 3.2 (the customer's own
read view, `RequestDetailSheet.jsx`), WP 3.1 (the reachability gate —
a completed engagement with no `service_record_id` yet) and WP 3.3
(the editor itself, `ServiceRecordEditorSheet.jsx`, built against
`WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md` written before it) all shipped
2026-08-22. One genuinely-required new capability found along the way
(0165 — evidence-photo attachment from the performing side; see the
scoping doc's own WP 3.3 entry). Verified live on staging through the
real UI, both parties: a pro authoring a record end-to-end, the
private annex persisting, and the customer reading back the shared
core with zero trace of the annex. WP 3.4 (reputation onto the real
engine) is next — needs real record volume, which this slice's own
test records don't constitute.

- **Homeowner:** sees a real, structured Service Record as "what
  happened to my boiler," not an invoice line (`ROADMAP_A` §5.1 step
  5, §7).
- **Professional:** authors it — the highest-leverage single screen in
  either roadmap (`ROADMAP_B` §5.5, §8 Phase B3).
- **Platform Operations:** Trust & Safety's case view (`ROADMAP_C` §5.1)
  now has real evidence to act on instead of a bare `reports` row with
  nothing to check it against; certification review becomes possible
  once Document validity is real.
- **Legacy replaced:** hand-computed trust score; the flat "mark
  complete" action.

### Slice 4 — Conversation & Notification Activation — **Complete**

Full work-package breakdown and findings:
`SLICE_4_CONVERSATION_NOTIFICATION_ACTIVATION.md`, written 2026-08-22.
Real finding along the way: Conversation is **not** a gap — `src/lib/
messages.js`'s own header confirms `work.conversations`/`work.messages`
is already the live path (Realtime, translation, read receipts all
real), so this slice's Conversation half is functionally already
activated. Notification is the real gap, and it is the identical shape
Slice 3 opened with: Epic 19 (0115-0118) built a complete backend —
including `platform.my_inbox()`, already correctly `auth.uid()`-scoped
— that zero client code references and, unlike Service Records,
**nothing anywhere even calls** (`grep` for `raise_notification` finds
only its own definition). "No notifications outside an open tab," the
platform risk named below, is **not** solved by the contract alone —
that is browser push delivery, a real infrastructure decision
requiring the platform owner's own approval, named but deliberately
not scoped as a work package here. See that document's own §2.3.

- **Homeowner:** the one inbox (`ROADMAP_A` §3.2, Phase A3).
- **Professional:** the same inbox mechanism carries leads, messages
  and schedule alerts (`ROADMAP_B` §7 — this is also where the named
  platform risk "no notifications outside an open tab" closes).
- **Platform Operations:** Notification delivery health becomes a real,
  watched pipeline (`ROADMAP_C` §2.1's table).
- **Legacy replaced:** legacy `conversations`/`messages` tables, once
  the Conversation engine's own tables are the write path.

### Slice 5 — Trust & Safety Activation — **Complete**

Full work-package breakdown and findings:
`SLICE_5_TRUST_SAFETY_ACTIVATION.md`, written 2026-08-23. Real finding
along the way: the enforcement primitive this slice needs
(`workspace.withdraw_capability()`) already exists, correct and
shipped since Epic 09 — this slice is largely a wiring problem
(a real schema, a real caller, a real operator screen), not a new
capability-model problem. Proposes a new `safety` schema (`safety.cases`/
`safety.decisions`), a fourth Operator tab reusing the existing
Audit/Workspace Lookup shape, and cutting `ReportSheet.jsx` over from
the legacy `public.reports` table (real data, zero readers today).
`is_certified` verification and "operator roles, plural" are both
named, real, deliberately deferred — see that document's own §2.3/§2.4.

*Beta 1 ships at the end of this slice.*

- **Platform Operations:** the full queue, case view, and capability-
  suspension enforcement action (`ROADMAP_C` §3.3, §5.1, Phase C3).
- **Homeowner / Professional:** experience this only as the report
  action itself and, where relevant, the outcome of an enforcement
  decision (a suspended capability, per §6.10 — behaviour removed,
  never data destroyed) — most of this slice's weight is legitimately
  on the Platform Operations side, and that asymmetry is correct, not a
  sign the other two questions were skipped.
- **Legacy replaced:** `reports` gains a real consumer for the first
  time; nothing is deleted here, something that already existed becomes
  actually used.

**Beta 1, defined identically to the superseded sequencing document's
§4, is: Slices 0 through 5, complete, with their Activation Ratios (§4
above) at an agreed threshold and their corresponding legacy write
paths deleted — not merely available.**

### Slice 6 — Depth Activation (post-Beta-1)

Maintenance Planning, Preventive Maintenance, Document Intelligence, AI
Premium (`ROADMAP_A` §8 Phase A4) · reputation formalized further, Team
Collaboration, Fleet/Compliance/CRM/Analytics depth
(`ROADMAP_B` §8 Phases B4–B6) · Marketplace health dashboard, feature
rollout tooling (`ROADMAP_C` §8 Phase C4) — run through the Four
Questions per capability as each is scheduled, since this slice
deliberately bundles what were previously several independent
capability rows in §6.7's catalogue, and bundling them into one slice
label must not become an excuse to skip the discipline per capability.

### Slice 7 — Commercial Activation

Payments/Billing, activated for all three experiences **simultaneously**
once the external provider decision is made (§2.1 of the pre-launch
audit — outside this programme's authority to schedule, tracked here
only so it isn't lost): homeowner pays, professional gets paid,
Platform Operations gets payment-operations tooling
(`ROADMAP_C` §8 Phase C6). Naming it as one slice, not three
independently-timed ones, is itself an application of §1's governing
principle to the one capability most tempting to build lopsidedly (a
"pay" button shipped for homeowners with no matching payout tooling
for professionals is exactly the fragmentation this programme exists to
prevent).

### Slice 8 — Catalogue & Configuration Activation

Platform Operations authors capabilities, plans, taxonomies,
jurisdictions and workflow definitions (`ROADMAP_C` §8 Phase C5).
Homeowner/professional experience is indirect and correct as such — a
new capability becoming available without a deploy (§6.9) *is* how this
slice's activation is felt on the other two sides, and no direct screen
work is owed to them by this slice specifically.

### Slice 9 — Extension & Global Activation

API Access, Enterprise Integrations, Federated Identity, jurisdiction
expansion, White Label — demand-gated, matching `MASTER_CONTEXT.md`'s
existing stance on Epics 23–24, extended to the experience layer.

---

## 6 · End state — expanded into verifiable conditions

The four conditions named for this programme, each restated as
something that can actually be checked rather than declared:

- **Legacy workflows retired.** Every row in §3's Legacy Inventory shows
  its replacing contract as the *only* write path — no dual-write, no
  fallback chain, the legacy table either dropped or read-only for
  historical data. Checkable directly against the inventory table.
- **All completed engines actively used.** Every one of the 24 engines
  in `SYSTEM_ARCHITECTURE.md` §2 has a non-zero Activation Ratio (§4)
  for at least one real journey type. Checkable against the Overview
  dashboard once Slice 0/4 exist.
- **Customer, Professional and Platform Operations operating against
  the same platform contracts.** No experience reads or writes a table
  the others don't share the same contract for — checkable by the
  simple test §2's worked example applies: could this slice's Q1/Q2/Q3
  answers each be traced to the *same* underlying engine contract, not
  three different ones that happen to produce similar-looking screens.
- **Product ready for Beta 1.** Slices 0–5 complete, per §5's own
  Beta 1 definition, with Activation Ratios at threshold, not merely
  screens shipped.

---

## 7 · Governance — how a new capability enters this programme

Every capability added to the catalogue after this programme starts
(§6.9's own "unremarkable" growth) is scoped as a new slice, following
the exact discipline used throughout §5:

1. State it as one slice, never as three independently-timed roadmap
   items.
2. Answer the Four Questions (§2) before any screen work starts.
3. Name its row in the Legacy Inventory (§3) — if it replaces nothing,
   say so explicitly rather than leaving the question unanswered.
4. Add its journey type to the Activation Ratio tracking (§4) before
   declaring it done, not after.

A capability that cannot pass step 2 for all three experiences is not
disqualified — some slices are legitimately asymmetric (Slice 5's
Trust & Safety weight, Slice 8's operator-only authoring) — but the
asymmetry must be a stated finding, not a silent gap the way the
original three-roadmap structure allowed it to become.

---

## 8 · Beta-completion checklist — the founder's own 2026-08-28 mandate

The single tracker for the ten beta priorities named directly by the
founder, in that order. Updated in place as each closes — this section,
not a new document, is where "is the beta candidate ready" gets answered
from here forward.

| # | Priority | Status |
|---|---|---|
| 1 | Service-location and address-disclosure experience, end to end | **Done**, PRs #112/#113, live-verified on staging both sides |
| 2 | Booking transition / `accepted_pending_location_approval` | **Done**, same PRs — quote acceptance → disclosure consent → active engagement all verified live |
| 3 | Customer and professional critical journeys | **Core loop done and live-verified**: create → quote → accept → disclose → book → complete → review → author/read/approve Service Record, both sides. Real document upload also completed live, 2026-08-28 (a real file to Supabase Storage, a real `property.documents` row) — found and fixed a second real bug the same way: `DocumentUploadSheet.jsx` has no caption field at all, so `doc.caption` is always empty for every document this UI creates, and the list's own fallback rendered the raw, untranslated `type_key` ("warranty") instead of the real localized label, in every locale, always. Two real gaps found and fixed this pass now: PR #115 (a review permanently hid the Service Record entry point) and this one. Still not exercised live: voice capture |
| 4 | Conversation, messaging, upload, notification integration | Messaging live-verified (real message sent and received, staging). Upload sheet reachable, not upload-completed. Notifications re-checked: WP 4.2's own revised scope (`src/lib/notifications.js`'s own header) is deliberate — conversation-message notifications surface through the Messages tab's own unread badge, not a duplicate inbox screen; that badge has been visibly correct throughout this session's own testing |
| 5 | RLS / negative-authorization gaps | **This session's new write surface spot-checked live** (2026-08-28): cross-tenant write blocked, list reads correctly isolated per caller, `property`/`work` schemas confirmed unexposed to PostgREST directly. Broader re-audit of Slice 5's own older surfaces not repeated |
| 6 | Auth/onboarding for providers actually configured | Email/password is the only configured provider (confirmed) — OAuth buttons are real but genuinely unconfigured, `AUTH_PROVIDER_SETUP.md`'s own long-standing finding, not new. **New finding this session**: no SMTP provider is configured either — Supabase's own signup email hit `"email rate limit exceeded"` on the third fresh-signup attempt in a few minutes. Real beta-blocker if left as-is; external account setup, not code — see `AUTH_PROVIDER_SETUP.md`'s new section |
| 7 | Mobile, accessibility, localization, error-state quality | Every new screen this session (`ServiceLocationField`, the disclosure-consent card) built and live-tested at the mobile viewport (375×812); its own address inputs got real `aria-label`s (PR #117). `docs/design/ACCESSIBILITY.md`'s own long-standing "Touch targets" finding fully closed, 2026-08-28 (PRs #120/#121): `.sheet-close`/`.modal-close` fixed to the full 44px via hit-slop, live-verified with a real hit-test outside the visible icon; `.photo-remove-btn` gets a smaller, deliberately partial 28px fix (its parent clips overflow); `.chat-input-row button` genuinely can't be hit-slopped (a real CSS Overflow spec constraint, confirmed live, named honestly rather than left as silently-broken CSS). **`.chip` — the shared primitive every service/when/where/category picker in the app uses — also closed**: hit-slop tried and confirmed live it doesn't work here either (same `.chiprow` overflow coercion), fixed instead with a real `min-height:44px` box-size increase, measured live at exactly 44.0px, checked across the highest chip-density screen in the app (the pro's own services-offered picker, six scrolling rows) with no regression |
| 8 | Remove beta-blocking dead paths | `ServiceSheet`/`QuoteFormSheet`/`Discover.jsx` orphaning documented (PR #114), not removed — no agreed replacement home yet (pre-existing decision, `EXPERIENCE_VISION.md` §10). **Swept the rest of `src/` for further orphans, 2026-08-28**: every other exported component traces back to a real entry point with an actual render — nothing else found |
| 9 | End-to-end staging validation, fresh synthetic accounts | Fresh signup attempted live — form and validation work correctly, blocked from completing by the SMTP rate limit just found (item 6). Every other verification this session reused the two seeded accounts (`customer@`/`pro@staging.klussie.test`), not fresh ones |
| 10 | Final beta-readiness report | **Done, 2026-08-28** — `implementation/BETA_READINESS_REPORT_2026-08-28.md`. Verdict: ready for a controlled beta, not a public launch; two accepted, external, founder-owned limitations (SMTP, OAuth) named with concrete mitigations, everything else in the mandate's own "Definition of beta-ready" checklist met and evidenced |

**Addendum, same day — the production-reset track, resumed at the
founder's own instruction now that the beta gate above is reached.**
Not part of the ten priorities (a separate, later decision named in the
mandate itself); recorded here rather than a new tracker. Planning only
— `implementation/PRODUCTION_MIGRATION_0018_0187.md` replaces the old,
170-migrations-stale v1.0 runbook with the real current scope. A real
restore drill was run against **staging** (never production) to prove
the disaster-recovery procedure this whole effort depends on, per the
founder's own explicit approval — and found it genuinely broken in three
ways nobody had ever caught (`DISASTER_RECOVERY.md` §8's own drill
record has the full account): the documented backup never covered most
of the platform's real schemas, never captured role grants at all, and
excluded the `api` schema entirely. Data+schema restore itself is now
proven correct (exact row counts, exact real data values). The drill was
deliberately stopped mid-recovery at the founder's own call, leaving
staging in a known, documented, partially-degraded state (roughly 19
`api.*` delegate functions missing or stale — full list and the proven
fix are in the drill record) — **not production, and not silent.**
Nothing was linked, migrated, or deployed against production this
session.

# Changelog

All notable changes to Klussie are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
adapted to this project's unit of delivery: **entries group under
engineering epics, not version numbers.** Klussie has no release
versioning yet — `docs/IMPLEMENTATION_ROADMAP.md` delivers epics, and an
epic is what a reader wants to locate. If versioned releases arrive
later, they slot in above the epics without restructuring this file.

---

## How to write an entry

**When.** At epic completion, as part of the gates in
`docs/IMPLEMENTATION_ROADMAP.md` §7 — not at the end of every work
package, which would make this a second commit log.

**What.** What changed for someone using or operating Klussie. Not a
restatement of the diff — `git log` already holds that, and holds it more
accurately.

**Categories**, used only when they have content:

| Category | For |
|---|---|
| `Added` | New capability |
| `Changed` | Different behaviour in something that already existed |
| `Deprecated` | Still works, going away, with what replaces it |
| `Removed` | Gone |
| `Fixed` | A defect corrected |
| `Security` | Anything affecting isolation, permissions, secrets or data protection |

**Two rules specific to this project:**

- **Behaviour changes are stated plainly.** Most migration work packages
  are deliberately behaviour-preserving; when one is not, this file says
  what a user sees differently. A silent behaviour change is a defect
  whether or not it was intended.
- **Migrations name their step.** Where an entry covers part of the
  six-step migration pattern (roadmap §3), it says which step, because
  "reads now come from the new structure" and "the old structure was
  dropped" are very different events to a reader debugging something
  months later.

---

## Unreleased

### Added

**Epic 18 — Provider Intelligence Engine (complete, 3 of 3 packages).**
No client caller exists yet — pure addition, no Changed entry below it.
**Built retroactively, on explicit instruction, after Epic 19** —
branched off Epic 19's own tip rather than its chronological position,
the same shape Epic 04 held earlier this session.

- **No schema, no engine role named for Provider Intelligence** anywhere
  in the frozen documents — the same class of gap Epic 19 found for
  Notification, resolved differently here: `SYSTEM_ARCHITECTURE.md`
  §9.3's own "Dependencies" line names Marketplace directly, so
  `work.provider_decisions` lives in `work`, owned by
  `klussie_engine_work`, by join locality rather than Notification's
  cross-cutting-concern precedent.
- **`work.provider_decisions`** — one row per decision.
  `recommended_providers` required non-empty, captured with the
  recommendation rather than after it. `selected_provider`/`decided_at`
  and `overridden_provider`/`override_reason`/`overridden_at` each a
  paired one-way outcome, structurally mutually exclusive.
- **`select_provider()`** verifies the chosen provider actually appears
  in `recommended_providers`, refusing otherwise and directing the
  caller to `override_recommendation()` instead.
- **`override_recommendation()`** deliberately performs no such check —
  disagreeing with the recommendation is the entire point of an override
  — but requires a non-blank reason.
- **Needs zero new cross-schema grants** — the first epic since 15 that
  doesn't, a direct benefit of the schema-placement choice.
- **`event_type` minted correctly from the start** — the fourth epic in
  a row to do so.

- Test suite grew from 1393 tests across 141 files to **1414 across 144**.

**Epic 19 — Notification Engine (complete, 3 of 3 packages).** No client
caller exists yet — pure addition, no Changed entry below it.

- **No schema, no engine role exists for Notification** anywhere in the
  frozen documents — resolved by precedent, following Audit's own
  placement in `platform`, owned by `klussie_engine_platform`, rather
  than adding an eleventh schema.
- **`platform.notifications`** (workspace-scoped, fully immutable) and
  **`platform.notification_deliveries`** (one per recipient per channel,
  immutable except `delivered_at`/`seen_at`/`acted_at`, each one-way) —
  two tables, not one, matching the domain model's own split between a
  workspace-scoped record and a per-person delivery fact.
- **`platform.notification_preferences`** — the first genuinely mutable
  aggregate this session has built. One row per membership, a real
  foreign key into `workspace.memberships`, deliberately not append-only
  since a preference toggle has no governance value worth a permanent
  trail.
- **`raise_notification()`** takes its recipients as a caller-supplied
  `jsonb` array — fanning out to an unbounded, transaction-resolved set
  means the caller mints every delivery id, never this function.
- **`mark_notification_acted()`** emits a named extension beyond the
  frozen event list, the third such gap-fill this session.
- **`platform.my_inbox()`** composes the identity-scoped inbox at read
  time across live membership — never materialised, so revoking a
  membership removes its items with no separate invalidation step.
- **`event_type` minted correctly from the start** — the third epic in a
  row to do so.

- Test suite grew from 1368 tests across 138 files to **1393 across 141**.

**Epic 17 — Intelligence Engine (complete, 4 of 4 packages).** No client
caller exists yet — pure addition, no Changed entry below it. No new
schema, no new engine role — shares Epic 16's own `knowledge` schema and
`klussie_engine_knowledge` role.

- **`knowledge.memory_versions`** — the one structural correction the
  Rebuild Test forced on Property Memory: permanent, append-only, no
  `workspace_id` column since memory follows the property, live,
  surviving a change of steward.
- **`knowledge.propose_rule()`/`confirm_proposed_rule()`/
  `reject_proposed_rule()`** — close the gap Epic 16's own contract
  deliberately deferred. Rejection composes `retire_rule()` rather than
  duplicating it.
- **`knowledge.publish_memory_version()`** — resolves its event's
  `workspace_id` from the property's current steward, live.
  Deliberately uses `subject_type = 'property'`, so a published version
  appears in Epic 15's own Timeline with no changes needed there.
- **Four event-only actions with no dedicated table** —
  `record_recommendation()`, `propose_prediction()`, `propose_asset()`,
  `generate_summary()` — since nothing yet needs to query one back out.
- **Read-before-design finding**: "migrates the existing AI intake and
  translation onto the engine contract" turned out to be substantially
  already done by other epics — translation is already Conversation's
  own event (Epic 13); AI intake's result lives entirely in a request's
  own jsonb column with no SQL-side equivalent to migrate. What this
  epic actually builds is the durable half neither had anywhere to
  write.
- **`event_type` minted correctly from the start** — the second epic in
  a row to do so, the direct benefit of Epic 15's own fix landing first.

- Test suite grew from 1346 tests across 135 files to **1368 across 138**.

**Epic 16 — Knowledge Engine (complete, 6 of 6 packages).** No client
caller exists yet — pure addition, no Changed entry below it.
`PLATFORM_DOMAIN_MODEL.md` §19.2 calls the Knowledge Graph "the most
demanding thing in this document"; this epic builds the smallest correct
slice of it.

- **`knowledge.rules`** — declared, binding Workspace Knowledge (§18.2).
  Four scope levels (workspace/property/location/asset_class); two
  origins (`declared`/`proposed`) — "observed but unconfirmed" is
  deliberately not stored, since it can never become policy by its own
  definition. Supersession by new row, never an in-place edit.
- **Conflicts are surfaced, never resolved silently** —
  `knowledge.rules_in_force()` returns every rule tied at the most
  specific applicable scope; `knowledge.declare_rule()` records the
  moment a conflict comes into existence, once, at declaration, rather
  than re-detecting it on every read.
- **`knowledge.workspace_edges`** — asserted graph facts a human stated
  that no aggregate implies. No node table needed — workspace-side nodes
  already exist as real aggregates elsewhere in the platform.
- **`knowledge.world_nodes`/`world_edges`** — the world graph. Real
  foreign keys between nodes; no workspace reference anywhere,
  structurally, per §19.2's own privacy guarantee. Writable only through
  `knowledge.promote_fact()`.
- **`knowledge.promote_fact()`** — promotion as an explicit, one-way,
  irreversible, audited operation (§6/§33): upserts both world nodes and
  the edge between them atomically, writes the required audit record
  naming what was promoted and from which population, and emits exactly
  one event attributed to the origin workspace.
- **Closed a debt row unallocated since Epic 01**: `platform.
  write_audit_record()`, the privileged write path `0022_audit.sql`'s own
  header named as deliberately out of scope, built because promotion is
  the first real caller that structurally needs it — mirrors
  `platform.emit_event()`'s own shape exactly.
- **A second, independent session-spanning defect, found and fixed
  forward**: `klussie_engine_work`/`klussie_engine_commerce` never held
  `USAGE` on schema `platform`, despite holding `EXECUTE` on
  `platform.emit_event()` since Epic 01 — six already-shipped contract
  functions across five epics would have failed with "permission denied
  for schema platform." Fixed in one new migration; unlike `event_type`,
  no rebase of the six affected branches was needed, since a missing
  `GRANT` only needs to exist in the final cumulative migration state.
- **Every `event_type` this epic mints was correct from the start** —
  `<engine>.<aggregate>.<past-participle>`, the direct benefit of
  Epic 15's own finding being fixed before this epic began.
- Derived workspace-graph edges, inferred world-graph edges, and
  `asset_class` rule-scope resolution are deliberately not built — named
  gaps, not silently narrowed scope.
- **A real bug caught in this epic's own work, before Epic 17 branched
  off it**: `rules_in_force()`/`declare_rule()` never checked
  `confirmed_at`, so an unconfirmed proposal would have been treated as
  already binding — fixed on this branch.

- Test suite grew from 1293 tests across 128 files to **1346 across 135**.

**Epic 15 — Timeline & Digital Twin (complete, 3 of 3 packages).** No
client caller exists yet — pure addition, no Changed entry below it.
**Not a new engine** — extends Property's (Epic 05) own contract with two
read functions, per `SYSTEM_ARCHITECTURE.md` §3's own ownership table.

- **`property.timeline_segment()`** — §25's own words taken literally: "a
  workspace may read the segment of a property's timeline that falls
  within its own stewardship period." Unions the current stewardship
  window with every closed one the caller's own workspace held, resolved
  across six subject branches (property, asset, location, service_record,
  conversation, message) joined directly against `platform.events` — §25
  rules out any separately-maintained cache.
- **`property.assemble_twin()`** — the twin itself stays unmaterialised
  (§28); this is only the "narrow summary projections" §28 explicitly
  permits: five live counts, current-steward-only, deliberately not
  stewardship-window-scoped like the timeline.
- **A pre-existing bug found and fixed while opening the same access
  Timeline needs**: `platform.events` has had RLS enabled with no policy
  since Epic 01 — `klussie_consumer_delivery`'s own `SELECT` grant has
  been dead code the entire time, since a table-level grant does not
  bypass RLS. One policy, naming both roles, fixes it.
- **Document resolution, and asset/location lifecycle events, deliberately
  excluded from v1** — Document and Asset engines (Epics 07/08) have never
  emitted a single event, so those branches would be correct but currently
  vacuous; Maintenance's own events already populate the asset/location
  branches today, so Timeline is thinner than its eventual shape, not
  empty.
- **The largest finding of this session, found and fixed**: every
  `emit_event()` call since Epic 06 used a bare PascalCase `event_type`
  instead of ADR-0019's own dotted format — 34 values across 7 epics,
  none matching `platform.events`' own `CHECK` constraint. ADR-0019 stayed
  authoritative and unmodified; every call site, its test assertions, and
  affected `comment on function` prose were conformed to it instead,
  across all 7 affected branches, each verified against
  `SYSTEM_ARCHITECTURE.md`'s own per-engine event lists rather than
  mechanically transformed — see `implementation/epic-15/COMPLETION.md`
  §6 for the full mapping.

- Test suite grew from 1269 tests across 125 files to **1293 across 128**.

**Epic 14 — Billing Engine (complete, 5 of 5 packages).** No client
caller exists yet — pure addition, no Changed entry below it. The first
real revenue path: `src/lib/billing.js`'s `PLATFORM_COMMISSION_RATE` was
a display-only constant with no persisted record; this epic formalises
it as a real, immutable ledger.

- **`commerce.invoices`** — immutable except `status`
  (`issued` → `paid` → `credited`, `credited` a true terminal).
  Multi-currency and multi-jurisdiction from the first row, no closed
  list of either. `payer_workspace_id` is a real, unpopulated
  forward-connection.
- **Subscription (§11.1) is deliberately not this epic** — the roadmap
  already sequences it separately, six epics later as Epic 22; nothing
  here invents a subscription concept ahead of it.
- **`commerce.credits`** — corrections by credit-and-reissue, never an
  edit; append-only, enforced structurally.
- **`commerce.payments`** — one table for both payments and payouts, a
  `direction` column rather than two duplicated shapes, matching
  `work.maintenance_obligations`' own `source`-column idiom (Epic 10).
- **`commerce.issue_marketplace_commission_invoice()`** resolves a real
  engagement's price and composes `commerce.issue_invoice()` rather than
  duplicating its insert — the third occurrence of the "compose, don't
  duplicate" pattern this session (`work.generate_due_obligation()`,
  Epic 10). The commission rate is a required parameter, never a
  hardcoded constant.
- **`commerce.settle_payment()`** marks a linked invoice paid in the
  same transaction as settling an inbound payment against it.
- **A named gap in the frozen event vocabulary**: §11.2 has no
  `PayoutFailed` event despite `commerce.payments.status` structurally
  permitting a failed outbound payment. `commerce.fail_payment()` emits
  it anyway, a minimal, consistent extension, recorded here rather than
  silently worked around.
- **No new bug class this epic** — every emitted event's `workspace_id`
  is a real, directly-available column; the first epic since Epic 11
  where the read-before-design pass found no structural bug, only scope
  and naming findings.

- Test suite grew from 1228 tests across 120 files to **1269 across 125**.

**Epic 13 — Conversation Engine (complete, 6 of 6 packages, reviewed
against every completed engine before implementation).** No client
caller exists yet — pure addition, no Changed entry below it. Review
itself: `implementation/epic-13/DESIGN_REVIEW.md`, produced and read
before any table was created, on explicit request.

- **The review's own largest finding**: `PLATFORM_DOMAIN_MODEL.md` §15's
  five real conversation subjects (engagement, asset, maintenance
  obligation, property, workspace) are all real aggregates for the first
  time only now, after Epics 05–12. The original scope note for this
  epic was written before any of them existed.
- **`work.conversations`** — binds to `work.engagements`, not a request
  — the single largest correction: legacy only bound to a request
  because no engagement existed as a real row before Epic 12.
- **`work.conversation_participants`** — an explicit, managed roster
  keyed by `person_ref`, not derived from workspace membership. The
  naive "either workspace" isolation shape (this epic's own nearest
  precedent) was checked against §20's own text and found to over-grant.
  Read state (`last_read_at`) lives here, per participant, replacing
  legacy's single `messages.read_at`, which assumed exactly two parties.
- **`work.messages`** — immutable except `translations` (reusing the
  exact existing AI Gateway mechanism, not waiting on Intelligence,
  Epic 17). `reference_type`/`reference_id` give a message an optional
  link to a structured moment (a quote, a transition), reusing
  `platform.emit_event()`'s own polymorphic-subject shape.
- **Backfilled: every real conversation and message**, bound to their
  real engagement rather than a request.
- **The conversation engine contract** — eleven functions, no `api.*`
  delegate for any of them.
- **Two real bugs caught before shipping — a new class of mistake for
  this session**: `platform.events.workspace_id` is `not null` and is
  the table's own hash-partition key. The first draft of
  `close_conversation()` passed a literal `null`; the first draft of
  `open_conversation()` would have silently recorded an asset or
  property id *as* a workspace id whenever a conversation opened on a
  subject with no workspace column of its own. Both fixed by
  `work.resolve_conversation_home_workspace()`, a real resolver walking
  all five subjects to their actual owning workspace.
- **Location and Service Record considered and not added** as
  conversation subjects — both real, plausible connections; neither is
  named in §15. Recorded as candidates for a future ADR.

- Test suite grew from 1183 tests across 114 files to **1228 across 120**.

**Epic 12 — Marketplace Engine (complete, 6 of 6 packages, deliberately
narrowed scope).** No client caller exists yet — pure addition, no
Changed entry below it. Does not retire any of the five legacy triggers
still driving booking today — see the scope note first.

- **A scope determination, before anything was built**: Epic 09's own
  header named the trigger retirement "the single largest behavioural
  risk in the roadmap," and the roadmap's own risk register requires the
  regression baseline (WP 00.08) before that switch. This epic builds
  the complete new schema, backfills every real request/quote/booked
  engagement, and ships a full contract proven to reproduce the five
  legacy triggers exactly — but does not dual-write a real scoped access
  grant, retire any trigger, or cut the live booking flow over. Recorded
  explicitly, not silently narrowed.
- **`work.requests`** — reuses `public.categories`/`services` directly
  rather than migrating marketplace taxonomy (its own separate debt
  item). `workflow_instance_id` is a real, unpopulated forward-connection
  to Epic 09.
- **`work.quotes`** — mirrors `public.quotes`' own shape, owned by the
  offering workspace.
- **`work.engagements`** — a bilateral object, both parties denormalised
  directly. `service_record_id`/`maintenance_obligation_id` are real,
  unpopulated forward-connections to Epics 11 and 10. Immutable once
  completed or cancelled; no delete grant, ever.
- **Backfilled: every request, quote and booked engagement** — reusing
  Epic 03's own already-resolved `workspace_id` columns rather than
  re-deriving the identity → membership → workspace chain a third time.
- **The marketplace engine contract** — thirteen functions reproducing
  the five legacy triggers exactly, including `accept_quote()`'s bulk
  decline of every other open quote in one statement. No `api.*`
  delegate for any of them.
- **A real cross-schema privilege violation caught before it shipped**:
  the first draft built `work.grant_engagement_access()`, inserting
  directly into `workspace.memberships` from a role
  (`klussie_engine_work`) holding no privilege on that table at all —
  removed entirely. The scoped access grant `DATABASE_ARCHITECTURE.md`
  §19 describes belongs to a future Workspace-owned consumer of this
  epic's own `EngagementCreated` event, per `SYSTEM_ARCHITECTURE.md`'s
  own Workspace section.

- Test suite grew from 1136 tests across 108 files to **1183 across 114**.

**Epic 11 — Service Record Engine (complete, 4 of 4 packages).**
`DATABASE_ARCHITECTURE.md` §17 names this "the most consequential
aggregate in the document" and "the highest-risk surface in the
architecture." No client caller exists yet — pure addition, no Changed
entry below it.

- **`work.service_records`** (the shared core) — no `owning_workspace_id`;
  it "follows the property" (§17), resolved live through `property_id ->
  property.properties.steward_workspace_id`, the same shape
  `property.assets`/`locations` already use, the opposite of `property.
  documents`' frozen-owner shape. `performing_workspace_id` **is** the
  permanent, non-revocable grant itself — a plain column, not a separate
  grants table; no withdraw path exists for it anywhere in this schema.
  Rich, variable content (diagnosis, parts, measurements) lives in
  `content jsonb`, not fifteen nullable columns. Immutable except
  `customer_approved`/`customer_approved_at`, which may move false →
  true exactly once.
- **`work.service_record_performing_annexes`** — no workspace column of
  its own (the core already has one). **`work.
  service_record_property_annexes`** — freezes its workspace at write
  time, §17's own transfer table's exact opposite of the core, proven in
  a real steward-transfer scenario. **`work.service_record_amendments`**
  — append-only, either party may author one.
- **RLS combines two independent visibility paths for the first time in
  this schema** — direct performing-workspace membership OR the
  property's current steward. `VERIFY_SERVICE_RECORD_ISOLATION.sql`
  inspects the actual policy text on both annexes to prove structurally
  that neither can ever reference the other side's relationship, not
  only that one test scenario happens to pass.
- **The service record engine contract** — ten functions, none generic,
  matching the authorship split exactly. `write_property_annex()`
  resolves the current steward itself, via a live join, rather than
  trusting a caller-supplied workspace id.
- **A real identifier-generation bug caught before it shipped, for the
  third time this session**: the first draft of `create_service_record()`
  minted its conditional `WarrantyArising` event's id via
  `gen_random_uuid()` — the identical mistake Epic 04's
  `grant_capability()` made, caught faster this time because the pattern
  was already named.

- Test suite grew from 1096 tests across 104 files to **1136 across 108**.

**Epic 04 — Capability Engine (complete, 6 of 6 packages) — built
retroactively.** Epic 04 is Tier 1 in the roadmap's own sequencing
(Identity, Workspace, Capability, before any physical-model epic) but was
skipped when the roadmap was originally executed — no branch, PR, or
completion record ever existed, and no documented reason was found. Found
and built after Epic 10, on request. Its migrations are numbered `0075`
onward rather than renumbering Epics 05–10's six already-open PRs — see
`implementation/epic-04/COMPLETION.md` §5.1. No client caller exists yet
— pure addition, no Changed entry below it.

- **`platform.capabilities`** — the real 26-capability catalogue
  (`PLATFORM_DOMAIN_MODEL.md` §6.7), seeded verbatim. **`platform.
  capability_dependencies`** — only the five edges §6.2 itself states; a
  plausible-but-unstated edge (Fleet Management on Asset Management, say)
  is not invented.
- **`platform.capability_presets`/`capability_preset_grants`** — exactly
  three presets (Personal, Professional, Business), transcribed from
  §6.8's own table. Not four: this epic's own roadmap acceptance
  criterion names three, and `workspace.workspaces.type` has no
  `'enterprise'` value to apply a fourth to. Verified dependency-consistent
  against the dependency graph, not merely assumed.
- **`workspace.capability_grants`/`capability_grant_history`** — shaped
  like `workspace.memberships`/`membership_history` (Epic 03), not
  ADR-0028: a capability grant is a set a workspace holds, not a single
  current value. No unique constraint on (workspace_id, capability_key),
  the same reason memberships has none on (person_ref, workspace_id).
- **The capability engine contract** — `grant_capability()` refuses
  (never auto-grants) a missing dependency; `withdraw_capability()`
  refuses while a dependent is still held. No `api.*` delegate for any of
  the four functions — `property.reparent_location()`'s posture, now a
  four-time pattern.
- **A real identifier-generation bug caught before it shipped**: the
  first draft of `grant_capability()` minted its history row's id via
  `gen_random_uuid()` internally, directly contradicting its own header's
  explanation of why every identifier must be a caller-supplied
  parameter. Found by re-reading the function against its own stated rule
  before running the tests.
- **Backfilled: every existing workspace's matching preset**, applied
  directly (not through the contract function, the same reason every
  other backfill in this roadmap inserts directly) and backdated to the
  workspace's own `created_at` — the capabilities were always its
  effective starting bundle; this migration is only the first thing to
  say so structurally.

- Test suite grew from 1053 tests across 98 files to **1096 across 104**.

**Epic 10 — Maintenance Engine (complete, 4 of 4 packages).** No client
caller exists yet — pure addition, no Changed entry below it.

- **`work.maintenance_schedules`** — the recurring rule, anchored to
  exactly one of an asset or a location, `recurrence` a native
  `interval`. Ordinary mutable data, no version history — nothing in
  `DATABASE_ARCHITECTURE.md` §16 requires reconstructing a schedule's
  past configuration the way a workflow definition's version history
  does.
- **`work.maintenance_obligations`** — authoritative once created, never
  conflated with a prediction (§16); immutable once `status` reaches
  `completed` or `cancelled`, via a conditional guard trigger reusing
  `property.documents_guard_deletion()`'s own shape (Epic 08).
  Cancellation always carries a reason, enforced by both a table check
  and the contract function.
- **The maintenance engine contract** — create/cancel a schedule,
  create/complete/cancel an obligation, plus two read functions. No
  `api.*` delegate for any of the eight — `property.reparent_location()`'s
  own precedent, now a three-time pattern in this roadmap.
- **A real identifier-generation trap avoided before it was built**: the
  obvious shape for "catch a schedule up on missed periods" is a loop
  minting a fresh id per generated obligation via
  `platform.uuid_v7_at()`. That function is documented backfill-only
  (ADR-0022) — generating new obligations on an ongoing basis is runtime
  generation, which belongs in the application, however deep inside a
  function it happens. `work.generate_due_obligation()` instead handles
  exactly one schedule, one obligation, per call; a caller catches a
  backlogged schedule up by calling it once per missed period, each with
  its own application-generated id.
- **Three relationships named in the architecture but deliberately not
  wired**: due/overdue is computed at read time from `due_on`, not a
  stored event (no Notification engine exists yet to consume one);
  "produces workflow instances" and "resolved by service records" both
  wait on engines that don't exist yet (a real maintenance-specific
  workflow definition, and Epic 11's Service Record Engine).

- Test suite grew from 1023 tests across 94 files to **1053 across 98**.

**Epic 09 — Workflow Engine (complete, 5 of 5 packages).** No client
caller exists yet — pure addition, no Changed entry below it. Does not
retire any of the five legacy triggers still driving booking today; see
the scope note first.

- **A scope determination, before anything was built**: the roadmap's own
  one-line summary for this epic reads "ends the trigger-based state
  machine." Checked against `DATABASE_ARCHITECTURE.md` §18 (a workflow
  instance is "one workspace-scoped run of a definition") against what
  the five legacy triggers actually key off
  (`public.service_requests`/`public.quotes`, keyed by a profile, not a
  workspace) — a workflow instance needs a workspace-scoped subject
  those tables don't have until Epic 12's own migration gives them one.
  This epic builds the real, generic engine and a real published
  definition; it does not touch `service_requests`, `quotes`, or retire
  any trigger. Recorded explicitly, not silently narrowed.
- **`work.workflow_definitions`** — versioned per `definition_key`,
  immutable once published except `deprecated_at`, never deleted.
  `work.workflow_stages` / `work.workflow_transition_rules` — the
  reachability graph, unconditionally append-only once published.
- **`work.workflow_instances`** and **`work.workflow_transitions`** —
  [ADR-0028](docs/adr/0028-stewardship-current-pointer-and-closed-period-log.md)'s
  mutable-current-pointer-plus-append-only-log shape, a fourth
  application. `subject_type`/`subject_id` is a polymorphic pair with no
  foreign key, reusing `platform.emit_event()`'s own shape (migration
  0023) rather than a new one — nothing in this schema has a real
  workspace-scoped subject to point at yet.
- **The workflow engine contract** —
  `work.start_workflow_instance()`/`work.transition_workflow_instance()`,
  the first write contract in this roadmap with no predecessor data to
  mirror, every identifier a required parameter, none minted
  server-side. No `api.*` delegate for any of its five functions —
  `property.reparent_location()`'s own precedent (migration 0047), not
  `property.my_documents()`'s.
- **`booking_request_lifecycle` v1** — the real rules `on_request_created`
  / `on_quote_sent` / `on_quote_accepted` / `on_job_completed` /
  `on_review_created` carry today, reproduced as published
  configuration, reusing their own stage and event names. Includes a
  deliberate `quotes_ready -> quotes_ready` self-loop reproducing
  `handle_quote_sent()`'s own `where status = 'collecting'` no-op for a
  second quote — caught by re-reading the trigger's own guard clause
  before writing the rule set, not assumed. The decline-other-quotes and
  open-conversation side effects of quote acceptance are a named,
  deliberately undone gap — no action/effect mechanism exists yet;
  Epic 12 designs it against a real instance.
- **`VERIFY_WORKFLOW_CONTRACT.sql`** — the shadow verification: walks a
  synthetic instance through all five legacy events plus the multi-quote
  no-op and the impossible-transition refusal, proving the definition
  reproduces the trigger chain's decisions exactly.

- Test suite grew from 978 tests across 89 files to **1023 across 94**.

**Epic 08 — Document Engine (complete, 9 of 9 packages).**
`portfolio_items` and `service_request_photos` remain fully
authoritative and unmodified — see Changed, below, for what actually
changed for a user.

- **A scope correction, before anything was built**: the roadmap's own
  original note for this epic named `avatar_url` as a migration target.
  Checked against `DATABASE_ARCHITECTURE.md` §15's actual definition of
  a document — evidence, with a type, a validity period, an issuer — an
  avatar fits none of that. Excluded, corrected rather than built as
  originally scoped.
- **`property.documents`** and **`property.document_versions`** —
  versioning repeats [ADR-0028](docs/adr/0028-stewardship-current-pointer-and-closed-period-log.md)'s
  mutable-current-pointer-plus-closed-log shape, a third time, matching
  `DATABASE_ARCHITECTURE.md` §15's own wording ("metadata mutable,
  content immutable... version history is retained") rather than the
  domain model's own softer "how it evolves" phrasing — the more
  specific document won.
- **`property.document_types`** — a declared catalog, matching
  `property.facet_types`' own shape (Epic 07), but seeded from the
  start: unlike facets, this epic's backfill needed real values.
  `retention_class` (`evidence`/`convenience`) gates deletion via a
  conditional trigger, never a grant alone.
- **`property.document_attachments`** — scoped to the four subjects
  with a real table today (property, location, asset, workspace);
  maintenance record and marketplace engagement, both named in the
  architecture, are not included since neither table exists yet.
- **`property.document_shares`, fully independent of attachment** —
  `DATABASE_ARCHITECTURE.md` §15 calls "attachment is not a visibility
  grant" a principle that was nearly lost; the isolation policy and
  engine contract both hold that line, proven in a real scenario (a
  property steward who can see an asset but not a document attached to
  it), not just by an absent join.
- **Backfilled: `portfolio_items` and `service_request_photos` into
  `property.documents`** — the second backfill in this roadmap moving
  real, existing data, and the first from two source tables into one
  target at once. Sharing for request photos is backfilled as a
  point-in-time snapshot of the existing `pro_matches_request()`
  matching rule.
- **Dual-write: every `portfolio_items`/`service_request_photos` write
  also writes `property.documents`, going forward** — four database
  triggers (insert and delete on each source table), not an
  application-level second write. Neither table needed an update
  trigger — read before design found neither has a client-mutable field
  the document model tracks.
- **Fixed, before it could ship: a foreign key that would have broken
  deleting a document.** `document_attachments.document_id` and
  `document_shares.document_id` had no `ON DELETE` behaviour, which
  would have made deleting a convenience-class document fail outright.
  Fixed with `ON DELETE CASCADE` in the same migration that added the
  delete triggers that would have hit it — caught this time before any
  account could be affected, not after.
- **Reconciled**: `RECONCILE_DOCUMENTS.sql`, written and structurally
  tested, following `RECONCILE_ASSETS.sql`'s own shape.
- **The read switch's architectural gap is resolved.** Designing it
  found `property.documents`' isolation model had no path for public
  visibility, while `portfolio_items` is genuinely public today — the
  product owner decided to add explicit public-visibility support to the
  isolation model. `property.document_types.is_public` carries it by
  type — the same reasoning `DATABASE_ARCHITECTURE.md` §15 already gives
  `retention_class` — with `portfolio_photo` the only public type.
  `service_request_photos`-sourced documents, deliberately unattached
  and undiscoverable by subject, get a dedicated lookup
  (`property.documents_for_service_request()`) instead.
- **`property.documents.caption`** — building the client read switch
  found `fetchPortfolioItems()` returns `caption`, a real field
  (`updatePortfolioCaption()`) with no equivalent on `property.documents`
  until now. Backfilled onto already-mirrored rows; `portfolio_items`
  gained its first-ever UPDATE mirror trigger to keep it in sync going
  forward.
- **`workspace.resolve_public_professional_workspace()`** — the first
  "resolve someone else's public workspace" lookup in this roadmap,
  needed to switch the portfolio read (every prior resolver only
  answered "what are *my own* workspaces"). Public, matching
  `portfolio_items`' own real grant — a workspace id isn't sensitive by
  itself, and visibility of anything real stays gated separately.

- Test suite grew from 875 tests across 75 files to **978 across 89**.

### Changed

- **`fetchRequestPhotos` and `fetchPortfolioItems` now read
  `property.documents` via the document engine**, not their legacy
  tables directly, whenever the new migrations are applied — both
  falling back to the exact prior behaviour otherwise, the same fallback
  discipline every read switch since Epic 03 WP 03.11 has used. Every
  field either function returned before, including portfolio's
  `caption`, is still returned. **Live verification of both switches is
  Pending**: `RECONCILE_DOCUMENTS.sql` has been written and structurally
  tested but has not run against a real database this session — do not
  treat either switch as verified in an environment with real users
  until it has.

**Epic 07 — Asset Engine (complete, 8 of 8 packages).** `household_items`
is still what every write actually lands on. What changed is where "Mijn
spullen" reads from — see Changed, below, for that part stated plainly.

- **`property.assets`** and **`property.asset_placements`** — placement
  repeats [ADR-0028](docs/adr/0028-stewardship-current-pointer-and-closed-period-log.md)'s
  mutable-current-pointer-plus-closed-log shape by citation, matching
  `DATABASE_ARCHITECTURE.md` §14's near-verbatim wording; no new ADR
  needed.
- **Declared facets** — `property.facet_types` (a catalog an attribute
  set must be declared in) and `property.asset_facets`, validated by
  trigger against the declared key set. No facet type seeded yet;
  nothing needs one.
- **Isolation inherits the property's current stewardship**, same
  pattern as locations — no asset- or facet-specific resolver.
  `asset_placements` deliberately gets no policy: Historical class, read
  through the engine contract only.
- **The asset engine contract** — `my_assets()`/`resolve_asset()`, with
  real `api` delegates this time (unlike Epic 06's engine-only
  containment functions), narrowed to active-only assets once the
  contract got a real caller.
- **Backfilled: every live `household_items` row into `property.assets`**
  — the first backfill in this roadmap moving real, existing data rather
  than deriving from a table the same epic just created. Idempotent via
  a bookkeeping-only `household_items_id` column. Deliberately does
  **not** exclude erased identities, departing from migration 0033's
  pattern, because this moves existing possession data rather than
  creating new structure.
- **Dual-write: every `household_items` write also writes
  `property.assets`, going forward** — three database triggers, not an
  application-level second write. A closer, already-accepted precedent
  in this codebase (the identity dual-write) makes a trigger the only
  place the mirror write is genuinely transactional with the primary
  one. `household_items` remains authoritative.
- **Fixed: a foreign key that would have broken deleting an item.**
  `property.assets.household_items_id` had no `ON DELETE` behaviour,
  which meant deleting a `household_items` row that had a mirrored asset
  would fail outright. Fixed with `ON DELETE SET NULL` before the
  dual-write above could make the bug guaranteed rather than latent.
  Found by reading the existing schema, not by running anything.

- Test suite grew from 792 tests across 67 files to **875 across 75**.

### Changed

- **"Mijn spullen" now reads from `property.assets`, not
  `public.household_items` directly, whenever a property has resolved
  for the signed-in workspace.** The list, sort order and every field
  shown are unchanged by design — this is a data-source switch, not a
  feature change — and it falls back to the exact prior behaviour when
  no property has resolved yet, the same fallback discipline every read
  switch since Epic 03 WP 03.11 has used. **Live verification of this
  switch is Pending**: `RECONCILE_ASSETS.sql`, the check this roadmap
  requires before trusting a read-switch, has been written and
  structurally tested but has not run against a real database this
  session. Do not treat this switch as verified in an environment with
  real users until it has.

**Epic 06 — Location Engine.** The roadmap's own highest correctness-risk
item in the physical tier. Nothing here changes what a user sees —
nothing in the product creates a real location yet, so there is nothing
to read or switch.

- **`property.locations`** — a recursive tree, unbounded depth, via a
  materialised `ltree` path (GiST-indexed) kept alongside the
  authoritative parent pointer. Isolation inherits the property's
  current stewardship — a location carries no workspace column of its
  own, reusing Epic 03's existing membership helper through a join.
- **Subtree containment as a first-class operation** — `location_within`,
  `location_ancestors`, `location_descendants` — a single indexed
  operation regardless of tree depth, never a recursive walk.
- **Re-parenting** (`reparent_location()`) rewrites a moved subtree's
  paths and emits `LocationTreeChanged` in the same transaction — the
  event that keeps the Workspace and Search engines' eventual caches and
  indexes from silently going stale, once either exists.
- **A real bug found and fixed before any of this shipped:** every
  `ltree` operator and function lives in Postgres's `extensions` schema,
  not `pg_catalog`, and needed explicit schema qualification to resolve
  under this codebase's `search_path = ''` discipline. Found by reasoning
  through Postgres's own operator resolution rules, not by running
  anything — no database connection was available this session either.

- Test suite grew from 742 tests across 62 files to **792 across 67**.

**Epic 05 — Property Engine.** A property now exists for every Personal
Workspace. Nothing here changes what a user sees — this epic's one
client-facing change adds a field nothing downstream reads yet.

- **`property.properties`** — the property aggregate, with a **mutable
  current-steward pointer** (`steward_workspace_id`) rather than a
  static workspace stamp, because stewardship transfers
  ([ADR-0028](docs/adr/0028-stewardship-current-pointer-and-closed-period-log.md)).
- **`property.stewardship_periods`** — the permanent, genuinely
  append-only log of *closed* stewardships. Empty today: nothing has
  ever transferred.
- **Backfilled**: one property ("My Home") per existing Personal
  Workspace. Professional and Business workspaces get none — nothing in
  the product represents a business's premises yet.
- **The isolation policy and the client resolver both reuse Epic 03's
  existing membership helper directly.** No property-specific resolver
  was built — ADR-0028 found the current-steward pointer is a plain,
  indexed column, the same shape every other workspace-scoped table
  already has.
- **The property engine contract** — `my_properties()` (discovery) and
  `resolve_property()` (detail), mirroring the workspace engine's own
  shape.

### Changed

- `src/lib/homeInventory.js`'s `fetchHomeProfile()` resolves the
  signed-in person's property (id and name); every other field is
  unchanged, and nothing downstream reads the new one yet.
- Test suite grew from 696 tests across 57 files to **742 across 62**.

**Epic 03 — Workspace Engine.** The pivot of the roadmap: workspaces and
memberships exist, every existing person and professional has been
migrated onto them, and the two reads that actually changed — a
customer's own requests and household items — now scope by workspace
with a fallback proven identical to the old behaviour. **Not applied to
production**, and not yet verified against a live, signed-in session
from this session's tooling (see §6 below) — recorded plainly rather
than implied away, the same discipline Epic 02 held itself to.

- **`workspace.workspaces` / `workspace.memberships` /
  `workspace.membership_history`** — the workspace aggregate and its
  mutable-current-plus-append-only-history membership shape
  (`DATABASE_ARCHITECTURE.md` §10).
- **Backfilled**: one Personal Workspace per existing identity ("My
  Home"), one Professional Workspace per existing pro profile (the
  business name, or the person's own name, or "My Business"), idempotent
  and reconciled clean against every real row on staging.
- **The `STABLE` membership helper** (`api.current_workspace_memberships()`)
  — the isolation predicate nearly every later policy depends on,
  evaluated once per statement via an uncorrelated subquery
  ([ADR-0026](docs/adr/0026-membership-helper-lives-in-public.md)).
- **The workspace engine contract** — `resolve_context`, `decide_permission`,
  ADR-0027's twelve-permission vocabulary for workspace lifecycle and
  membership management.
- **A permissive isolation policy on all thirteen workspace-scoped
  tables**, adding to — never replacing — the existing 58 policies
  ([ADR-0025](docs/adr/0025-marketplace-visibility-survives-epic-03.md)
  narrowed this from the roadmap's original "the policies simplify").
- **The workspace switcher** (`WorkspaceSwitcher`), invisible for the
  single-workspace majority and shown only once a person genuinely holds
  two live workspaces — today, an existing professional's Personal and
  Professional pair (`PLATFORM_DOMAIN_MODEL.md` §27).
- **There is no API Gateway, and none was built.** Request context is
  resolved in the database instead, once per statement, called directly
  by the browser
  ([ADR-0024](docs/adr/0024-request-context-resolved-in-the-database.md)) —
  a decision with consequences for every engine still to come.

### Changed

- **A customer's own requests, and their own household items, now read
  by workspace** when one has been resolved, falling back to the
  pre-Epic-03 owner-id filter otherwise — proven identical either way,
  by tests that run both paths over the same row. A professional's own
  offered-services list does the same.
- **Conversations gained an additive third access path** (workspace
  membership, alongside the existing customer and professional sides) —
  not a switch, since a professional's side has no workspace to switch
  to until Epic 12's engagements exist.
- Test suite grew from 561 tests across 42 files to **696 across 57**.

**Epic 02 — Identity Engine.** The platform's identity is now its own,
separate from Supabase Auth, and carries a person reference designed to
outlive the person's data.

- **`identity.identities`** — the person reference every durable record
  will carry, with personal attributes in the one place erasure can
  reach. No foreign key in either direction: erasure must stay a
  redaction rather than becoming a cascade.
- **Backfilled from every existing profile**, idempotently, with
  identifiers minted from each row's own creation time
  ([ADR-0022](docs/adr/0022-backfilled-identifiers-are-uuidv7-minted-in-sql.md)).
- **UUIDv7 generation** (`src/lib/ids.ts`) — monotonic within a
  millisecond, which is the only reason the format is worth choosing.
- **Dual-write on signup**, inside the transaction that creates the auth
  user and the profile. One signup produces exactly one identity, or
  none of the three.
- **A reconciliation that gates the read switch** — and refuses to report
  success against a database with nothing to compare.
- **Erasure by redaction** — personal data removed across all three
  tables that hold it, the reference left valid as a key, history
  untouched, audited per `DATABASE_ARCHITECTURE.md` §33. It deletes
  nothing, because `public.profiles` is the parent of nine cascading
  foreign keys.
- **Staging test accounts** (`supabase/seed/staging_test_accounts.sql`) —
  the seed `ENVIRONMENTS.md` §4.4 has asked for since Epic 00.

### Changed

- **Profile display now reads from the identity engine.** The first
  behaviour change in the implementation roadmap, and it is designed to
  be invisible: the same names, avatars and cities, from a different
  source. Cross-user reads resolve *display information* rather than
  reading the identity row, because that row also holds contact details
  which stay private until a booking exists
  ([ADR-0023](docs/adr/0023-identity-display-resolution-versus-row-visibility.md)).
- Test suite grew from 497 tests across 34 files to **561 across 42**.

**Epic 01 — Schema Foundation & Event Backbone.** Nothing here changes
what a user sees, and nothing here is used yet. The epic is **entirely
additive**: it creates the substrate every later epic needs, applied to
staging only, with `public.domain_events` and its five triggers still the
product's live event path.

- **Ten engine-tier schemas**, and **twelve database roles** whose grants
  make an engine writing another engine's schema fail on privileges
  rather than on review ([ROLES.md](docs/operations/ROLES.md)).
- **`ltree` and `pg_cron`**, installed outside `public`.
- **`platform.events`** — the event outbox. Hash-partitioned by workspace,
  range-partitioned by time, append-only, carrying all thirteen fields of
  the [canonical event envelope](docs/adr/0019-canonical-platform-event-envelope.md).
  Not readable by any client role.
- **`platform.audit_records`** — the audit trail. Range-partitioned,
  append-only, and **writable by no application role at all**, including
  the engine that owns the schema. Records denied attempts, which no
  domain event captures.
- **`platform.emit_event()`** — emits an event inside the caller's
  transaction, so a change without an event is impossible, and assigns
  the next gapless per-subject sequence.
- **Cursor-based consumer scaffolding** — durable per-partition cursors,
  a quarantine that keeps one bad event from halting a stream, and a
  runner proven to resume without gaps and to redeliver at most one event
  after a crash.
- **Six SQL diagnostics** under `supabase/diagnostics/`, because a
  grant's effect, a partition's routing and an append-only guard's
  refusal are all invisible in the SQL that creates them.

**Two decisions the frozen architecture left open are recorded and
`Proposed`, not accepted** —
[ADR-0020](docs/adr/0020-events-partitioning-parameters.md) (eight hash
partitions, yearly ranges, a default range partition) and
[ADR-0021](docs/adr/0021-one-audit-table-with-nullable-workspace.md) (one
audit table with a nullable workspace). Both are cheap to revise while
the tables are empty and expensive afterwards.

**Epic 00 — Engineering Foundations.** Nothing in this epic changes what
a user sees; all of it changes what can be built safely afterwards.

- **CI pipeline** gating every push and pull request on lint, type-check,
  test and build.
- **This changelog**, and the rule that every epic updates it.
- **TypeScript toolchain** alongside JavaScript, `strict` from the start,
  with one leaf module converted as proof. No big-bang migration.
- **A staging environment.** Production is no longer the only environment
  Klussie has ever had. All 17 migrations replayed onto an empty database
  with no file modified — **the first proof that the migration chain can
  rebuild the schema from nothing.**
- **A disaster recovery strategy** that works on the Supabase Free plan
  without Docker: native `pg_dump` over the session pooler, storage via
  the Storage API, four backup cadences, and a stated RPO/RTO
  ([ADR-0017](docs/adr/0017-free-tier-disaster-recovery-strategy.md)).
  Klussie previously had **no working backup mechanism of any kind**.
- **A regression baseline** — a definition of what a behavioural
  regression is, an inventory of all 59 user-facing flows, and automated
  pins on the known defects so none is fixed silently
  ([TESTING.md](docs/engineering/TESTING.md)).

### Changed

- Test suite grew from 404 tests across 22 files to **497 across 34**
  (411/24 at the end of Epic 00).
- `.gitignore` now covers Supabase CLI machine state (`supabase/.temp/`).

### Fixed

- **Unit tests no longer require real Supabase configuration.**
  `src/lib/supabaseClient.js` validated configuration and constructed the
  client as an import side effect, so any module transitively importing
  the data layer — including files that only export pure functions —
  could not be loaded without a configured project. CI, which correctly
  has no credentials, failed on the import rather than on anything a test
  asserted. The client is now created on first use; validation still runs
  at application startup and again before construction, so a misconfigured
  deployment fails exactly as before, with the same message.

### Notes

- **No behaviour changed for users in this epic.** The literal
  escape-text defects and the untranslated `awaiting_pro` status are
  deliberately preserved and now pinned by tests — fixing either is a
  declared change requiring its own entry here.
- The restore procedure is documented and its tooling verified, but **no
  restore drill has been performed** — the Free plan provides two
  projects and neither can be consumed as a target.

---

## Before this file

This changelog begins with Epic 00. Klussie was built over roughly forty
commits before that point — the marketplace, AI intake, ten-locale
i18n, the design system, Property Memory V1, and the architecture phase
that produced the five frozen documents.

**That history is not reconstructed here, on purpose.** A changelog
written after the fact is a later guess at what mattered, presented with
the authority of a contemporaneous record. `git log` is the accurate
source for anything before Epic 00, and
`docs/architecture/ARCHITECTURE.md` describes what that history actually
built.

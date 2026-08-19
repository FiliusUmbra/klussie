# Klussie — Detailed System Architecture

**This document owns:** the real, current system architecture — data
model, deployment topology, request lifecycle, and Core Platform layer
status at the file level. It does not own the AI Gateway's internals
(`AI_ARCHITECTURE.md`), API contracts (`API_SPEC.md`), the threat model
(`../engineering/SECURITY.md`), or phase-by-phase planning
(`ROADMAP.md`).

> Ground truth, as of this writing. Where this document and
> `MASTER_CONTEXT.md` §3/§6 disagree, `MASTER_CONTEXT.md` wins — this
> document goes one level deeper, `MASTER_CONTEXT.md` stays the
> executive summary.

## Deployment topology

Three independently deployed surfaces, one shared Postgres project:

| Surface | Stack | Hosting | Notes |
|---|---|---|---|
| App (customer + pro) | Vite + React 19 SPA | Vercel (`klussie-xi.vercel.app`) | Serves `src/`; API routes under `api/*.js` deploy as Vercel serverless functions from the same project |
| Marketing site | Astro, statically generated | Separate Vercel project (`klussie.be`) | Lives in `marketing/`, its own `package.json`, no shared build with the app |
| Database/Auth/Storage/Realtime | Supabase (Postgres) | Supabase-hosted | One project serves production; also the only environment that has ever existed — no staging project yet (see `Known gaps` below) |

There is no CDN, queue, or cache layer in front of any of this today —
every request hits Vercel's serverless runtime and Supabase directly.

## Repository layout

See [`README.md`](../../README.md#repository-structure) for the
canonical top-level layout — not duplicated here. The parts most
relevant to this document:

- `api/_lib/` — the seed of Core Platform: `auth.js` (Authentication),
  `rateLimit.js` (part of Permissions), `aiGateway.js` (AI Gateway),
  `events.js` (the domain-event bus's publish side).
- `ai/{capability}/` — the prompt library (`AI_ARCHITECTURE.md` owns
  this in detail).
- `src/lib/*.js` — one small, single-purpose data-access module per
  domain (`auth.jsx`, `catalog.js`, `pros.js`, `requests.js`,
  `messages.js`, `reports.js`, `portfolio.js`, `testimonials.js`,
  `requestPhotos.js`, `serviceQuestions.js`, `storage.js`,
  `translate.js`, `aiIntake.js`, `supabaseClient.js`).
- `src/design-system/` — `primitives.jsx`, `overlays.jsx`,
  `domain.jsx`, `index.js` — the 14-component library referenced
  throughout the design docs.
- `supabase/migrations/` — 11 migrations, applied in order, are the
  actual schema history; this document summarizes their current state,
  not each migration individually.

## Data model

Grouped by concern, not by migration number (see `supabase/migrations/`
for the literal history):

**Identity**
- `profiles` — one row per `auth.users` row, created by trigger
  (`handle_new_user`). Public-safe fields only.
- `profile_contacts` — email/phone, split out so RLS can keep contact
  details private until a booking confirms a real relationship between
  customer and pro.
- `pro_profiles` — exists once a profile "becomes a pro"; `pro_type`
  (`flexi`/`business`), business details.
- `pro_stats` — `rating_avg`, `rating_count`, `badge_tier`,
  `is_certified`. Platform-controlled: no client write policy at all,
  only ever written by security-definer trigger functions.

**Catalog**
- `categories` / `category_translations` — 8 categories, seeded, 8
  locales each.
- `services` / `service_translations` — 15 seeded services (hardcoded
  taxonomy — see `ROADMAP.md` Phase 5, which replaces this with a
  configurable schema).
- `pro_services` — which services a pro offers.

**Requests, quotes, reviews**
- `service_requests` — the core booking-flow row. `status` moves
  `collecting → quotes_ready → booked → completed → reviewed` (or
  `cancelled`), driven by trigger functions, not application code.
- `quotes` — `sent → accepted/declined`; accepting one triggers the
  request's status change, declines the others, and opens a
  conversation, all inside `handle_quote_accepted()`.
- `reviews` — one per completed request; a trigger updates the pro's
  aggregate rating on insert.

**Messaging**
- `conversations` — created only by `handle_quote_accepted()`, never
  directly by a client (no insert policy exists).
- `messages` — `translations` jsonb column (added in `0009`) caches
  per-locale translations so a message is only translated once, not
  once per viewer per view.

**Trust & safety / portfolio** *(added in later migrations, not
detailed table-by-table here — see `0004_trustlocal_features.sql`,
`0006_portfolio_testimonials.sql`, `0007_request_details_and_photos.sql`
directly)*: `reports`, `portfolio_items`, `testimonials`,
`service_request_photos`, plus `city`/`paused` on `pro_profiles` and
`details_json` on `service_requests`.

**AI / governance (Phase 1 foundation, migration `0010`)**
- `ai_usage_log` — backs per-user, per-endpoint rate limiting.
- `feature_flags` — global/country/user/percentage rollout shape;
  public read, no client write policy yet (managed via the Supabase
  dashboard until an admin surface exists).
- `audit_log` — every sensitive mutation's eventual home. No RLS
  policies at all yet — nothing writes here today; it's provisioned
  ahead of the phases that need it.
- `domain_events` — the event bus's storage. No direct client
  policies; the only write path is the `emit_domain_event()`
  security-definer RPC.

**Auth onboarding (migration `0011`)**
- `profiles.onboarding_role_selected` — the flag that makes "ask
  exactly once" possible without inferring "new user" from timestamps.

## Request lifecycle (traced end to end)

1. A customer creates a `service_requests` row (`status = 'collecting'`),
   optionally via `api/ai-intake.js` for AI-assisted structuring.
2. A pro sends a `quotes` row. `handle_quote_sent()` moves the request
   to `quotes_ready` on the first quote.
3. The customer accepts a quote. `handle_quote_accepted()` (a
   `before update` trigger) does four things in one transaction: books
   the request, declines every other pending quote, opens a
   `conversations` row, and stamps `responded_at`.
4. Customer and pro message inside that conversation;
   `api/translate-message.js` translates on request, caching the result
   per-locale on the message row.
5. The pro marks the job complete. `handle_job_completed()` (migration
   `0012`) fires on the transition into `completed`, emitting
   `JobCompleted`.
6. The customer reviews. `handle_new_review()` updates `pro_stats` and
   moves the request to `reviewed`.

Every step above except the AI-intake call and the translation call is
enforced by a Postgres trigger, not application code — the state
machine lives in the database, not `src/App.jsx`.

## Core Platform layer status

The 11-layer target from `MASTER_CONTEXT.md` §6, at file-level detail:

| Layer | Status | Where it actually lives |
|---|---|---|
| Authentication | Implemented | `api/_lib/auth.js` (server), `src/lib/auth.jsx` (client) |
| Permissions | In Progress — deferred by choice | RLS policies per-table (real, consistent) + `api/_lib/rateLimit.js`; a formal checkpoint module is deliberately not built yet — see `../adr/0010-defer-permissions-layer-formalization.md` |
| AI Gateway | Implemented (2 of eventual N capabilities) | `api/_lib/aiGateway.js` — `reason()`, `translate()`. Speech is client-side Web Speech API, not yet gatewayed |
| Payments | Planned | No code exists; commission is a display-only constant |
| Matching | Planned | `pro_matches_request()` is a bare SQL function, not a Core module |
| Messaging | In Progress | `src/lib/messages.js` + `src/lib/translate.js`; not yet formalized as a Core layer boundary |
| Notifications | Planned | No code exists |
| Storage | In Progress | `src/lib/storage.js` exists but buckets (avatars, portfolio, photos) aren't unified behind one interface yet |
| Analytics | Planned | No code exists |
| Marketplace Engine | Planned | Catalog is hardcoded seed data, not a configurable engine |
| API (public) | Planned | No public-facing API exists; `api/*.js` are internal-only endpoints |

## Domain events

The bus mechanism (`emit_domain_event()` RPC + `domain_events` table)
exists. As of migration `0012` (Foundation Freeze Epic 01), five of the
nine planned events fire for real, all from Postgres triggers rather
than client JS — reliable regardless of which code path triggers the
underlying mutation:

- `ai_intake.analyzed` — from `api/ai-intake.js`, after a successful
  analysis.
- `message.translated` — from `api/translate-message.js`, after a
  successful translation.
- `RequestCreated` — `handle_new_request()`, on `service_requests`
  insert.
- `QuoteSubmitted` — `handle_quote_sent()`, on `quotes` insert.
- `QuoteAccepted` — `handle_quote_accepted()`, on a quote's genuine
  `sent → accepted` transition.
- `JobCompleted` — `handle_job_completed()`, on a request's genuine
  transition into `completed`.
- `ReviewSubmitted` — `handle_new_review()`, on `reviews` insert.

**Not yet wired, honestly:** `PaymentAuthorized` (no real payment
system exists — Execution Roadmap Epic 04), `ProfessionalDispatched`
and `ProfessionalArrived` (no corresponding status exists anywhere in
the schema — inventing one just to fire an event would misrepresent
capability that doesn't exist). These stay unwired until the epic that
owns the real underlying capability ships it — see
`../EXECUTION_ROADMAP.md`.

## Client architecture

- `src/App.jsx` — the composition root, and nothing more: it wraps
  `src/shell/AppShell.jsx` in the auth provider. The Engineering Health
  sprint took it from 3,459 lines to 19 by splitting the app into feature
  folders; `../engineering/ENGINEERING_STANDARDS.md` documents the
  boundaries and what each one owns.
- `src/shell/AppShell.jsx` decides which surface renders — welcome,
  role selection, `src/customer/CustomerApp.jsx`, or
  `src/pro/ProApp.jsx`. It is the only place that routing-like logic
  lives.
- 10-locale i18n (`nl`, `fr`, `de`, `en`, `es`, `ar`, `fa`, `tr`, `ru`,
  `zh`, including right-to-left Arabic and Persian). Three flat tables —
  `src/lib/appStrings.js`, `homeStrings.js`, `homeFollowUpStrings.js` —
  merged into one `t` lookup by `src/lib/langContext.js`. Still not
  per-locale files; `homeStrings.test.js` derives its locale list from
  `LANGS` and enforces key parity across all three tables, so a language
  offered in the picker but missing copy fails in CI rather than rendering
  key names to a customer. Catalog names live in the database
  (`category_translations`, `service_translations`) and are widened by the
  same migration that widens the `locale` check constraints — see 0017.
- No routing library — the app is state-driven, not URL-driven; no
  code-splitting exists because there are no routes.
- `src/design-system/` components are real and have real call sites, but
  inline markup remains in `ProProfile`, `ProPublicProfileSheet` and
  `CustomerProfile`.

## Known gaps

- ~~No staging Supabase project~~ **Closed, Epic 00 WP06.**
  `klussie-staging` exists in `eu-west-1`, built by applying all 17
  migrations to an empty database — the first proof the migration chain
  reconstructs the schema from nothing.
- ~~No automated tests, no CI~~ **Closed, Epic 00.** 497 tests across 34
  files as of Epic 01, and a CI pipeline gating every push and pull
  request on lint, type-check, test and build. *(This line previously read
  "no automated tests" while `MASTER_CONTEXT.md` §3 reported 404 — the
  kind of drift that made both untrustworthy. Corrected here rather than
  left.)*
- **Identity is real, and is what profile display reads** (Epic 02).
  `identity.identities` carries the person reference that survives
  erasure, backfilled from every profile and written on signup **inside
  the auth transaction** — by `handle_new_user()`, not by the client,
  because no client-side write can be transactional with a trigger.
  Display reads go through two `SECURITY DEFINER` resolvers in `public`;
  the `identity` schema itself stays off the client API surface
  ([ADR-0023](../adr/0023-identity-display-resolution-versus-row-visibility.md)).
  Erasure redacts across three tables and deletes nothing.
  **`public.profiles` and `public.profile_contacts` both remain**, still
  written and still authoritative for application state and for bilateral
  contact visibility — step 6 is not reachable while their policies
  encode a confirmed-booking relationship no engine can evaluate yet.
  Staging only.
- **The platform schema foundation exists and is almost entirely unused**
  (Epic 01). Ten engine-tier schemas, twelve roles, `platform.events`,
  `platform.audit_records`, `platform.emit_event()` and consumer
  cursor/quarantine storage are applied to **staging only**. Nothing in
  the application reads or writes any of it, no application role can
  reach the `platform` schema, and `public.domain_events` with its five
  triggers remains the product's live event path. This is the gap Epics
  02 onward close, one aggregate at a time.
- **`auth.users` deletion cascades into nine tables.** `public.profiles`
  is the parent of nine `on delete cascade` foreign keys and cascades
  from `auth.users` itself, so deleting one account destroys that
  person's history and both sides of every conversation they were part
  of. This violates `SUPABASE_ARCHITECTURE.md` §5 and §11.4 and has since
  migration `0001`. Epic 02's erasure routes around it by never deleting;
  the cascade remains.
- **No application-code path into the `platform` schema**, deliberately.
  PostgREST does not expose that schema and must not — exposing it to
  reach `emit_event()` or a consumer cursor would expose the event stream
  too. Engines call the emission helper SQL-side; a real background
  consumer needs a direct Postgres connection this repository does not
  have.
- **Workspaces are real, and every existing user and pro has one**
  (Epic 03, complete). `workspace.workspaces` / `.memberships` carry
  tenancy; every identity has a Personal Workspace ("My Home"), every
  `pro_profiles` row a Professional Workspace. All thirteen
  workspace-scoped tables carry `workspace_id`, correctly backfilled and
  reconciled, with a permissive isolation policy layered on top of the
  existing 58 (nothing removed —
  [ADR-0025](../adr/0025-marketplace-visibility-survives-epic-03.md)).
  `fetchCustomerRequests`, `fetchHouseholdItems`, `fetchProServices` and
  `fetchConversations` read by workspace when one resolves, with a
  fallback proven identical to the pre-Epic-03 behaviour — which is what
  every account still gets, since **there is no API Gateway and none was
  built** ([ADR-0024](../adr/0024-request-context-resolved-in-the-database.md)):
  the browser resolves its own context, once, against the database
  directly. A real workspace switcher exists, reaching only accounts
  with two or more genuine workspaces. Staging only, and **not seen
  exercised against a live database** since WP 03.09 — no working test
  credentials, no direct Postgres connection available to the sessions
  that built WP 03.09–03.12 and all of Epic 05.
- **A property exists for every Personal Workspace** (Epic 05,
  complete). `property.properties` carries a **mutable current-steward
  pointer** rather than a static workspace stamp — stewardship
  transfers, so tenancy here is "the one place... not a static stamp"
  ([ADR-0028](../adr/0028-stewardship-current-pointer-and-closed-period-log.md)).
  `property.stewardship_periods` is the separate, genuinely append-only
  log of *closed* periods — empty today, since nothing has ever
  transferred. The isolation policy and the client resolver both reuse
  Epic 03's existing membership helper directly; no property-specific
  resolver was built. `src/lib/homeInventory.js`'s `fetchHomeProfile()`
  resolves the property's id and name; nothing downstream reads them
  yet. Locations, assets, documents and the real event-sourced Timeline
  are Epics 06–08 and later — this epic is the aggregate and stewardship
  alone. Staging only, same unverified-live-database gap as Epic 03.
- **The location tree exists** (Epic 06, complete) — `property.locations`,
  a recursive tree via an `ltree` materialised path, GiST-indexed, the
  roadmap's own highest correctness-risk item in the physical tier.
  Isolation inherits the property's current stewardship — no
  location-level workspace column. Subtree containment
  (`location_within`/`_ancestors`/`_descendants`) answers as one indexed
  operation at any depth; re-parenting (`reparent_location()`) rewrites a
  moved subtree's paths and emits `LocationTreeChanged` in one
  transaction. **A real bug was found and fixed before this shipped:**
  every `ltree` operator and function lives in the `extensions` schema,
  not `pg_catalog`, and needed explicit qualification
  (`OPERATOR(extensions.<op>)`, `extensions.nlevel()`) to resolve under
  this codebase's `search_path = ''` discipline — see
  `../../implementation/epic-06/COMPLETION.md` §5. No backfill, no client
  wiring — nothing in the product creates a real location yet. Staging
  only, same unverified-live-database gap as Epics 03 and 05.
- **The asset engine exists, complete** (Epic 07, **8/8 packages**) —
  `property.assets` and `property.asset_placements` repeat ADR-0028's
  mutable-pointer-plus-closed-log shape by citation, no new ADR needed.
  Declared facets (`property.facet_types`, `property.asset_facets`) are
  validated by trigger, key presence only, no facet type seeded yet.
  Isolation inherits the property's stewardship, same as locations — no
  asset-specific resolver, narrowed to active-only assets (0054) once the
  contract got a real caller. **The first backfill in this roadmap moving
  real, existing, live-table data**: every `household_items` row (the
  live inventory feature) has a corresponding `property.assets` row,
  linked by a bookkeeping-only `household_items_id` column. This backfill
  deliberately does **not** exclude erased identities, unlike migration
  0033's pattern — it moves existing possession data rather than creating
  new structure, so an erased owner's item is still backfilled (see
  `../../implementation/epic-07/COMPLETION.md` §5). **Kept in sync going
  forward by three database triggers (0053), not by an application-level
  second write** — the nearer precedent turned out to be migration 0027's
  identity dual-write, a trigger being the only place a mirror write is
  transactional with the primary one; building it found and fixed a real
  bug, a missing `ON DELETE` clause on `household_items_id`'s foreign key
  that would have broken `deleteHouseholdItem()` outright. `Mijn spullen`
  (`fetchHouseholdItems`) now reads `property.assets` when a property
  resolves, falling back to the two tiers Epic 03 WP 03.11 already proved.
  **`RECONCILE_ASSETS.sql` — the six-step pattern's hard gate before a
  read-switch may be trusted — has never actually run.** This session has
  no database connection; per the current engineering directive that marks
  live verification Pending rather than blocking the epic's completion,
  but the read switch must not reach real users before that diagnostic
  runs and passes. Staging only for what was built; nothing applied
  anywhere.
- **The document engine exists, complete** (Epic 08, 9/9 packages) —
  `property.documents` holds the current version
  directly on the row, `property.document_versions` holds only
  superseded versions, append-only: ADR-0028's mutable-current-plus-
  closed-log shape, a third application, no new ADR needed.
  `property.document_types` is a declared catalog (matching
  `property.facet_types`' own shape, Epic 07) but — unlike it — ships
  seeded, since this epic's backfill needed real values to classify
  existing rows into. `property.document_attachments` scopes to the
  four real subjects (property, location, asset, workspace); maintenance
  record and marketplace engagement, both named in
  `DATABASE_ARCHITECTURE.md` §15, are deliberately not included, since
  neither table exists yet. **`property.document_shares` is fully
  independent of attachment** — `§15` calls that separation a principle
  that was "nearly lost," and the isolation policy and engine contract
  both hold the line in a real, reproducible scenario, not just by
  omission. `portfolio_items` and `service_request_photos` are both
  backfilled and now kept in sync going forward by four database
  triggers (insert/delete on each source table — neither needed an
  update trigger); building the delete triggers caught a real bug before
  it could ship — `document_attachments`/`document_shares` had no
  `ON DELETE` clause on `document_id`, fixed with `CASCADE` in the same
  migration. **`profiles.avatar_url` is deliberately excluded** —
  checked against §15's own definition of a document, found not to fit,
  corrected before building it as the roadmap's own original scope note
  assumed. **WP 08.09's architectural gap is resolved.** The product
  owner decided: add explicit public-visibility support to the isolation
  model. `property.document_types.is_public` (`0062`) carries it by
  type — the same reasoning §15 already gives `retention_class` —
  `portfolio_photo` the only public type; the isolation policy and both
  contract functions gained a third visibility branch, guarded on
  `auth.uid() is not null`. `property.documents_for_service_request()`
  (`0063`) resolves the discoverability half (request-photo documents
  are deliberately unattached) with a dedicated lookup, same visibility
  rule, no public branch. Building the client switch found one more,
  narrower gap — `caption` had no equivalent on `property.documents` —
  resolved directly (`property.documents.caption`, `0064`;
  `portfolio_items`' first-ever UPDATE mirror trigger) rather than
  re-asked, since it carried no visibility trade-off. One more piece,
  `workspace.resolve_public_professional_workspace()` (`0065`), the
  first "resolve someone else's public workspace" lookup in this
  roadmap, granted to `anon` for the same reason `is_public` exists.
  **Both read switches are now live** — `src/lib/requestPhotos.js` and
  `src/lib/portfolio.js`, each with a proven fallback
  (`../../implementation/epic-08/COMPLETION.md`). Staging only for what
  was built; nothing applied anywhere.
- **The workflow engine exists, complete** (Epic 09, 5/5 packages) —
  `work.workflow_definitions` (versioned per `definition_key`, immutable
  once published except `deprecated_at`, never deleted) and
  `work.workflow_instances`/`work.workflow_transitions` (ADR-0028's
  mutable-pointer-plus-append-only-log shape, a fourth application).
  **Does not retire the five legacy triggers** (`on_quote_accepted`,
  `on_job_completed`, `on_review_created`, `on_request_created`,
  `on_quote_sent`) or touch `public.service_requests`/`public.quotes` —
  read before design found a workflow instance needs a workspace-scoped
  subject those tables do not have until Epic 12's own migration gives
  them one, so this epic builds the real, generic engine and a real
  published definition (`booking_request_lifecycle` v1, reproducing the
  five triggers' actual decisions including the `quotes_ready` self-loop
  a second `QuoteSubmitted` needs) without wiring it to anything live
  yet — `../../implementation/epic-09/COMPLETION.md` §5.1. The engine
  contract (`work.start_workflow_instance()`,
  `work.transition_workflow_instance()`, three read functions) has no
  `api.*` delegate — `property.reparent_location()`'s own precedent
  (migration 0047: granted to the engine role only, no client caller
  yet), not `property.my_documents()`'s. `subject_type`/`subject_id` is a
  polymorphic pair with no foreign key, reusing `platform.emit_event()`'s
  own shape (migration 0023) rather than inventing a new one. Staging
  only for what was built; nothing applied anywhere.
- **The maintenance engine exists, complete** (Epic 10, 4/4 packages) —
  `work.maintenance_schedules` (a recurring rule, `recurrence` a native
  `interval`, ordinary mutable data, no version history) and
  `work.maintenance_obligations` (authoritative once created — §16's own
  distinction from a prediction, which this epic does not build, since
  Intelligence/Epic 17 owns predictions — immutable once `status` reaches
  `completed` or `cancelled`, via a conditional guard trigger reusing
  `property.documents_guard_deletion()`'s own shape from Epic 08). Both
  anchored to exactly one of an asset or a location, narrower than
  `property.document_attachments`' four-subject menu, matching what §16
  actually names. **`work.generate_due_obligation()` handles exactly one
  schedule, one obligation, per call** — not a loop minting several ids
  itself, since `platform.uuid_v7_at()` is documented backfill-only
  (ADR-0022) and generating new obligations on an ongoing basis is
  runtime generation, which the architecture puts in the application; a
  schedule several periods behind is caught up by calling it once per
  missed period, proven in `VERIFY_MAINTENANCE_CONTRACT.sql` catching up
  three missed monthly periods with three separate calls. **Three
  relationships §16/`SYSTEM_ARCHITECTURE.md` §8.1 name are deliberately
  not wired**: due/overdue is computed at read time from `due_on`, not a
  stored event (no Notification engine exists yet); "produces workflow
  instances" and "resolved by service records" both wait on engines that
  do not exist yet (a real maintenance-specific workflow definition, and
  Epic 11) — `../../implementation/epic-10/COMPLETION.md` §5. No `api.*`
  delegate for any of its eight functions — `property.reparent_location()`'s
  posture, now a three-time pattern. Staging only for what was built;
  nothing applied anywhere.
- **The capability engine exists, complete** (Epic 04, 6/6 packages) —
  **built retroactively.** Epic 04 is Tier 1 in the roadmap's own
  sequencing (§5: Identity, Workspace, Capability, before any
  physical-model epic) but was skipped when the roadmap was originally
  executed, with no branch, PR, completion record, or documented reason
  found anywhere. Found and built after Epic 10, on request — its
  migrations are numbered `0075` onward rather than renumbering Epics
  05–10's already-open PRs (`../../implementation/epic-04/COMPLETION.md`
  §5.1). `platform.capabilities` (the real 26-capability catalogue,
  `PLATFORM_DOMAIN_MODEL.md` §6.7, seeded verbatim) and
  `platform.capability_dependencies` (only the five edges §6.2 itself
  states). `platform.capability_presets`/`capability_preset_grants` —
  three presets (Personal, Professional, Business), matching this epic's
  own acceptance criterion rather than §6.8's fourth (Enterprise, which
  `workspace.workspaces.type` cannot express). **`workspace.
  capability_grants`/`capability_grant_history` is shaped like
  `workspace.memberships`/`membership_history` (Epic 03), not ADR-0028**
  — a capability grant is a set a workspace holds, never one current
  value, the first aggregate since Epic 03 itself to reuse that specific
  shape. The contract's `grant_capability()` refuses rather than
  auto-grants a missing dependency, and `withdraw_capability()` refuses
  while a dependent is still held — Conflict 3's distinguishing test
  applied a third time (after Workflow's transition rules and
  Maintenance's schedule generation), because auto-cascading would mean
  minting several ids per call with none supplied, exactly what `work.
  generate_due_obligation()` already ruled out. No `api.*` delegate — the
  same posture, now a four-time pattern. **A real bug caught before
  shipping**: the first draft of `grant_capability()` minted its history
  row's id via `gen_random_uuid()` internally, contradicting its own
  header — found by re-reading the function before running the tests.
  Backfilled: every existing workspace's matching preset, applied
  directly (not through the contract function) and backdated to the
  workspace's own `created_at`. Staging only for what was built; nothing
  applied anywhere.
- **The service record engine exists, complete** (Epic 11, 4/4
  packages) — `DATABASE_ARCHITECTURE.md` §17's own "highest-risk surface
  in the architecture," read in full, twice, before any SQL was written
  (`../../implementation/epic-11/COMPLETION.md` §5). `work.
  service_records` (the shared core) has **no `owning_workspace_id`** —
  it "follows the property" (§17), resolved live through `property_id ->
  property.properties.steward_workspace_id`, the same shape
  `property.assets`/`locations` already use, the opposite of `property.
  documents`' frozen-owner shape. `performing_workspace_id` **is** the
  permanent, non-revocable grant (§17) — a plain column, not a separate
  grants table; no withdraw path exists anywhere in this schema for it.
  Rich, variable content lives in `content jsonb`, not fifteen nullable
  columns. Immutable except `customer_approved`/`customer_approved_at`,
  which may move false → true exactly once. Two private annexes:
  `service_record_performing_annexes` has no workspace column of its own
  (the core already has one); `service_record_property_annexes`
  **freezes its workspace at write time** — §17's own transfer table's
  exact opposite of the core, proven in a real steward-transfer scenario,
  not merely asserted. RLS combines two independent visibility paths for
  the first time in this schema (direct performing-workspace membership
  OR the property's current steward); `VERIFY_SERVICE_RECORD_ISOLATION.sql`
  inspects the actual `pg_policies` text on both annexes to prove
  structurally that neither can ever reference the other side's
  relationship. A ten-function contract, none generic, matches the
  authorship split exactly (`create_service_record()` for the performing
  workspace's work content, `record_service_record_approval()` for the
  property side's approval, one writer per annex). **A real bug caught
  before shipping, for the third time this session**: the first draft of
  `create_service_record()` minted its conditional `WarrantyArising`
  event's id via `gen_random_uuid()` — the identical mistake Epic 04's
  `grant_capability()` made, caught faster this time because the pattern
  was already named. No `api.*` delegate — the same posture, now a
  five-time pattern. Staging only for what was built; nothing applied
  anywhere.
- **The marketplace engine exists, in a deliberately narrowed scope**
  (Epic 12, 6/6 packages **for this epic's own boundary** — the actual
  behavioural switch is a named, undone step, not this epic's job). Epic
  09's own header named the trigger retirement "the single largest
  behavioural risk in the roadmap," and the roadmap's own risk register
  requires the regression baseline (WP 00.08) before that switch — see
  `../../implementation/epic-12/COMPLETION.md` §5.1. `work.requests`/
  `quotes`/`engagements` are built, backfilled (reusing Epic 03's own
  already-resolved `workspace_id` columns rather than re-deriving the
  identity chain a third time), and served by a thirteen-function
  contract proven, structurally, to reproduce the five legacy triggers'
  exact decisions (`VERIFY_MARKETPLACE_CONTRACT.sql`) — the guarded
  first-quote transition, the bulk decline of every other open quote in
  one statement, the completion and review side effects. **It does not**
  dual-write a real scoped access grant, retire any legacy trigger, or
  cut the live booking flow over. **A real cross-schema privilege
  violation was caught mid-build**: the first draft's `work.
  grant_engagement_access()` inserted directly into
  `workspace.memberships` from `work` — a table `klussie_engine_work`
  holds no privilege on at all, which would have failed the instant
  anyone called it. Removed entirely; `SYSTEM_ARCHITECTURE.md`'s own
  Workspace section already names the correct shape ("Events consumed.
  `EngagementAccepted`") — the grant belongs to a future Workspace-owned
  consumer of this epic's own `EngagementCreated` event. No `api.*`
  delegate — the same posture, now a six-time pattern. Reputation
  projection deferred — no `work.reviews` aggregate exists anywhere in
  the frozen architecture to compute it from. Staging only for what was
  built; nothing applied anywhere.
- **The conversation engine exists, reviewed against every completed
  engine before implementation** (Epic 13, 6/6 packages) — the review
  itself is `../../implementation/epic-13/DESIGN_REVIEW.md`, produced
  and read before any table was created, on explicit request. Its own
  largest finding: `PLATFORM_DOMAIN_MODEL.md` §15's five real subjects
  (engagement, asset, maintenance obligation, property, workspace) are
  all real aggregates for the first time only now, after Epics 05–12.
  `work.conversations` **binds to `work.engagements`, not a request** —
  legacy only bound to a request because no engagement existed as a real
  row before Epic 12. `work.conversation_participants` is an explicit,
  managed roster keyed by `person_ref` (no foreign key) — **not derived
  from workspace membership**: the naive "either workspace" isolation
  shape this epic's own nearest precedent (Marketplace's engagement
  policy) would have produced was checked against §20's own text
  ("participants see the thread... not each other's workspaces") and
  found to over-grant. Read state moved from a single legacy
  `messages.read_at` to per-participant `last_read_at`, since
  participation is no longer fixed at two people. Messages carry an
  optional, typed `reference_type`/`reference_id` to a structured moment
  (a quote, a transition), reusing `platform.emit_event()`'s own
  polymorphic-subject shape. Translations stay a `jsonb` column, reusing
  the existing AI Gateway mechanism rather than waiting on Intelligence
  (Epic 17, not built). **Two real bugs caught before shipping — a new
  class for this session, not a repeat of the `gen_random_uuid()`
  pattern**: `platform.events.workspace_id` is `not null` and is the
  table's own hash-partition key; `close_conversation()`'s first draft
  passed a literal `null`, and `open_conversation()`'s first draft would
  have silently recorded an asset or property id *as* a workspace id
  whenever a conversation opened on a subject with no workspace column
  of its own. Both fixed by `work.resolve_conversation_home_workspace()`,
  a real resolver walking all five subjects to their actual owning
  workspace. Location and Service Record are real, plausible conversation
  subjects the review considered and did not add — neither is named in
  §15; recorded as candidates for a future ADR. No `api.*` delegate —
  the same posture, now a seven-time pattern. Staging only for what was
  built; nothing applied anywhere.
- **The billing engine exists, complete** (Epic 14, 5/5 packages) — the
  first real revenue path. `src/lib/billing.js`'s
  `PLATFORM_COMMISSION_RATE`/`platformFee()`/`netPayout()` are pure
  client-side display math with no persisted record anywhere
  ("commission is currently a display-only constant," roadmap §10);
  `commerce.invoices` formalises this as a real, immutable ledger.
  **Subscription (§11.1) is deliberately not this epic** —
  `SYSTEM_ARCHITECTURE.md` names it as a separate engine sharing the
  same `commerce` schema, and the roadmap already sequences it six
  epics later as Epic 22; nothing here invents a subscription concept
  ahead of it. Immutable except `status` (`issued` → `paid` → `credited`,
  `credited` a true terminal) — corrections are `commerce.credits`,
  append-only, never an edit. `commerce.payments` is **one table for
  both payments and payouts**, a `direction` column rather than two
  duplicated shapes, matching `work.maintenance_obligations`' own
  `source`-column idiom (Epic 10). `commerce.
  issue_marketplace_commission_invoice()` resolves a real engagement's
  price and **composes** `commerce.issue_invoice()` rather than
  duplicating its insert — the third occurrence of the pattern `work.
  generate_due_obligation()` established (Epic 10) — with the commission
  rate a required parameter, never a hardcoded constant. `commerce.
  settle_payment()` marks a linked invoice paid in the same transaction
  as settling an inbound payment against it. **A named gap in the frozen
  event vocabulary**: §11.2 has no `PayoutFailed` event even though
  `commerce.payments.status` structurally permits a failed outbound
  payment — emitted anyway, a minimal, consistent extension of the
  pattern the frozen list already establishes. No `api.*` delegate — the
  same posture, now an eight-time pattern. No new bug class this epic —
  every emitted event's `workspace_id` is a real, directly-available
  column, never a polymorphic subject needing Epic 13's own resolver.
  Staging only for what was built; nothing applied anywhere.
- **Timeline and the Digital Twin exist, complete** (Epic 15, 3/3
  packages) — **not a new engine**. §3's own aggregate/projection
  ownership table assigns both to **Property** (Epic 05), already built;
  this epic is two read functions added to that existing contract, no new
  schema, no new engine role. `property.timeline_segment()` reads
  `platform.events` directly and lives — §25's "derived from events,
  never maintained separately" rules out any cache — scoped to the
  caller's own current-or-past stewardship windows, resolved across six
  subject branches (property, asset, location, service_record,
  conversation, message). `property.assemble_twin()` is only the "narrow
  summary projections" §28 permits to be materialised — five live counts,
  the twin itself staying unmaterialised. **A pre-existing bug found and
  fixed in the same work package**: `platform.events` has had RLS enabled
  with no policy since Epic 01 — `klussie_consumer_delivery`'s own
  `SELECT` grant has been dead code the entire time, since a table-level
  grant does not bypass RLS; one policy, naming both roles, fixes it.
  Document resolution and asset/location lifecycle events are deliberately
  absent from Timeline v1 — Document and Asset engines (Epics 07/08) have
  never emitted a single event, so those branches would be correct but
  currently vacuous (Maintenance's own events already populate the
  asset/location branches today). **The largest finding of this session**,
  found while writing this epic's own diagnostic and fixed across all
  seven affected branches before this epic closed: every `emit_event()`
  call since Epic 06 used a bare PascalCase `event_type` instead of
  ADR-0019's own dotted format — 34 values across 7 epics, none matching
  `platform.events`' own `CHECK` constraint. ADR-0019 stayed authoritative
  and unmodified; every call site (and its test assertions) was conformed
  to it instead, verified against `SYSTEM_ARCHITECTURE.md`'s own
  per-engine event lists rather than mechanically transformed — see
  `implementation/epic-15/COMPLETION.md` §6. No `api.*` delegate — the
  same posture, now a ten-time pattern. Staging only for what was built;
  nothing applied anywhere.
- **The knowledge engine exists, complete** (Epic 16, 6/6 packages) —
  `PLATFORM_DOMAIN_MODEL.md` §19.2 calls the Knowledge Graph "the most
  demanding thing in this document"; this epic builds the smallest
  correct slice of it. `knowledge.rules` — declared, binding Workspace
  Knowledge (§18.2), four scope levels, conflicts surfaced rather than
  resolved silently (`rules_in_force()` returns every rule tied at the
  most specific applicable scope; `declare_rule()` records the moment a
  conflict is created, once, never re-detected on every read).
  `knowledge.workspace_edges` — asserted graph facts, no node table
  needed since workspace-side nodes already exist elsewhere.
  `knowledge.world_nodes`/`world_edges` — the world graph, real foreign
  keys between nodes, no workspace reference anywhere structurally (§27's
  own privacy guarantee), writable only through `knowledge.promote_fact()`
  — one-way, irreversible, audited (§6/§33). **Closed a debt row
  unallocated since Epic 01**: `platform.write_audit_record()`, mirroring
  `platform.emit_event()`'s own shape, built because promotion is the
  first real caller that needs it. **A second, independent
  session-spanning finding, found and fixed forward**: `klussie_engine_
  work`/`klussie_engine_commerce` never held `USAGE` on schema `platform`
  despite holding `EXECUTE` on `platform.emit_event()` since Epic 01, so
  six already-shipped contract functions across five epics would have
  failed with "permission denied for schema platform" — fixed in one new
  migration, no rebase of the six affected branches required, since a
  missing `GRANT` only needs to exist in the final cumulative migration
  state rather than on the emitting function's own branch — see
  `implementation/epic-16/COMPLETION.md` §5.1/§5.2. Every `event_type`
  this epic mints was correct from the start, the direct benefit of
  Epic 15's own fix landing first. Derived workspace-graph edges,
  inferred world-graph edges, and `asset_class` rule-scope resolution are
  deliberately not built — named gaps, not silently narrowed scope. **A
  real bug caught in this epic's own work, before Epic 17 branched off
  it**: `rules_in_force()`/`declare_rule()` never checked `confirmed_at`,
  so an unconfirmed proposal would have been treated as already binding
  — fixed on this branch (`implementation/epic-16/COMPLETION.md` §5.3).
  No `api.*` delegate — the same posture, now an eleven-time pattern.
  Staging only for what was built; nothing applied anywhere.
- **The intelligence engine exists, complete** (Epic 17, 4/4 packages) —
  **no new schema, no new engine role**. `SUPABASE_ARCHITECTURE.md` §7's
  own schema table already lists `knowledge` as shared by "Knowledge,
  Intelligence," and `klussie_engine_knowledge` covers both. `knowledge.
  memory_versions` — the one structural correction the Rebuild Test
  forced on Property Memory (§36 finding 1): permanent, append-only,
  no `workspace_id` column since memory follows the property, live,
  surviving a change of steward, the same shape `work.service_records`
  already uses. `knowledge.propose_rule()`/`confirm_proposed_rule()`/
  `reject_proposed_rule()` close the gap Epic 16's own contract
  deliberately deferred; rejection composes `retire_rule()` rather than
  duplicating it. `knowledge.publish_memory_version()` resolves its
  event's `workspace_id` from the property's current steward, live, and
  deliberately uses `subject_type = 'property'` so a published version
  appears in Epic 15's own Timeline with no changes needed there. Four
  event-only actions carry no dedicated table —
  `record_recommendation()`, `propose_prediction()`, `propose_asset()`,
  `generate_summary()` — since nothing yet needs to query one back out.
  **Read before design**: "migrates the existing AI intake and
  translation onto the engine contract" turned out to be substantially
  already done by other epics — translation is already Conversation's
  own event (Epic 13), and AI intake's result lives entirely in a
  request's own jsonb column with no SQL-side equivalent to migrate; what
  this epic actually builds is the durable half neither had anywhere to
  write. `event_type` minted correctly from the start, the second epic in
  a row to do so. No `api.*` delegate — the same posture, now a
  twelve-time pattern. Staging only for what was built; nothing applied
  anywhere.
- **Epic 18 (Provider Intelligence Engine) is deliberately skipped**, on
  explicit instruction, in favour of proceeding directly to Epic 19. Not
  built, not silently dropped — recorded in `MASTER_CONTEXT.md` §2 and
  `implementation/epic-19/COMPLETION.md`'s own header as a real,
  out-of-order gap the roadmap still expects filled.
- **The notification engine exists, complete** (Epic 19, 3/3 packages) —
  no schema, no engine role exists for Notification anywhere in the
  frozen documents (`SUPABASE_ARCHITECTURE.md` §7's own schema table
  names none); resolved by precedent rather than invention, following
  Audit's own placement in `platform`, owned by `klussie_engine_platform`
  — both "Platform Services," both cross-cutting concerns with a genuine
  aggregate rather than a pure projection. `platform.notifications`
  (workspace-scoped, fully immutable) and `platform.
  notification_deliveries` (one per recipient per channel, immutable
  except delivered_at/seen_at/acted_at, each one-way) — two tables, not
  one, matching §32's own split between a workspace-scoped record and a
  per-person delivery fact. `platform.notification_preferences` — **the
  first genuinely mutable aggregate this session has built**, a real
  foreign key into `workspace.memberships`, one row each, deliberately
  not append-only since a preference toggle has no governance value worth
  a permanent trail, unlike every other table this session has built.
  `raise_notification()` takes its recipients as a caller-supplied
  `jsonb` array — fanning out to an unbounded, transaction-resolved set
  means the caller mints every delivery id, never this function
  (ADR-0022; no id-minting pattern already established in this session
  covers an unbounded set, only a single conditional branch).
  `mark_notification_acted()` emits `platform.notification.acted_on`, a
  named extension beyond §10.1's own event list, the third such gap-fill
  this session. `platform.my_inbox()` composes the identity-scoped inbox
  at read time across live membership, joining `platform`, `identity` and
  `workspace` in one query — never materialised, so revoking a
  membership removes its items with no separate invalidation step,
  proven in the diagnostic. `event_type` minted correctly from the
  start, the third epic in a row. No `api.*` delegate — the same
  posture, now a thirteen-time pattern. Staging only for what was built;
  nothing applied anywhere.
- **Production has none of Epic 01's schema**, nor Epic 03's, nor
  Epic 04's, nor Epic 05's, nor Epic 06's, nor Epic 07's, nor Epic 08's,
  nor Epic 09's, nor Epic 10's, nor Epic 11's, nor Epic 12's, nor
  Epic 13's, nor Epic 14's, nor Epic 15's, nor Epic 16's, nor Epic 17's,
  nor Epic 19's. Its migration ledger is still unreconciled
  (`../operations/ENVIRONMENTS.md` §9), which is a prerequisite for any
  push to it — see `../operations/PRODUCTION_MIGRATION_0018_0029.md`,
  itself covering only `0018`–`0029` and owed an update through `0117`.
- **No backup/restore drill has ever been run.** Still open. The backup
  path is verified and the procedure documented
  ([ADR-0017](../adr/0017-free-tier-disaster-recovery-strategy.md)), but
  no restore has been performed — the Free plan provides two projects and
  neither can be consumed as a target
  (`../operations/DISASTER_RECOVERY.md` §8).
- **Branch protection is not enabled on `main`**, so CI reports failure
  without blocking a merge.
- No pagination anywhere — every list-fetching function in `src/lib`
  pulls an unbounded result set.
- Search (Discover) is a client-side filter over the full catalog, not
  a real search index.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 3)

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
- ~~No automated tests, no CI~~ **Closed, Epic 00.** 411 tests across 24
  files, and a CI pipeline gating every push and pull request on lint,
  type-check, test and build. *(This line previously read "no automated
  tests" while `MASTER_CONTEXT.md` §3 reported 404 — the kind of drift
  that made both untrustworthy. Corrected here rather than left.)*
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

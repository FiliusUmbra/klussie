# Klussie Platform Architecture Review & Roadmap

**This document owns:** the full phase-by-phase implementation roadmap —
what ships in what order, and why that order was chosen. It does not own
current project status (`MASTER_CONTEXT.md`), permanent product philosophy
(`PRODUCT_CONSTITUTION.md`), or code-level rules (`ENGINEERING_STANDARDS.md`).

> Transcribed into the repository from a founder architectural-review
> artifact (v4) that existed only in conversation history until now. Content
> is faithful to that review; two facts inside it have been corrected for
> accuracy as of the transcription date (2026-08-06): `src/App.jsx`'s line
> count (was 2,784, is now 2,823 — see `ENGINEERING_STANDARDS.md`) and the
> "design language: decision needed" callout under Manifesto Alignment
> below, which has since been resolved by ADR-006 in `MASTER_CONTEXT.md`
> §15 (Design Direction Lock). Everything else — phase content, governance,
> findings — is unchanged from the original review.

## Executive summary

Thirteen phases, up from an earlier 12-phase draft. Ten Product Constitution
rules. Eight KPIs every feature is checked against. Nine domain events in
the Core event chain. Zero real payments processed, still, as of this
writing.

The core addition this revision made was law, memory, and a way to fail
safely — not more features. That means: a Product Constitution and
Engineering Standards doc every future change is checked against (both now
real and committed — see `PRODUCT_CONSTITUTION.md`, `ENGINEERING_STANDARDS.md`),
a KPI table that gives "does this feature matter" an actual number instead
of a feeling, an event-driven pattern for how Core's layers talk to each
other, an audit trail, an AI prompt library with its own evaluation
framework, and a Phase 3 — Disaster Recovery — sitting deliberately after
the testing/CI foundation and before real money starts moving in Phase 4.

Two changes reshaped existing phases rather than adding new ones: the AI
Gateway is framed around **capability-based routing** (speech, vision,
reasoning, translation each independently swappable) instead of one
"swap the provider" abstraction; and the Intelligence Platform phase (10)
folds in both marketplace memory (customer preferences, preferred pros,
recurring issues) and an internal AI assistant for querying the business in
plain language.

## Manifesto alignment

The roadmap reaches nine of the manifesto's ten AI stages in some form —
only live camera remains genuinely untouched.

| Manifesto AI stage | Status |
|---|---|
| 1. Understands text | Shipped |
| 2. Understands speech | Shipped |
| 3. Understands photos | Shipped |
| 4. Understands video | Deferred |
| 5. Understands live camera | Not scheduled |
| 6. Predicts problems before they happen | Phase 10 + 13 |
| 7. Dispatches professionals automatically | Phase 10 — groundwork; full autonomy still beyond this roadmap |
| 8. Manages professional businesses | Phase 10 — business intelligence + internal AI assistant |
| 9. Manages homes | Phase 13 |
| 10. Operating system for trusted services | Phase 11 + 12 |

*(Resolved since the original review, per `MASTER_CONTEXT.md` ADR-006:*
*the "design language: keep the warm identity, or move toward the*
*manifesto's references?" open question is closed — direction is locked to*
*evolve the existing warm identity.)*

## Klussie Core

Eleven layers, one rule: nothing bypasses Core once a layer exists for that
concern.

| # | Layer | Note | Phase |
|---|---|---|---|
| 01 | Authentication | Supabase Auth, formalized as a named Core layer | 1 |
| 02 | Permissions | today's scattered RLS policies, unified into one checkpoint | 1 |
| 03 | AI Gateway | capability-based routing — speech, vision, reasoning, translation each independently swappable, not one monolithic provider | 1 |
| 04 | Payments | Stripe/Mollie integration plugs in rather than being called from route handlers | 4 |
| 05 | Matching | `pro_matches_request` becomes a Core module shared by the Marketplace Engine and AI v2 | 5 / 9 |
| 06 | Messaging | today's `messages.js` + translation, formalized | 6 |
| 07 | Notifications | email/push dispatch, one place every other module calls into | 8 |
| 08 | Storage | today's separate avatar/portfolio/photo buckets, unified | 7 |
| 09 | Analytics | the data layer Marketplace Intelligence reads from | 10 |
| 10 | Marketplace Engine | the dynamic service/category taxonomy | 5 |
| 11 | API | the outermost layer — everything above it, exposed to partners | 11 |

**How the layers talk to each other: domain events, not direct calls.** A
layer publishes what happened; anything downstream that cares subscribes.
Payments doesn't call Notifications directly — it emits `PaymentAuthorized`,
and Notifications (among others) reacts. This is what lets Phase 10's
Intelligence Platform and Phase 11's partner API observe the same
marketplace activity everything else does, without every new consumer
requiring a change to the code that produces the event.

```
RequestCreated → QuoteSubmitted → QuoteAccepted → PaymentAuthorized →
ProfessionalDispatched → ProfessionalArrived → JobStarted → JobCompleted →
ReviewSubmitted
```

Introduced structurally in Phase 1 alongside Permissions and the AI
Gateway; individual events get emitted as the phase that owns that action
ships (`PaymentAuthorized` in Phase 4, `ProfessionalDispatched`/`Arrived`
once real dispatch logic exists, etc.) — the event *bus* exists from day
one even though most events are added incrementally.

## Platform governance

Three documents that make "does this belong in klussie" answerable without
a meeting. All three ship as part of Phase 1 and apply to every phase after
it. **All three now exist as real, committed files** — see
`PRODUCT_CONSTITUTION.md` and `ENGINEERING_STANDARDS.md`; the KPI table
below now lives in `MASTER_CONTEXT.md` §14.

Product Constitution's 10 rules, Product KPIs, and Engineering Standards'
10 items are not repeated here verbatim — see those two documents directly,
since they're the authoritative, evolving source and this roadmap should
not maintain a second copy per Constitution Rule 8, One source of truth.

## Current architecture (at time of review)

Three deployed surfaces, one Postgres project doing double duty as both the
production database and the only test environment that has ever existed.

- **app** — Client-side React SPA. Vite + React 19, no SSR. All UI, state,
  and the entire 8-language string table live in `src/App.jsx`. Data access
  is cleanly isolated into `src/lib/*.js` modules per domain — close to
  Core's module boundary already.
- **db** — Supabase: Postgres + Auth + Storage + Realtime. Every table is
  RLS-protected; no server-side authorization layer outside Postgres
  policies. One project serves production, and — at time of review — every
  round of manual testing too.
- **ai** — Two Vercel serverless functions: `api/ai-intake.js` (Claude
  Sonnet, vision + tool-forced JSON) and `api/translate-message.js` (Claude
  Haiku). Both called Anthropic directly at time of review, with no auth
  check and no capability-based routing yet — the seed of the AI Gateway.
  *(Since resolved — see Phase 1 below and `MASTER_CONTEXT.md` §2.)*
- **www** — Separate marketing site. Astro, statically generated, its own
  Vercel project, no shared design tokens with the app.
- **ops** — Fully manual deploys at time of review. No CI, no staging, no
  rollback strategy — see Phase 2 and Phase 3.

## Strengths

- **RLS-first security model** — access control lives in Postgres
  policies, verified consistently correct across requests, messages,
  portfolio, and reports tables — the strongest possible starting point
  for Phase 12's tenant-isolation work later.
- **A genuinely differentiated AI layer, already live** — multimodal job
  intake and real-time bidirectional chat translation both work end-to-end
  in production.
- **i18n depth from day one** — eight languages including right-to-left
  Arabic, built into the architecture rather than retrofitted.
- **Clean data-access layering** — every Supabase call lives in a small,
  single-purpose module — very nearly Core's boundary already.
- **Shipping velocity** — nine migrations and a full feature set built and
  manually verified in one continuous run.

## Weaknesses & technical debt (at time of review)

- **One large file held the entire app** — violated the 300-line component
  limit outright. *(Since addressed by extracting a real Design System —
  see `ENGINEERING_STANDARDS.md`'s scorecard for current status.)*
- **Zero automated tests** — every feature verified by hand against
  production. Nothing catches a silent regression — the direct reason
  Phase 2 precedes Payments.
- **No CI/CD, no disaster recovery plan** — no pipeline, no backups
  strategy, no documented rollback — see Phase 3.
- **Production doubled as the test environment** — every test account and
  synthetic AI-generated request lived in the same tables as real users.
- **Two unresolved dependency vulnerabilities** — `brace-expansion` (high)
  and `postcss` (moderate). *(Since patched.)*
- **One unsplit 576KB JS bundle** — no code-splitting because there were no
  routes.

## Scalability bottlenecks

- No pagination, anywhere — every list-fetching function pulls an
  unbounded result set.
- No caching layer — static catalog data refetches in full on every app
  mount.
- Search is a client-side filter — won't hold up once the catalog spans
  multiple countries and verticals.
- Broad Realtime subscriptions — listens to the entire `messages` table,
  relying on RLS to hide what a client shouldn't see.
- No image pipeline — only the AI-intake path downsizes uploads
  client-side.

## UX friction

- Two unreconciled ways to start a request — manual form and AI intake, no
  clear steer either way.
- No notification outside an open tab — the single biggest gap against the
  "professional response time < 5 min" KPI — closed in Phase 8.
- "Boost" and invoices were explicitly fake — closed in Phase 4.
- `is_certified` is a bare boolean — no evidence trail — closed in Phase 6.
- AI follow-up loop hard-caps at two rounds — no path to keep clarifying if
  confidence still isn't there.

## Security concerns

- Both AI endpoints were wide open — zero authentication check on either.
  *(Since closed — see Phase 1 and `MASTER_CONTEXT.md` §2.)*
- No rate limiting — nothing stopped a scripted burst. *(Since closed.)*
- No bot defense — neither signup nor the AI endpoints have any.
- Reports go in, nothing comes out — no moderation workflow yet.
- Two known dependency CVEs, unpatched at time of review. *(Since patched.)*

## AI improvement opportunities

- Matching is still purely rule-based — could rank pros by trust score and
  fit.
- Vision is used once and discarded — feeds Phase 13's Home Profile once
  that exists.
- Translation covers chat but not the request itself — closed in Phase 9.
- No AI help on the supply side, no marketplace memory — both addressed in
  Phase 10.
- No formalized evaluation framework — prompts had no benchmark cases at
  time of review — closed in Phase 2.

## Monetization opportunities

**Headline finding:** klussie has no way to collect money today.
Commission, boost, API licensing, and white-label licensing are all
unbuilt or UI-only until Phase 4 ships.

- No payment collection mechanism exists — Phase 4.
- No subscription tier for pros — meets Phase 10's business intelligence
  directly.
- API licensing and white-label licensing, scheduled — Phases 11 and 12.
- No tiered or volume-based commission — no lever to reward high-volume
  pros yet.

---

## Implementation roadmap

Thirteen phases in four groups. Disaster Recovery sits deliberately after
the testing/CI foundation, before Payments puts real money at stake.

| Phase | Focus | Risk | Complexity |
|---|---|---|---|
| **Foundation** | | | |
| 1 | Security, Klussie Core & design system | Critical to fix | M |
| 2 | Testing, CI, types & release strategy | Low | M |
| 3 | Disaster recovery & operational resilience | Medium | M |
| **Business** | | | |
| 4 | Real payments & monetization | High | L–XL |
| 5 | Marketplace engine — dynamic taxonomy | Manifesto-driven | L |
| 6 | Trust & safety / admin tooling | Medium | M–L |
| **Scale** | | | |
| 7 | Performance & scale | Medium | M–L |
| 8 | Engagement & notifications | Medium | M |
| 9 | AI engine v2 & multi-country groundwork | Medium | L |
| **Platform** | | | |
| 10 | Intelligence platform | Medium | L |
| 11 | Platform API | High | XL |
| 12 | White label | Critical if rushed | XL |
| 13 | AI Home | Medium–high | XL |

### Phase 1 — Security, Klussie Core & Design System

*Do this first — ship the security fix in week one, build the foundation
around it. Risk: do first. Complexity: M.*

**Objective —** Close the two unauthenticated AI endpoints, then use that
work to stand up Core's Auth/Permissions/AI Gateway layers plus the
domain-event bus, publish the Product Constitution and Engineering
Standards docs, and start the design system. This phase produces the "law"
every later phase is checked against, not just code.

- **Components affected:** `api/ai-intake.js`, `api/translate-message.js`,
  new `src/core/` boundary, new design-system library, new `/docs/` tree,
  new `/ai/` prompt library
- **Database changes:** `ai_usage_log`; `feature_flags` (key,
  enabled_globally, enabled_countries jsonb, enabled_user_ids jsonb,
  rollout_percentage); new `audit_log` (actor_id, action, entity_type,
  entity_id, before jsonb, after jsonb, created_at) — every sensitive
  mutation (email change, quote edit, refund) writes here going forward
- **Backend changes:** JWT verification + rate limiting on both AI
  endpoints; server-side payload caps; AI Gateway with new capability-based
  routing (`speech()`, `vision()`, `reason()`, `translate()` as
  independently swappable functions, not one provider client) so a future
  switch to a different transcription or vision provider touches one
  function, not the whole codebase; Permissions layer formalizing today's
  RLS into one checkpoint; new domain-event bus (publish/subscribe) — the
  mechanism, with the first events (`RequestCreated`, `QuoteSubmitted`)
  wired from existing code; feature-flag evaluation service; new
  `/ai/{intake,translation,matching,fraud,quotes,reports,home-profile,admin}/`
  — each folder holding `prompt.md`, `schema.ts`, `tests.ts`,
  `evaluation.md`, moving prompts out of the API files they currently live
  in
- **Frontend changes:** Bootstrap the design system — Button, Card, Modal,
  Drawer, Avatar, Badge, Rating, ServiceCard, AIMessage, JobCard, Timeline,
  QuoteCard, TrustBadge, PriceTag — extracted from what already exists ad
  hoc in App.jsx; friendly auth/rate-limit states in AiIntakeSheet and
  ConversationSheet
- **AI changes:** Standardized output contract (`reasoning` field, formal
  fallback behavior) applied uniformly across the new prompt library; each
  prompt folder's `evaluation.md` defines its benchmark cases from day one,
  not retrofitted later
- **API changes:** Both endpoints require `Authorization`, return
  `401`/`429` appropriately
- **Testing requirements:** Unit tests on auth/rate-limit middleware and
  the AI Gateway's capability routers; a scripted burst-request test; the
  first prompt evaluation run (Phase 2) against the intake and translation
  benchmark cases; a simple internal catalog page for the design system
- **Risks:** Carries the most scope of any phase in the roadmap — security
  fix, Core's first three layers, the event bus, two governance docs, and
  the start of a design system. Sequence strictly: security fix in week
  one, governance docs in week two (mostly writing, not code), Core/design
  system work spread over the rest of the phase. Don't let the foundation
  ambition delay the urgent fix.

> **Status note (2026-08-06):** this phase has substantially shipped — see
> `MASTER_CONTEXT.md` §2/§3 for the live scorecard.

### Phase 2 — Testing, CI, Types & Release Strategy

*The safety net, formalized — including how code is allowed to reach
production. Risk: low. Complexity: M.*

**Objective —** Build the regression net, type safety, and a real release
pipeline before Phase 4 puts money through the platform. This phase also
stands up the AI evaluation framework the new prompt library (Phase 1)
needs to be trustworthy over time.

- **Components affected:** Whole repo, plus deployment configuration
- **Database changes:** A separate staging Supabase project plus a seed
  script
- **Backend changes:** Convert the two API functions to TypeScript first;
  structured logging and error tracking (Sentry) wired into the AI
  Gateway; new formal environment pipeline —
  `Development → Internal → Beta → Production` — replacing the current
  direct-to-production deploy, enforced by CI, not convention
- **Frontend changes:** Vitest + React Testing Library, Playwright for the
  critical e2e flows; `src/lib/*.js` converted to `.ts` incrementally
- **AI changes:** New AI Evaluation Framework — every prompt folder's
  `evaluation.md` gets real benchmark cases, e.g. input *"My washing
  machine leaks"* → expected category "Appliance Repair," confidence
  >90%, budget €80–120, exactly 2 follow-up questions — so a prompt change
  to any AI module shows a pass/fail delta, not a guess
- **API changes:** None
- **Testing requirements:** This phase *is* the testing requirement — CI
  blocks merges on lint + typecheck + unit/e2e failures *and* AI eval
  regressions from here on; nothing reaches Production without passing
  through Internal and Beta first
- **Risks:** Can become a time sink if scoped too broadly — cover the
  happy-path flows and the highest-traffic prompts first, expand from
  there.

### Phase 3 — Disaster Recovery & Operational Resilience

*The phase most startups skip — placed here deliberately, before real
money is at stake. Risk: medium. Complexity: M.*

**Objective —** Make sure klussie can recover from a bad deploy, a
corrupted migration, or a regional outage without losing data or
improvising under pressure. This is boring, unglamorous work — exactly the
kind that's cheap to build now and catastrophically expensive to have
skipped once Phase 4 makes data loss mean lost payments, not just lost
test accounts.

- **Components affected:** Supabase project configuration, Vercel
  deployment configuration, no application code
- **Database changes:** Enable Supabase's point-in-time recovery /
  automated daily backups on the production project; a documented, tested
  restore procedure (not just "backups exist" — an actual rehearsed drill)
- **Backend changes:** Infrastructure as code for the Supabase + Vercel
  project configuration (so "how is production configured" is a file in
  the repo, not institutional memory); a rollback runbook tied to Phase
  2's release pipeline — every Beta→Production promotion has a known,
  tested revert path
- **Frontend / AI / API changes:** None
- **Testing requirements:** A literal disaster-recovery drill: restore the
  staging project from a backup and confirm the app runs against it
  end-to-end; a documented incident-response runbook covering "production
  is down" and "we shipped a bad migration," each rehearsed at least once,
  not just written
- **Risks:** The main risk here is skipping the actual drill and treating
  "we wrote the runbook" as equivalent to "we know it works" — those are
  not the same thing, and the gap between them is exactly where startups
  get hurt.

### Phase 4 — Real Payments & Monetization

*The business becomes real — now shipping onto a tested, typed, backed-up
foundation. Risk: high. Complexity: L–XL.*

**Objective —** Make the 12% commission real, as the first of several
revenue streams. Ships behind a `STRIPE` feature flag, through Phase 2's
Beta stage before full Production rollout, with Phase 3's rollback plan
actually rehearsed. Primary KPI: average booking completion.

- **Components affected:** RequestDetailSheet, ProProfile, InvoiceSheet,
  Core's new Payments layer
- **Database changes:** `payments` (request_id, quote_id, amount,
  platform_fee, payout_status, provider_ref, revenue_stream);
  `pro_payout_accounts`
- **Backend changes:** Payment-intent creation, webhook handling, Stripe
  Connect or Mollie onboarding; emits `PaymentAuthorized` on the Phase 1
  event bus so Notifications and Analytics react without direct coupling
- **Frontend changes:** Real checkout on quote acceptance; pro payout
  onboarding; boost becomes a genuine charge
- **AI changes:** None directly
- **API changes:** New `/api/payments/create-intent`,
  `/api/payments/webhook`
- **Testing requirements:** Full sandbox charge→payout lifecycle tests
  under CI; webhook signature verification; a legal/compliance pass on
  the invoice; every audit-logged action (refund, payout) verified to
  actually write to `audit_log`
- **Risks:** Still the highest-risk phase by nature — real money, real
  regulatory exposure — but materially safer than in earlier drafts of
  this plan, now shipping onto tested, typed, backed-up ground instead of
  being the first thing to touch production with real stakes.

### Phase 5 — Marketplace Engine: Dynamic Service Taxonomy

*Turn "add a new vertical" from a code change into a config change.
Risk: manifesto-driven. Complexity: L.*

**Objective —** Move the 15 hardcoded services into data, behind an admin
surface, becoming Core's Marketplace Engine layer. Primary KPI: time to
first booking, since a properly-schemad new vertical launches with the
same fast intake experience as the original 15 services.

- **Components affected:** `src/lib/serviceQuestions.js` (retired),
  QuoteFormSheet, AiIntakeSheet, category/service tables
- **Database changes:** `service_question_schemas` (service_id, field_key,
  type, label_i18n_key, options jsonb, sort_order); backfill migration for
  the current 15
- **Backend changes:** RLS for the newly admin-editable tables
- **Frontend changes:** QuoteFormSheet and AiIntakeSheet read schemas from
  data; admin screens built from the Phase 1 design system
- **AI changes:** `api/ai-intake.js` queries the dynamic schema through the
  AI Gateway instead of importing a JS constant
- **API changes:** None new
- **Testing requirements:** Acceptance test — add a brand-new service
  purely through the admin surface, confirm it renders correctly
  everywhere with zero code changes
- **Risks:** Trades a compile-time-checked structure for runtime data —
  the admin-write path needs strong validation so a malformed schema can't
  silently break a live intake flow.

### Phase 6 — Trust & Safety / Admin Tooling

*The piece that makes "certified" mean something. Risk: medium.
Complexity: M–L.*

**Objective —** Real certification verification and a working
report-moderation workflow — necessary before scaling matching for
legally-sensitive services, and the RLS proving ground Phase 12's tenant
isolation later depends on. Primary KPI: NPS and both retention numbers.

- **Components affected:** pro_profiles/pro_stats, reports table,
  testimonials
- **Database changes:** `certification_documents`; admin view/RPC over
  `reports.status`
- **Backend changes:** Admin-only RLS role; private storage bucket for
  certification documents
- **Frontend changes:** Protected admin surface — request/report/
  certification queues; pro-facing document upload
- **AI changes:** Reuse the intake vision pipeline to pre-screen
  certification documents
- **API changes:** None beyond admin CRUD
- **Testing requirements:** RLS policy tests proving non-admins genuinely
  cannot access admin-only tables; end-to-end report → review → resolution
  workflow test
- **Risks:** A new admin surface is a new attack surface if role/policy
  checks are wrong; certification documents are sensitive PII.

### Phase 7 — Performance & Scale

*Fix the gaps before they're user-visible. Risk: medium. Complexity: M–L.*

**Objective —** Remove the pagination, caching, and search gaps, and
unify storage under Core. Primary KPI: booking completion (a slow, janky
list is an abandoned booking).

- **Components affected:** Every `src/lib` fetch function; Discover,
  RequestsList, ProDashboard, ProJobs, MessagesList
- **Database changes:** Keyset-pagination indexes on `service_requests`,
  `messages`, `quotes`
- **Backend changes:** Stale-while-revalidate cache for catalog data;
  Postgres full-text search for Discover; Core's unified Storage interface
- **Frontend changes:** Paginated/infinite-scroll lists; code-splitting to
  shrink the 576KB bundle
- **AI / API changes:** None
- **Testing requirements:** Load-test against a seeded large dataset;
  confirm pagination doesn't break the Realtime refetch pattern
- **Risks:** Pagination interacts with the refetch-on-event pattern
  everywhere — needs care to avoid resetting scroll position on every live
  update.

### Phase 8 — Engagement & Notifications

*Reach people when they're not staring at the app. Risk: medium.
Complexity: M.*

**Objective —** Stands up Core's Notifications layer. Primary KPI:
professional response time — directly, since this is the phase that makes
a lead reachable outside an open tab.

- **Components affected:** Request/quote/message creation paths
- **Database changes:** `notification_preferences`
- **Backend changes:** Transactional email (Resend/Postmark) subscribed to
  the event bus's `QuoteSubmitted`/`QuoteAccepted`/message events;
  optional web push
- **Frontend changes:** Notification preferences; PWA manifest + service
  worker if push is included
- **AI changes:** Use `urgency` to prioritize delivery
- **API changes:** New notification-dispatch function, becomes Core's
  Notifications layer
- **Testing requirements:** Deliverability testing; preference-honoring
  tests; no duplicate notifications against existing Realtime updates
- **Risks:** Notification fatigue if not opt-in from day one;
  sender-reputation risk without SPF/DKIM configured first.

### Phase 9 — AI Engine v2 & Multi-Country Groundwork

*Extend the AI beyond intake, and stop assuming Belgium. Risk: medium.
Complexity: L.*

**Objective —** Matching becomes Core's Matching layer; groundwork for
Belgium/Netherlands/Luxembourg. Primary KPI: AI understanding accuracy and
first-time fix rate.

- **Components affected:** `pro_matches_request`, SendQuoteSheet, catalog
  schema, flexi-job tax tracker
- **Database changes:** `country`/`currency` columns; ranking-signal
  columns
- **Backend changes:** Weighted matching by trust score and past
  performance; country-aware tax logic
- **Frontend changes:** Country/currency-aware formatting; AI-assisted
  quote drafting for pros
- **AI changes:** Translate the request's own text, not just chat;
  fraud/spam confidence signal using the reasoning field from Phase 1
- **API changes:** Extend the intake response schema
- **Testing requirements:** Extend the Phase 2 AI eval suite to cover
  ranking quality and translation correctness; Belgian flexi-job
  regression tests
- **Risks:** Generalizing country/currency logic touches code used
  everywhere; AI-ranking needs careful evaluation against systematically
  favoring particular pros.

### Phase 10 — Intelligence Platform

*AI stops helping only individual users and starts helping the
marketplace itself. Risk: medium. Complexity: L.*

**Objective —** Three audiences on one Analytics layer: marketplace-wide
supply/demand signals for the founder, business intelligence for pros,
proactive maintenance intelligence for customers — plus marketplace memory
(preferences, preferred pros, recurring issues) and an internal AI
assistant queryable in plain language ("why is Antwerp demand
increasing?"). This is where the manifesto's "predicts problems" and
"manages professional businesses" stages become real.

- **Components affected:** New admin Intelligence dashboard, pro analytics
  panel, customer proactive reminders, Core's Analytics layer
- **Database changes:** `market_signals` (region, service_id, metric,
  value, computed_at); `pro_analytics_snapshots`; `asset_reminders`
  (precursor to Phase 13's Home Profile); new `customer_preferences`
  (customer_id, preferred_pro_ids, preferred_times jsonb,
  communication_language, budget_sensitivity, recurring_issue_tags) — the
  marketplace-memory table
- **Backend changes:** Scheduled jobs computing signals from
  service_requests/quotes/reviews, subscribed to the event bus; an AI
  summarization pass turning aggregates into plain-language findings ("not
  enough plumbers in Antwerp, average wait 42 minutes, recommend
  increasing provider incentives") through the AI Gateway; a new
  internal-assistant endpoint — natural-language queries over the
  Analytics layer, answered by the same reasoning capability the AI
  Gateway already exposes
- **Frontend changes:** Intelligence dashboard; pro analytics panel;
  proactive customer reminders; a simple admin chat interface for the
  internal assistant
- **AI changes:** A periodic batch-analysis pass, distinct from
  per-request intake; marketplace memory feeds directly into Phase 9's
  matching quality (a customer's preferred pro or known budget sensitivity
  becomes a ranking signal, not just a display field)
- **API changes:** Internal analytics endpoints — the direct foundation for
  what Phase 11 later exposes externally
- **Testing requirements:** Correctness tests on the aggregation queries
  before AI narrates them; a sanity eval on AI-generated insight text
  against known synthetic scenarios; the internal assistant tested against
  a fixed set of known-answer questions the way any other prompt is
- **Risks:** The most data-dependent phase in the roadmap — with low
  transaction volume, signals will be noisy or wrong, and a wrong insight
  damages trust faster than no insight. Needs a minimum-data threshold
  gating when any signal surfaces, and shouldn't ship until Phases 4–5
  have produced meaningful real usage.

### Phase 11 — Platform API

*Most marketplaces stop at their own app — this makes klussie
programmable. Risk: high. Complexity: XL.*

**Objective —** External systems — insurers, real estate agencies,
municipalities, hotels, property managers — integrate directly. Klussie
becomes Core's outermost layer, exposed to partners rather than only end
users.

- **Components affected:** New public API layer over every existing Core
  module; partner-account management
- **Database changes:** `api_clients` (partner org, api_key_hash, scopes,
  rate_limit_tier); `api_request_log`
- **Backend changes:** Versioned public REST API wrapping the same Core
  modules used internally, with partner-level auth and rate limiting;
  webhook delivery keyed to the same domain events already flowing
  internally
- **Frontend changes:** A partner developer portal — docs, API keys, usage
  dashboard; can start minimal
- **AI changes:** Partner-submitted job descriptions flow through the same
  AI intake pipeline server-side
- **API changes:** This phase *is* the API — versioned endpoints, OpenAPI
  spec, webhooks
- **Testing requirements:** Contract tests against the OpenAPI spec; a
  partner-sandbox environment separate from both production and the Phase
  2 staging project
- **Risks:** A public API is a permanent backward-compatibility commitment
  — versioning discipline from day one is non-negotiable. Don't start
  before Phase 2's CI discipline and Phase 3's operational resilience are
  proven.

### Phase 12 — White Label

*"City of Brussels, powered by klussie" — now you're selling software, not
jobs. Risk: critical if rushed. Complexity: XL.*

**Objective —** Full multi-tenant deployments for municipalities,
insurers, and facility managers. Depends directly on Phase 1's design
system (swappable tokens instead of rebuilt UI) and Phase 6's RLS
discipline (tenant isolation is the same problem as user-level isolation,
at higher stakes).

- **Components affected:** A multi-tenancy layer across auth, catalog,
  branding, billing
- **Database changes:** `tenants` (id, name, domain, branding_config jsonb,
  billing_plan); a deliberate, carefully-scoped decision on which core
  tables gain a `tenant_id` column — its own design pass when this phase
  starts, not a bolt-on
- **Backend changes:** Tenant-resolution middleware added to Core alongside
  Auth/Permissions; per-tenant commission, catalog subset, and branding
  config
- **Frontend changes:** Design-system tokens (colors, logo, copy) become
  swappable per tenant — the payoff for building a real design system in
  Phase 1
- **AI changes:** Per-tenant usage tracking on the AI Gateway so API costs
  attribute correctly
- **API changes:** Extends Phase 11's partner API with tenant-scoped
  deployments
- **Testing requirements:** Strict tenant-isolation tests — the single
  scariest failure mode in this entire roadmap is one tenant seeing
  another tenant's data. This phase needs the most rigorous RLS/
  access-control testing of any phase here, full stop.
- **Risks:** The highest architectural risk in the roadmap after Payments.
  Multi-tenancy retrofitted onto a single-tenant schema is one of the most
  common sources of catastrophic data leaks industry-wide. Do not start
  until Phase 2's testing discipline and Phase 6's RLS patterns are both
  mature and proven in production.

### Phase 13 — AI Home

*The manifesto's stage 9, directly — every house gets a memory.
Risk: medium–high. Complexity: XL.*

**Objective —** A persistent Home Profile the AI remembers across every
job, every appliance, every warranty. When something breaks, the AI
already has full context — the deepest integration of everything built in
every phase before it, including Phase 10's marketplace memory, which this
phase extends from customer preferences to full home-asset history.

- **Components affected:** New Home Profile surface, tied into every past
  request/photo/invoice
- **Database changes:** `homes`; `home_assets` (category, install_date,
  warranty_expiry, brand, model, serial_number — reusing the brand/OCR
  detection already shipped); `home_asset_events`
- **Backend changes:** Every completed request tied to a home updates the
  relevant asset's history automatically; a scheduled job generates
  maintenance reminders from asset age plus typical service intervals,
  feeding Phase 10's customer-intelligence surface with real data instead
  of guesses
- **Frontend changes:** A Home Profile screen — visual map of tracked
  assets, history, warranty status, upcoming maintenance; AI intake
  pre-fills brand/model/install-date from a photographed appliance
- **AI changes:** The deepest AI integration in the roadmap — every
  intake, photo, and completed job feeds the Home Profile; on a new
  request, the AI Gateway pulls the relevant asset's full history as
  context before even asking a follow-up question
- **API changes:** Home Profile data becomes available through the Phase
  11 Platform API too
- **Testing requirements:** Data-integrity tests ensuring asset history
  stays correctly linked as requests and photos accumulate over years
- **Risks:** Asks customers to trust klussie with a persistent, detailed
  record of their home. Privacy and data-retention policy need to be
  airtight and clearly communicated before this ships, or it works
  against "trust above everything" instead of for it.

> See also `HOME_OPERATING_SYSTEM.md` and `PROPERTY_MEMORY.md` for the
> full product-design and philosophy layer this phase is built from.

---

## Approval note (from the original review)

No code changed as part of this review. Thirteen phases, a constitution, a
KPI table, an event-driven Core, and a rehearsed disaster-recovery plan
sitting exactly where the founder's own reasoning put it — before the
money, not after.

Phase 1 was the recommendation, and the discipline was the point: a
well-executed Phase 1 and Phase 2 make every phase after them faster and
safer — the temptation to skip ahead to something more exciting was named
as the only real risk left in the plan that wasn't already written down
somewhere above.

---

Version 1.0 — 2026-08-06 (transcribed into the repository from the
conversation-only v4 architecture-review artifact; see note at top of
document for the two corrections applied during transcription)

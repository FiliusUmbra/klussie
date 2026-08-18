-- Epic 12 WP01 — the Request aggregate: what is needed, owned by the requesting
-- workspace.
--
-- READ BEFORE DESIGN — THIS EPIC'S OWN SCOPE BOUNDARY, STATED ONCE HERE AND HELD ACROSS
-- EVERY MIGRATION IN IT
--
-- DATABASE_ARCHITECTURE.md §19 / SYSTEM_ARCHITECTURE.md §8.4: requests, quotes and
-- engagements migrated onto this schema, driven by workflow definitions rather than
-- triggers. The roadmap's own risk register (§23, row 2) names the actual switch
-- explicitly: "Epic 09 changes booking behaviour while replacing triggers... Workflow
-- definitions must reproduce current trigger behaviour exactly before the switch;
-- regression baseline from 00.08 is the reference" — and Epic 09's own header already
-- deferred that switch here, to Epic 12, on exactly this reasoning.
--
-- This epic builds the full new schema, backfills every real existing request, quote
-- and booked engagement, and ships a complete read/write contract — everything that is
-- additive, reversible and has no consumer, the same restraint Epics 09/10/11 all held.
-- It does **not**: wire a dual-write trigger that creates a real, immediately-consumed
-- workspace.memberships row (the scoped grant an engagement produces is a live
-- authorization change the instant it exists — every isolation policy in this schema
-- already consults api.current_workspace_memberships()); retire or modify any of the
-- five legacy triggers; or switch the live booking flow to be workflow-instance-driven.
-- Those three are the actual "single largest behavioural risk in the roadmap" Epic 09's
-- own header named, and they remain a deliberate, named, undone step — the regression
-- baseline (00.08) is the gate the roadmap itself sets for it, not a decision to make
-- silently inside an "add a table" migration. Full reasoning in
-- implementation/epic-12/COMPLETION.md §5.1.
--
-- work.requests, work.quotes AND work.engagements ARE THE SAFE HALF OF THIS EPIC
--
-- Pure addition: new tables, no client reads them, no trigger writes them yet. Backfill
-- (WP 12.05) mirrors existing public.service_requests/quotes data — read-only with
-- respect to the legacy tables, which remain fully authoritative, exactly as every prior
-- backfill in this roadmap has left its own source table.
--
-- REUSES THE LEGACY TAXONOMY — public.categories/services ARE NOT MIGRATED
--
-- MASTER_CONTEXT.md §12 already tracks "Categories/services hardcoded seed data...
-- Marketplace Engine configurable taxonomy" as its own, separate, low-priority (P3) debt
-- item. Building a new taxonomy system is not what "requests, quotes, engagements
-- migrated" asks for — work.requests references public.categories/services directly,
-- across schemas, the same way property.assets already references nothing in public but
-- would if a real cross-schema case existed. category_id stays text, matching
-- public.categories.id's own type exactly rather than inventing a uuid key for a table
-- this epic does not touch.
--
-- ONE-TAP BOOKING'S DIRECTED-QUOTE WINDOW (ADR-0012) IS NOT MODELLED HERE
--
-- public.service_requests carries directed_pro_id/directed_until/auto_accept_max — a
-- real mechanism, but a marketplace UX/workflow behaviour (ADR-0012), not a domain
-- concept §19 names. Nothing reads the new schema yet, so nothing needs it reproduced
-- structurally today; a future work package can express it as workflow-definition
-- configuration once a real read caller exists to need it. Named here, not silently
-- dropped, the same restraint Epic 08 held for profiles.avatar_url.
--
-- workflow_instance_id IS A FORWARD-COMPATIBLE COLUMN, NOT YET POPULATED
--
-- Epic 09 built the real engine and the real booking_request_lifecycle definition
-- without a subject to attach it to, precisely because nothing was workspace-scoped
-- until now. work.requests.workflow_instance_id exists so that whichever future work
-- package performs the actual switch has somewhere to put the pin — the same
-- forward-compatible-column pattern property.document_types.is_public (Epic 08) and
-- property.assets.warranty_expires_on (Epic 07) both already used ahead of their own
-- first real writer.

create table if not exists work.requests (
  id                       uuid        not null,

  requesting_workspace_id  uuid        not null
                           references workspace.workspaces (id),
  property_id              uuid        null
                           references property.properties (id),
  asset_id                 uuid        null
                           references property.assets (id),
  location_id              uuid        null
                           references property.locations (id),

  category_id              text        null
                           references public.categories (id),
  service_id               uuid        null
                           references public.services (id),

  details                  text        null,
  when_pref                text        null
                           check (when_pref in ('this_week', 'next_week', 'flexible')),
  budget                   numeric(10, 2) null,

  status                   text        not null default 'collecting'
                           check (status in ('collecting', 'quotes_ready', 'booked', 'completed', 'reviewed', 'cancelled')),

  -- Bridges to Epic 09's real engine, unpopulated until the actual switch — see this
  -- migration's own header.
  workflow_instance_id     uuid        null
                           references work.workflow_instances (id),

  -- Bookkeeping only, mirroring Epic 08's own dual-write idiom (portfolio_item_id,
  -- service_request_photo_id) — set by the backfill (WP 12.05) and future dual-write,
  -- read by nothing else, never exposed through the contract.
  service_request_id       uuid        null,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint requests_pkey primary key (id),
  constraint requests_at_most_one_subject
    check (num_nonnulls(asset_id, location_id) <= 1)
);

comment on table work.requests is
  'What is needed, owned by the requesting workspace (DATABASE_ARCHITECTURE.md §19). Mirrors public.service_requests during this epic''s backfill (WP 12.05) — that table remains authoritative; this one has no reader yet. status is a plain column here, not yet derived from a workflow instance — see this migration''s own header for why the actual switch is deliberately not this epic''s job.';
comment on column work.requests.service_request_id is
  'Bookkeeping only — the legacy row this request was backfilled from, if any. Never returned by the contract (WP 12.06), the same restraint every prior bookkeeping column in this schema holds.';

create index if not exists requests_workspace_idx
  on work.requests (requesting_workspace_id);
create index if not exists requests_service_request_id_idx
  on work.requests (service_request_id) where service_request_id is not null;

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on work.requests to klussie_engine_work;
revoke all on work.requests from anon, authenticated, service_role;

alter table work.requests enable row level security;

-- No policy yet — WP 12.04's own job, once all three aggregates exist to write
-- isolation against together.

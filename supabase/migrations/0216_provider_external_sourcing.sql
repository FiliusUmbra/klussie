-- Provider Intelligence's own anticipated extension point, built for the first time —
-- PLATFORM_DOMAIN_MODEL.md §14.4's "External directories (future): supply the platform
-- does not itself host... thin markets, specialist trades, new countries," and
-- DATABASE_ARCHITECTURE.md §29's identical framing. Not a new idea bolted on; the domain
-- model already named this exact source of supply and left it for later. This is later.
--
-- WHAT THIS MIGRATION IS, AND WHAT IT DELIBERATELY IS NOT
--
-- Schema and a write contract for recording businesses sourced from outside the platform
-- (Google Places today, more sources later) as candidates for a specific request that
-- needs more supply than the marketplace currently has. It does NOT include:
--
--   · Any outreach/dispatch mechanism (SMS, email) — that needs a suppression/opt-out
--     table of its own, built alongside the sending code that actually needs it, not
--     preemptively (0032's own six-step discipline: a table with no reader or writer yet
--     is a table nothing has actually needed).
--   · Any automatic trigger. PLATFORM_DOMAIN_MODEL.md §14.4 is explicit and load-bearing
--     here: "For workspaces that want automation, auto-dispatch within stated bounds is a
--     Workflow Automation capability the customer explicitly enables, never a default."
--     That sentence governs dispatching a customer's own job to a provider, but the
--     principle it states — automation beyond ordinary matching requires the customer's
--     own explicit opt-in, never a silent platform default — applies with equal force to
--     reaching outside the platform on a customer's behalf using their job's details.
--     This migration's write contract is therefore reachable only by a real operator
--     action, not wired to fire automatically off any request state. When and how a
--     customer might opt in themselves is an open product question for whoever builds the
--     trigger, not settled here.
--
-- WHY A NEW SCHEMA, NOT public OR platform
--
-- DATABASE_ARCHITECTURE.md §5's tenancy rule: a genuinely new engine gets its own schema
-- (identity, workspace, property, work, safety, knowledge, commerce — the established
-- precedent), not a table bolted onto an existing one. A sourced business is platform-
-- scoped reference data (real supply that exists in the world, independent of any one
-- workspace) — closer in shape to public.categories/services than to anything workspace-
-- owned, but genuinely its own concept (Provider Intelligence, §29), not the marketplace
-- catalogue. `provider` is that engine's own home.
--
-- provider.external_leads — THE SOURCED BUSINESS ITSELF, DEDUPLICATED GLOBALLY
--
-- Keyed by (source, source_ref) — e.g. a Google Place ID — so the same real-world
-- plumber sourced for two different requests, weeks apart, is one row, not two. Contact
-- fields are nullable: Places gives a phone reliably but rarely an email (this migration's
-- own PR body has the research); a later enrichment step may fill email in without ever
-- needing a second table.
--
-- provider.lead_matches — WHICH LEAD WAS SURFACED FOR WHICH REQUEST, AND WHY
--
-- A lead can be sourced once and matched to many requests over time; a request can surface
-- many leads. The join is its own table rather than a column on either side for exactly
-- that many-to-many shape. match_reason is jsonb, not prose, because §14.4 states
-- explainability as a data requirement, not a feature: "the *inputs* to a recommendation...
-- are captured with the decision, because recomputing an explanation later against changed
-- data produces a different explanation, which is worse than none."
--
-- SAME TWO-LAYER SHAPE AS 0180's OWN activation_ratios_for_caller()/api.activation_ratios()
--
-- Plain logic in the engine schema, SECURITY INVOKER, checking the same "real, active
-- membership in a workspace holding platform_operations" EXISTS predicate every operator-
-- only path in this codebase already uses — plus, because this is a write
-- (SUPPORT_ACCESS_DESIGN.md §1.3(b)'s own role audit: reads don't need the extra guard,
-- writes do), the same `and m.role <> 'support'` exclusion 0179 already established for
-- every other operator write. A thin SECURITY DEFINER delegate in api, granted only to
-- authenticated, holds no logic of its own.
--
-- IDENTIFIERS ARE APPLICATION-GENERATED (ADR-0022) — NOT ONLY THE OBVIOUS ONE
--
-- Every lead id and match id the caller proposes is a real uuidv7, generated client-side
-- (in practice, server-side inside the serverless function that already called out to
-- Google Places — still "the application," never the database). A lead's *proposed* id is
-- authoritative only the first time that (source, source_ref) pair is seen; the upsert
-- below correctly returns the pair's one true existing id on every later sighting, which is
-- unavoidable given natural-key deduplication and is not a violation of 0022 — the
-- identifier was still minted by the application the first time the row came to exist.

create schema if not exists provider;

-- =========================================================================
-- THE TABLES

create table if not exists provider.external_leads (
  id             uuid        not null,
  source         text        not null,
  source_ref     text        not null,
  business_name  text        not null,
  phone          text        null,
  email          text        null,
  website        text        null,
  city           text        null,
  category_id    text        null
                 references public.categories (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint external_leads_pkey primary key (id),
  constraint external_leads_source_ref_unique unique (source, source_ref)
);

comment on table provider.external_leads is
  'A real-world business sourced from outside the platform (PLATFORM_DOMAIN_MODEL.md §14.4, "External directories") as a candidate for a request the marketplace could not fully supply. Platform-scoped, not workspace-owned — deduplicated globally by (source, source_ref), e.g. a Google Place ID, so the same business sourced for two different requests is one row. Never contacted by anything in this migration; that is a separate, not-yet-built capability.';

create table if not exists provider.lead_matches (
  id            uuid        not null,
  lead_id       uuid        not null
                references provider.external_leads (id),
  request_id    uuid        not null
                references work.requests (id),
  match_reason  jsonb       not null default '{}'::jsonb,
  matched_at    timestamptz not null default now(),

  constraint lead_matches_pkey primary key (id),
  constraint lead_matches_lead_request_unique unique (lead_id, request_id)
);

comment on table provider.lead_matches is
  'Records that a sourced lead was surfaced as a candidate for a specific request, and why (§14.4: explainability is a data requirement — the inputs to a recommendation are captured with the decision). Many-to-many: one lead may match many requests over time, one request may surface many leads.';

create index if not exists lead_matches_request_idx on provider.lead_matches (request_id);
create index if not exists lead_matches_lead_idx on provider.lead_matches (lead_id);

-- =========================================================================
-- ACCESS — reachable only through the write contract below, matching every other
-- operator-only table in this codebase: RLS enabled, no policies, direct grants revoked.

alter table provider.external_leads enable row level security;
alter table provider.lead_matches enable row level security;

revoke all on provider.external_leads from public, anon, authenticated, service_role;
revoke all on provider.lead_matches from public, anon, authenticated, service_role;

-- =========================================================================
-- THE WRITE CONTRACT

create or replace function provider.record_sourced_leads_for_caller(
  p_request_id      uuid,
  p_leads           jsonb,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_lead         jsonb;
  v_lead_id      uuid;
begin
  if not exists (
    select 1
    from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
      and m.role <> 'support'
  ) then
    raise exception 'provider.record_sourced_leads_for_caller: caller lacks platform_operations'
      using errcode = 'insufficient_privilege';
  end if;

  select r.requesting_workspace_id into v_workspace_id
  from work.requests r
  where r.id = p_request_id;

  if v_workspace_id is null then
    raise exception 'provider.record_sourced_leads_for_caller: % does not name a real request', p_request_id
      using errcode = 'no_data_found';
  end if;

  if p_leads is null or jsonb_typeof(p_leads) <> 'array' or jsonb_array_length(p_leads) = 0 then
    raise exception 'provider.record_sourced_leads_for_caller: p_leads must be a non-empty array'
      using errcode = 'invalid_parameter_value';
  end if;

  for v_lead in select * from jsonb_array_elements(p_leads)
  loop
    insert into provider.external_leads (
      id, source, source_ref, business_name, phone, email, website, city, category_id
    )
    values (
      (v_lead ->> 'id')::uuid,
      v_lead ->> 'source',
      v_lead ->> 'source_ref',
      v_lead ->> 'business_name',
      nullif(v_lead ->> 'phone', ''),
      nullif(v_lead ->> 'email', ''),
      nullif(v_lead ->> 'website', ''),
      nullif(v_lead ->> 'city', ''),
      nullif(v_lead ->> 'category_id', '')
    )
    on conflict (source, source_ref) do update
      set business_name = excluded.business_name,
          -- A later sighting only ever fills a gap, never erases a value a previous
          -- sighting (or manual correction) already recorded.
          phone         = coalesce(provider.external_leads.phone, excluded.phone),
          email         = coalesce(provider.external_leads.email, excluded.email),
          website       = coalesce(provider.external_leads.website, excluded.website),
          city          = coalesce(provider.external_leads.city, excluded.city),
          updated_at    = now()
    returning id into v_lead_id;

    insert into provider.lead_matches (id, lead_id, request_id, match_reason)
    values (
      (v_lead ->> 'match_id')::uuid,
      v_lead_id,
      p_request_id,
      coalesce(v_lead -> 'match_reason', '{}'::jsonb)
    )
    on conflict (lead_id, request_id) do nothing;
  end loop;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'provider.leads.sourced',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'request',
    p_subject_id     => p_request_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('leadCount', jsonb_array_length(p_leads))
  );
end;
$$;

comment on function provider.record_sourced_leads_for_caller(uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  'Persists businesses sourced from outside the platform (Google Places today) as candidates for p_request_id, deduplicated globally by (source, source_ref) and matched with an explainable reason. Restricted to a real, active membership in a workspace holding platform_operations, excluding support-only grants (0179''s own role audit, applied here because this is a write). Emits provider.leads.sourced on the requesting workspace. Never contacts anyone — see this migration''s own header. Reachable only through api.record_sourced_leads().';

revoke all on function provider.record_sourced_leads_for_caller(uuid, jsonb, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- THE DELEGATE

create or replace function api.record_sourced_leads(
  p_request_id      uuid,
  p_leads           jsonb,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select provider.record_sourced_leads_for_caller(p_request_id, p_leads, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.record_sourced_leads(uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  'The Provider engine''s isolation contract for provider.record_sourced_leads_for_caller(). Delegates entirely; holds no logic of its own.';

revoke all on function api.record_sourced_leads(uuid, jsonb, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.record_sourced_leads(uuid, jsonb, uuid, uuid, platform.actor_type, text)
  to authenticated;

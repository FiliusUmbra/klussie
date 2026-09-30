-- Payments Slice A (WP A2) — the acquisition-fee decision table's own answer to "how is
-- attribution evidenced and persisted": an explicit, affirmative signal on the request
-- that started the relationship, never inferred from behaviour.
--
-- WHY A NEW COLUMN, NOT A REUSE OF directed_workspace_id (ADR-0012)
--
-- work.requests.directed_workspace_id (0154) already lets a customer address a request
-- at one specific professional, but it answers a different question — "did the customer
-- pick this pro by name instead of opening it to matching" — not "did they already know
-- this pro before Klussie." A customer can perfectly well direct a request at a
-- professional they discovered through Klussie's own public profile/portfolio browsing
-- (src/lib/portfolio.js) — that is still a real Klussie introduction, and reusing
-- directed_workspace_id to mean "no fee" would silently exempt exactly the case the fee
-- is meant to capture. A second, orthogonal column is the correct model, not overloading
-- one that already carries a real, different meaning (Rule 8, no duplicate business
-- logic — this is not a duplicate, it is a genuinely different fact).
--
-- THE DEFAULT IS THE CHARGEABLE CASE, DELIBERATELY — WITH ONE NAMED EXCEPTION
--
-- The acquisition-fee decision table's own default is "unknown or unproven attribution
-- must not automatically produce a charge." That governs HISTORICAL rows (any request
-- created before this migration has no considered answer at all, and is backfilled
-- 'unknown' below, never silently charged). It does not mean every NEW row defaults to
-- non-chargeable — the ordinary, current request flow (AI intake / open matching,
-- src/lib/requests.js's own createServiceRequest()) is BY CONSTRUCTION a Klussie
-- introduction every single time it runs, so 'marketplace_match' is the correct default
-- for every request created from here on, not an unproven guess. The one flow that can
-- rebut it is createDirectedRequest() (below), via a real, explicit customer toggle —
-- built in the same work package as this migration, not left as a schema-only gap.
--
-- 'professional_supplied' IS NAMED BUT HAS NO WRITER YET — A REAL, NAMED GAP
--
-- The brief's own free-tier guarantee ("professionals can bring and work with their
-- existing customers") has no dedicated request-creation path today distinct from a
-- customer-initiated request — a professional cannot yet create a request/job on a
-- customer's behalf at all. This value exists in the check constraint for the day that
-- flow is built (it would default here, not to 'marketplace_match'), and is not reachable
-- by any function this migration adds. Recorded here rather than silently assumed solved.

alter table work.requests add column if not exists origin text;

update work.requests set origin = 'unknown' where origin is null;

alter table work.requests alter column origin set not null;
alter table work.requests alter column origin set default 'marketplace_match';

alter table work.requests drop constraint if exists requests_origin_check;
alter table work.requests add constraint requests_origin_check
  check (origin in ('marketplace_match', 'existing_relationship', 'professional_supplied', 'unknown'));

comment on column work.requests.origin is
  'Payments Slice A — whether this request is a real Klussie introduction (marketplace_match, the default for every new request), an explicit customer-declared pre-existing relationship (existing_relationship, settable only on a directed request), a professional-authored request for their own existing customer (professional_supplied, named but unreachable — no writer exists yet), or a pre-this-migration row with no considered answer (unknown, backfilled, never chargeable). commerce.is_first_eligible_engagement() is the only reader that gives this column financial meaning.';

-- =========================================================================
-- work.create_request() — the base writer (0090), gains p_origin as a trailing,
-- defaulted parameter. A new trailing parameter changes the function's own argument
-- signature, so CREATE OR REPLACE alone would create a second, overloaded function
-- rather than replacing the first (ambiguous the moment a caller omits p_origin) — the
-- exact reason 0154 explicitly dropped my_requests()/resolve_request() before
-- redefining them. Dropped here for the identical reason, then re-created and re-granted.

drop function if exists work.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, platform.actor_type, text);

create or replace function work.create_request(
  p_request_id             uuid,
  p_requesting_workspace_id uuid,
  p_property_id            uuid,
  p_asset_id               uuid,
  p_location_id            uuid,
  p_category_id            text,
  p_service_id             uuid,
  p_details                text,
  p_when_pref              text,
  p_budget                 numeric,
  p_event_id               uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text,
  p_origin                 text default 'marketplace_match'
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into work.requests (
    id, requesting_workspace_id, property_id, asset_id, location_id,
    category_id, service_id, details, when_pref, budget, origin
  ) values (
    p_request_id, p_requesting_workspace_id, p_property_id, p_asset_id, p_location_id,
    p_category_id, p_service_id, p_details, p_when_pref, p_budget, coalesce(p_origin, 'marketplace_match')
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.request.created',
    p_workspace_id   => p_requesting_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'request',
    p_subject_id     => p_request_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('categoryId', p_category_id, 'serviceId', p_service_id)
  );
end;
$$;

comment on function work.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, platform.actor_type, text, text) is
  'Creates a request at status = collecting (the table''s own default). Mirrors on_request_created (migration 0012). p_origin (Payments Slice A) defaults to marketplace_match — see 0228''s own header for why that is the correct default rather than an unproven guess.';

-- =========================================================================
-- work.create_request_for_caller()/api.create_request() (0154, the latest of three
-- redefinitions) — gain the same trailing, defaulted parameter. Same drop-first
-- reasoning as work.create_request() above — both are dropped before either is
-- re-created, so api.create_request() is never left referencing a dropped function
-- mid-migration.

drop function if exists work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text);
drop function if exists api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text);

create or replace function work.create_request_for_caller(
  p_request_id uuid, p_requesting_workspace_id uuid, p_property_id uuid, p_asset_id uuid, p_location_id uuid,
  p_category_id text, p_service_id uuid, p_details text, p_when_pref text, p_budget numeric,
  p_details_json jsonb, p_ai_analysis jsonb, p_city text,
  p_service_request_id uuid, p_directed_workspace_id uuid, p_auto_accept_max numeric,
  p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text,
  p_origin text default 'marketplace_match'
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_requesting_workspace_id
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if p_directed_workspace_id is not null then
    if p_auto_accept_max is null or p_auto_accept_max <= 0 then
      raise exception 'work.create_request_for_caller: a directed request requires a positive auto_accept_max'
        using errcode = 'invalid_parameter_value';
    end if;
    if not exists (select 1 from workspace.workspaces w where w.id = p_directed_workspace_id) then
      raise exception 'work.create_request_for_caller: directed_workspace_id does not name a real workspace'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- existing_relationship is only ever true on a directed request — a customer cannot
  -- name "someone I already know" without naming who, and the open/AI-matched flow
  -- (p_directed_workspace_id null) is a Klussie introduction by construction every time
  -- it runs, so rejecting the combination here (rather than silently ignoring it) keeps
  -- a caller from ever writing an unproven-but-labelled-proven row.
  if p_origin = 'existing_relationship' and p_directed_workspace_id is null then
    raise exception 'work.create_request_for_caller: existing_relationship requires a directed_workspace_id'
      using errcode = 'invalid_parameter_value';
  end if;

  perform work.create_request(
    p_request_id => p_request_id, p_requesting_workspace_id => p_requesting_workspace_id,
    p_property_id => p_property_id, p_asset_id => p_asset_id, p_location_id => p_location_id,
    p_category_id => p_category_id, p_service_id => p_service_id, p_details => p_details,
    p_when_pref => p_when_pref, p_budget => p_budget,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref,
    p_origin => coalesce(p_origin, 'marketplace_match')
  );

  update work.requests
  set details_json = p_details_json,
      ai_analysis = p_ai_analysis,
      city = p_city
  where id = p_request_id;

  if p_directed_workspace_id is not null then
    update work.requests
    set directed_workspace_id = p_directed_workspace_id,
        directed_until = now() + interval '24 hours',
        auto_accept_max = p_auto_accept_max
    where id = p_request_id;
  end if;

  if p_service_request_id is not null then
    update work.requests
    set service_request_id = p_service_request_id
    where id = p_request_id;
  end if;
end;
$$;

comment on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text, text) is
  'Creates a request for a caller with a real, active membership in the requesting workspace (unchanged from 0146/0150/0154). p_origin (Payments Slice A, this migration) defaults to marketplace_match and refuses existing_relationship without a directed_workspace_id — see 0228''s own header.';

create or replace function api.create_request(
  p_request_id uuid, p_requesting_workspace_id uuid, p_property_id uuid, p_asset_id uuid, p_location_id uuid,
  p_category_id text, p_service_id uuid, p_details text, p_when_pref text, p_budget numeric,
  p_details_json jsonb, p_ai_analysis jsonb, p_city text,
  p_service_request_id uuid, p_directed_workspace_id uuid, p_auto_accept_max numeric,
  p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text,
  p_origin text default 'marketplace_match'
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.create_request_for_caller(
    p_request_id, p_requesting_workspace_id, p_property_id, p_asset_id, p_location_id,
    p_category_id, p_service_id, p_details, p_when_pref, p_budget,
    p_details_json, p_ai_analysis, p_city,
    p_service_request_id, p_directed_workspace_id, p_auto_accept_max,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref,
    p_origin
  );
$$;

-- =========================================================================
-- ACCESS — re-applied exactly as 0154 left it. DROP FUNCTION removes any grant on that
-- exact signature, so both statements below are required, not defensive redundancy.

revoke all on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text, text)
  from public, anon, authenticated, service_role;
revoke all on function api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text, text)
  from public, anon, service_role;
grant execute on function api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text, text)
  to authenticated;

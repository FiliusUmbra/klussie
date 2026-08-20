-- Platform Activation Slice 2, WP 2.6 — dual-write at creation, so legacy's own
-- pro_matches_request() keeps finding new activity, plus the status bridge
-- fetchProLeads() needs once a request's real lifecycle moves onto work.* alone.
--
-- WHY DUAL-WRITE, AND WHY ONLY AT CREATION — A REAL FINDING, NOT THIS SLICE'S ORIGINAL
-- PLAN
--
-- SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md §1.7 scoped Provider Intelligence
-- (matching) out of this slice from the start — pro_matches_request() (0013) stays
-- legacy, unchanged, until Slice 6. It reads public.service_requests/quotes only. If
-- api.create_request()/api.submit_quote() wrote to work.* alone, every new request and
-- quote would be invisible to every pro's own lead list — not a cutover, a break in the
-- product's actual revenue loop. Checked directly before building this: fetchProLeads()
-- (src/lib/requests.js) also excludes anything the calling pro has already quoted, via
-- the SAME legacy quotes join — meaning a quote submitted through work.* alone would
-- leave that request looking un-quoted to the pro who just quoted it, and it would keep
-- reappearing in their own leads list forever.
--
-- The rest of the lifecycle does not need this. Accepting, completing, cancelling and
-- reviewing all happen after matching is already resolved — fetchProLeads()'s own
-- status filter (collecting/awaiting_pro/quotes_ready) is what actually needs to stay
-- accurate, not the full row. Rather than have accept_quote_for_caller() etc. also
-- write back into legacy (a second dual-write surface, growing with every future
-- lifecycle function), this migration adds one small, targeted bridge instead:
-- api.request_lifecycle_statuses() lets fetchProLeads() ask, for a batch of legacy ids,
-- what each one's correlated work.requests row''s real status is right now — and
-- exclude anything that has already moved past collecting. Legacy becomes a pure
-- matching index, populated once at creation; work.* becomes the one lifecycle system
-- of record from that point forward. Named and decided here, not assumed silently.
--
-- SIGNATURES CHANGE AGAIN — DROPPED FIRST, THE SAME DISCIPLINE 0148/0149 ALREADY
-- ESTABLISHED
--
-- create_request_for_caller()/submit_quote_for_caller() and their api.* delegates each
-- gain one new optional parameter (p_service_request_id/p_legacy_quote_id). A changed
-- parameter list is a different signature to Postgres regardless of the new parameter
-- having a default — every one is dropped by its exact prior signature before being
-- recreated, and every grant the drop removes is restated, matching 0148's own
-- structural test for this exact class of mistake.
--
-- THE CORRELATION IS PATCHED IN, NOT INSERTED — THE SAME SHAPE ALREADY USED FOR
-- DIRECTED-BOOKING COLUMNS
--
-- work.create_request()/work.submit_quote() (0090) remain completely unmodified — their
-- own INSERT lists were never asked to carry a legacy id. create_request_for_caller()/
-- submit_quote_for_caller() delegate to them exactly as before, then run one more
-- conditional UPDATE when a legacy id was actually given, the identical pattern 0146
-- already established for directed_workspace_id/directed_until/auto_accept_max.

-- =========================================================================
-- 1 · api.request_lifecycle_statuses() — the status bridge fetchProLeads() needs

create or replace function work.request_lifecycle_statuses(p_service_request_ids uuid[])
returns table (service_request_id uuid, status text)
language sql
stable
set search_path = ''
as $$
  select r.service_request_id, r.status
  from work.requests r
  where r.service_request_id = any(p_service_request_ids);
$$;

comment on function work.request_lifecycle_statuses(uuid[]) is
  'For a batch of legacy service_requests ids, each one''s correlated work.requests row''s real status, if a correlated row exists at all — the status bridge fetchProLeads() (src/lib/requests.js, WP 2.6) uses to exclude an already-accepted request from lingering in another pro''s own leads list. No membership check: this reveals only a status value, already visible to any caller through legacy''s own service_requests row they can already read (RLS-gated there, unchanged) — never anything api.resolve_request() itself would refuse. Not SECURITY DEFINER, granted to nobody, reachable only from api.request_lifecycle_statuses().';

create or replace function api.request_lifecycle_statuses(p_service_request_ids uuid[])
returns table (service_request_id uuid, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.request_lifecycle_statuses(p_service_request_ids);
$$;

comment on function api.request_lifecycle_statuses(uuid[]) is
  'Delegate for work.request_lifecycle_statuses() (WP 2.6). Batch status lookup, keyed by legacy id, for fetchProLeads()''s own exclusion filter.';

revoke all on function work.request_lifecycle_statuses(uuid[]) from public, anon, authenticated, service_role;
revoke all on function api.request_lifecycle_statuses(uuid[]) from public, anon, service_role;
grant execute on function api.request_lifecycle_statuses(uuid[]) to authenticated;

-- =========================================================================
-- 2 · work.create_request_for_caller()/api.create_request() — gain p_service_request_id

drop function if exists work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform.actor_type, text);
drop function if exists api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform.actor_type, text);

create or replace function work.create_request_for_caller(
  p_request_id              uuid,
  p_requesting_workspace_id uuid,
  p_property_id             uuid,
  p_asset_id                uuid,
  p_location_id             uuid,
  p_category_id             text,
  p_service_id              uuid,
  p_details                 text,
  p_when_pref               text,
  p_budget                  numeric,
  p_service_request_id      uuid,
  p_directed_workspace_id   uuid,
  p_auto_accept_max         numeric,
  p_event_id                uuid,
  p_correlation_id          uuid,
  p_actor_type              platform.actor_type,
  p_actor_ref               text
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

  perform work.create_request(
    p_request_id => p_request_id, p_requesting_workspace_id => p_requesting_workspace_id,
    p_property_id => p_property_id, p_asset_id => p_asset_id, p_location_id => p_location_id,
    p_category_id => p_category_id, p_service_id => p_service_id, p_details => p_details,
    p_when_pref => p_when_pref, p_budget => p_budget,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

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

comment on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) is
  'Creates a request for a caller with a real, active membership in the requesting workspace (unchanged from 0146). p_service_request_id, when given, correlates this row to a legacy service_requests row created in the same client action (WP 2.6''s own dual-write) — patched in via one follow-up UPDATE, the same shape already used for the directed-booking columns; work.create_request() itself is never asked to carry a legacy id.';

create or replace function api.create_request(
  p_request_id uuid, p_requesting_workspace_id uuid, p_property_id uuid, p_asset_id uuid, p_location_id uuid,
  p_category_id text, p_service_id uuid, p_details text, p_when_pref text, p_budget numeric,
  p_service_request_id uuid, p_directed_workspace_id uuid, p_auto_accept_max numeric,
  p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.create_request_for_caller(
    p_request_id, p_requesting_workspace_id, p_property_id, p_asset_id, p_location_id,
    p_category_id, p_service_id, p_details, p_when_pref, p_budget,
    p_service_request_id, p_directed_workspace_id, p_auto_accept_max,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

-- =========================================================================
-- 3 · work.submit_quote_for_caller()/api.submit_quote() — gain p_legacy_quote_id

drop function if exists work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text);
drop function if exists api.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text);

create or replace function work.submit_quote_for_caller(
  p_quote_id                         uuid,
  p_request_id                       uuid,
  p_offering_workspace_id            uuid,
  p_price                            numeric,
  p_message                          text,
  p_legacy_quote_id                  uuid,
  p_event_id                         uuid,
  p_correlation_id                   uuid,
  p_auto_accept_engagement_id        uuid,
  p_auto_accept_event_id             uuid,
  p_auto_accept_engagement_event_id  uuid,
  p_auto_accept_conversation_id                 uuid,
  p_auto_accept_customer_participant_id         uuid,
  p_auto_accept_pro_participant_id              uuid,
  p_auto_accept_conversation_event_id           uuid,
  p_auto_accept_customer_participant_event_id   uuid,
  p_auto_accept_pro_participant_event_id        uuid,
  p_actor_type                       platform.actor_type,
  p_actor_ref                        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_directed_ws     uuid;
  v_directed_until  timestamptz;
  v_auto_accept_max numeric;
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_offering_workspace_id
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.submit_quote(
    p_quote_id => p_quote_id, p_request_id => p_request_id, p_offering_workspace_id => p_offering_workspace_id,
    p_price => p_price, p_message => p_message,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  if p_legacy_quote_id is not null then
    update work.quotes set legacy_quote_id = p_legacy_quote_id where id = p_quote_id;
  end if;

  select r.directed_workspace_id, r.directed_until, r.auto_accept_max
    into v_directed_ws, v_directed_until, v_auto_accept_max
  from work.requests r where r.id = p_request_id;

  if v_directed_ws is not null
     and v_directed_ws = p_offering_workspace_id
     and v_directed_until > now()
     and p_price <= v_auto_accept_max
  then
    perform work.accept_quote(
      p_quote_id => p_quote_id, p_engagement_id => p_auto_accept_engagement_id,
      p_event_id => p_auto_accept_event_id, p_engagement_event_id => p_auto_accept_engagement_event_id,
      p_declined_event_id => null,
      p_correlation_id => p_correlation_id, p_actor_type => 'system', p_actor_ref => 'directed_booking_auto_accept'
    );

    perform work.open_conversation_for_engagement(
      p_engagement_id => p_auto_accept_engagement_id,
      p_conversation_id => p_auto_accept_conversation_id,
      p_customer_participant_id => p_auto_accept_customer_participant_id,
      p_pro_participant_id => p_auto_accept_pro_participant_id,
      p_conversation_event_id => p_auto_accept_conversation_event_id,
      p_customer_participant_event_id => p_auto_accept_customer_participant_event_id,
      p_pro_participant_event_id => p_auto_accept_pro_participant_event_id,
      p_correlation_id => p_correlation_id, p_actor_type => 'system', p_actor_ref => 'directed_booking_auto_accept'
    );
  end if;
end;
$$;

comment on function work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Submits a quote (unchanged from 0146/0148) and runs the auto-accept cascade when directed. p_legacy_quote_id, when given, correlates this row to a legacy quotes row created in the same client action (WP 2.6''s own dual-write), patched in via one follow-up UPDATE — work.submit_quote() itself is never asked to carry a legacy id.';

create or replace function api.submit_quote(
  p_quote_id uuid, p_request_id uuid, p_offering_workspace_id uuid, p_price numeric, p_message text,
  p_legacy_quote_id uuid,
  p_event_id uuid, p_correlation_id uuid,
  p_auto_accept_engagement_id uuid, p_auto_accept_event_id uuid, p_auto_accept_engagement_event_id uuid,
  p_auto_accept_conversation_id uuid, p_auto_accept_customer_participant_id uuid, p_auto_accept_pro_participant_id uuid,
  p_auto_accept_conversation_event_id uuid, p_auto_accept_customer_participant_event_id uuid, p_auto_accept_pro_participant_event_id uuid,
  p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.submit_quote_for_caller(
    p_quote_id, p_request_id, p_offering_workspace_id, p_price, p_message,
    p_legacy_quote_id,
    p_event_id, p_correlation_id,
    p_auto_accept_engagement_id, p_auto_accept_event_id, p_auto_accept_engagement_event_id,
    p_auto_accept_conversation_id, p_auto_accept_customer_participant_id, p_auto_accept_pro_participant_id,
    p_auto_accept_conversation_event_id, p_auto_accept_customer_participant_event_id, p_auto_accept_pro_participant_event_id,
    p_actor_type, p_actor_ref
  );
$$;

-- =========================================================================
-- ACCESS — restated for both dropped-and-recreated functions and their delegates

revoke all on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;

revoke all on function api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;

grant execute on function api.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;

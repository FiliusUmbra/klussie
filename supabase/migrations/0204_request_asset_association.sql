-- Intake item-association slice — "which item is this about," closing the gap
-- ItemDetailSheet.jsx's own header names: "work.requests.asset_id exists but nothing in
-- the current intake flow ever sets it, so most real items will show History's honest
-- empty state until a later slice teaches intake to ask 'which item is this about.'"
--
-- work.requests.asset_id has existed since 0085; every real client caller
-- (createServiceRequest()/createDirectedRequest(), src/lib/requests.js) has always
-- hardcoded it to null. This migration's own client half finally sends a real one when
-- the customer picks a tracked item during intake — a plain, optional chip row, never
-- required (most real requests genuinely aren't about one tracked appliance).
--
-- THE REAL GAP FOUND BY AUDIT: NEITHER work.create_request() NOR ITS OWN
-- work.create_request_for_caller() WRAPPER EVER VALIDATED p_asset_id (OR p_property_id)
-- AGAINST THE REQUESTING WORKSPACE
--
-- Harmless while p_asset_id was always null and p_property_id was always resolved
-- through the caller's own read-scoped fetchMyProperties() first (a well-behaved client
-- could never even SEE another workspace's property id to hand back) — but the instant
-- p_asset_id becomes a real, client-supplied value, the same class of gap this session
-- has now found and closed twice (work.complete_maintenance_obligation(), 0203;
-- exposing an asset/location write without checking who stewards it) reappears here.
-- Fixed the same way: checking p_asset_id, when given, is actually stewarded by the
-- requesting workspace before it is ever written — the identical join
-- work.create_manual_maintenance_obligation() (0142) already uses for the same question.
--
-- p_property_id's OWN equivalent gap is real too, but is not this migration's job: it
-- is a pre-existing condition, not something newly introduced by giving asset_id real
-- teeth, and touches the "another saved property" flow on its own terms — named here,
-- not silently fixed as a drive-by, matching this session's own restraint elsewhere.
--
-- A REAL MISTAKE, FOUND AND FIXED BEFORE MERGE — NOT JUST BEFORE THIS COMMENT
--
-- This migration's first draft redefined work.create_request_for_caller() against its
-- STALE 0146-era 16-parameter signature. 0154 had already grown it to 20 parameters
-- (p_details_json/p_ai_analysis/p_city/p_service_request_id), and 0175 redefined it
-- again at that same 20-parameter shape to exclude a support-role membership from
-- authorizing a write (the write-path role audit that session's own header describes).
-- Postgres treats a different parameter list as a DIFFERENT function — CREATE OR REPLACE
-- against the old 16-param shape didn't touch the real function at all; it silently
-- created an unused second overload nothing calls, while api.create_request() (which
-- always did, and still does, invoke the real 20-param overload directly) kept calling
-- the completely unfixed original. Caught live, before merge, by testing a cross-
-- workspace asset reference through the actual client-shaped call rather than assuming
-- the fix landed because the file compiled and pushed without error. The dead 16-param
-- overload this mistake left on staging is dropped below; the real fix is the 20-param
-- redefinition beneath it, byte-for-byte identical to 0175's own body otherwise.

drop function if exists work.create_request_for_caller(
  uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform.actor_type, text
);

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
  p_details_json            jsonb,
  p_ai_analysis             jsonb,
  p_city                    text,
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
    select 1 from workspace.current_memberships() m where m.workspace_id = p_requesting_workspace_id and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if p_asset_id is not null and not exists (
    select 1 from property.assets a
    join property.properties p on p.id = a.property_id
    where a.id = p_asset_id and p.steward_workspace_id = p_requesting_workspace_id
  ) then
    raise exception
      'work.create_request_for_caller: asset % is not stewarded by workspace %', p_asset_id, p_requesting_workspace_id
      using errcode = 'insufficient_privilege';
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

comment on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) is
  'Creates a request for a caller with a real, active membership in the requesting workspace, excluding a support-role grant (0175). Since 0204, also refuses a given asset_id that is not actually stewarded by that same workspace (property_id carries the same pre-existing, unenforced trust today -- named, not fixed here). Delegates entirely to the unmodified work.create_request() for the base row and event, then patches details_json/ai_analysis/city, the directed-booking columns, and service_request_id in follow-up UPDATEs -- unchanged from 0175 other than the one added check.';

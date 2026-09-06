-- Closes the property_id gap named (not fixed) in both 0204's and 0205's own headers:
-- work.create_request_for_caller() validates a given asset_id against the requesting
-- workspace (0204) but never did the same for property_id, even though the function
-- has accepted it since 0090 and every real client caller has always sent a real one
-- (resolveRequestLocation(), src/lib/requests.js — a property the caller's own
-- fetchMyProperties() read already scoped correctly, so a well-behaved client could
-- never even see another workspace's property id to hand back; a caller that skips the
-- UI entirely could still send one).
--
-- FOUND WHILE FIXING property_id, NOT ANTICIPATED: location_id HAS THE IDENTICAL GAP
--
-- The same function also accepts p_location_id, unchecked against the requesting
-- workspace either — the exact same class of gap, previously unnoticed because no real
-- client caller has ever sent a non-null one (both createServiceRequest() and
-- createDirectedRequest() hardcode it to null today, matching asset_id's own history
-- before 0204). Left unfixed here would mean shipping one twin of a gap while leaving
-- the other sitting in the exact same function, found in the exact same pass — fixed
-- together rather than requiring a third near-identical migration later.
--
-- SAME SIGNATURE, SAME MECHANISM AS 0204 -- NOT A NEW DECISION
--
-- Both checks use the identical "if given and not stewarded, raise insufficient_
-- privilege" shape 0204 already established for asset_id (itself copied from
-- work.create_manual_maintenance_obligation(), 0142) — property.properties carries
-- steward_workspace_id directly (no join needed, unlike the asset/location checks which
-- go through property.properties from their own table); location_id's own check
-- mirrors 0204's asset_id join exactly, substituting property.locations for
-- property.assets.

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

  if p_property_id is not null and not exists (
    select 1 from property.properties p
    where p.id = p_property_id and p.steward_workspace_id = p_requesting_workspace_id
  ) then
    raise exception
      'work.create_request_for_caller: property % is not stewarded by workspace %', p_property_id, p_requesting_workspace_id
      using errcode = 'insufficient_privilege';
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

  if p_location_id is not null and not exists (
    select 1 from property.locations l
    join property.properties p on p.id = l.property_id
    where l.id = p_location_id and p.steward_workspace_id = p_requesting_workspace_id
  ) then
    raise exception
      'work.create_request_for_caller: location % is not stewarded by workspace %', p_location_id, p_requesting_workspace_id
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
  'Creates a request for a caller with a real, active membership in the requesting workspace, excluding a support-role grant (0175). Refuses a given property_id, asset_id (0204), or location_id not actually stewarded by that same workspace (0208). Delegates entirely to the unmodified work.create_request() for the base row and event, then patches details_json/ai_analysis/city, the directed-booking columns, and service_request_id in follow-up UPDATEs -- unchanged from 0204/0175 other than the two added checks.';

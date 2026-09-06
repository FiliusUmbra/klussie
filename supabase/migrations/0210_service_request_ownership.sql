-- Found by a systematic sweep of every *_for_caller() function in this codebase for the
-- exact class of bug 0204/0208/0209 fixed in this same function: a parameter that is a
-- real, ownable foreign key, trusted from the client with no ownership check.
--
-- work.create_request_for_caller() has accepted p_service_request_id since 0146
-- (correlating a new work.requests row to the legacy public.service_requests row the
-- client creates in the same dual-write) and patched it onto the new row completely
-- unchecked -- the one FK-shaped parameter in this function 0204/0208/0209 never
-- touched.
--
-- NOT DEAD BOOKKEEPING -- 0085_requests.sql's OWN COLUMN COMMENT IS STALE
--
-- work.requests.service_request_id's column comment (0085) says "never returned by the
-- contract," which reads like this column is write-only, low-stakes correlation
-- bookkeeping. It is not. Two live read paths key off it with no ownership re-check of
-- their own, both reachable by a real pro:
--   - work.request_lifecycle_statuses(uuid[]) (0150) -- keyed purely on
--     service_request_id, no membership check. src/lib/requests.js's own fetchProLeads()
--     drops any legacy lead whose correlated work.requests row has moved past
--     'collecting'. A caller could correlate their OWN new request to ANOTHER
--     customer's real, still-open legacy service_requests row, then withdraw their own
--     request -- the victim's legacy lead silently disappears from every pro's list. A
--     targeted denial of service on someone else's request, requiring no privileged
--     access at all.
--   - api.matching_request_locations_for_pro(uuid[]) (0187) -- same legacy-id keying;
--     the same planted correlation lets a caller substitute what location/notes pros see
--     for the victim's own lead.
--   - work.submit_review_for_request (0175) also inserts public.reviews using this same
--     unvalidated value.
-- public.service_requests.customer_id is a real, ownable reference (references
-- public.profiles(id), 0001) -- exactly the kind of foreign key 0204/0208/0209 already
-- established must be checked before use, just missed because it is the one parameter
-- in this function that points into a LEGACY table rather than the property engine.
--
-- THE FIX
--
-- One more check, same shape as every other one in this function: p_service_request_id,
-- when given, must resolve to a legacy row whose own customer_id is tied (via
-- identity.identities, the same person_ref bridge workspace.current_memberships() itself
-- uses) to a real, active, unscoped, non-support membership in the REQUESTING workspace
-- -- i.e., the legacy row must genuinely belong to a real member of the same workspace
-- creating the new request, not merely exist. Same non-enumerating shape: "not exists"
-- conflates "belongs to someone else" with "does not exist at all." Placed alongside the
-- other subject checks, before work.create_request() is ever called, so a rejection
-- happens before the new request row or its own platform.events row are created --
-- matching the ordering established by 0204/0208/0209, not merely relying on statement-
-- level atomicity to undo work already done.
--
-- Every real client caller is unaffected: createServiceRequest()/createDirectedRequest()
-- (src/lib/requests.js) both insert the legacy row with customer_id set to the caller's
-- own auth id, then call this RPC with p_requesting_workspace_id set to the caller's own
-- active workspace -- always a real, active, unscoped, non-support membership by
-- construction.
--
-- SAME SIGNATURE, SAME MECHANISM -- NOT A NEW DECISION
--
-- No parameter added or removed, no return type change, no grant change: still the real,
-- current 20-parameter signature (confirmed against every migration that has ever
-- redefined this function: 0146, 0150, 0154, 0161, 0175, 0204, 0208, 0209).

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

  if p_property_id is not null and p_asset_id is not null and not exists (
    select 1 from property.assets a where a.id = p_asset_id and a.property_id = p_property_id
  ) then
    raise exception
      'work.create_request_for_caller: asset % does not belong to property %', p_asset_id, p_property_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_property_id is not null and p_location_id is not null and not exists (
    select 1 from property.locations l where l.id = p_location_id and l.property_id = p_property_id
  ) then
    raise exception
      'work.create_request_for_caller: location % does not belong to property %', p_location_id, p_property_id
      using errcode = 'insufficient_privilege';
  end if;

  -- 0210: p_service_request_id must correlate to a legacy row genuinely owned by a real,
  -- active, unscoped, non-support member of THIS SAME requesting workspace -- not merely
  -- exist. Mirrors workspace.current_memberships()'s own identity.identities bridge and
  -- filter shape (active, unexpired, unscoped, non-support), applied to the legacy row's
  -- own customer_id instead of the caller.
  if p_service_request_id is not null and not exists (
    select 1
    from public.service_requests sr
    join identity.identities i on i.auth_user_id = sr.customer_id
    join workspace.memberships m on m.person_ref = i.person_ref
    where sr.id = p_service_request_id
      and i.erased_at is null
      and m.workspace_id = p_requesting_workspace_id
      and m.role <> 'support'
      and m.scope is null
      and m.state = 'active'
      and (m.expires_at is null or m.expires_at > now())
  ) then
    raise exception
      'work.create_request_for_caller: service_request % is not owned by workspace %', p_service_request_id, p_requesting_workspace_id
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
  'Creates a request for a caller with a real, active, unscoped (0161/0194) membership in the requesting workspace, excluding a support-role grant (0175). Refuses a given property_id, asset_id (0204), or location_id (0208) not actually stewarded by that same workspace, refuses a given property_id paired with an asset_id or location_id that does not belong to it (0209), and refuses a given service_request_id whose legacy customer_id is not tied to a real, active, unscoped, non-support member of that same workspace (0210). Delegates entirely to the unmodified work.create_request() for the base row and event, then patches details_json/ai_analysis/city, the directed-booking columns, and service_request_id in follow-up UPDATEs -- unchanged from 0204/0175 other than the checks named above.';

-- Founder decision (continued from 0182/0183): legacy treatment. Scope, per the narrowest
-- literal reading of "for the currently active legacy engagement, request confirmation" --
-- only the one request behind the one real active legacy engagement. The completed legacy
-- engagement (decision: "may remain historical exceptions; do not create new contractor
-- access for completed work") gets nothing here, permanently, on purpose.

-- =========================================================================
-- 1 · STATUS FLIP — additive bookkeeping only, no grant, no engagement change

update work.requests r
set status_before_location_confirmation = r.status,
    status = 'location_confirmation_required'
from work.engagements e
where e.request_id = r.id
  and e.status = 'active'
  and not exists (
    select 1 from work.location_disclosures d where d.request_id = r.id and d.quote_id = e.quote_id
  )
  and r.status <> 'location_confirmation_required';

-- =========================================================================
-- 2 · THE CUSTOMER-FACING CONFIRMATION FUNCTION
--
-- Links the request to a real property (Home, another saved property, or a fresh one-time
-- address created inline), demotes the already-existing legacy engagement from 'active'
-- back to 'pending_disclosure' (0182's guard trigger does not fire on this direction --
-- it only guards transitions INTO 'active'), and restores the request's own real status.
-- From this point forward there is no special-cased legacy path left: the customer goes
-- through api.approve_location_disclosure() exactly as any live customer would.

create or replace function work.confirm_legacy_request_location(
  p_request_id  uuid,
  p_property_id uuid,
  p_street text default null, p_house_number text default null,
  p_postcode text default null, p_municipality text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_requesting_ws uuid;
  v_status        text;
  v_engagement_id uuid;
  v_resolved_property uuid;
begin
  select requesting_workspace_id, status into v_requesting_ws, v_status
  from work.requests where id = p_request_id;

  if v_requesting_ws is null or not exists (
    select 1 from api.current_workspace_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'location_confirmation_required' then
    raise exception
      'work.confirm_legacy_request_location: request % is % , not location_confirmation_required', p_request_id, v_status
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if p_property_id is not null then
    -- Home or another saved property -- must already belong to the caller's own workspace.
    if not exists (select 1 from property.properties where id = p_property_id and steward_workspace_id = v_requesting_ws) then
      raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
    end if;
    v_resolved_property := p_property_id;
  else
    -- A genuine one-time address: a fresh property row, same steward, populated inline.
    v_resolved_property := gen_random_uuid();
    insert into property.properties (id, name, steward_workspace_id, steward_since, street, house_number, postcode, municipality)
    values (v_resolved_property, 'One-time service address', v_requesting_ws, now(), p_street, p_house_number, p_postcode, p_municipality);
  end if;

  update work.requests
  set property_id = v_resolved_property,
      location_selection_type = case when p_property_id is not null then 'saved_property' else 'one_time_address' end,
      status = status_before_location_confirmation,
      status_before_location_confirmation = null,
      updated_at = now()
  where id = p_request_id;

  select id into v_engagement_id from work.engagements where request_id = p_request_id and status = 'active';
  if v_engagement_id is not null then
    update work.engagements set status = 'pending_disclosure' where id = v_engagement_id;
  end if;
end;
$$;

comment on function work.confirm_legacy_request_location(uuid, uuid, text, text, text, text) is
  'Legacy-only step 1 of 2 (0184). Links a location-confirmation-required request to a real property, demotes its already-existing active engagement back to pending_disclosure. Step 2 is the same api.approve_location_disclosure() a live customer uses -- no special-cased grant path for legacy rows.';

create or replace function api.confirm_legacy_request_location(
  p_request_id uuid, p_property_id uuid,
  p_street text default null, p_house_number text default null,
  p_postcode text default null, p_municipality text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.confirm_legacy_request_location(p_request_id, p_property_id, p_street, p_house_number, p_postcode, p_municipality);
$$;

revoke all on function work.confirm_legacy_request_location(uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function api.confirm_legacy_request_location(uuid, uuid, text, text, text, text) from public, anon, service_role;
grant execute on function api.confirm_legacy_request_location(uuid, uuid, text, text, text, text) to authenticated;

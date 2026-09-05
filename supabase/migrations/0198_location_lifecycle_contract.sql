-- Home Builder vertical slice — closes the three real gaps
-- 0140_location_write_contract.sql's own header named and deliberately deferred:
-- "update_location() (rename, retype)... a permission-checked path to
-- property.reparent_location()... retire_location() (retired_at)... All three are real
-- gaps a future work package should close, not oversights this one failed to notice."
-- This is that work package.
--
-- WHY NOW: a homeowner can create a room but has no way to fix a typo'd name, remove a
-- room added by mistake, or move one under another — the read path
-- (property.locations_for_property, 0136/0170) already excludes retired_at is not null
-- rows and already renders whatever parent_id points to, both waiting on a write side
-- that never arrived.
--
-- SAME AUTHORIZATION SHAPE AS property.create_location() (0140) THROUGHOUT
--
-- One real, self-contained caller-membership check per function, via
-- workspace.current_memberships() against the location's own property's steward
-- workspace -- the exact posture 0140's own header established for this engine. One
-- generic 'insufficient_privilege' exception covering both "no such location" and
-- "exists, but not yours," so neither case leaks which is true.
--
-- rename_location(): pure, deterministic -- a name update, nothing else.
--
-- retire_location(): safe by refusal, not by cascading. Retiring a room does not retire
-- what is inside it -- it refuses outright if the room still has an active (non-retired)
-- child location, or a real, active (property.assets.lifecycle_state = 'active') asset
-- placed in it. A homeowner must clear a room before removing it; nothing here silently
-- orphans a still-active item under a name that no longer resolves to anything in the
-- room list. property.locations_for_property() already excludes retired_at is not null
-- rows (0136) -- retiring is enough to make a room disappear from the list precisely
-- because nothing beneath it is left dangling.
--
-- reparent_location(): property.reparent_location() (0047) already exists, is already
-- correct (bug-fixed and verified against real staging data per its own header), and
-- explicitly deferred building "this function's first real caller" to "whichever future
-- work package" needed one. This is that caller -- a thin permission-checking wrapper,
-- resolving the location's CURRENT property (not a caller-supplied one) and checking
-- membership against it before ever calling the untouched, existing function.

-- =========================================================================
-- 1 · property.rename_location_for_caller() / api.rename_location()

create or replace function property.rename_location_for_caller(
  p_location_id     uuid,
  p_name            text,
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
  v_property_id          uuid;
  v_steward_workspace_id uuid;
begin
  select l.property_id into v_property_id from property.locations l where l.id = p_location_id;

  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = v_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.rename_location_for_caller: caller may not rename location %', p_location_id
      using errcode = 'insufficient_privilege';
  end if;

  update property.locations set name = p_name, updated_at = now() where id = p_location_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.location.renamed',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'location',
    p_subject_id     => p_location_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('name', p_name)
  );
end;
$$;

comment on function property.rename_location_for_caller(uuid, text, uuid, uuid, platform.actor_type, text) is
  'Renames a location the caller has a live membership in the property of (Home Builder slice). One generic exception for both "no such location" and "not yours," matching property.create_location()''s own restraint. Emits property.location.renamed. Not SECURITY DEFINER, granted to nobody, reachable only from api.rename_location().';

create or replace function api.rename_location(
  p_location_id     uuid,
  p_name            text,
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
  select property.rename_location_for_caller(p_location_id, p_name, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.rename_location(uuid, text, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.rename_location_for_caller() (ADR-0026''s split).';

revoke all on function api.rename_location(uuid, text, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.rename_location(uuid, text, uuid, uuid, platform.actor_type, text) to authenticated;

-- =========================================================================
-- 2 · property.retire_location_for_caller() / api.retire_location()

create or replace function property.retire_location_for_caller(
  p_location_id     uuid,
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
  v_property_id          uuid;
  v_steward_workspace_id uuid;
  v_already_retired      boolean;
begin
  select l.property_id, l.retired_at is not null into v_property_id, v_already_retired
  from property.locations l where l.id = p_location_id;

  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = v_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.retire_location_for_caller: caller may not retire location %', p_location_id
      using errcode = 'insufficient_privilege';
  end if;

  if v_already_retired then
    raise exception
      'property.retire_location_for_caller: location % is already retired', p_location_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if exists (
    select 1 from property.locations l where l.parent_id = p_location_id and l.retired_at is null
  ) then
    raise exception
      'property.retire_location_for_caller: location % still has an active room inside it', p_location_id
      using errcode = 'object_not_in_prerequisite_state', hint = 'active_children';
  end if;

  if exists (
    select 1 from property.assets a where a.location_id = p_location_id and a.lifecycle_state = 'active'
  ) then
    raise exception
      'property.retire_location_for_caller: location % still has an active item placed in it', p_location_id
      using errcode = 'object_not_in_prerequisite_state', hint = 'active_assets';
  end if;

  update property.locations set retired_at = now(), updated_at = now() where id = p_location_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.location.retired',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'location',
    p_subject_id     => p_location_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function property.retire_location_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Retires (never deletes) a location the caller has a live membership in the property of -- refuses if it still has an active child location or an active asset placed in it, so nothing is ever silently orphaned (Home Builder slice). Emits property.location.retired. Not SECURITY DEFINER, granted to nobody, reachable only from api.retire_location().';

create or replace function api.retire_location(
  p_location_id     uuid,
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
  select property.retire_location_for_caller(p_location_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.retire_location(uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.retire_location_for_caller() (ADR-0026''s split).';

revoke all on function api.retire_location(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.retire_location(uuid, uuid, uuid, platform.actor_type, text) to authenticated;

-- =========================================================================
-- 3 · property.reparent_location_for_caller() / api.reparent_location() -- the
-- permission-checked caller property.reparent_location() (0047) has waited for since it
-- shipped. property.reparent_location() itself is completely untouched by this
-- migration.

create or replace function property.reparent_location_for_caller(
  p_location_id     uuid,
  p_new_parent_id   uuid,
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
  v_property_id          uuid;
  v_steward_workspace_id uuid;
begin
  select l.property_id into v_property_id from property.locations l where l.id = p_location_id;

  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = v_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.reparent_location_for_caller: caller may not move location %', p_location_id
      using errcode = 'insufficient_privilege';
  end if;

  perform property.reparent_location(
    p_location_id => p_location_id, p_new_parent_id => p_new_parent_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id
  );
end;
$$;

comment on function property.reparent_location_for_caller(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'The permission-checked caller property.reparent_location() (0047) named as its own missing piece: checks the caller''s real membership in the location''s CURRENT property before calling that function, which is otherwise completely unchanged (Home Builder slice). Not SECURITY DEFINER, granted to nobody, reachable only from api.reparent_location().';

create or replace function api.reparent_location(
  p_location_id     uuid,
  p_new_parent_id   uuid,
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
  select property.reparent_location_for_caller(p_location_id, p_new_parent_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.reparent_location(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.reparent_location_for_caller() (ADR-0026''s split).';

revoke all on function api.reparent_location(uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.reparent_location(uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;

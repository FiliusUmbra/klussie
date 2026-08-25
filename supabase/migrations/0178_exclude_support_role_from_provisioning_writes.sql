-- Fix: two write functions missed by the earlier sweeps (0173/0174/0175/0176/0177)
-- because neither lives in a migration whose name or grep pattern those sweeps searched
-- by. Found this pass by walking every migration that references
-- workspace.current_memberships() at all, not just files matching "write_contract" or
-- functions named *_for_caller in the schemas already audited.
--
-- property.create_property_for_caller() (0143) — WP 1.10's own live-caller entry point,
-- shipped in a migration named "...write_contract_for_caller", not "...property_write_
-- contract" like 0139-0141 — checks "does the caller hold ANY live membership in
-- p_steward_workspace_id", no role filter. Without this fix a support-access grant
-- (0172) would be sufficient to create an entire new property claiming stewardship for
-- someone else's workspace.
--
-- work.create_manual_maintenance_obligation() (0142) — the live-caller entry point to
-- work.create_maintenance_obligation() (WP 1.7), shipped in "maintenance_write_
-- delegate.sql", a name that doesn't match either "property" or "marketplace"/"request".
-- Same gap: no role filter on its own membership check. Without this fix a support-
-- access grant would be sufficient to create a maintenance obligation against a
-- workspace's property or asset — a real professional/customer scheduling decision, not
-- a read.
--
-- Both redefined with their own bodies otherwise byte-for-byte identical to their last
-- shipped version — only the membership check gains one additional guard clause.

create or replace function property.create_property_for_caller(
  p_property_id           uuid,
  p_steward_workspace_id  uuid,
  p_name                  text,
  p_event_id              uuid,
  p_correlation_id        uuid,
  p_actor_type            platform.actor_type,
  p_actor_ref             text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_steward_workspace_id and m.role <> 'support'
  ) then
    raise exception
      'property.create_property_for_caller: caller may not create a property for workspace %', p_steward_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  perform property.create_property(
    p_property_id, p_steward_workspace_id, p_name, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
end;
$$;

comment on function property.create_property_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'The first real live-caller entry point to property.create_property() (WP 1.10, Option B''s own trigger — a professional workspace''s first "My Business" open). Checks the caller''s own real, active, non-support membership in p_steward_workspace_id (0178 — a support-access grant, migration 0172, must never be sufficient to create a property claiming stewardship for someone else), then delegates unchanged. Does not touch property.create_property() itself — handle_new_user()''s own Option A call site keeps its own trusted, unchecked posture. No "already has one" guard, matching 0135''s own stated reasoning for the function it wraps. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_property().';

create or replace function work.create_manual_maintenance_obligation(
  p_obligation_id   uuid,
  p_workspace_id    uuid,
  p_asset_id        uuid,
  p_location_id     uuid,
  p_title           text,
  p_description     text,
  p_due_on          date,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id and m.role <> 'support'
  ) then
    raise exception
      'work.create_manual_maintenance_obligation: caller may not create an obligation for workspace %', p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_asset_id is not null and not exists (
    select 1 from property.assets a
    join property.properties p on p.id = a.property_id
    where a.id = p_asset_id and p.steward_workspace_id = p_workspace_id
  ) then
    raise exception
      'work.create_manual_maintenance_obligation: asset % is not stewarded by workspace %', p_asset_id, p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_location_id is not null and not exists (
    select 1 from property.locations l
    join property.properties p on p.id = l.property_id
    where l.id = p_location_id and p.steward_workspace_id = p_workspace_id
  ) then
    raise exception
      'work.create_manual_maintenance_obligation: location % is not stewarded by workspace %', p_location_id, p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  perform work.create_maintenance_obligation(
    p_obligation_id, p_workspace_id, p_asset_id, p_location_id, null,
    p_title, p_description, 'manual', p_due_on,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
end;
$$;

comment on function work.create_manual_maintenance_obligation(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform.actor_type, text) is
  'The first real live-caller entry point to work.create_maintenance_obligation() (WP 1.7) — checks the caller''s own real, active, non-support workspace membership (0178) and that any given asset/location is actually stewarded by that same workspace, then delegates to the existing function with source hardcoded to ''manual'' and schedule_id to null (the only combination a live customer action can mean). Does not touch work.create_maintenance_obligation() itself — ''schedule''/''compliance''/''prediction'' keep calling it directly, unauthenticated-context, unchanged. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_maintenance_obligation().';

-- No grant/revoke changes — both functions' own access posture is untouched.

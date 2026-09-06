-- Move Room UI slice (Home Builder completion) — found while auditing
-- property.reparent_location_for_caller() (0198) as this function's own first real
-- caller: it never checks whether p_new_parent_id names a RETIRED location.
--
-- property.locations_for_property() (0136/0170) already excludes every retired_at is not
-- null row from what a client ever sees, so a well-behaved client can practically never
-- offer a retired room as a destination in the first place -- the new UI's own picker
-- (built from that same read contract) never lists one. But nothing at the RPC layer
-- enforced it: a stale client-side tree (a room retired in another tab or by another
-- household member moments earlier) or a caller that skips the UI entirely could still
-- send a retired location's real id as p_new_parent_id, and property.reparent_location()
-- (0047, untouched, correctly refuses cross-property moves and cycles) has no concept of
-- retirement at all -- it would silently succeed, moving a room INTO one its own steward
-- already asked to remove.
--
-- THE FIX
--
-- One more check in the wrapper 0198 already built for exactly this kind of caller-side
-- validation (the same posture as its own steward-workspace check three lines above):
-- when p_new_parent_id is given, it must resolve to a location that is not retired,
-- refused with the same insufficient_privilege errcode as every other invalid-destination
-- case this wrapper already raises -- "not a valid destination for you" covers both
-- "not yours" and "no longer a real room to put anything in." property.reparent_location()
-- itself (0047) is not touched.
--
-- A "not exists (... and retired_at is null)" check catches a wholly unknown id the same
-- way it catches a retired one (both simply fail to match) -- an unrelated, previously
-- unnoticed improvement: an unknown destination now also fails non-enumerating
-- (insufficient_privilege) here rather than reaching 0047's own bare "parent location %
-- does not exist" text. A destination from another property still reaches 0047's own
-- cross-property refusal unchanged (this check only tests retirement, not stewardship,
-- of a real, active row) -- not touched, not this migration's concern.
--
-- SAME SIGNATURE, SAME MECHANISM -- NOT A NEW DECISION

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

  if p_new_parent_id is not null and not exists (
    select 1 from property.locations l where l.id = p_new_parent_id and l.retired_at is null
  ) then
    raise exception
      'property.reparent_location_for_caller: % is not a valid destination for location %', p_new_parent_id, p_location_id
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
  'The permission-checked caller property.reparent_location() (0047) named as its own missing piece: checks the caller''s real membership in the location''s CURRENT property, and that a given new parent is not retired (0211 -- this UI slice''s own first real caller), before calling that function, which is otherwise completely unchanged. Not SECURITY DEFINER, granted to nobody, reachable only from api.reparent_location().';

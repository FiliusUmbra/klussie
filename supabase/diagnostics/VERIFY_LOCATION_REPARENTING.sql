-- Verifies property.reparent_location(), created by 0047_location_reparenting.sql
-- (Epic 06 WP05) — the epic's actual risk.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LOCATION_REPARENTING.sql
--
-- This is the one diagnostic in this epic that most needs to pass before anything calls
-- this function for real. Every check is written and rolled back inside its own
-- transaction so a failure midway never leaves the database in a state check 2 finds.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Moving a subtree rewrites every descendant's path correctly, and emits exactly one
-- LocationTreeChanged event naming the right subject, workspace and payload

begin;

do $$
declare
  v_ws         uuid := gen_random_uuid();
  v_prop       uuid := gen_random_uuid();
  v_bldg_a     uuid := gen_random_uuid();
  v_bldg_b     uuid := gen_random_uuid();
  v_floor      uuid := gen_random_uuid();  -- moved: from under Building A to under Building B
  v_room       uuid := gen_random_uuid();  -- descendant of v_floor, must move with it
  v_event_id   uuid := gen_random_uuid();
  v_corr_id    uuid := gen_random_uuid();
  v_bldg_b_path  text;
  v_floor_path   text;
  v_room_path    text;
  v_event_count  integer;
  v_payload      jsonb;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'probe');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Probe Campus', v_ws, now());

  insert into property.locations (id, property_id, parent_id, name, type) values
    (v_bldg_a, v_prop, null,     'Building A', 'building'),
    (v_bldg_b, v_prop, null,     'Building B', 'building'),
    (v_floor,  v_prop, v_bldg_a, 'Floor 1',    'floor'),
    (v_room,   v_prop, v_floor,  'Room 101',   'room');

  perform property.reparent_location(
    p_location_id    => v_floor,
    p_new_parent_id  => v_bldg_b,
    p_actor_type     => 'person',
    p_actor_ref      => 'probe-actor',
    p_event_id       => v_event_id,
    p_correlation_id => v_corr_id
  );

  select path::text into v_bldg_b_path from property.locations where id = v_bldg_b;
  select path::text into v_floor_path from property.locations where id = v_floor;
  select path::text into v_room_path from property.locations where id = v_room;

  if v_floor_path <> (v_bldg_b_path || '.' || replace(v_floor::text, '-', '_')) then
    raise exception 'Moved location''s own path is wrong: %', v_floor_path;
  end if;
  if v_room_path <> (v_floor_path || '.' || replace(v_room::text, '-', '_')) then
    raise exception 'Descendant''s path did not cascade correctly: %', v_room_path;
  end if;
  if (select parent_id from property.locations where id = v_floor) <> v_bldg_b then
    raise exception 'parent_id was not updated on the moved location';
  end if;

  select count(*) into v_event_count
  from platform.events
  where event_id = v_event_id;
  if v_event_count <> 1 then
    raise exception 'Expected exactly 1 LocationTreeChanged event, found %', v_event_count;
  end if;

  select payload into v_payload
  from platform.events
  where event_id = v_event_id;
  if v_payload ->> 'affected_location_count' <> '2' then
    raise exception 'Event payload''s affected_location_count is wrong: %', v_payload ->> 'affected_location_count';
  end if;
  if (v_payload ->> 'old_parent_id')::uuid <> v_bldg_a then
    raise exception 'Event payload''s old_parent_id is wrong: %', v_payload ->> 'old_parent_id';
  end if;
  if (v_payload ->> 'new_parent_id')::uuid <> v_bldg_b then
    raise exception 'Event payload''s new_parent_id is wrong: %', v_payload ->> 'new_parent_id';
  end if;

  if not exists (
    select 1 from platform.events
    where event_id = v_event_id and event_type = 'location.location.tree_changed'
      and subject_type = 'location' and subject_id = v_floor
      and workspace_id = v_ws and correlation_id = v_corr_id
  ) then
    raise exception 'Event''s own identifying columns (type, subject, workspace, correlation) are wrong';
  end if;

  raise notice '1 · re-parenting a subtree cascades every descendant''s path correctly and emits exactly one correctly-shaped event, in the same transaction';
end;
$$;

rollback;

-- =========================================================================
-- 2 · A cycle is refused; a cross-property move is refused; a no-op re-parent writes
-- nothing

begin;

do $$
declare
  v_ws        uuid := gen_random_uuid();
  v_ws2       uuid := gen_random_uuid();
  v_prop      uuid := gen_random_uuid();
  v_prop2     uuid := gen_random_uuid();
  v_parent    uuid := gen_random_uuid();
  v_child     uuid := gen_random_uuid();
  v_other     uuid := gen_random_uuid();
  v_trapped   boolean;
  v_events_before bigint;
  v_events_after  bigint;
begin
  insert into workspace.workspaces (id, type, name) values
    (v_ws, 'personal', 'probe'), (v_ws2, 'personal', 'probe2');
  insert into property.properties (id, name, steward_workspace_id, steward_since) values
    (v_prop, 'Probe Property', v_ws, now()),
    (v_prop2, 'Other Property', v_ws2, now());
  insert into property.locations (id, property_id, parent_id, name, type) values
    (v_parent, v_prop, null,    'Parent', 'room'),
    (v_child,  v_prop, v_parent,'Child',  'room'),
    (v_other,  v_prop2, null,   'Other',  'room');

  -- Cycle: parent cannot be re-parented under its own child.
  v_trapped := false;
  begin
    perform property.reparent_location(v_parent, v_child, 'person', 'probe', gen_random_uuid(), gen_random_uuid());
  exception when others then
    v_trapped := true;
  end;
  if not v_trapped then
    raise exception 'A cycle (parent moved under its own child) was not rejected';
  end if;

  -- Cross-property: refused outright, not attempted.
  v_trapped := false;
  begin
    perform property.reparent_location(v_child, v_other, 'person', 'probe', gen_random_uuid(), gen_random_uuid());
  exception when others then
    v_trapped := true;
  end;
  if not v_trapped then
    raise exception 'A cross-property re-parent was not rejected';
  end if;

  -- No-op: same parent as already set. Must write no event.
  select count(*) into v_events_before from platform.events where subject_id = v_child;
  perform property.reparent_location(v_child, v_parent, 'person', 'probe', gen_random_uuid(), gen_random_uuid());
  select count(*) into v_events_after from platform.events where subject_id = v_child;
  if v_events_before <> v_events_after then
    raise exception 'A no-op re-parent (same parent) emitted an event — it should have changed nothing';
  end if;

  raise notice '2 · a cycle is rejected, a cross-property move is rejected, and a no-op re-parent emits nothing';
end;
$$;

rollback;

-- =========================================================================
-- 3 · Moving to top-level (null parent) produces a correct path under the same property

begin;

do $$
declare
  v_ws     uuid := gen_random_uuid();
  v_prop   uuid := gen_random_uuid();
  v_bldg   uuid := gen_random_uuid();
  v_floor  uuid := gen_random_uuid();
  v_prop_label text;
  v_floor_path text;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'probe');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Probe Property', v_ws, now());
  insert into property.locations (id, property_id, parent_id, name, type) values
    (v_bldg, v_prop, null, 'Building', 'building'),
    (v_floor, v_prop, v_bldg, 'Floor', 'floor');

  perform property.reparent_location(v_floor, null, 'person', 'probe', gen_random_uuid(), gen_random_uuid());

  v_prop_label := replace(v_prop::text, '-', '_');
  select path::text into v_floor_path from property.locations where id = v_floor;

  if v_floor_path <> (v_prop_label || '.' || replace(v_floor::text, '-', '_')) then
    raise exception 'Moving to top-level produced the wrong path: %', v_floor_path;
  end if;
  if (select parent_id from property.locations where id = v_floor) is not null then
    raise exception 'parent_id was not cleared on a move to top-level';
  end if;

  raise notice '3 · moving a location to top-level produces a correct path rooted directly at the property';
end;
$$;

rollback;

-- =========================================================================
-- 4 · Move Room UI slice — the CALLER-FACING contract (api.reparent_location() /
-- property.reparent_location_for_caller(), 0198, retired-destination check added by
-- 0211) with real impersonated sessions. Checks 1-3 above already prove
-- property.reparent_location() itself is correct; nothing above ever exercised the
-- permission-checking wrapper this UI slice is this function's own first real caller
-- of.

begin;

do $$
declare
  v_owner_auth        uuid := gen_random_uuid();
  v_stranger_auth     uuid := gen_random_uuid();
  v_owner_ref         uuid;
  v_stranger_ref      uuid;
  v_ws                uuid := gen_random_uuid();
  v_stranger_ws       uuid := gen_random_uuid();
  v_prop              uuid := gen_random_uuid();
  v_stranger_prop     uuid := gen_random_uuid();
  v_parent            uuid := gen_random_uuid();
  v_child             uuid := gen_random_uuid();
  v_retired           uuid := gen_random_uuid();
  v_stranger_room     uuid := gen_random_uuid();
  v_unknown_id        uuid := gen_random_uuid();
  v_expected_failure  boolean;
  v_events_before     bigint;
  v_events_after      bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reparent-caller-owner@example.test', '{}'::jsonb, now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reparent-caller-stranger@example.test', '{}'::jsonb, now(), now());

  select person_ref into v_owner_ref from identity.identities where auth_user_id = v_owner_auth;
  select person_ref into v_stranger_ref from identity.identities where auth_user_id = v_stranger_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_ws, 'personal', 'Reparent Caller Owner WS'),
    (v_stranger_ws, 'personal', 'Reparent Caller Stranger WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, created_at, updated_at) values
    (gen_random_uuid(), v_ws, v_owner_ref, 'owner', null, 'active', now(), now()),
    (gen_random_uuid(), v_stranger_ws, v_stranger_ref, 'owner', null, 'active', now(), now());

  insert into property.properties (id, name, steward_workspace_id, steward_since) values
    (v_prop, 'Reparent Caller Property', v_ws, now()),
    (v_stranger_prop, 'Reparent Caller Stranger Property', v_stranger_ws, now());

  insert into property.locations (id, property_id, parent_id, name, type) values
    (v_parent, v_prop, null, 'Parent', 'room'),
    (v_child, v_prop, v_parent, 'Child', 'room'),
    (v_stranger_room, v_stranger_prop, null, 'Stranger Room', 'room');

  insert into property.locations (id, property_id, parent_id, name, type, retired_at) values
    (v_retired, v_prop, null, 'Retired Room', 'room', now());

  -- 4a · A native member moves their own location through the real entry point
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.reparent_location(v_child, null, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  reset role;
  if (select parent_id from property.locations where id = v_child) is not null then
    raise exception '4a · a native member could not move their own location to top level through api.reparent_location()';
  end if;
  raise notice '4a · a native member moves their own location through the real caller-facing entry point';

  select count(*) into v_events_before from platform.events where subject_type = 'location' and subject_id = v_child;

  -- 4b · Moving beneath a retired location is refused
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.reparent_location(v_child, v_retired, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '4b · moving a location beneath a RETIRED one was accepted';
  end if;
  if (select parent_id from property.locations where id = v_child) = v_retired then
    raise exception '4b · the child''s parent_id was updated despite the retired-destination refusal';
  end if;
  raise notice '4b · moving beneath a retired location is refused (0211), with no partial path rewrite';

  -- 4c · An unknown destination is refused with the identical sqlstate as retired
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.reparent_location(v_child, v_unknown_id, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '4c · a wholly unknown destination id was accepted';
  end if;
  raise notice '4c · a wholly unknown destination fails with the identical sqlstate as a retired one (42501), non-enumerating';

  -- 4d · Cross-workspace: a stranger cannot move the owner's location at all, even to
  -- their own (real, active) room
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.reparent_location(v_child, v_stranger_room, gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text);
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '4d · a stranger moved a location they do not steward';
  end if;
  if (select parent_id from property.locations where id = v_child) = v_stranger_room then
    raise exception '4d · the child''s parent_id was updated despite the cross-workspace refusal';
  end if;
  raise notice '4d · a stranger with no membership in the location''s own property cannot move it at all';

  -- 4e · No NEW event was emitted by any of the three rejected attempts above (4b/4c/4d)
  -- -- each rejection happens inside the wrapper, before property.reparent_location() (the
  -- only place that ever calls platform.emit_event() for this event type) is reached.
  -- Compared against the count captured right after 4a's own real, successful move,
  -- which does legitimately own one real event for this same location.
  select count(*) into v_events_after from platform.events where subject_type = 'location' and subject_id = v_child;
  if v_events_after <> v_events_before then
    raise exception '4e · % new location.location.tree_changed event(s) exist for the child despite every attempted move since 4a being rejected', v_events_after - v_events_before;
  end if;
  raise notice '4e · no new event was emitted by any of the three rejected attempts (4b/4c/4d) -- each was refused before property.reparent_location() was ever reached';

  raise notice 'VERIFY_LOCATION_REPARENTING §4 (caller-facing contract): all checks passed';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_LOCATION_REPARENTING: all checks passed';
end;
$$;

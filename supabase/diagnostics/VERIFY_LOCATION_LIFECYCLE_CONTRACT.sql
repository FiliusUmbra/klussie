-- Verifies 0198_location_lifecycle_contract.sql with real data and real impersonated
-- sessions: an owner renames and moves their own room, a stranger cannot; retiring a
-- room is refused while it still has an active child room or an active asset placed in
-- it, succeeds once both are cleared, keeps the row (never deletes it), disappears from
-- the read path, and refuses a second retirement rather than silently no-op'ing.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LOCATION_LIFECYCLE_CONTRACT.sql

\set ON_ERROR_STOP on
begin;
do $$
declare
  v_owner_auth      uuid := gen_random_uuid();
  v_stranger_auth   uuid := gen_random_uuid();
  v_owner_ref       uuid;
  v_owner_ws        uuid := gen_random_uuid();
  v_stranger_ws     uuid := gen_random_uuid();
  v_property        uuid := gen_random_uuid();
  v_kitchen         uuid := gen_random_uuid();
  v_pantry          uuid := gen_random_uuid();
  v_bedroom         uuid := gen_random_uuid();
  v_asset           uuid := gen_random_uuid();
  v_count           integer;
  v_name            text;
  v_retired_at      timestamptz;
  v_expected_failure boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'homebuilder-owner@example.test', '{}'::jsonb, now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'homebuilder-stranger@example.test', '{}'::jsonb, now(), now());
  select person_ref into v_owner_ref from identity.identities where auth_user_id = v_owner_auth;

  insert into workspace.workspaces (id, type, name) values (v_owner_ws, 'personal', 'Home Builder Owner'), (v_stranger_ws, 'personal', 'Home Builder Stranger');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values
    (gen_random_uuid(), v_owner_ws, v_owner_ref, 'owner', 'active'),
    (gen_random_uuid(), v_stranger_ws, (select person_ref from identity.identities where auth_user_id = v_stranger_auth), 'owner', 'active');

  insert into property.properties (id, name, steward_workspace_id, steward_since) values (v_property, 'HB Property', v_owner_ws, now());
  insert into property.locations (id, property_id, name) values (v_kitchen, v_property, 'Kitchen');
  insert into property.locations (id, property_id, parent_id, name) values (v_pantry, v_property, v_kitchen, 'Pantry');
  insert into property.locations (id, property_id, name) values (v_bedroom, v_property, 'Bedroom');

  -- =========================================================================
  -- 1 · rename: positive (owner), negative (stranger)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.rename_location(v_kitchen, 'Keuken', gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  reset role;
  select name into v_name from property.locations where id = v_kitchen;
  if v_name <> 'Keuken' then raise exception '1a FAILED · rename did not persist, got %', v_name; end if;
  raise notice '1a · PASS: owner renames their own room';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.rename_location(v_kitchen, 'Hacked', gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text);
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '1b FAILED · a stranger renamed a room they do not steward'; end if;
  select name into v_name from property.locations where id = v_kitchen;
  if v_name <> 'Keuken' then raise exception '1b FAILED · the stranger''s rename landed anyway'; end if;
  raise notice '1b · PASS: a stranger cannot rename someone else''s room';

  -- =========================================================================
  -- 2 · retire: refused with an active child, refused with an active asset, succeeds
  -- once both are cleared

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.retire_location(v_kitchen, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  exception when object_not_in_prerequisite_state then v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception '2a FAILED · retiring a room with an active child location was allowed'; end if;
  raise notice '2a · PASS: refused while an active child room still exists';

  perform api.retire_location(v_pantry, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  reset role;

  insert into property.assets (id, property_id, location_id, name, lifecycle_state, source)
  values (v_asset, v_property, v_kitchen, 'Fridge', 'active', 'manual');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.retire_location(v_kitchen, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  exception when object_not_in_prerequisite_state then v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception '2b FAILED · retiring a room with an active asset in it was allowed'; end if;
  reset role;
  raise notice '2b · PASS: refused while an active asset is still placed in it';

  update property.assets set lifecycle_state = 'retired' where id = v_asset;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.retire_location(v_kitchen, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  reset role;

  select retired_at into v_retired_at from property.locations where id = v_kitchen;
  if v_retired_at is null then raise exception '2c FAILED · retiring the now-clear room did not set retired_at'; end if;
  raise notice '2c · PASS: retires cleanly once no active child or asset remains -- row kept, never deleted';

  select count(*) into v_count from property.locations where id in (v_kitchen, v_pantry);
  if v_count <> 2 then raise exception '2d FAILED · a retired room row was deleted, not kept'; end if;

  select count(*) into v_count from api.locations_for_property(v_property) where id = v_kitchen;
  if v_count <> 0 then raise exception '2e FAILED · a retired room still appears in the read path'; end if;
  raise notice '2e · PASS: a retired room disappears from the read path, without deleting the row';

  -- Retiring an already-retired room is refused, not a silent no-op.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.retire_location(v_kitchen, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  exception when object_not_in_prerequisite_state then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '2f FAILED · retiring an already-retired room did not raise'; end if;
  raise notice '2f · PASS: retiring an already-retired room is refused, not a silent no-op';

  -- =========================================================================
  -- 3 · move (reparent): positive under the caller's own property, negative for a
  -- stranger; the existing property.reparent_location() logic itself untouched

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.reparent_location(v_pantry, v_bedroom, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  reset role;

  select count(*) into v_count from property.locations where id = v_pantry and parent_id = v_bedroom;
  if v_count <> 1 then raise exception '3a FAILED · the room was not actually moved under its new parent'; end if;
  raise notice '3a · PASS: owner moves their own room under another';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.reparent_location(v_pantry, null, gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text);
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '3b FAILED · a stranger moved a room they do not steward'; end if;
  select count(*) into v_count from property.locations where id = v_pantry and parent_id = v_bedroom;
  if v_count <> 1 then raise exception '3b FAILED · the stranger''s move landed anyway'; end if;
  raise notice '3b · PASS: a stranger cannot move someone else''s room';

  raise notice 'VERIFY_LOCATION_LIFECYCLE_CONTRACT: all checks passed';
end;
$$;
rollback;

-- Verifies 0201_item_detail_contract.sql with real data and real impersonated sessions:
-- an owner moves their own item between two real rooms and can unplace it, a stranger
-- cannot move it or move it into a room outside its own property, the previous placement
-- closes into asset_placements exactly once per real move, and my_service_records(p_asset_id)
-- returns only the named asset's own records to an authorized caller and nothing to a
-- stranger.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ITEM_DETAIL_CONTRACT.sql

\set ON_ERROR_STOP on
begin;
do $$
declare
  v_owner_auth       uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_owner_ref        uuid;
  v_owner_ws         uuid := gen_random_uuid();
  v_stranger_ws      uuid := gen_random_uuid();
  v_property         uuid := gen_random_uuid();
  v_other_property   uuid := gen_random_uuid();
  v_kitchen          uuid := gen_random_uuid();
  v_garage           uuid := gen_random_uuid();
  v_foreign_room     uuid := gen_random_uuid();
  v_asset            uuid := gen_random_uuid();
  v_service_record   uuid := gen_random_uuid();
  v_other_asset_sr   uuid := gen_random_uuid();
  v_count            integer;
  v_location_id      uuid;
  v_placed_since     timestamptz;
  v_expected_failure boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'itemdetail-owner@example.test', '{}'::jsonb, now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'itemdetail-stranger@example.test', '{}'::jsonb, now(), now());
  select person_ref into v_owner_ref from identity.identities where auth_user_id = v_owner_auth;

  insert into workspace.workspaces (id, type, name) values (v_owner_ws, 'personal', 'ItemDetail Owner'), (v_stranger_ws, 'personal', 'ItemDetail Stranger');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values
    (gen_random_uuid(), v_owner_ws, v_owner_ref, 'owner', 'active'),
    (gen_random_uuid(), v_stranger_ws, (select person_ref from identity.identities where auth_user_id = v_stranger_auth), 'owner', 'active');

  insert into property.properties (id, name, steward_workspace_id, steward_since) values
    (v_property, 'ID Property', v_owner_ws, now()),
    (v_other_property, 'ID Stranger Property', v_stranger_ws, now());
  insert into property.locations (id, property_id, name) values (v_kitchen, v_property, 'Kitchen'), (v_garage, v_property, 'Garage');
  insert into property.locations (id, property_id, name) values (v_foreign_room, v_other_property, 'Foreign Room');
  insert into property.assets (id, property_id, location_id, name, lifecycle_state, source, placed_since)
  values (v_asset, v_property, v_kitchen, 'Washing machine', 'active', 'manual', now() - interval '30 days');

  -- =========================================================================
  -- 1 · move: positive (owner, kitchen -> garage), closes the prior placement exactly once

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.move_asset(v_asset, v_garage, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  reset role;

  select location_id, placed_since into v_location_id, v_placed_since from property.assets where id = v_asset;
  if v_location_id <> v_garage then raise exception '1a FAILED · asset did not move to the garage, got %', v_location_id; end if;
  if v_placed_since is null then raise exception '1a FAILED · placed_since was not refreshed'; end if;
  raise notice '1a · PASS: owner moves their own item to another room';

  select count(*) into v_count from property.asset_placements where asset_id = v_asset and location_id = v_kitchen;
  if v_count <> 1 then raise exception '1b FAILED · expected exactly one closed placement for the kitchen, got %', v_count; end if;
  raise notice '1b · PASS: the previous placement closed into asset_placements exactly once';

  -- =========================================================================
  -- 2 · unplace: positive (owner, garage -> null)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.move_asset(v_asset, null, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  reset role;

  select location_id, placed_since into v_location_id, v_placed_since from property.assets where id = v_asset;
  if v_location_id is not null then raise exception '2 FAILED · asset still has a location_id after unplacing'; end if;
  if v_placed_since is not null then raise exception '2 FAILED · placed_since was not cleared after unplacing'; end if;
  raise notice '2 · PASS: owner unplaces their own item (location_id null, allowed)';

  select count(*) into v_count from property.asset_placements where asset_id = v_asset and location_id = v_garage;
  if v_count <> 1 then raise exception '2b FAILED · expected exactly one closed placement for the garage, got %', v_count; end if;
  raise notice '2b · PASS: unplacing also closed the prior (garage) placement';

  -- =========================================================================
  -- 3 · a stranger cannot move someone else's item, and a room outside the item's own
  -- property is refused even for the real owner

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.move_asset(v_asset, v_kitchen, gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text);
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '3a FAILED · a stranger moved an item they do not steward'; end if;
  select location_id into v_location_id from property.assets where id = v_asset;
  if v_location_id is not null then raise exception '3a FAILED · the stranger''s move landed anyway'; end if;
  raise notice '3a · PASS: a stranger cannot move someone else''s item';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.move_asset(v_asset, v_foreign_room, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text);
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '3b FAILED · the owner moved their own item into a room outside its own property'; end if;
  raise notice '3b · PASS: even the real owner cannot move an item into a room from a different property';

  -- =========================================================================
  -- 4 · my_service_records(p_asset_id) — an owner sees only this asset's own records;
  -- a stranger sees none

  insert into work.service_records (id, property_id, asset_id, performing_workspace_id, performed_at, work_performed)
  values (v_service_record, v_property, v_asset, v_owner_ws, now(), 'Replaced the drain pump.');
  -- A second, unrelated record on the SAME property but a DIFFERENT (null) asset, proving
  -- the filter narrows rather than merely re-deriving "every record on this property."
  insert into work.service_records (id, property_id, asset_id, performing_workspace_id, performed_at, work_performed)
  values (v_other_asset_sr, v_property, null, v_owner_ws, now(), 'Unrelated boiler service.');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  select count(*) into v_count from api.my_service_records(v_owner_ws, v_asset);
  reset role;
  if v_count <> 1 then raise exception '4a FAILED · expected exactly 1 service record for this asset, got %', v_count; end if;
  raise notice '4a · PASS: my_service_records(p_asset_id) returns only this asset''s own record, not the unrelated one';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from api.my_service_records(v_stranger_ws, v_asset);
  reset role;
  if v_count <> 0 then raise exception '4b FAILED · a stranger''s own workspace saw another workspace''s asset service record'; end if;
  raise notice '4b · PASS: a stranger''s workspace sees nothing for an asset it has no relationship to';

  -- Existing workspace-wide call (no asset filter) still returns both records — the
  -- extension narrows, it does not replace.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  select count(*) into v_count from api.my_service_records(v_owner_ws);
  reset role;
  if v_count <> 2 then raise exception '4c FAILED · the unfiltered call regressed, expected 2 records, got %', v_count; end if;
  raise notice '4c · PASS: the existing unfiltered (workspace-wide) call is unchanged';

  raise notice 'VERIFY_ITEM_DETAIL_CONTRACT: all checks passed';
end;
$$;
rollback;

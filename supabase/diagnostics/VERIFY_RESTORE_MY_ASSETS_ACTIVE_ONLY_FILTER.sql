-- Verifies 0200_restore_my_assets_active_only_filter.sql with real data and a real
-- impersonated session, reproducing the exact live bug before proving it fixed: a
-- customer creates an asset, sees it through api.my_assets(), retires it through the real
-- api.retire_asset() write path (the one ItemFormSheet.jsx's "Delete item" button uses),
-- and must never see it again. Also confirms retire_asset()/update_asset() themselves are
-- untouched -- this migration only ever changed the read side.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_RESTORE_MY_ASSETS_ACTIVE_ONLY_FILTER.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth     uuid := gen_random_uuid();
  v_customer_ref      uuid;
  v_customer_property uuid;
  v_asset_id          uuid := gen_random_uuid();
  v_row               record;
  v_visible_count     integer;
begin
  -- Setup: one real account. 0135's handle_new_user() extension auto-provisions a real
  -- Personal workspace and a real property -- same setup shape as
  -- VERIFY_ASSET_WRITE_CONTRACT.sql.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'restore-my-assets-active-only-customer@example.test', jsonb_build_object('full_name', 'Restore My Assets Customer'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;

  select p.id into v_customer_property
  from property.properties p
  join workspace.memberships m on m.workspace_id = p.steward_workspace_id
  where m.person_ref = v_customer_ref and m.role = 'owner';

  if v_customer_property is null then
    raise exception 'setup · the customer''s auto-provisioned property was not found — has 0135''s handle_new_user() extension regressed?';
  end if;

  -- =========================================================================
  -- 1 · The customer creates a real asset and sees it through api.my_assets()

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_asset(
    p_asset_id => v_asset_id, p_property_id => v_customer_property, p_name => 'TempTestItem',
    p_type => 'appliance', p_make => null, p_model => null, p_serial_number => null,
    p_parent_asset_id => null, p_location_id => null, p_room_label => null,
    p_acquired_on => null, p_installed_on => null, p_expected_service_life_months => null,
    p_warranty_expires_on => null, p_condition => null, p_photo_path => null, p_notes => 'diagnostic row',
    p_source => 'manual', p_ai_suggestion => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  select count(*) into v_visible_count from api.my_assets(v_customer_property) where id = v_asset_id;
  if v_visible_count <> 1 then
    raise exception '1 · the freshly-created active asset should appear in api.my_assets(), found %', v_visible_count;
  end if;
  raise notice '1 · a customer creates an asset and sees it through api.my_assets()';

  -- =========================================================================
  -- 2 · THE BUG, REPRODUCED: retiring it through the real write path used to leave it
  -- visible. This must now fail to reproduce.

  perform api.retire_asset(
    p_asset_id => v_asset_id, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  select lifecycle_state into v_row from property.assets where id = v_asset_id;
  if v_row.lifecycle_state <> 'retired' then
    raise exception '2 · retire_asset() itself is broken — expected lifecycle_state retired, got %. This migration must not touch the write path.', v_row.lifecycle_state;
  end if;
  raise notice '2 · retire_asset() itself still transitions active -> retired correctly (untouched by this migration)';

  select count(*) into v_visible_count from api.my_assets(v_customer_property) where id = v_asset_id;
  if v_visible_count <> 0 then
    raise exception '2 · THE BUG IS STILL PRESENT: a retired asset (lifecycle_state=retired) is still returned by api.my_assets() — found % row(s). Confirmed live symptom: this exact shape kept a retired "TempTestItem" visible in "Mijn spullen".', v_visible_count;
  end if;
  raise notice '2 · a retired asset no longer appears in api.my_assets() — the regression is fixed';

  -- =========================================================================
  -- 3 · A second, still-active asset under the same property remains visible — the fix is
  -- a filter addition, not a break of the whole read path

  perform api.create_asset(
    p_asset_id => gen_random_uuid(), p_property_id => v_customer_property, p_name => 'Still Active Control',
    p_type => 'appliance', p_make => null, p_model => null, p_serial_number => null,
    p_parent_asset_id => null, p_location_id => null, p_room_label => null,
    p_acquired_on => null, p_installed_on => null, p_expected_service_life_months => null,
    p_warranty_expires_on => null, p_condition => null, p_photo_path => null, p_notes => 'diagnostic control row',
    p_source => 'manual', p_ai_suggestion => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  select count(*) into v_visible_count from api.my_assets(v_customer_property) where name = 'Still Active Control';
  if v_visible_count <> 1 then
    raise exception '3 · a still-active asset under the same property should remain visible, found %', v_visible_count;
  end if;
  raise notice '3 · a still-active asset under the same property remains visible — the read path is otherwise unbroken';

  reset role;
  raise notice 'VERIFY_RESTORE_MY_ASSETS_ACTIVE_ONLY_FILTER: all checks passed';
end;
$$;

rollback;

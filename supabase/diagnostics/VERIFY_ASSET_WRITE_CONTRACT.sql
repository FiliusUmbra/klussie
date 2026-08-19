-- Verifies 0139_asset_write_contract.sql (Platform Activation Slice 1, WP 1.4) with real
-- data and real impersonated sessions, not just structural assertions: a customer
-- creates, updates, retires and disposes their own asset through the real api.*
-- delegates, each transition landing a real property.asset.* event; a stranger with no
-- membership in that property's steward workspace is refused at every one of the same
-- four operations; and each lifecycle guard (retire only from active, dispose never
-- twice) actually holds.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ASSET_WRITE_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth    uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_customer_ref     uuid;
  v_customer_property uuid;
  v_asset_id         uuid := gen_random_uuid();
  v_row              record;
  v_event_count      integer;
  v_expected_failure boolean;
begin
  -- Setup: two real accounts. WP 1.0's handle_new_user() extension (0135) auto-provisions
  -- a real Personal workspace AND a real property for each — no manual workspace/property
  -- construction needed here, unlike VERIFY_WORKSPACE_LOOKUP.sql's diagnostic, which
  -- predates relying on that (its own target workspace was deliberately separate from its
  -- auto-provisioned one). This diagnostic uses the auto-provisioned property directly —
  -- the same shape a real signed-up customer's first asset creation will actually go
  -- through.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'asset-write-contract-customer@example.test', jsonb_build_object('full_name', 'Asset Write Contract Customer'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'asset-write-contract-stranger@example.test', jsonb_build_object('full_name', 'Asset Write Contract Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;

  select p.id into v_customer_property
  from property.properties p
  join workspace.memberships m on m.workspace_id = p.steward_workspace_id
  where m.person_ref = v_customer_ref and m.role = 'owner';

  if v_customer_property is null then
    raise exception 'setup · the customer''s auto-provisioned property was not found — has 0135''s handle_new_user() extension regressed?';
  end if;

  -- =========================================================================
  -- 1 · The customer creates an asset under their own property

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_asset(
    p_asset_id => v_asset_id, p_property_id => v_customer_property, p_name => 'Diagnostic Boiler',
    p_type => 'appliance', p_make => 'Vaillant', p_model => 'ecoTEC', p_serial_number => 'VLT-001',
    p_parent_asset_id => null, p_location_id => null, p_room_label => 'Utility room',
    p_acquired_on => '2024-01-15', p_installed_on => '2024-01-20', p_expected_service_life_months => 180,
    p_warranty_expires_on => '2029-01-20', p_condition => 'good', p_photo_path => null, p_notes => 'diagnostic row',
    p_source => 'manual', p_ai_suggestion => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select * into v_row from property.assets where id = v_asset_id;
  if v_row.id is null then
    raise exception '1 · the asset was not actually created';
  end if;
  if v_row.name <> 'Diagnostic Boiler' or v_row.lifecycle_state <> 'active' or v_row.source <> 'manual' then
    raise exception '1 · the created asset''s fields do not match what was sent: name=%, lifecycle_state=%, source=%', v_row.name, v_row.lifecycle_state, v_row.source;
  end if;

  select count(*) into v_event_count from platform.events
  where event_type = 'property.asset.created' and subject_id = v_asset_id;
  if v_event_count <> 1 then
    raise exception '1 · expected exactly 1 property.asset.created event, found %', v_event_count;
  end if;
  raise notice '1 · a customer creates a real asset under their own property, with a real event';

  -- =========================================================================
  -- 2 · The customer updates their own asset — descriptive fields change,
  -- lifecycle_state/source/location_id do not

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.update_asset(
    p_asset_id => v_asset_id, p_name => 'Diagnostic Boiler (serviced)', p_type => 'appliance',
    p_make => 'Vaillant', p_model => 'ecoTEC Plus', p_serial_number => 'VLT-001',
    p_parent_asset_id => null, p_room_label => 'Utility room', p_acquired_on => '2024-01-15',
    p_installed_on => '2024-01-20', p_expected_service_life_months => 180,
    p_warranty_expires_on => '2029-01-20', p_condition => 'excellent', p_photo_path => null,
    p_notes => 'serviced, diagnostic update',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select * into v_row from property.assets where id = v_asset_id;
  if v_row.model <> 'ecoTEC Plus' or v_row.condition <> 'excellent' then
    raise exception '2 · the update did not take effect: model=%, condition=%', v_row.model, v_row.condition;
  end if;
  if v_row.lifecycle_state <> 'active' or v_row.source <> 'manual' or v_row.location_id is not null then
    raise exception '2 · update_asset() touched a field it must never touch: lifecycle_state=%, source=%, location_id=%', v_row.lifecycle_state, v_row.source, v_row.location_id;
  end if;
  raise notice '2 · update_asset() changes descriptive fields and leaves lifecycle_state/source/location_id untouched';

  -- =========================================================================
  -- 3 · A stranger with no membership in the customer's steward workspace cannot create
  -- an asset under the customer's property

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_asset(
      p_asset_id => gen_random_uuid(), p_property_id => v_customer_property, p_name => 'Should not exist',
      p_type => null, p_make => null, p_model => null, p_serial_number => null,
      p_parent_asset_id => null, p_location_id => null, p_room_label => null,
      p_acquired_on => null, p_installed_on => null, p_expected_service_life_months => null,
      p_warranty_expires_on => null, p_condition => null, p_photo_path => null, p_notes => null,
      p_source => 'manual', p_ai_suggestion => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '3 · a stranger was able to create an asset under someone else''s property';
  end if;
  raise notice '3 · a stranger cannot create an asset under someone else''s property';

  -- =========================================================================
  -- 4 · A stranger cannot update the customer's own asset

  v_expected_failure := false;
  begin
    perform api.update_asset(
      p_asset_id => v_asset_id, p_name => 'Hijacked', p_type => null, p_make => null, p_model => null,
      p_serial_number => null, p_parent_asset_id => null, p_room_label => null, p_acquired_on => null,
      p_installed_on => null, p_expected_service_life_months => null, p_warranty_expires_on => null,
      p_condition => null, p_photo_path => null, p_notes => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '4 · a stranger was able to update someone else''s asset';
  end if;

  reset role;
  select name into v_row from property.assets where id = v_asset_id;
  if v_row.name = 'Hijacked' then
    raise exception '4 · the stranger''s update landed despite the exception';
  end if;
  raise notice '4 · a stranger cannot update someone else''s asset, and no partial write landed';

  -- =========================================================================
  -- 5 · The customer retires their own active asset

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.retire_asset(
    p_asset_id => v_asset_id, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select lifecycle_state into v_row from property.assets where id = v_asset_id;
  if v_row.lifecycle_state <> 'retired' then
    raise exception '5 · expected lifecycle_state retired, got %', v_row.lifecycle_state;
  end if;

  select count(*) into v_event_count from platform.events
  where event_type = 'property.asset.retired' and subject_id = v_asset_id;
  if v_event_count <> 1 then
    raise exception '5 · expected exactly 1 property.asset.retired event, found %', v_event_count;
  end if;
  raise notice '5 · a customer retires their own active asset, with a real event';

  -- =========================================================================
  -- 6 · Retiring an already-retired asset is rejected — the state guard actually holds

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.retire_asset(
      p_asset_id => v_asset_id, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_customer_auth::text
    );
  exception when sqlstate '55000' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '6 · retiring an already-retired asset was not rejected';
  end if;
  raise notice '6 · retiring an already-retired asset is rejected';

  -- =========================================================================
  -- 7 · The customer disposes the (now retired) asset — retired -> disposed is valid

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.dispose_asset(
    p_asset_id => v_asset_id, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select lifecycle_state into v_row from property.assets where id = v_asset_id;
  if v_row.lifecycle_state <> 'disposed' then
    raise exception '7 · expected lifecycle_state disposed, got %', v_row.lifecycle_state;
  end if;

  select count(*) into v_event_count from platform.events
  where event_type = 'property.asset.disposed' and subject_id = v_asset_id
    and payload ->> 'previousState' = 'retired';
  if v_event_count <> 1 then
    raise exception '7 · expected exactly 1 property.asset.disposed event with previousState=retired, found %', v_event_count;
  end if;
  raise notice '7 · a customer disposes their retired asset (retired -> disposed), with a real event carrying the previous state';

  -- =========================================================================
  -- 8 · Disposing an already-disposed asset is rejected

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.dispose_asset(
      p_asset_id => v_asset_id, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_customer_auth::text
    );
  exception when sqlstate '55000' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '8 · disposing an already-disposed asset was not rejected';
  end if;
  raise notice '8 · disposing an already-disposed asset is rejected';

  -- =========================================================================
  -- 9 · A stranger can retire or dispose nothing of the customer's, even a settled asset

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.retire_asset(
      p_asset_id => v_asset_id, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '9 · a stranger was able to call retire_asset on someone else''s asset';
  end if;
  raise notice '9 · a stranger is refused on every one of the four operations, even a settled asset';

  reset role;
  raise notice 'VERIFY_ASSET_WRITE_CONTRACT: all checks passed';
end;
$$;

rollback;

-- Verifies 0140_location_write_contract.sql (Platform Activation Slice 1, WP 1.5) with
-- real data and real impersonated sessions, not just structural assertions: a customer
-- creates a top-level location and a nested child under their own property, both landing
-- real property.location.created events with real paths from the existing trigger; and a
-- stranger is refused both a direct create AND the specific authorization-bypass shape
-- this migration's own header names — passing their OWN property_id alongside the
-- CUSTOMER's location as p_parent_id, hoping the authorization check trusts the
-- parameter instead of the parent's real property.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LOCATION_WRITE_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth      uuid := gen_random_uuid();
  v_stranger_auth      uuid := gen_random_uuid();
  v_customer_ref       uuid;
  v_stranger_ref       uuid;
  v_customer_property  uuid;
  v_stranger_property  uuid;
  v_top_location       uuid := gen_random_uuid();
  v_child_location     uuid := gen_random_uuid();
  v_row                record;
  v_event_count        integer;
  v_expected_failure   boolean;
begin
  -- Setup: two real accounts, each auto-provisioned a real Personal workspace and a real
  -- property by WP 1.0's handle_new_user() extension (0135) — the same reliance
  -- VERIFY_ASSET_WRITE_CONTRACT.sql already established.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'location-write-contract-customer@example.test', jsonb_build_object('full_name', 'Location Write Contract Customer'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'location-write-contract-stranger@example.test', jsonb_build_object('full_name', 'Location Write Contract Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;
  select i.person_ref into v_stranger_ref from identity.identities i where i.auth_user_id = v_stranger_auth;

  select p.id into v_customer_property
  from property.properties p join workspace.memberships m on m.workspace_id = p.steward_workspace_id
  where m.person_ref = v_customer_ref and m.role = 'owner';

  select p.id into v_stranger_property
  from property.properties p join workspace.memberships m on m.workspace_id = p.steward_workspace_id
  where m.person_ref = v_stranger_ref and m.role = 'owner';

  if v_customer_property is null or v_stranger_property is null then
    raise exception 'setup · an auto-provisioned property was not found — has 0135''s handle_new_user() extension regressed?';
  end if;

  -- =========================================================================
  -- 1 · The customer creates a top-level location under their own property

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_location(
    p_location_id => v_top_location, p_property_id => v_customer_property, p_parent_id => null,
    p_name => 'Ground Floor', p_type => 'floor',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select * into v_row from property.locations where id = v_top_location;
  if v_row.id is null then
    raise exception '1 · the location was not actually created';
  end if;
  if v_row.property_id <> v_customer_property or v_row.parent_id is not null then
    raise exception '1 · the created location''s property_id/parent_id are wrong: property_id=%, parent_id=%', v_row.property_id, v_row.parent_id;
  end if;
  if extensions.nlevel(v_row.path) <> 2 then
    raise exception '1 · expected a 2-segment top-level path (property, location), got % segments', extensions.nlevel(v_row.path);
  end if;

  select count(*) into v_event_count from platform.events
  where event_type = 'property.location.created' and subject_id = v_top_location;
  if v_event_count <> 1 then
    raise exception '1 · expected exactly 1 property.location.created event, found %', v_event_count;
  end if;
  raise notice '1 · a customer creates a real top-level location under their own property, with a real path and a real event';

  -- =========================================================================
  -- 2 · The customer creates a nested child under it — the trigger computes the deeper
  -- path, property_id is inherited correctly

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_location(
    p_location_id => v_child_location, p_property_id => v_customer_property, p_parent_id => v_top_location,
    p_name => 'Kitchen', p_type => 'kitchen',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select * into v_row from property.locations where id = v_child_location;
  if v_row.property_id <> v_customer_property then
    raise exception '2 · the child''s property_id does not match its parent''s: got %', v_row.property_id;
  end if;
  if extensions.nlevel(v_row.path) <> 3 or not (v_row.path OPERATOR(extensions.<@) (select path from property.locations where id = v_top_location)) then
    raise exception '2 · the child''s path is not correctly nested under its parent';
  end if;
  raise notice '2 · a customer creates a nested child location, with the trigger''s own path nesting it correctly';

  -- =========================================================================
  -- 3 · A stranger cannot create a location directly under the customer's property

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_location(
      p_location_id => gen_random_uuid(), p_property_id => v_customer_property, p_parent_id => null,
      p_name => 'Should not exist', p_type => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '3 · a stranger was able to create a location directly under someone else''s property';
  end if;
  raise notice '3 · a stranger cannot create a location directly under someone else''s property';

  -- =========================================================================
  -- 4 · THE BYPASS ATTEMPT this migration's own header names: a stranger passes their
  -- OWN property_id but the CUSTOMER's location as p_parent_id, hoping the check trusts
  -- the parameter instead of resolving the real target from the parent

  v_expected_failure := false;
  begin
    perform api.create_location(
      p_location_id => gen_random_uuid(), p_property_id => v_stranger_property, p_parent_id => v_top_location,
      p_name => 'Bypass attempt', p_type => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '4 · THE AUTHORIZATION BYPASS THIS MIGRATION WAS WRITTEN TO PREVENT SUCCEEDED — a stranger created a location under the customer''s tree by supplying their own property_id alongside the customer''s location as parent';
  end if;

  reset role;
  select count(*) into v_event_count from property.locations where name = 'Bypass attempt';
  if v_event_count <> 0 then
    raise exception '4 · the bypass attempt''s row exists despite the exception — no partial write should ever land';
  end if;
  raise notice '4 · the parent-property bypass is refused, and no partial write lands';

  reset role;
  raise notice 'VERIFY_LOCATION_WRITE_CONTRACT: all checks passed';
end;
$$;

rollback;

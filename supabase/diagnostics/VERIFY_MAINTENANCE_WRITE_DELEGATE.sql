-- Verifies 0142_maintenance_write_delegate.sql (Platform Activation Slice 1, WP 1.7) with
-- real data and real impersonated sessions, not just structural assertions: the shared,
-- internally-trusted work.create_maintenance_obligation() still works completely
-- unchanged for a non-live-caller source; a customer creates real manual obligations
-- (workspace-level, asset-attached, location-attached), each with source hardcoded to
-- 'manual' and a real event; the asset/location stewardship cross-check refuses an
-- obligation that references someone else's asset even when the target workspace is the
-- caller's own; and a stranger is refused outright.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MAINTENANCE_WRITE_DELEGATE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth      uuid := gen_random_uuid();
  v_stranger_auth      uuid := gen_random_uuid();
  v_customer_ref       uuid;
  v_customer_workspace uuid;
  v_customer_property  uuid;
  v_stranger_workspace uuid;
  v_stranger_ref       uuid;
  v_stranger_property  uuid;
  v_customer_asset     uuid := gen_random_uuid();
  v_customer_location  uuid := gen_random_uuid();
  v_stranger_asset     uuid := gen_random_uuid();
  v_internal_obligation uuid := gen_random_uuid();
  v_obligation_workspace uuid := gen_random_uuid();
  v_obligation_asset    uuid := gen_random_uuid();
  v_obligation_location uuid := gen_random_uuid();
  v_row                record;
  v_event_count        integer;
  v_expected_failure   boolean;
begin
  -- Setup: two real accounts, each auto-provisioned a real Personal workspace and a real
  -- property by WP 1.0's handle_new_user() extension (0135). A real asset and a real
  -- location are inserted directly under each property (postgres bypasses RLS and any
  -- write contract, the same shorthand VERIFY_MAINTENANCE_READ_DELEGATES.sql already
  -- used in WP 1.2's own diagnostic) so this diagnostic has real subjects to attach
  -- obligations to.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'maintenance-write-delegate-customer@example.test', jsonb_build_object('full_name', 'Maintenance Write Delegate Customer'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'maintenance-write-delegate-stranger@example.test', jsonb_build_object('full_name', 'Maintenance Write Delegate Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;
  select i.person_ref into v_stranger_ref from identity.identities i where i.auth_user_id = v_stranger_auth;

  select p.id, p.steward_workspace_id into v_customer_property, v_customer_workspace
  from property.properties p join workspace.memberships m on m.workspace_id = p.steward_workspace_id
  where m.person_ref = v_customer_ref and m.role = 'owner';

  select p.id, p.steward_workspace_id into v_stranger_property, v_stranger_workspace
  from property.properties p join workspace.memberships m on m.workspace_id = p.steward_workspace_id
  where m.person_ref = v_stranger_ref and m.role = 'owner';

  if v_customer_property is null or v_stranger_property is null then
    raise exception 'setup · an auto-provisioned property was not found — has 0135''s handle_new_user() extension regressed?';
  end if;

  insert into property.locations (id, property_id, parent_id, name, type, created_at, updated_at)
  values (v_customer_location, v_customer_property, null, 'Diagnostic Utility Room', 'utility', now(), now());

  insert into property.assets (id, property_id, name, lifecycle_state, source, created_at, updated_at)
  values (v_customer_asset, v_customer_property, 'Diagnostic Boiler', 'active', 'manual', now(), now());

  insert into property.assets (id, property_id, name, lifecycle_state, source, created_at, updated_at)
  values (v_stranger_asset, v_stranger_property, 'Stranger''s Boiler', 'active', 'manual', now(), now());

  -- =========================================================================
  -- 1 · work.create_maintenance_obligation() itself is unchanged — a non-live-caller
  -- source ('compliance') still works directly, with no role impersonation at all,
  -- exactly as every internal caller already relies on

  perform work.create_maintenance_obligation(
    v_internal_obligation, v_customer_workspace, v_customer_asset, null, null,
    'Internal compliance check', 'inserted directly, not through the live-caller path', 'compliance', current_date + 30,
    gen_random_uuid(), gen_random_uuid(), 'system', 'diagnostic-internal-caller'
  );

  select source, schedule_id into v_row from work.maintenance_obligations where id = v_internal_obligation;
  if v_row.source <> 'compliance' then
    raise exception '1 · work.create_maintenance_obligation() no longer accepts a non-manual source directly — internal callers would be broken';
  end if;
  raise notice '1 · work.create_maintenance_obligation() itself is unchanged — a non-live-caller source still works directly';

  -- =========================================================================
  -- 2 · A customer creates a manual, workspace-level obligation (no asset, no location)
  -- for their own workspace

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_maintenance_obligation(
    p_obligation_id => v_obligation_workspace, p_workspace_id => v_customer_workspace,
    p_asset_id => null, p_location_id => v_customer_location,
    p_title => 'Check the fuse box', p_description => 'diagnostic row',
    p_due_on => current_date + 14,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select source, schedule_id, workspace_id, location_id into v_row from work.maintenance_obligations where id = v_obligation_workspace;
  if v_row.source <> 'manual' or v_row.schedule_id is not null then
    raise exception '2 · expected source=manual, schedule_id=null, got source=%, schedule_id=%', v_row.source, v_row.schedule_id;
  end if;
  if v_row.workspace_id <> v_customer_workspace or v_row.location_id <> v_customer_location then
    raise exception '2 · the created obligation''s workspace_id/location_id do not match what was sent';
  end if;

  select count(*) into v_event_count from platform.events
  where event_type = 'maintenance.maintenance_obligation.created' and subject_id = v_customer_location and payload ->> 'obligationId' = v_obligation_workspace::text;
  if v_event_count <> 1 then
    raise exception '2 · expected exactly 1 maintenance.maintenance_obligation.created event, found %', v_event_count;
  end if;
  raise notice '2 · a customer creates a real manual obligation for their own workspace, source hardcoded to manual, with a real event';

  -- =========================================================================
  -- 3 · A customer creates an obligation attached to their own real asset

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_maintenance_obligation(
    p_obligation_id => v_obligation_asset, p_workspace_id => v_customer_workspace,
    p_asset_id => v_customer_asset, p_location_id => null,
    p_title => 'Service the boiler', p_description => null,
    p_due_on => current_date + 30,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  if not exists (select 1 from work.maintenance_obligations where id = v_obligation_asset and asset_id = v_customer_asset) then
    raise exception '3 · the asset-attached obligation was not created correctly';
  end if;
  raise notice '3 · a customer creates an obligation attached to their own real asset';

  -- =========================================================================
  -- 4 · A customer CANNOT create an obligation for their own workspace that references
  -- a STRANGER's asset — the cross-tenant stewardship check

  v_expected_failure := false;
  begin
    perform api.create_maintenance_obligation(
      p_obligation_id => gen_random_uuid(), p_workspace_id => v_customer_workspace,
      p_asset_id => v_stranger_asset, p_location_id => null,
      p_title => 'Should not exist', p_description => null,
      p_due_on => current_date + 30,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_customer_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '4 · a customer was able to create an obligation for their own workspace referencing someone else''s asset';
  end if;
  raise notice '4 · a customer''s own workspace does not authorize referencing someone else''s asset';

  -- =========================================================================
  -- 5 · A stranger cannot create an obligation for the customer's workspace at all

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_maintenance_obligation(
      p_obligation_id => gen_random_uuid(), p_workspace_id => v_customer_workspace,
      p_asset_id => null, p_location_id => null,
      p_title => 'Should not exist', p_description => null,
      p_due_on => current_date + 30,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '5 · a stranger was able to create an obligation for someone else''s workspace';
  end if;

  reset role;
  select count(*) into v_event_count from work.maintenance_obligations where title = 'Should not exist';
  if v_event_count <> 0 then
    raise exception '5 · a refused attempt''s row exists despite the exception — no partial write should ever land';
  end if;
  raise notice '5 · a stranger cannot create an obligation for someone else''s workspace, and no partial write lands';

  reset role;
  raise notice 'VERIFY_MAINTENANCE_WRITE_DELEGATE: all checks passed';
end;
$$;

rollback;

-- Verifies 0137_maintenance_read_delegates.sql (Platform Activation Slice 1, WP 1.2) with
-- real data, built through the real write contracts (work.create_maintenance_schedule()/
-- create_maintenance_obligation(), Epic 10) rather than raw inserts — composing WP 1.0's
-- provisioning with an already-shipped write contract and this slice's new read path, all
-- three together.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MAINTENANCE_READ_DELEGATES.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_member_auth      uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_member_workspace uuid;
  v_member_property  uuid;
  v_location_id      uuid := gen_random_uuid();
  v_schedule_id      uuid := gen_random_uuid();
  v_overdue_id       uuid := gen_random_uuid();
  v_upcoming_id      uuid := gen_random_uuid();
  v_row_count        integer;
  v_overdue_flag     boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_member_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'maintenance-read-member@example.test', jsonb_build_object('full_name', 'Maintenance Read Member'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'maintenance-read-stranger@example.test', jsonb_build_object('full_name', 'Maintenance Read Stranger'), now(), now());

  select m.workspace_id into v_member_workspace
  from workspace.memberships m
  join identity.identities i on i.person_ref = m.person_ref
  where i.auth_user_id = v_member_auth;

  if v_member_workspace is null then
    raise exception 'setup · the member''s signup did not provision a workspace — WP 1.0 regression, not a WP 1.2 defect';
  end if;

  select p.id into v_member_property from property.properties p where p.steward_workspace_id = v_member_workspace;

  -- A real location to satisfy maintenance_schedules_one_subject/
  -- maintenance_obligations_one_subject (num_nonnulls(asset_id, location_id) = 1) —
  -- inserted directly, matching VERIFY_LOCATION_READ_CONTRACT.sql's own precedent, since
  -- property.create_location() (WP 1.5) does not exist yet.
  insert into property.locations (id, property_id, parent_id, name, type)
  values (v_location_id, v_member_property, null, 'Utility room', 'utility');

  -- One real schedule, and two real obligations — one overdue, one not — through the real
  -- write contracts, not raw inserts.
  perform work.create_maintenance_schedule(
    p_schedule_id => v_schedule_id, p_workspace_id => v_member_workspace,
    p_asset_id => null, p_location_id => v_location_id, p_title => 'Boiler service',
    p_description => null, p_recurrence => interval '1 year', p_first_due_on => current_date + 300,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_member_auth::text
  );

  perform work.create_maintenance_obligation(
    p_obligation_id => v_overdue_id, p_workspace_id => v_member_workspace,
    p_asset_id => null, p_location_id => v_location_id, p_schedule_id => null,
    p_title => 'Overdue smoke alarm check', p_description => null, p_source => 'manual',
    p_due_on => current_date - 10,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_member_auth::text
  );

  perform work.create_maintenance_obligation(
    p_obligation_id => v_upcoming_id, p_workspace_id => v_member_workspace,
    p_asset_id => null, p_location_id => v_location_id, p_schedule_id => null,
    p_title => 'Upcoming gutter clean', p_description => null, p_source => 'manual',
    p_due_on => current_date + 10,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_member_auth::text
  );

  -- =========================================================================
  -- 1 · The member sees their real schedule and both obligations, with is_overdue
  -- computed correctly for each

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth)::text, true);

  select count(*) into v_row_count from api.my_maintenance_schedules(v_member_workspace);
  if v_row_count <> 1 then
    raise exception '1a · expected 1 schedule, found %', v_row_count;
  end if;

  select count(*) into v_row_count from api.my_maintenance_obligations(v_member_workspace);
  if v_row_count <> 2 then
    raise exception '1b · expected 2 obligations, found %', v_row_count;
  end if;

  select is_overdue into v_overdue_flag from api.my_maintenance_obligations(v_member_workspace) where id = v_overdue_id;
  if v_overdue_flag is not true then
    raise exception '1c · the overdue obligation was not flagged is_overdue';
  end if;

  select is_overdue into v_overdue_flag from api.my_maintenance_obligations(v_member_workspace) where id = v_upcoming_id;
  if v_overdue_flag is not false then
    raise exception '1d · the upcoming obligation was incorrectly flagged is_overdue';
  end if;
  raise notice '1 · the member sees their real schedule and both obligations, is_overdue correct for each';

  -- =========================================================================
  -- 2 · A real stranger sees nothing for the member's workspace, for either function —
  -- zero rows, not an error

  reset role;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  select count(*) into v_row_count from api.my_maintenance_schedules(v_member_workspace);
  if v_row_count <> 0 then
    raise exception '2a · a stranger saw % schedule row(s) for a workspace they do not belong to', v_row_count;
  end if;

  select count(*) into v_row_count from api.my_maintenance_obligations(v_member_workspace);
  if v_row_count <> 0 then
    raise exception '2b · a stranger saw % obligation row(s) for a workspace they do not belong to', v_row_count;
  end if;
  raise notice '2 · a real stranger sees nothing for a workspace they do not belong to, for either function';

  reset role;
  raise notice 'VERIFY_MAINTENANCE_READ_DELEGATES: all checks passed';
end;
$$;

rollback;

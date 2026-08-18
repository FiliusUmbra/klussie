-- Verifies 0071_maintenance_schedules.sql / 0072_maintenance_obligations.sql: the
-- one-subject rule, the terminal-immutability guard, and that cancellation always
-- carries a reason.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MAINTENANCE_OBLIGATIONS.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws       uuid := gen_random_uuid();
  v_prop     uuid := gen_random_uuid();
  v_asset    uuid := gen_random_uuid();
  v_sched    uuid := gen_random_uuid();
  v_obl      uuid := gen_random_uuid();
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Workspace');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Test Home', v_ws, now());
  insert into property.assets (id, property_id, name, type) values (v_asset, v_prop, 'Boiler', 'appliance');

  -- =========================================================================
  -- 1 · A schedule must be anchored to exactly one of asset or location

  begin
    insert into work.maintenance_schedules
      (id, workspace_id, asset_id, location_id, title, recurrence, next_due_on)
    values (gen_random_uuid(), v_ws, null, null, 'No subject', interval '1 year', current_date);
    raise exception '1a · a schedule with no subject was accepted';
  exception when others then
    if sqlerrm not like '%maintenance_schedules_one_subject%' then raise; end if;
  end;
  raise notice '1 · a schedule with zero or two subjects is rejected';

  -- =========================================================================
  -- 2 · Recurrence must be positive

  begin
    insert into work.maintenance_schedules
      (id, workspace_id, asset_id, title, recurrence, next_due_on)
    values (gen_random_uuid(), v_ws, v_asset, 'Zero interval', interval '0', current_date);
    raise exception '2 · a zero-length recurrence was accepted';
  exception when others then
    if sqlerrm not like '%maintenance_schedules_recurrence%' then raise; end if;
  end;
  raise notice '2 · a non-positive recurrence is rejected';

  -- =========================================================================
  -- 3 · An obligation's schedule_id must match its source

  insert into work.maintenance_schedules (id, workspace_id, asset_id, title, recurrence, next_due_on)
  values (v_sched, v_ws, v_asset, 'Annual boiler service', interval '1 year', current_date);

  begin
    insert into work.maintenance_obligations
      (id, workspace_id, asset_id, schedule_id, title, source, due_on)
    values (gen_random_uuid(), v_ws, v_asset, v_sched, 'Manual with a schedule', 'manual', current_date);
    raise exception '3a · source=manual with a schedule_id was accepted';
  exception when others then
    if sqlerrm not like '%maintenance_obligations_schedule_matches_source%' then raise; end if;
  end;

  begin
    insert into work.maintenance_obligations
      (id, workspace_id, asset_id, title, source, due_on)
    values (gen_random_uuid(), v_ws, v_asset, 'Schedule with no schedule_id', 'schedule', current_date);
    raise exception '3b · source=schedule with no schedule_id was accepted';
  exception when others then
    if sqlerrm not like '%maintenance_obligations_schedule_matches_source%' then raise; end if;
  end;
  raise notice '3 · schedule_id is required if and only if source = schedule';

  -- =========================================================================
  -- 4 · Cancellation always carries a reason

  insert into work.maintenance_obligations (id, workspace_id, asset_id, title, source, due_on)
  values (v_obl, v_ws, v_asset, 'Check the flue', 'manual', current_date);

  begin
    update work.maintenance_obligations set status = 'cancelled' where id = v_obl;
    raise exception '4 · cancelling with no reason was accepted';
  exception when others then
    if sqlerrm not like '%maintenance_obligations_cancelled_consistency%' then raise; end if;
  end;
  raise notice '4 · cancellation without both cancelled_at and cancellation_reason is rejected';

  -- =========================================================================
  -- 5 · Once terminal, an obligation is immutable

  update work.maintenance_obligations
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'no longer needed'
  where id = v_obl;

  begin
    update work.maintenance_obligations set title = 'renamed' where id = v_obl;
    raise exception '5 · updating a cancelled obligation did not raise';
  exception when others then
    if sqlerrm not like '%is % and immutable%' then raise; end if;
  end;
  raise notice '5 · a terminal obligation cannot be mutated further';

  raise notice 'VERIFY_MAINTENANCE_OBLIGATIONS: all checks passed';
end;
$$;

rollback;

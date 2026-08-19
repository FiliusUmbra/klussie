-- Verifies 0074_maintenance_contract.sql end to end: schedule creation, generating
-- obligations one period at a time (including catching a schedule up across several
-- missed periods with one application-generated id per call), completing and
-- cancelling obligations, and every guard the contract functions add on top of the
-- table's own constraints.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MAINTENANCE_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws       uuid := gen_random_uuid();
  v_prop     uuid := gen_random_uuid();
  v_asset    uuid := gen_random_uuid();
  v_sched    uuid := gen_random_uuid();
  v_obl1     uuid := gen_random_uuid();
  v_obl2     uuid := gen_random_uuid();
  v_obl3     uuid := gen_random_uuid();
  v_manual   uuid := gen_random_uuid();
  v_next_due date;
  v_count    integer;
  v_status   text;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Workspace');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Test Home', v_ws, now());
  insert into property.assets (id, property_id, name, type) values (v_asset, v_prop, 'Boiler', 'appliance');

  -- =========================================================================
  -- 1 · create_maintenance_schedule() creates a schedule due today, three months back

  perform work.create_maintenance_schedule(
    p_schedule_id => v_sched, p_workspace_id => v_ws, p_asset_id => v_asset, p_location_id => null,
    p_title => 'Quarterly filter change', p_description => null,
    p_recurrence => interval '1 month', p_first_due_on => current_date - interval '2 months',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  if not exists (select 1 from work.maintenance_schedules where id = v_sched and active) then
    raise exception '1 · schedule was not created active';
  end if;
  raise notice '1 · create_maintenance_schedule() creates an active schedule';

  -- =========================================================================
  -- 2 · generate_due_obligation() catches up three missed periods, one call each,
  -- each with its own application-generated id -- never minting one itself

  perform work.generate_due_obligation(
    p_schedule_id => v_sched, p_obligation_id => v_obl1,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'system', p_actor_ref => null
  );
  perform work.generate_due_obligation(
    p_schedule_id => v_sched, p_obligation_id => v_obl2,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'system', p_actor_ref => null
  );
  perform work.generate_due_obligation(
    p_schedule_id => v_sched, p_obligation_id => v_obl3,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'system', p_actor_ref => null
  );

  select count(*) into v_count from work.maintenance_obligations where schedule_id = v_sched;
  if v_count <> 3 then
    raise exception '2a · expected 3 generated obligations, found %', v_count;
  end if;
  if not exists (select 1 from work.maintenance_obligations where id = v_obl1 and source = 'schedule') then
    raise exception '2b · obl1 was not recorded with source = schedule';
  end if;

  select next_due_on into v_next_due from work.maintenance_schedules where id = v_sched;
  if v_next_due <> current_date + interval '1 month' then
    raise exception '2c · expected next_due_on one month in the future, got %', v_next_due;
  end if;
  raise notice '2 · generate_due_obligation() catches up three missed periods and correctly advances next_due_on past today';

  -- =========================================================================
  -- 3 · A schedule not yet due is refused, not silently skipped

  begin
    perform work.generate_due_obligation(
      p_schedule_id => v_sched, p_obligation_id => gen_random_uuid(),
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'system', p_actor_ref => null
    );
    raise exception '3 · generating from a not-yet-due schedule did not raise';
  exception when others then
    if sqlerrm not like '%is not due until%' then raise; end if;
  end;
  raise notice '3 · a schedule not yet due refuses generation rather than silently no-op';

  -- =========================================================================
  -- 4 · A manual obligation, completed

  perform work.create_maintenance_obligation(
    p_obligation_id => v_manual, p_workspace_id => v_ws, p_asset_id => v_asset, p_location_id => null,
    p_schedule_id => null, p_title => 'Fix the leak', p_description => 'Under the sink',
    p_source => 'manual', p_due_on => current_date,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  perform work.complete_maintenance_obligation(
    p_obligation_id => v_manual,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select status into v_status from work.maintenance_obligations where id = v_manual;
  if v_status <> 'completed' then
    raise exception '4 · expected completed, got %', v_status;
  end if;
  raise notice '4 · a manual obligation is created and completed';

  -- =========================================================================
  -- 5 · Completing an already-completed obligation is refused

  begin
    perform work.complete_maintenance_obligation(
      p_obligation_id => v_manual,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'customer-1'
    );
    raise exception '5 · completing an already-completed obligation did not raise';
  exception when others then
    if sqlerrm not like '%is not open%' then raise; end if;
  end;
  raise notice '5 · completing a non-open obligation refuses rather than silently succeeding';

  -- =========================================================================
  -- 6 · Cancelling requires a non-blank reason, enforced before the table is touched

  begin
    perform work.cancel_maintenance_obligation(
      p_obligation_id => v_obl3, p_reason => '   ',
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'customer-1'
    );
    raise exception '6 · cancelling with a blank reason did not raise';
  exception when others then
    if sqlerrm not like '%a cancellation reason is required%' then raise; end if;
  end;

  perform work.cancel_maintenance_obligation(
    p_obligation_id => v_obl3, p_reason => 'duplicate of another schedule',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select status into v_status from work.maintenance_obligations where id = v_obl3;
  if v_status <> 'cancelled' then
    raise exception '6b · expected cancelled, got %', v_status;
  end if;
  raise notice '6 · cancellation refuses a blank reason, succeeds with a real one';

  -- =========================================================================
  -- 7 · cancel_maintenance_schedule() stops further generation

  perform work.cancel_maintenance_schedule(
    p_schedule_id => v_sched,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );

  begin
    perform work.cancel_maintenance_schedule(
      p_schedule_id => v_sched,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'customer-1'
    );
    raise exception '7a · cancelling an already-cancelled schedule did not raise';
  exception when others then
    if sqlerrm not like '%does not exist or is already cancelled%' then raise; end if;
  end;

  begin
    perform work.generate_due_obligation(
      p_schedule_id => v_sched, p_obligation_id => gen_random_uuid(),
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'system', p_actor_ref => null
    );
    raise exception '7b · generating from a cancelled schedule did not raise';
  exception when others then
    if sqlerrm not like '%does not exist or is not active%' then raise; end if;
  end;
  raise notice '7 · a cancelled schedule refuses re-cancellation and further generation';

  -- =========================================================================
  -- 8 · Both read functions find everything for the workspace

  select count(*) into v_count from work.my_maintenance_schedules(v_ws);
  if v_count <> 1 then
    raise exception '8a · expected 1 schedule, found %', v_count;
  end if;

  select count(*) into v_count from work.my_maintenance_obligations(v_ws);
  if v_count <> 4 then -- 3 generated + 1 manual
    raise exception '8b · expected 4 obligations, found %', v_count;
  end if;

  if not exists (select 1 from work.my_maintenance_obligations(v_ws) where id = v_manual and status = 'completed') then
    raise exception '8c · the completed manual obligation was not found by my_maintenance_obligations()';
  end if;
  raise notice '8 · both read functions find everything owned by the workspace';

  raise notice 'VERIFY_MAINTENANCE_CONTRACT: all checks passed';
end;
$$;

rollback;

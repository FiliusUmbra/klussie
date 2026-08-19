-- Verifies 0077_capability_grants.sql / 0079_capability_contract.sql end to end: grant
-- and withdraw, the dependency refusal on both sides, the already-held/not-held guards,
-- and that the append-only history is genuinely append-only.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_CAPABILITY_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws     uuid := gen_random_uuid();
  v_held   boolean;
  v_count  integer;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'business', 'Test Workspace');

  -- =========================================================================
  -- 1 · Granting a capability whose dependency is missing is refused, not auto-granted

  begin
    perform workspace.grant_capability(
      p_grant_id => gen_random_uuid(), p_history_id => gen_random_uuid(),
      p_workspace_id => v_ws, p_capability_key => 'preventive_maintenance', p_source => 'operator',
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'operator-1'
    );
    raise exception '1 · granting preventive_maintenance with no dependency held did not raise';
  exception when others then
    if sqlerrm not like '%requires%first%' then raise; end if;
  end;

  select count(*) into v_count from workspace.capability_grants where workspace_id = v_ws;
  if v_count <> 0 then
    raise exception '1b · a refused grant left % row(s) behind — it must auto-grant nothing', v_count;
  end if;
  raise notice '1 · granting a capability with a missing dependency refuses and grants nothing at all';

  -- =========================================================================
  -- 2 · Granting the dependency chain in order succeeds

  perform workspace.grant_capability(
    p_grant_id => gen_random_uuid(), p_history_id => gen_random_uuid(),
    p_workspace_id => v_ws, p_capability_key => 'property_management', p_source => 'preset',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'operator-1'
  );
  perform workspace.grant_capability(
    p_grant_id => gen_random_uuid(), p_history_id => gen_random_uuid(),
    p_workspace_id => v_ws, p_capability_key => 'asset_management', p_source => 'preset',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'operator-1'
  );
  perform workspace.grant_capability(
    p_grant_id => gen_random_uuid(), p_history_id => gen_random_uuid(),
    p_workspace_id => v_ws, p_capability_key => 'maintenance_planning', p_source => 'preset',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'operator-1'
  );
  perform workspace.grant_capability(
    p_grant_id => gen_random_uuid(), p_history_id => gen_random_uuid(),
    p_workspace_id => v_ws, p_capability_key => 'preventive_maintenance', p_source => 'preset',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'operator-1'
  );

  select workspace.workspace_has_capability(v_ws, 'preventive_maintenance') into v_held;
  if not v_held then
    raise exception '2 · preventive_maintenance was not granted after its full dependency chain was';
  end if;
  raise notice '2 · granting a dependency chain in order, one call each, succeeds';

  -- =========================================================================
  -- 3 · Granting an already-held capability is refused, not a silent no-op

  begin
    perform workspace.grant_capability(
      p_grant_id => gen_random_uuid(), p_history_id => gen_random_uuid(),
      p_workspace_id => v_ws, p_capability_key => 'property_management', p_source => 'operator',
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'operator-1'
    );
    raise exception '3 · re-granting an already-held capability did not raise';
  exception when others then
    if sqlerrm not like '%already holds%' then raise; end if;
  end;
  raise notice '3 · re-granting an already-held capability refuses';

  -- =========================================================================
  -- 4 · Withdrawing a capability something else depends on is refused

  begin
    perform workspace.withdraw_capability(
      p_workspace_id => v_ws, p_capability_key => 'asset_management', p_history_id => gen_random_uuid(),
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'operator-1'
    );
    raise exception '4 · withdrawing asset_management while maintenance_planning still holds it did not raise';
  exception when others then
    if sqlerrm not like '%still holds%' then raise; end if;
  end;
  raise notice '4 · withdrawing a capability with a live dependent refuses';

  -- =========================================================================
  -- 5 · Withdrawing in dependency order succeeds, and history accumulates correctly

  perform workspace.withdraw_capability(
    p_workspace_id => v_ws, p_capability_key => 'preventive_maintenance', p_history_id => gen_random_uuid(),
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'operator-1'
  );
  select workspace.workspace_has_capability(v_ws, 'preventive_maintenance') into v_held;
  if v_held then
    raise exception '5a · preventive_maintenance is still reported held after withdrawal';
  end if;

  select count(*) into v_count from workspace.capability_grant_history where workspace_id = v_ws;
  if v_count <> 5 then -- 4 grants + 1 withdrawal
    raise exception '5b · expected 5 history rows, found %', v_count;
  end if;
  raise notice '5 · withdrawal succeeds once nothing depends on it, and history records both the grant and the withdrawal';

  -- =========================================================================
  -- 6 · Withdrawing something not held is refused

  begin
    perform workspace.withdraw_capability(
      p_workspace_id => v_ws, p_capability_key => 'preventive_maintenance', p_history_id => gen_random_uuid(),
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'operator-1'
    );
    raise exception '6 · withdrawing an already-withdrawn capability did not raise';
  exception when others then
    if sqlerrm not like '%does not currently hold%' then raise; end if;
  end;
  raise notice '6 · withdrawing a capability not currently held refuses';

  -- =========================================================================
  -- 7 · The grant history is genuinely append-only

  begin
    update workspace.capability_grant_history
    set source = 'operator'
    where id = (select id from workspace.capability_grant_history where workspace_id = v_ws limit 1);
    raise exception '7 · updating a capability_grant_history row did not raise';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  raise notice '7 · capability_grant_history refuses mutation';

  raise notice 'VERIFY_CAPABILITY_CONTRACT: all checks passed';
end;
$$;

rollback;

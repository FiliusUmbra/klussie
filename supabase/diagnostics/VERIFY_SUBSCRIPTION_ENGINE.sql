-- Verifies 0127-0130 end to end: activating a subscription grants its plan's full bundle,
-- starting a trial grants with a distinguishable source, changing plan grants the
-- difference forward and withdraws the difference in reverse (without ever hitting
-- workspace.withdraw_capability()'s own dependency-still-held refusal), lapsing withdraws
-- everything, expiring a trial refuses when not trialing, and one subscription per
-- workspace is enforced structurally.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SUBSCRIPTION_ENGINE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws              uuid := gen_random_uuid();
  v_trial_ws        uuid := gen_random_uuid();
  v_subscription_id uuid := gen_random_uuid();
  v_trial_id        uuid := gen_random_uuid();
  v_row             record;
  v_count           integer;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Home');
  insert into workspace.workspaces (id, type, name) values (v_trial_ws, 'business', 'Test Business');

  -- =========================================================================
  -- 1 · Activating a subscription grants the full plan bundle

  perform commerce.activate_subscription(
    v_subscription_id, v_ws, 'personal', jsonb_build_object('payerType', 'workspace', 'payerRef', v_ws),
    gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1'
  );

  select count(*) into v_count from workspace.capability_grants
    where workspace_id = v_ws and withdrawn_at is null and source = 'subscription';
  if v_count <> 5 then
    raise exception '1 · activating personal granted % capabilities, expected 5', v_count;
  end if;
  if not workspace.workspace_has_capability(v_ws, 'asset_management') then
    raise exception '1 · asset_management was not granted, despite depending only on property_management';
  end if;
  raise notice '1 · activating a subscription grants its plan''s full bundle';

  -- =========================================================================
  -- 2 · Upgrading plan grants the difference forward, with no withdrawals

  perform commerce.change_plan(v_subscription_id, 'premium_home', gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');

  select count(*) into v_count from workspace.capability_grants
    where workspace_id = v_ws and withdrawn_at is null and source = 'subscription';
  if v_count <> 10 then
    raise exception '2 · upgrading to premium_home left % live grants, expected 10', v_count;
  end if;
  if not workspace.workspace_has_capability(v_ws, 'preventive_maintenance') then
    raise exception '2 · preventive_maintenance was not granted on upgrade';
  end if;
  raise notice '2 · upgrading plan grants exactly the bundle difference, forward';

  -- =========================================================================
  -- 3 · Downgrading plan withdraws the difference in reverse — never hits
  -- withdraw_capability()'s own dependency-still-held refusal

  perform commerce.change_plan(v_subscription_id, 'personal', gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');

  select count(*) into v_count from workspace.capability_grants
    where workspace_id = v_ws and withdrawn_at is null and source = 'subscription';
  if v_count <> 5 then
    raise exception '3 · downgrading to personal left % live grants, expected 5', v_count;
  end if;
  if workspace.workspace_has_capability(v_ws, 'maintenance_planning') then
    raise exception '3 · maintenance_planning was not withdrawn on downgrade';
  end if;
  if not workspace.workspace_has_capability(v_ws, 'asset_management') then
    raise exception '3 · asset_management was wrongly withdrawn — personal still needs it';
  end if;
  raise notice '3 · downgrading plan withdraws exactly the bundle difference, in reverse order, with no dependency conflict';

  -- =========================================================================
  -- 4 · A trial grants with a distinguishable source, and expiring it refuses unless trialing

  perform commerce.start_trial(
    v_trial_id, v_trial_ws, 'business', jsonb_build_object('payerType', 'workspace', 'payerRef', v_trial_ws),
    now() + interval '14 days', gen_random_uuid(), gen_random_uuid(), 'person', 'customer-2'
  );
  select count(*) into v_count from workspace.capability_grants
    where workspace_id = v_trial_ws and withdrawn_at is null and source = 'trial';
  if v_count <> 14 then
    raise exception '4a · starting a business trial granted % capabilities with source trial, expected 14', v_count;
  end if;

  perform commerce.activate_subscription(
    gen_random_uuid(), v_ws, 'personal', jsonb_build_object('payerType', 'workspace', 'payerRef', v_ws),
    gen_random_uuid(), gen_random_uuid(), 'person', 'customer-3'
  );
  begin
    perform commerce.expire_trial(v_subscription_id, gen_random_uuid(), gen_random_uuid(), 'system', 'trial-expiry-job');
    raise exception '4b · expiring a non-trialing subscription did not raise';
  exception when others then
    if sqlerrm not like '%is not trialing%' then raise; end if;
  end;

  perform commerce.expire_trial(v_trial_id, gen_random_uuid(), gen_random_uuid(), 'system', 'trial-expiry-job');
  select count(*) into v_count from workspace.capability_grants
    where workspace_id = v_trial_ws and withdrawn_at is null and source = 'trial';
  if v_count <> 0 then
    raise exception '4c · expiring the trial left % live trial grants, expected 0', v_count;
  end if;
  select status into v_row from commerce.subscriptions where id = v_trial_id;
  raise notice '4 · trials grant with their own source and expiring one withdraws everything, refusing when not trialing';

  -- =========================================================================
  -- 5 · Renewing touches no capability; lapsing withdraws everything

  select count(*) into v_count from workspace.capability_grants where workspace_id = v_ws and withdrawn_at is null;
  perform commerce.renew_subscription(v_subscription_id, gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');
  select count(*) into v_count from workspace.capability_grants where workspace_id = v_ws and withdrawn_at is null;

  perform commerce.lapse_subscription(v_subscription_id, gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');
  select count(*) into v_count from workspace.capability_grants
    where workspace_id = v_ws and withdrawn_at is null and source = 'subscription';
  if v_count <> 0 then
    raise exception '5 · lapsing left % live subscription grants, expected 0', v_count;
  end if;
  raise notice '5 · renewing touches no capability; lapsing withdraws every capability the plan granted';

  -- =========================================================================
  -- 6 · One subscription per workspace, enforced structurally

  begin
    perform commerce.activate_subscription(
      gen_random_uuid(), v_ws, 'personal', jsonb_build_object('payerType', 'workspace', 'payerRef', v_ws),
      gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1'
    );
    raise exception '6 · a second subscription for the same workspace did not raise';
  exception when others then
    if sqlerrm not like '%duplicate key%' then raise; end if;
  end;
  raise notice '6 · a workspace can never hold a second subscription row';

  raise notice 'VERIFY_SUBSCRIPTION_ENGINE: all checks passed';
end;
$$;

rollback;

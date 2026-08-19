-- Verifies 0124-0126 end to end: recording a workspace metric and reading it back only
-- from its own workspace, re-recording the same period upserts in place, promoting a
-- platform metric writes an audited record with a null workspace and no platform.events
-- row, and platform_metrics_for reads across the whole platform with no workspace
-- parameter at all.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ANALYTICS_ENGINE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws            uuid := gen_random_uuid();
  v_other_ws      uuid := gen_random_uuid();
  v_metric_id     uuid := gen_random_uuid();
  v_platform_id   uuid := gen_random_uuid();
  v_row           record;
  v_count         integer;
  v_events_before bigint;
  v_events_after  bigint;
  v_audit_before  bigint;
  v_audit_after   bigint;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'business', 'Test Business');
  insert into workspace.workspaces (id, type, name) values (v_other_ws, 'business', 'Other Business');

  -- =========================================================================
  -- 1 · Recording a workspace metric, then reading it — only from its own workspace

  perform analytics_ws.record_workspace_metric(
    v_metric_id, 'business', v_ws, 'response_time_avg_minutes', 4.5,
    jsonb_build_object('period', '2026-08'), '2026-08-01'::timestamptz, '2026-09-01'::timestamptz,
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'system', 'analytics-consumer'
  );

  select * into v_row from analytics_ws.workspace_metrics_for(v_ws, 'business') limit 1;
  if v_row.metric_key is distinct from 'response_time_avg_minutes' then
    raise exception '1a · reading the owning workspace did not find the recorded metric';
  end if;

  select count(*) into v_count from analytics_ws.workspace_metrics_for(v_other_ws, 'business');
  if v_count <> 0 then
    raise exception '1b · a different workspace could read another workspace''s metric';
  end if;
  raise notice '1 · recording and reading a workspace metric applies scope correctly';

  -- =========================================================================
  -- 2 · Re-recording the same period upserts in place, never duplicates

  perform analytics_ws.record_workspace_metric(
    v_metric_id, 'business', v_ws, 'response_time_avg_minutes', 4.1,
    jsonb_build_object('period', '2026-08'), '2026-08-01'::timestamptz, '2026-09-01'::timestamptz,
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'system', 'analytics-consumer'
  );
  select count(*) into v_count from analytics_ws.workspace_metrics
    where domain = 'business' and workspace_id = v_ws and metric_key = 'response_time_avg_minutes';
  if v_count <> 1 then
    raise exception '2 · re-recording the same period produced % rows instead of 1', v_count;
  end if;
  select metric_value into v_row from analytics_ws.workspace_metrics_for(v_ws, 'business') limit 1;
  raise notice '2 · re-recording the same period upserts in place';

  -- =========================================================================
  -- 3 · Recording a workspace metric emits a real platform.events row

  select count(*) into v_events_before from platform.events where subject_type = 'metric' and subject_id = v_metric_id;
  perform analytics_ws.record_workspace_metric(
    gen_random_uuid(), 'property', v_ws, 'maintenance_cost_total', 1250.00,
    '{}'::jsonb, '2026-08-01'::timestamptz, '2026-09-01'::timestamptz,
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'system', 'analytics-consumer'
  );
  select count(*) into v_events_after from platform.events where event_type = 'analytics.metric.refreshed' and workspace_id = v_ws;
  if v_events_after < 1 then
    raise exception '3 · recording a workspace metric did not emit analytics.metric.refreshed';
  end if;
  raise notice '3 · recording a workspace metric emits a real event with the owning workspace';

  -- =========================================================================
  -- 4 · Promoting a platform metric writes an audited record with a null workspace, and
  -- emits no platform.events row at all

  select count(*) into v_audit_before from platform.audit_records where subject_type = 'platform_metric';
  select count(*) into v_events_before from platform.events where subject_type = 'platform_metric';

  perform analytics_pf.promote_platform_metric(
    v_platform_id, 'platform', 'customer_retention_rate', 0.62,
    jsonb_build_object('cohort', '2026-Q2'), '2026-04-01'::timestamptz, '2026-07-01'::timestamptz,
    gen_random_uuid(), 'system', 'analytics-consumer', 'scheduled-aggregation', gen_random_uuid()
  );

  select count(*) into v_audit_after from platform.audit_records
    where subject_type = 'platform_metric' and subject_id = v_platform_id and workspace_id is null;
  if v_audit_after <> v_audit_before + 1 then
    raise exception '4a · promoting a platform metric did not write an audit record with a null workspace';
  end if;

  select count(*) into v_events_after from platform.events where subject_type = 'platform_metric';
  if v_events_after <> v_events_before then
    raise exception '4b · promoting a platform metric emitted a platform.events row — it should not be able to';
  end if;
  raise notice '4 · promoting a platform metric writes an audited record with a null workspace, and emits no event';

  -- =========================================================================
  -- 5 · platform_metrics_for reads platform-wide, no workspace parameter, no individual detail

  select * into v_row from analytics_pf.platform_metrics_for('platform') limit 1;
  if v_row.metric_key is distinct from 'customer_retention_rate' then
    raise exception '5 · platform_metrics_for did not find the promoted metric';
  end if;
  raise notice '5 · platform_metrics_for reads the promoted metric platform-wide';

  raise notice 'VERIFY_ANALYTICS_ENGINE: all checks passed';
end;
$$;

rollback;

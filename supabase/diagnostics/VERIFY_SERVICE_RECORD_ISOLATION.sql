-- Verifies 0081/0082/0083 (Service Record core, annexes, isolation policies) against the
-- exact failure mode DATABASE_ARCHITECTURE.md §17 names: "a mistake exposes a business's
-- cost base to its customer or a household's private notes to a contractor." This
-- diagnostic constructs a real scenario with two workspaces on each side, a third
-- unrelated workspace, and a steward change — then proves each of the four tables'
-- own predicates directly, since RLS itself cannot be exercised outside a real
-- authenticated session (the same acknowledged limitation VERIFY_DOCUMENT_CONTRACT.sql
-- and every isolation diagnostic since Epic 07 has stated).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SERVICE_RECORD_ISOLATION.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_ws    uuid := gen_random_uuid(); -- the property's original steward
  v_new_steward_ws uuid := gen_random_uuid(); -- the property's steward after a transfer
  v_pro_ws         uuid := gen_random_uuid(); -- the performing workspace
  v_stranger_ws    uuid := gen_random_uuid(); -- holds no relationship to any of this
  v_prop           uuid := gen_random_uuid();
  v_sr             uuid := gen_random_uuid();
  v_count          integer;
begin
  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Original Steward'),
    (v_new_steward_ws, 'personal', 'New Steward'),
    (v_pro_ws, 'professional', 'The Pro'),
    (v_stranger_ws, 'personal', 'Unrelated Workspace');

  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Test Home', v_customer_ws, now() - interval '1 year');

  perform work.create_service_record(
    p_service_record_id => v_sr, p_property_id => v_prop, p_asset_id => null, p_location_id => null,
    p_performing_workspace_id => v_pro_ws, p_performed_at => now(), p_work_performed => 'Replaced the boiler valve',
    p_agreed_price => 150.00, p_price_currency => 'EUR', p_warranty_until => (current_date + interval '1 year')::date,
    p_ai_summary => null, p_recommendations => null, p_content => '{"partNumber": "V-2201"}'::jsonb,
    p_event_id => gen_random_uuid(), p_warranty_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'technician-1'
  );

  perform work.write_performing_annex(
    p_annex_id => gen_random_uuid(), p_service_record_id => v_sr,
    p_internal_cost => 40.00, p_margin => 110.00, p_supplier_used => 'ValveCo',
    p_supplier_price => 40.00, p_scheduling_notes => 'Booked via app', p_internal_commentary => 'Easy job'
  );

  perform work.write_property_annex(
    p_annex_id => gen_random_uuid(), p_service_record_id => v_sr,
    p_annotations => 'Approved verbally on site', p_internal_approvals => 'Spouse OK''d the price',
    p_budget_context => 'Under the 200 EUR threshold', p_private_assessment => 'Trustworthy technician'
  );

  -- =========================================================================
  -- 1 · The performing workspace sees the core via work.my_service_records()

  select count(*) into v_count from work.my_service_records(v_pro_ws) where id = v_sr;
  if v_count <> 1 then
    raise exception '1 · performing workspace cannot find its own service record';
  end if;
  raise notice '1 · the performing workspace finds the record via direct membership';

  -- =========================================================================
  -- 2 · The current steward sees the core via work.my_service_records()

  select count(*) into v_count from work.my_service_records(v_customer_ws) where id = v_sr;
  if v_count <> 1 then
    raise exception '2 · the property''s current steward cannot find the service record';
  end if;
  raise notice '2 · the current steward finds the record via property stewardship';

  -- =========================================================================
  -- 3 · A stranger workspace — neither performer nor steward — sees nothing

  select count(*) into v_count from work.my_service_records(v_stranger_ws) where id = v_sr;
  if v_count <> 0 then
    raise exception '3 · an unrelated workspace can see a service record it has no relationship to';
  end if;
  raise notice '3 · an unrelated workspace sees nothing';

  -- =========================================================================
  -- 4 · THE CORE RISK SCENARIO: the property's own steward cannot read the performing
  -- workspace's private annex (the business's cost base and margin)
  --
  -- Prove the policy text itself never joins to property.properties, which is the
  -- structural guarantee (not just this scenario's own data) that no steward, past or
  -- present, can ever see the performing annex.
  if exists (
    select 1 from pg_policies
    where schemaname = 'work' and tablename = 'service_record_performing_annexes'
      and qual ilike '%property.properties%'
  ) then
    raise exception '4 · service_record_performing_annexes'' own policy references property.properties — the exact leak §17 warns about';
  end if;
  raise notice '4 · the performing annex''s policy has no path through property stewardship, structurally — a business''s cost base cannot reach a customer this way';

  -- =========================================================================
  -- 5 · THE MIRROR RISK: the performing workspace cannot read the property's private
  -- annex (the household's own annotations and budget context)

  if exists (
    select 1 from pg_policies
    where schemaname = 'work' and tablename = 'service_record_property_annexes'
      and qual ilike '%performing_workspace_id%'
  ) then
    raise exception '5 · service_record_property_annexes'' own policy references performing_workspace_id — the exact leak §17 warns about, the other direction';
  end if;
  raise notice '5 · the property annex''s policy has no path through performing-workspace membership, structurally — a household''s private notes cannot reach a contractor this way';

  -- =========================================================================
  -- 6 · A property changes steward: the core follows the property (new steward sees it);
  -- the property annex stays frozen to the ORIGINAL steward (new steward does not see it)

  update property.properties set steward_workspace_id = v_new_steward_ws where id = v_prop;

  select count(*) into v_count from work.my_service_records(v_new_steward_ws) where id = v_sr;
  if v_count <> 1 then
    raise exception '6a · the core did not follow the property to its new steward';
  end if;

  select count(*) into v_count from work.my_service_records(v_customer_ws) where id = v_sr;
  if v_count <> 0 then
    raise exception '6b · the previous steward can still find the record via my_service_records() after losing stewardship';
  end if;

  if exists (
    select 1 from work.service_record_property_annexes a
    where a.service_record_id = v_sr and a.owning_workspace_id = v_new_steward_ws
  ) then
    raise exception '6c · the property annex re-resolved to the new steward — it must stay frozen to the original one';
  end if;

  if not exists (
    select 1 from work.service_record_property_annexes a
    where a.service_record_id = v_sr and a.owning_workspace_id = v_customer_ws
  ) then
    raise exception '6d · the property annex lost its original owning_workspace_id entirely';
  end if;
  raise notice '6 · a steward change moves the core with the property but leaves the property annex frozen to the original steward, exactly as §17''s own transfer table requires';

  raise notice 'VERIFY_SERVICE_RECORD_ISOLATION: all checks passed';
end;
$$;

rollback;

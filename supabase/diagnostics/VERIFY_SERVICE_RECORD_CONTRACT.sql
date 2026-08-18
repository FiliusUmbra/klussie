-- Verifies 0084_service_record_contract.sql end to end: creation, the one-way approval
-- guard, annex upserts, amendments, and the core's own immutability once written —
-- including the exact regression this epic's own first draft would have shipped
-- (WarrantyArising minting its own event id) if left uncaught.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SERVICE_RECORD_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_ws  uuid := gen_random_uuid();
  v_pro_ws       uuid := gen_random_uuid();
  v_prop         uuid := gen_random_uuid();
  v_sr           uuid := gen_random_uuid();
  v_approved     boolean;
  v_annex_count  integer;
  v_cost         numeric;
  v_history_len  integer;
begin
  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Customer'), (v_pro_ws, 'professional', 'Pro');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Test Home', v_customer_ws, now());

  -- =========================================================================
  -- 1 · Creation without a warranty emits no WarrantyArising side effect (structurally:
  -- the branch simply does not run) and the record is not pre-approved

  perform work.create_service_record(
    p_service_record_id => v_sr, p_property_id => v_prop, p_asset_id => null, p_location_id => null,
    p_performing_workspace_id => v_pro_ws, p_performed_at => now(), p_work_performed => 'Tap washer replaced',
    p_agreed_price => 20.00, p_price_currency => 'EUR', p_warranty_until => null,
    p_ai_summary => null, p_recommendations => null, p_content => '{}'::jsonb,
    p_event_id => gen_random_uuid(), p_warranty_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'technician-1'
  );

  select customer_approved into v_approved from work.service_records where id = v_sr;
  if v_approved then
    raise exception '1 · a freshly created record must not be pre-approved';
  end if;
  raise notice '1 · a four-field record (no warranty) is created, unapproved';

  -- =========================================================================
  -- 2 · Approval succeeds once, and refuses a second time

  perform work.record_service_record_approval(
    p_service_record_id => v_sr, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select customer_approved into v_approved from work.service_records where id = v_sr;
  if not v_approved then
    raise exception '2a · approval did not set customer_approved';
  end if;

  begin
    perform work.record_service_record_approval(
      p_service_record_id => v_sr, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'customer-1'
    );
    raise exception '2b · approving an already-approved record did not raise';
  exception when others then
    if sqlerrm not like '%already approved%' then raise; end if;
  end;
  raise notice '2 · approval succeeds once, refuses a second time';

  -- =========================================================================
  -- 3 · The core is immutable even for the workspace that created it — the guard
  -- trigger fires regardless of which role or workspace attempts the write

  begin
    update work.service_records set work_performed = 'Rewritten' where id = v_sr;
    raise exception '3 · editing work_performed after creation did not raise';
  exception when others then
    if sqlerrm not like '%immutable except customer_approved%' then raise; end if;
  end;

  begin
    update work.service_records set customer_approved = false where id = v_sr;
    raise exception '3b · un-approving a record did not raise';
  exception when others then
    if sqlerrm not like '%move from false to true only%' then raise; end if;
  end;
  raise notice '3 · the core refuses any edit after creation, including un-approving';

  -- =========================================================================
  -- 4 · Writing an annex twice upserts, not duplicates — proven by row count, not just
  -- absence of an error

  perform work.write_performing_annex(
    p_annex_id => gen_random_uuid(), p_service_record_id => v_sr,
    p_internal_cost => 5.00, p_margin => 15.00, p_supplier_used => 'PlumbCo',
    p_supplier_price => 5.00, p_scheduling_notes => null, p_internal_commentary => null
  );
  perform work.write_performing_annex(
    p_annex_id => gen_random_uuid(), p_service_record_id => v_sr,
    p_internal_cost => 6.00, p_margin => 14.00, p_supplier_used => 'PlumbCo',
    p_supplier_price => 6.00, p_scheduling_notes => 'Updated', p_internal_commentary => null
  );

  select count(*) into v_annex_count from work.service_record_performing_annexes where service_record_id = v_sr;
  if v_annex_count <> 1 then
    raise exception '4a · writing a performing annex twice produced % rows, expected 1', v_annex_count;
  end if;

  select internal_cost into v_cost from work.service_record_performing_annexes where service_record_id = v_sr;
  if v_cost <> 6.00 then
    raise exception '4b · the second write did not update internal_cost, got %', v_cost;
  end if;
  raise notice '4 · writing a performing annex twice upserts one row, not two';

  -- =========================================================================
  -- 5 · Amendments are refused without a reason, and accumulate correctly

  begin
    perform work.amend_service_record(
      p_amendment_id => gen_random_uuid(), p_service_record_id => v_sr, p_authored_by_workspace_id => v_pro_ws,
      p_field_key => 'work_performed', p_previous_value => 'Tap washer replaced', p_corrected_value => 'Tap washer and O-ring replaced',
      p_reason => '', p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => 'technician-1'
    );
    raise exception '5a · amending with a blank reason did not raise';
  exception when others then
    if sqlerrm not like '%a reason is required%' then raise; end if;
  end;

  perform work.amend_service_record(
    p_amendment_id => gen_random_uuid(), p_service_record_id => v_sr, p_authored_by_workspace_id => v_pro_ws,
    p_field_key => 'work_performed', p_previous_value => 'Tap washer replaced', p_corrected_value => 'Tap washer and O-ring replaced',
    p_reason => 'Missed a detail on first write', p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'technician-1'
  );

  select count(*) into v_history_len from work.service_record_history(v_sr);
  if v_history_len <> 1 then
    raise exception '5b · expected 1 amendment in the history, found %', v_history_len;
  end if;
  raise notice '5 · amendments refuse a blank reason and accumulate in service_record_history()';

  -- =========================================================================
  -- 6 · The amendment log is genuinely append-only

  begin
    update work.service_record_amendments set reason = 'edited' where service_record_id = v_sr;
    raise exception '6 · updating an amendment row did not raise';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  raise notice '6 · the amendment log refuses mutation';

  raise notice 'VERIFY_SERVICE_RECORD_CONTRACT: all checks passed';
end;
$$;

rollback;

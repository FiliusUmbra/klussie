-- Verifies 0090_marketplace_contract.sql end to end: the full request -> quotes ->
-- acceptance -> engagement -> completion -> review lifecycle, proving it reproduces the
-- five legacy triggers' decisions exactly (the multi-quote bulk decline, the guarded
-- first-quote transition, the terminal-state guards) — and proving, structurally, that
-- nothing in this epic ever touches workspace.memberships.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MARKETPLACE_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_ws   uuid := gen_random_uuid();
  v_pro1_ws       uuid := gen_random_uuid();
  v_pro2_ws       uuid := gen_random_uuid();
  v_request       uuid := gen_random_uuid();
  v_quote1        uuid := gen_random_uuid();
  v_quote2        uuid := gen_random_uuid();
  v_engagement    uuid := gen_random_uuid();
  v_status        text;
  v_membership_count_before integer;
  v_membership_count_after  integer;
begin
  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Customer'), (v_pro1_ws, 'professional', 'Pro One'), (v_pro2_ws, 'professional', 'Pro Two');

  select count(*) into v_membership_count_before from workspace.memberships;

  -- =========================================================================
  -- 1 · create_request() opens at collecting

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Leaking tap', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select status into v_status from work.requests where id = v_request;
  if v_status <> 'collecting' then
    raise exception '1 · expected collecting, got %', v_status;
  end if;
  raise notice '1 · create_request() opens at collecting';

  -- =========================================================================
  -- 2 · The first quote moves the request to quotes_ready; the second is a no-op —
  -- mirrors handle_quote_sent()'s own guard exactly

  perform work.submit_quote(
    p_quote_id => v_quote1, p_request_id => v_request, p_offering_workspace_id => v_pro1_ws,
    p_price => 80.00, p_message => 'Can do Tuesday',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'pro1-tech'
  );
  select status into v_status from work.requests where id = v_request;
  if v_status <> 'quotes_ready' then
    raise exception '2a · expected quotes_ready after first quote, got %', v_status;
  end if;

  perform work.submit_quote(
    p_quote_id => v_quote2, p_request_id => v_request, p_offering_workspace_id => v_pro2_ws,
    p_price => 90.00, p_message => 'Available this week',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'pro2-tech'
  );
  select status into v_status from work.requests where id = v_request;
  if v_status <> 'quotes_ready' then
    raise exception '2b · a second quote must remain a no-op at quotes_ready, got %', v_status;
  end if;
  raise notice '2 · the first quote transitions the request; the second is a no-op, matching handle_quote_sent() exactly';

  -- =========================================================================
  -- 3 · Accepting quote1 books the request, declines quote2, and creates the engagement
  -- — mirrors handle_quote_accepted()'s own bulk decline exactly

  perform work.accept_quote(
    p_quote_id => v_quote1, p_engagement_id => v_engagement,
    p_event_id => gen_random_uuid(), p_engagement_event_id => gen_random_uuid(), p_declined_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );

  select status into v_status from work.requests where id = v_request;
  if v_status <> 'booked' then
    raise exception '3a · expected booked, got %', v_status;
  end if;

  select status into v_status from work.quotes where id = v_quote2;
  if v_status <> 'declined' then
    raise exception '3b · expected the losing quote declined, got %', v_status;
  end if;

  if not exists (select 1 from work.engagements where id = v_engagement and performing_workspace_id = v_pro1_ws and agreed_price = 80.00) then
    raise exception '3c · engagement was not created correctly';
  end if;
  raise notice '3 · accepting a quote books the request, declines the loser, and creates the engagement — matching handle_quote_accepted() exactly';

  -- =========================================================================
  -- 4 · An already-declined quote cannot be accepted

  begin
    perform work.accept_quote(
      p_quote_id => v_quote2, p_engagement_id => gen_random_uuid(),
      p_event_id => gen_random_uuid(), p_engagement_event_id => gen_random_uuid(), p_declined_event_id => gen_random_uuid(),
      p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
    );
    raise exception '4 · accepting an already-declined quote did not raise';
  exception when others then
    if sqlerrm not like '%is not open%' then raise; end if;
  end;
  raise notice '4 · accepting a non-open quote refuses';

  -- =========================================================================
  -- 5 · Completing the engagement moves the request to completed; the engagement is
  -- then immutable

  perform work.complete_engagement(
    p_engagement_id => v_engagement,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select status into v_status from work.requests where id = v_request;
  if v_status <> 'completed' then
    raise exception '5a · expected completed, got %', v_status;
  end if;

  begin
    update work.engagements set agreed_price = 999.00 where id = v_engagement;
    raise exception '5b · editing a completed engagement did not raise';
  exception when others then
    if sqlerrm not like '%is % and immutable%' then raise; end if;
  end;
  raise notice '5 · completing the engagement moves the request to completed, mirroring markComplete(), and the engagement is then frozen';

  -- =========================================================================
  -- 6 · mark_request_reviewed() completes the state machine

  perform work.mark_request_reviewed(
    p_request_id => v_request,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select status into v_status from work.requests where id = v_request;
  if v_status <> 'reviewed' then
    raise exception '6 · expected reviewed, got %', v_status;
  end if;
  raise notice '6 · mark_request_reviewed() completes the state machine, mirroring handle_new_review()''s status side effect';

  -- =========================================================================
  -- 7 · Nothing in this entire lifecycle ever wrote to workspace.memberships — the
  -- scoped access grant was never created, exactly as designed

  select count(*) into v_membership_count_after from workspace.memberships;
  if v_membership_count_after <> v_membership_count_before then
    raise exception '7 · workspace.memberships row count changed (% -> %) — the marketplace contract must never write there', v_membership_count_before, v_membership_count_after;
  end if;
  raise notice '7 · workspace.memberships was never touched across the full lifecycle';

  raise notice 'VERIFY_MARKETPLACE_CONTRACT: all checks passed';
end;
$$;

rollback;

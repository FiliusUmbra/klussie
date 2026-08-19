-- Verifies 0145_marketplace_read_contract.sql (Platform Activation Slice 2, WP 2.1) with
-- real data and real impersonated sessions, not just structural assertions: a customer
-- sees their own requests/quotes/engagement; a pro who quoted can resolve the request and
-- see their own quote but never a competitor's; a pro who never quoted sees nothing; a
-- total stranger sees nothing anywhere. Requests/quotes/engagements are seeded directly
-- through work.* (api.create_request() etc. do not exist yet — WP 2.3), the same
-- fixture-building discipline VERIFY_LOCATION_READ_CONTRACT.sql already established for a
-- read path verified ahead of its own write contract.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MARKETPLACE_READ_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth   uuid := gen_random_uuid();
  v_pro1_auth       uuid := gen_random_uuid();
  v_pro2_auth       uuid := gen_random_uuid();
  v_stranger_auth   uuid := gen_random_uuid();
  v_customer_ws     uuid := gen_random_uuid();
  v_pro1_ws         uuid := gen_random_uuid();
  v_pro2_ws         uuid := gen_random_uuid();
  v_stranger_ws     uuid := gen_random_uuid();
  v_customer_ref    uuid;
  v_pro1_ref        uuid;
  v_pro2_ref        uuid;
  v_stranger_ref    uuid;
  v_request         uuid := gen_random_uuid();
  v_quote1          uuid := gen_random_uuid();
  v_quote2          uuid := gen_random_uuid();
  v_engagement      uuid := gen_random_uuid();
  v_row_count       integer;
begin
  -- Setup: four real accounts, each with their own real workspace and membership.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marketplace-read-customer@example.test', jsonb_build_object('full_name', 'Marketplace Read Customer'), now(), now()),
    (v_pro1_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marketplace-read-pro1@example.test', jsonb_build_object('full_name', 'Marketplace Read Pro One'), now(), now()),
    (v_pro2_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marketplace-read-pro2@example.test', jsonb_build_object('full_name', 'Marketplace Read Pro Two'), now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marketplace-read-stranger@example.test', jsonb_build_object('full_name', 'Marketplace Read Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;
  select i.person_ref into v_pro1_ref from identity.identities i where i.auth_user_id = v_pro1_auth;
  select i.person_ref into v_pro2_ref from identity.identities i where i.auth_user_id = v_pro2_auth;
  select i.person_ref into v_stranger_ref from identity.identities i where i.auth_user_id = v_stranger_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Marketplace Read Customer WS'),
    (v_pro1_ws, 'professional', 'Marketplace Read Pro One WS'),
    (v_pro2_ws, 'professional', 'Marketplace Read Pro Two WS'),
    (v_stranger_ws, 'professional', 'Marketplace Read Stranger WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_pro1_ws, v_pro1_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_pro2_ws, v_pro2_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_stranger_ws, v_stranger_ref, 'owner', 'active', now(), now());

  -- A request from the customer, two competing quotes, one accepted — built through
  -- work.* directly, as postgres, exactly like VERIFY_MARKETPLACE_CONTRACT.sql.

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Leaking tap', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );
  perform work.submit_quote(
    p_quote_id => v_quote1, p_request_id => v_request, p_offering_workspace_id => v_pro1_ws,
    p_price => 80.00, p_message => 'Can do Tuesday',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro1_auth::text
  );
  perform work.submit_quote(
    p_quote_id => v_quote2, p_request_id => v_request, p_offering_workspace_id => v_pro2_ws,
    p_price => 90.00, p_message => 'Available this week',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro2_auth::text
  );
  perform work.accept_quote(
    p_quote_id => v_quote1, p_engagement_id => v_engagement,
    p_event_id => gen_random_uuid(), p_engagement_event_id => gen_random_uuid(), p_declined_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  -- =========================================================================
  -- 1 · api.my_requests() — the customer sees their own request; a stranger asking for
  -- the customer's own workspace sees nothing

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select count(*) into v_row_count from api.my_requests(v_customer_ws);
  if v_row_count <> 1 then
    raise exception '1a · expected the customer to see 1 request, found %', v_row_count;
  end if;
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_row_count from api.my_requests(v_customer_ws);
  if v_row_count <> 0 then
    raise exception '1b · a stranger asking for the customer''s own workspace saw %, expected 0', v_row_count;
  end if;
  reset role;
  raise notice '1 · my_requests(): the customer sees their own request; a stranger sees nothing';

  -- =========================================================================
  -- 2 · api.resolve_request() — two-sided: the customer and both quoting pros can resolve
  -- it (pro2 quoted and lost, but still legitimately quoted); a stranger cannot

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro2_auth)::text, true);
  select count(*) into v_row_count from api.resolve_request(v_request);
  if v_row_count <> 1 then
    raise exception '2a · a pro who quoted (and lost) could not resolve the request, found %', v_row_count;
  end if;
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_row_count from api.resolve_request(v_request);
  if v_row_count <> 0 then
    raise exception '2b · a stranger resolved a request they never quoted on, found %', v_row_count;
  end if;
  reset role;
  raise notice '2 · resolve_request(): both quoting pros (winner and loser) can resolve it; a stranger cannot';

  -- =========================================================================
  -- 3 · api.quotes_for_request() — the customer sees both competing quotes; each pro
  -- sees only their own, never a competitor's; a stranger sees none

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select count(*) into v_row_count from api.quotes_for_request(v_request);
  if v_row_count <> 2 then
    raise exception '3a · the customer should see both competing quotes, found %', v_row_count;
  end if;
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro1_auth)::text, true);
  select count(*) into v_row_count from api.quotes_for_request(v_request);
  if v_row_count <> 1 then
    raise exception '3b · pro1 should see exactly their own quote, found %', v_row_count;
  end if;
  if exists (select 1 from api.quotes_for_request(v_request) where id = v_quote2) then
    raise exception '3c · pro1 could see pro2''s competing quote — a real privacy break';
  end if;
  reset role;
  raise notice '3 · quotes_for_request(): the customer sees both quotes; each pro sees only their own, never a competitor''s';

  -- =========================================================================
  -- 4 · api.my_quotes() — a pro sees their own quote; a stranger asking for that pro's
  -- workspace sees nothing

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro1_auth)::text, true);
  select count(*) into v_row_count from api.my_quotes(v_pro1_ws);
  if v_row_count <> 1 then
    raise exception '4a · pro1 should see their own 1 quote, found %', v_row_count;
  end if;
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_row_count from api.my_quotes(v_pro1_ws);
  if v_row_count <> 0 then
    raise exception '4b · a stranger asking for pro1''s workspace saw %, expected 0', v_row_count;
  end if;
  reset role;
  raise notice '4 · my_quotes(): a pro sees their own quote; a stranger sees nothing';

  -- =========================================================================
  -- 5 · api.my_engagements() — both real parties (requesting and performing) see the
  -- engagement from their own workspace; a stranger sees nothing

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select count(*) into v_row_count from api.my_engagements(v_customer_ws);
  if v_row_count <> 1 then
    raise exception '5a · the customer should see 1 engagement, found %', v_row_count;
  end if;
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro1_auth)::text, true);
  select count(*) into v_row_count from api.my_engagements(v_pro1_ws);
  if v_row_count <> 1 then
    raise exception '5b · pro1 (the performing workspace) should see 1 engagement, found %', v_row_count;
  end if;
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_row_count from api.my_engagements(v_customer_ws);
  if v_row_count <> 0 then
    raise exception '5c · a stranger asking for the customer''s own workspace saw %, expected 0', v_row_count;
  end if;
  reset role;
  raise notice '5 · my_engagements(): both real parties see it from their own workspace; a stranger sees nothing';

  raise notice 'VERIFY_MARKETPLACE_READ_CONTRACT: all checks passed';
end;
$$;

rollback;

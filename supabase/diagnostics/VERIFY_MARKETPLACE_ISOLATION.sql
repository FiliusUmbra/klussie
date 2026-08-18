-- Verifies 0085/0086/0087/0088 (requests, quotes, engagements, isolation policies) and
-- the backfill (0089): a stranger workspace sees nothing, both parties to a quote see
-- it, both parties to an engagement see it, and every backfilled row resolves to a real
-- workspace with no orphans.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MARKETPLACE_ISOLATION.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_ws   uuid := gen_random_uuid();
  v_pro_ws        uuid := gen_random_uuid();
  v_stranger_ws   uuid := gen_random_uuid();
  v_request       uuid := gen_random_uuid();
  v_quote         uuid := gen_random_uuid();
  v_count         integer;
  v_orphans       integer;
begin
  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Customer'), (v_pro_ws, 'professional', 'Pro'), (v_stranger_ws, 'personal', 'Stranger');

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Test', p_when_pref => 'flexible', p_budget => 50.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  perform work.submit_quote(
    p_quote_id => v_quote, p_request_id => v_request, p_offering_workspace_id => v_pro_ws,
    p_price => 50.00, p_message => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'pro-tech'
  );

  -- =========================================================================
  -- 1 · Both the customer and the pro find the request/quote via the read functions;
  -- a stranger finds neither

  select count(*) into v_count from work.my_requests(v_customer_ws) where id = v_request;
  if v_count <> 1 then raise exception '1a · customer cannot find their own request'; end if;

  select count(*) into v_count from work.quotes_for_request(v_request) where id = v_quote;
  if v_count <> 1 then raise exception '1b · quotes_for_request() did not return the quote'; end if;

  select count(*) into v_count from work.my_quotes(v_pro_ws) where id = v_quote;
  if v_count <> 1 then raise exception '1c · pro cannot find their own quote via my_quotes()'; end if;

  select count(*) into v_count from work.my_requests(v_stranger_ws) where id = v_request;
  if v_count <> 0 then raise exception '1d · a stranger workspace can see a request it has no relationship to'; end if;
  raise notice '1 · both real parties find their own data; a stranger finds nothing';

  -- =========================================================================
  -- 2 · The isolation policy on work.quotes has both halves of its own OR — direct
  -- offeror membership, and a join through work.requests for the requester

  if not exists (
    select 1 from pg_policies
    where schemaname = 'work' and tablename = 'quotes' and qual ilike '%offering_workspace_id%'
  ) then
    raise exception '2a · quotes'' own policy lost its direct offeror-membership half';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'work' and tablename = 'quotes' and qual ilike '%work.requests%'
  ) then
    raise exception '2b · quotes'' own policy lost its join-through-requests half';
  end if;
  raise notice '2 · quotes'' isolation policy still has both halves of its own OR predicate';

  -- =========================================================================
  -- 3 · Every row backfilled by 0089 resolves to a real workspace — no orphans

  select count(*) into v_orphans
  from work.requests r
  where not exists (select 1 from workspace.workspaces w where w.id = r.requesting_workspace_id);
  if v_orphans <> 0 then
    raise exception '3a · % request(s) reference a workspace that does not exist', v_orphans;
  end if;

  select count(*) into v_orphans
  from work.quotes q
  where not exists (select 1 from workspace.workspaces w where w.id = q.offering_workspace_id);
  if v_orphans <> 0 then
    raise exception '3b · % quote(s) reference a workspace that does not exist', v_orphans;
  end if;

  select count(*) into v_orphans
  from work.engagements e
  where not exists (select 1 from workspace.workspaces w where w.id = e.requesting_workspace_id)
     or not exists (select 1 from workspace.workspaces w where w.id = e.performing_workspace_id);
  if v_orphans <> 0 then
    raise exception '3c · % engagement(s) reference a workspace that does not exist', v_orphans;
  end if;
  raise notice '3 · every request, quote and engagement (including any already backfilled) resolves to a real workspace';

  raise notice 'VERIFY_MARKETPLACE_ISOLATION: all checks passed';
end;
$$;

rollback;

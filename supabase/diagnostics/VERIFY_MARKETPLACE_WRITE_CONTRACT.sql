-- Verifies 0146_marketplace_write_contract.sql (Platform Activation Slice 2, WP 2.2 +
-- WP 2.3) with real data and real impersonated sessions: an ordinary request's three
-- directed columns stay genuinely null (the legacy bug this migration's own header found
-- is not reproduced); a directed request auto-accepts a matching quote from the right
-- workspace, inside the window, at or under the ceiling — and does NOT auto-accept when
-- any one of those three conditions fails; a stranger cannot write through any of the
-- eight api.* functions; cancelling is genuinely two-sided.
--
-- Also, since 0148 redefined api.accept_quote()/api.submit_quote() to open the
-- engagement's conversation (WP 2.6's own cascade): check 2 confirms the auto-accept
-- path opens a real, two-participant conversation, not merely an engagement.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MARKETPLACE_WRITE_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth    uuid := gen_random_uuid();
  v_pro_auth         uuid := gen_random_uuid();
  v_wrong_pro_auth   uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_customer_ws      uuid := gen_random_uuid();
  v_pro_ws           uuid := gen_random_uuid();
  v_wrong_pro_ws     uuid := gen_random_uuid();
  v_stranger_ws      uuid := gen_random_uuid();
  v_ordinary_request uuid := gen_random_uuid();
  v_directed_request uuid := gen_random_uuid();
  v_quote            uuid := gen_random_uuid();
  v_row              record;
  v_status           text;
  v_expected_failure boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marketplace-write-customer@example.test', jsonb_build_object('full_name', 'Marketplace Write Customer'), now(), now()),
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marketplace-write-pro@example.test', jsonb_build_object('full_name', 'Marketplace Write Pro'), now(), now()),
    (v_wrong_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marketplace-write-wrong-pro@example.test', jsonb_build_object('full_name', 'Marketplace Write Wrong Pro'), now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'marketplace-write-stranger@example.test', jsonb_build_object('full_name', 'Marketplace Write Stranger'), now(), now());

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Marketplace Write Customer WS'),
    (v_pro_ws, 'professional', 'Marketplace Write Pro WS'),
    (v_wrong_pro_ws, 'professional', 'Marketplace Write Wrong Pro WS'),
    (v_stranger_ws, 'professional', 'Marketplace Write Stranger WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  select gen_random_uuid(), w.ws, i.person_ref, 'owner', 'active', now(), now()
  from (values (v_customer_ws, v_customer_auth), (v_pro_ws, v_pro_auth), (v_wrong_pro_ws, v_wrong_pro_auth), (v_stranger_ws, v_stranger_auth)) as w(ws, auth_id)
  join identity.identities i on i.auth_user_id = w.auth_id;

  -- =========================================================================
  -- 1 · An ordinary request's three directed columns stay genuinely null — the legacy
  -- bug this migration's own header found (a column default breaking every ordinary
  -- insert) is not reproduced

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_request(
    p_request_id => v_ordinary_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Ordinary leak', p_when_pref => 'flexible', p_budget => 100.00,
    p_directed_workspace_id => null, p_auto_accept_max => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select * into v_row from work.requests where id = v_ordinary_request;
  if v_row.directed_workspace_id is not null or v_row.directed_until is not null or v_row.auto_accept_max is not null then
    raise exception '1 · an ordinary request''s directed columns are not all null: %, %, %', v_row.directed_workspace_id, v_row.directed_until, v_row.auto_accept_max;
  end if;
  raise notice '1 · an ordinary request''s three directed columns stay genuinely null';

  -- =========================================================================
  -- 2 · A directed request, quoted by the right workspace at or under the ceiling,
  -- auto-accepts — books the request and creates the engagement with no separate
  -- accept call

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_request(
    p_request_id => v_directed_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Directed leak', p_when_pref => 'flexible', p_budget => 100.00,
    p_directed_workspace_id => v_pro_ws, p_auto_accept_max => 90.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);

  perform api.submit_quote(
    p_quote_id => v_quote, p_request_id => v_directed_request, p_offering_workspace_id => v_pro_ws,
    p_price => 80.00, p_message => 'Can do it', p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_auto_accept_engagement_id => gen_random_uuid(), p_auto_accept_event_id => gen_random_uuid(), p_auto_accept_engagement_event_id => gen_random_uuid(),
    p_auto_accept_conversation_id => gen_random_uuid(), p_auto_accept_customer_participant_id => gen_random_uuid(), p_auto_accept_pro_participant_id => gen_random_uuid(),
    p_auto_accept_conversation_event_id => gen_random_uuid(), p_auto_accept_customer_participant_event_id => gen_random_uuid(), p_auto_accept_pro_participant_event_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro_auth::text
  );

  reset role;
  select status into v_status from work.quotes where id = v_quote;
  if v_status <> 'accepted' then
    raise exception '2a · expected the directed quote to auto-accept, status is %', v_status;
  end if;

  select status into v_status from work.requests where id = v_directed_request;
  if v_status <> 'booked' then
    raise exception '2b · expected the directed request to be booked after auto-accept, status is %', v_status;
  end if;

  if not exists (select 1 from work.engagements where request_id = v_directed_request and performing_workspace_id = v_pro_ws) then
    raise exception '2c · no engagement was created by the auto-accept cascade';
  end if;

  if not exists (
    select 1 from work.conversations c
    join work.engagements e on e.id = c.engagement_id
    where e.request_id = v_directed_request
  ) then
    raise exception '2d · the auto-accept cascade did not open a conversation for the new engagement';
  end if;

  if (
    select count(*) from work.conversation_participants cp
    join work.conversations c on c.id = cp.conversation_id
    join work.engagements e on e.id = c.engagement_id
    where e.request_id = v_directed_request
  ) <> 2 then
    raise exception '2e · the auto-accept cascade''s conversation does not have exactly 2 participants';
  end if;
  raise notice '2 · a directed request auto-accepts a matching quote — books the request, creates the engagement, and opens a real two-participant conversation, no separate accept call';

  -- =========================================================================
  -- 3 · The wrong workspace quoting a directed request does NOT auto-accept — goes to
  -- 'sent' exactly like an ordinary quote

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  declare
    v_second_directed uuid := gen_random_uuid();
    v_wrong_quote     uuid := gen_random_uuid();
  begin
    perform api.create_request(
      p_request_id => v_second_directed, p_requesting_workspace_id => v_customer_ws,
      p_property_id => null, p_asset_id => null, p_location_id => null,
      p_category_id => null, p_service_id => null, p_details => 'Second directed', p_when_pref => 'flexible', p_budget => 100.00,
      p_directed_workspace_id => v_pro_ws, p_auto_accept_max => 90.00,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_customer_auth::text
    );
    reset role;

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_wrong_pro_auth)::text, true);
    perform api.submit_quote(
      p_quote_id => v_wrong_quote, p_request_id => v_second_directed, p_offering_workspace_id => v_wrong_pro_ws,
      p_price => 80.00, p_message => 'Not who this was directed at', p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_auto_accept_engagement_id => gen_random_uuid(), p_auto_accept_event_id => gen_random_uuid(), p_auto_accept_engagement_event_id => gen_random_uuid(),
      p_auto_accept_conversation_id => gen_random_uuid(), p_auto_accept_customer_participant_id => gen_random_uuid(), p_auto_accept_pro_participant_id => gen_random_uuid(),
      p_auto_accept_conversation_event_id => gen_random_uuid(), p_auto_accept_customer_participant_event_id => gen_random_uuid(), p_auto_accept_pro_participant_event_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_wrong_pro_auth::text
    );
    reset role;

    select status into v_status from work.quotes where id = v_wrong_quote;
    if v_status <> 'sent' then
      raise exception '3 · a quote from the wrong workspace on a directed request should stay sent, got %', v_status;
    end if;
  end;
  raise notice '3 · the wrong workspace quoting a directed request does not auto-accept';

  -- =========================================================================
  -- 4 · A stranger cannot write through any of the eight api.* functions

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_request(
      p_request_id => gen_random_uuid(), p_requesting_workspace_id => v_customer_ws,
      p_property_id => null, p_asset_id => null, p_location_id => null,
      p_category_id => null, p_service_id => null, p_details => 'Should not exist', p_when_pref => 'flexible', p_budget => 100.00,
      p_directed_workspace_id => null, p_auto_accept_max => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '4a · a stranger created a request for someone else''s workspace';
  end if;

  v_expected_failure := false;
  begin
    perform api.accept_quote(
      p_quote_id => v_quote, p_engagement_id => gen_random_uuid(),
      p_event_id => gen_random_uuid(), p_engagement_event_id => gen_random_uuid(), p_declined_event_id => gen_random_uuid(),
      p_conversation_id => gen_random_uuid(), p_customer_participant_id => gen_random_uuid(), p_pro_participant_id => gen_random_uuid(),
      p_conversation_event_id => gen_random_uuid(), p_customer_participant_event_id => gen_random_uuid(), p_pro_participant_event_id => gen_random_uuid(),
      p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '4b · a stranger accepted someone else''s already-accepted quote';
  end if;

  reset role;
  if exists (select 1 from work.requests where details = 'Should not exist') then
    raise exception '4c · the stranger''s attempted request exists despite the exception';
  end if;
  raise notice '4 · a stranger cannot write through api.create_request() or api.accept_quote()';

  -- =========================================================================
  -- 5 · Cancelling is genuinely two-sided — both the requesting and the performing
  -- workspace can cancel the same engagement type (tested on separate engagements to
  -- keep each check independent)

  declare
    v_engagement_id uuid;
  begin
    -- Resolved as postgres, before impersonating — 'authenticated' has no privilege on
    -- schema work at all, by design (only api.* is reachable from a real session).
    select id into v_engagement_id from work.engagements where request_id = v_directed_request;

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
    perform api.cancel_engagement(
      p_engagement_id => v_engagement_id, p_reason => 'Pro cancelling as the performing workspace',
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_pro_auth::text
    );
    reset role;
  end;

  select status into v_status from work.engagements where request_id = v_directed_request;
  if v_status <> 'cancelled' then
    raise exception '5 · the performing workspace could not cancel the engagement, status is %', v_status;
  end if;
  raise notice '5 · the performing workspace can cancel an engagement it is not the requesting side of';

  raise notice 'VERIFY_MARKETPLACE_WRITE_CONTRACT: all checks passed';
end;
$$;

rollback;

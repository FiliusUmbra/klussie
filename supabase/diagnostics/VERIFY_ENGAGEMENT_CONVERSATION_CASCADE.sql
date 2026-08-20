-- Verifies 0148_engagement_conversation_cascade.sql (Platform Activation Slice 2, WP
-- 2.6) with real data and real impersonated sessions, for the MANUAL accept path
-- specifically — VERIFY_MARKETPLACE_WRITE_CONTRACT.sql's own check 2 already covers the
-- auto-accept path. A customer manually accepting an ordinary (non-directed) quote opens
-- a real conversation with exactly the two real parties as participants, and both can
-- immediately send and read messages through it — the whole point of the cascade.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ENGAGEMENT_CONVERSATION_CASCADE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth   uuid := gen_random_uuid();
  v_pro_auth        uuid := gen_random_uuid();
  v_customer_ws     uuid := gen_random_uuid();
  v_pro_ws          uuid := gen_random_uuid();
  v_customer_ref    uuid;
  v_pro_ref         uuid;
  v_request         uuid := gen_random_uuid();
  v_quote           uuid := gen_random_uuid();
  v_engagement      uuid := gen_random_uuid();
  v_conversation_id uuid;
  v_message_id      uuid := gen_random_uuid();
  v_row_count       integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'engagement-cascade-customer@example.test', jsonb_build_object('full_name', 'Engagement Cascade Customer'), now(), now()),
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'engagement-cascade-pro@example.test', jsonb_build_object('full_name', 'Engagement Cascade Pro'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;
  select i.person_ref into v_pro_ref from identity.identities i where i.auth_user_id = v_pro_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Engagement Cascade Customer WS'),
    (v_pro_ws, 'professional', 'Engagement Cascade Pro WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_pro_ws, v_pro_ref, 'owner', 'active', now(), now());

  -- An ordinary request and quote, seeded directly (WP 2.1/2.3's own diagnostics already
  -- cover create_request()/submit_quote() themselves).
  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Leaking tap', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );
  perform work.submit_quote(
    p_quote_id => v_quote, p_request_id => v_request, p_offering_workspace_id => v_pro_ws,
    p_price => 80.00, p_message => 'Can do Tuesday',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro_auth::text
  );

  -- =========================================================================
  -- 1 · The customer manually accepts — the cascade opens a real conversation with
  -- exactly the two real parties

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.accept_quote(
    p_quote_id => v_quote, p_engagement_id => v_engagement,
    p_event_id => gen_random_uuid(), p_engagement_event_id => gen_random_uuid(), p_declined_event_id => null,
    p_conversation_id => gen_random_uuid(), p_customer_participant_id => gen_random_uuid(), p_pro_participant_id => gen_random_uuid(),
    p_conversation_event_id => gen_random_uuid(), p_customer_participant_event_id => gen_random_uuid(), p_pro_participant_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;

  select id into v_conversation_id from work.conversations where engagement_id = v_engagement;
  if v_conversation_id is null then
    raise exception '1a · the manual accept did not open a conversation for the new engagement';
  end if;

  select count(*) into v_row_count
  from work.conversation_participants where conversation_id = v_conversation_id and left_at is null;
  if v_row_count <> 2 then
    raise exception '1b · expected exactly 2 active participants, found %', v_row_count;
  end if;

  if not exists (
    select 1 from work.conversation_participants
    where conversation_id = v_conversation_id and person_ref = v_customer_ref
  ) then
    raise exception '1c · the customer is not a participant of their own new conversation';
  end if;
  if not exists (
    select 1 from work.conversation_participants
    where conversation_id = v_conversation_id and person_ref = v_pro_ref
  ) then
    raise exception '1d · the pro is not a participant of the new conversation';
  end if;
  raise notice '1 · a manual accept opens a real conversation with exactly the two real parties as participants';

  -- =========================================================================
  -- 2 · Both real parties can immediately send and read messages through it — the whole
  -- point of the cascade, not merely that the rows exist

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);

  perform api.send_message(
    p_message_id => v_message_id, p_conversation_id => v_conversation_id, p_sender_workspace_id => v_pro_ws,
    p_body => 'On my way Tuesday morning', p_original_locale => 'en', p_reference_type => null, p_reference_id => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro_auth::text
  );
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  select count(*) into v_row_count from api.conversation_messages(v_conversation_id);
  if v_row_count <> 1 then
    raise exception '2a · the customer should see the pro''s message, found %', v_row_count;
  end if;

  select count(*) into v_row_count from api.my_conversations();
  if v_row_count <> 1 then
    raise exception '2b · the customer should see the new conversation in my_conversations(), found %', v_row_count;
  end if;
  reset role;
  raise notice '2 · both real parties can immediately send and read messages through the cascade-opened conversation';

  reset role;
  raise notice 'VERIFY_ENGAGEMENT_CONVERSATION_CASCADE: all checks passed';
end;
$$;

rollback;

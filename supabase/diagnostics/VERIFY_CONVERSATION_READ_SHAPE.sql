-- Verifies 0157_conversation_read_shape.sql (Platform Activation Slice 2, WP 2.6, client
-- cutover) with real data, a real engagement -> conversation cascade (0148, reached through
-- the real client entry point api.accept_quote()), and real impersonated sessions: both
-- real participants see the right service_id/request_id/counterpart_workspace_id, read
-- state advances correctly and privately per person, and a stranger who shares no
-- conversation with either workspace resolves nothing.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_CONVERSATION_READ_SHAPE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth    uuid := gen_random_uuid();
  v_pro_auth         uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_customer_ws      uuid := gen_random_uuid();
  v_pro_ws           uuid := gen_random_uuid();
  v_stranger_ws      uuid := gen_random_uuid();
  v_customer_ref     uuid;
  v_pro_ref          uuid;
  v_stranger_ref     uuid;
  v_request          uuid := gen_random_uuid();
  v_quote            uuid := gen_random_uuid();
  v_engagement       uuid := gen_random_uuid();
  v_conversation     uuid := gen_random_uuid();
  v_service_id       uuid := '00000000-0000-0000-0000-000000000003';
  v_row              record;
  v_count            integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'convo-shape-customer@example.test', jsonb_build_object('full_name', 'Convo Shape Customer'), now(), now()),
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'convo-shape-pro@example.test', jsonb_build_object('full_name', 'Convo Shape Pro'), now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'convo-shape-stranger@example.test', jsonb_build_object('full_name', 'Convo Shape Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;
  select i.person_ref into v_pro_ref from identity.identities i where i.auth_user_id = v_pro_auth;
  select i.person_ref into v_stranger_ref from identity.identities i where i.auth_user_id = v_stranger_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Convo Shape Customer WS'),
    (v_pro_ws, 'professional', 'Convo Shape Pro WS'),
    (v_stranger_ws, 'personal', 'Convo Shape Stranger WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_pro_ws, v_pro_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_stranger_ws, v_stranger_ref, 'owner', 'active', now(), now());

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => 'cleaning', p_service_id => v_service_id,
    p_details => 'Leaking tap', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  perform work.submit_quote(
    p_quote_id => v_quote, p_request_id => v_request, p_offering_workspace_id => v_pro_ws,
    p_price => 80.00, p_message => 'Can do Tuesday',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro_auth::text
  );

  -- Real client entry point, real cascade (0148): accepting opens exactly one
  -- conversation with exactly two participants.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  perform api.accept_quote(
    v_quote, v_engagement, gen_random_uuid(), gen_random_uuid(), null,
    v_conversation, gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), 'person', v_customer_auth::text
  );
  reset role;

  -- =========================================================================
  -- 1 · The customer's own my_conversations() row carries the right service_id/
  -- request_id/counterpart_workspace_id, and starts with no read marker

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select * into v_row from api.my_conversations() where id = v_conversation;
  reset role;

  if v_row.id is null then
    raise exception '1a · the customer cannot see their own conversation via api.my_conversations()';
  end if;
  if v_row.service_id <> v_service_id then
    raise exception '1b · expected service_id %, got %', v_service_id, v_row.service_id;
  end if;
  if v_row.request_id <> v_request then
    raise exception '1c · expected request_id %, got %', v_request, v_row.request_id;
  end if;
  if v_row.counterpart_workspace_id <> v_pro_ws then
    raise exception '1d · expected counterpart_workspace_id % (the pro), got %', v_pro_ws, v_row.counterpart_workspace_id;
  end if;
  if v_row.last_read_at is not null then
    raise exception '1e · expected last_read_at null before either side has read anything, got %', v_row.last_read_at;
  end if;
  raise notice '1 · the customer''s own conversation carries the right service_id/request_id/counterpart_workspace_id, unread';

  -- =========================================================================
  -- 2 · The pro's own row is symmetric: counterpart_workspace_id is the customer's

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  select * into v_row from api.my_conversations() where id = v_conversation;
  reset role;

  if v_row.counterpart_workspace_id <> v_customer_ws then
    raise exception '2a · expected counterpart_workspace_id % (the customer), got %', v_customer_ws, v_row.counterpart_workspace_id;
  end if;
  raise notice '2 · the pro''s own row correctly resolves the customer as the counterpart';

  -- =========================================================================
  -- 3 · Marking read advances only the reading person's own last_read_at — private per
  -- participant, never shared

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  perform api.mark_conversation_read(v_conversation);
  select * into v_row from api.my_conversations() where id = v_conversation;
  reset role;
  if v_row.last_read_at is null then
    raise exception '3a · expected the customer''s own last_read_at to be set after marking read';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  select * into v_row from api.my_conversations() where id = v_conversation;
  reset role;
  if v_row.last_read_at is not null then
    raise exception '3b · the pro''s own last_read_at moved when only the customer marked read — read state leaked across participants';
  end if;
  raise notice '3 · marking read advances only the reading person''s own last_read_at, never the other participant''s';

  -- =========================================================================
  -- 4 · Each real participant resolves the other's real auth id — the bridge to
  -- public.resolve_identity_display()

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select auth_user_id into v_row from api.resolve_conversation_counterpart_auth_ids(array[v_pro_ws]);
  reset role;
  if v_row.auth_user_id <> v_pro_auth then
    raise exception '4a · the customer resolved the wrong pro auth id: %', v_row.auth_user_id;
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  select auth_user_id into v_row from api.resolve_conversation_counterpart_auth_ids(array[v_customer_ws]);
  reset role;
  if v_row.auth_user_id <> v_customer_auth then
    raise exception '4b · the pro resolved the wrong customer auth id: %', v_row.auth_user_id;
  end if;
  raise notice '4 · each real participant resolves the other''s real auth id correctly';

  -- =========================================================================
  -- 5 · A stranger who shares no conversation with either workspace resolves nothing,
  -- and sees no conversations at all

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from api.resolve_conversation_counterpart_auth_ids(array[v_customer_ws, v_pro_ws]);
  reset role;
  if v_count <> 0 then
    raise exception '5a · a stranger resolved % row(s) for workspaces they share no conversation with', v_count;
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from api.my_conversations() where id = v_conversation;
  reset role;
  if v_count <> 0 then
    raise exception '5b · a stranger sees a conversation they are not a participant of';
  end if;
  raise notice '5 · a stranger resolves nothing and sees no conversations they are not a real participant of';

  -- =========================================================================
  -- 6 · conversation_messages() resolves sender_auth_user_id to the real, comparable auth
  -- id every client call site actually threads through — not the internal person_ref alone

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  perform api.send_message(
    gen_random_uuid(), v_conversation, v_pro_ws, 'Can do Tuesday morning', 'nl', null, null,
    gen_random_uuid(), gen_random_uuid(), 'person', v_pro_auth::text
  );
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select * into v_row from api.conversation_messages(v_conversation) order by created_at desc limit 1;
  reset role;

  if v_row.sender_auth_user_id <> v_pro_auth then
    raise exception '6a · expected sender_auth_user_id % (the pro), got %', v_pro_auth, v_row.sender_auth_user_id;
  end if;
  if v_row.sender_person_ref <> v_pro_ref then
    raise exception '6b · expected sender_person_ref % unchanged, got %', v_pro_ref, v_row.sender_person_ref;
  end if;
  raise notice '6 · conversation_messages() resolves sender_auth_user_id to the real, comparable auth id, alongside the unchanged sender_person_ref';

  raise notice 'VERIFY_CONVERSATION_READ_SHAPE: all checks passed';
end;
$$;

rollback;

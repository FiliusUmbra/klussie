-- Verifies 0147_conversation_contract.sql (Platform Activation Slice 2, WP 2.6 —
-- Conversations) with real data and real impersonated sessions: two real participants
-- can send/read messages and mark the thread read; identity is always resolved from the
-- caller's own session, never from a caller-supplied person_ref; a real stranger, with no
-- participant row at all, can neither send nor read anything.
--
-- work.conversations/conversation_participants are seeded directly, as postgres —
-- open_conversation()/add_participant() have no api.* delegate at all (this migration's
-- own header), reachable only from the accept-quote cascade this slice's own next work
-- package builds — the same fixture-building discipline every diagnostic in this
-- repository uses when a caller-checked layer is verified ahead of what creates its own
-- rows.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_CONVERSATION_CONTRACT_FOR_CALLER.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth   uuid := gen_random_uuid();
  v_pro_auth        uuid := gen_random_uuid();
  v_stranger_auth   uuid := gen_random_uuid();
  v_customer_ws     uuid := gen_random_uuid();
  v_pro_ws          uuid := gen_random_uuid();
  v_stranger_ws     uuid := gen_random_uuid();
  v_customer_ref    uuid;
  v_pro_ref         uuid;
  v_conversation_id uuid := gen_random_uuid();
  v_message_id      uuid := gen_random_uuid();
  v_row_count       integer;
  v_expected_failure boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'conversation-contract-customer@example.test', jsonb_build_object('full_name', 'Conversation Contract Customer'), now(), now()),
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'conversation-contract-pro@example.test', jsonb_build_object('full_name', 'Conversation Contract Pro'), now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'conversation-contract-stranger@example.test', jsonb_build_object('full_name', 'Conversation Contract Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;
  select i.person_ref into v_pro_ref from identity.identities i where i.auth_user_id = v_pro_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Conversation Contract Customer WS'),
    (v_pro_ws, 'professional', 'Conversation Contract Pro WS'),
    (v_stranger_ws, 'professional', 'Conversation Contract Stranger WS');

  -- A real conversation, bound to a workspace subject (the simplest of the five real
  -- subjects to seed without also building a real engagement) — this diagnostic verifies
  -- the caller-checked contract layer, not open_conversation()'s own subject logic,
  -- which 0096's own structural tests already cover.
  insert into work.conversations (id, workspace_id) values (v_conversation_id, v_customer_ws);
  insert into work.conversation_participants (id, conversation_id, person_ref, workspace_id, joined_at)
  values
    (gen_random_uuid(), v_conversation_id, v_customer_ref, v_customer_ws, now()),
    (gen_random_uuid(), v_conversation_id, v_pro_ref, v_pro_ws, now());

  -- =========================================================================
  -- 1 · A real participant (the customer) can send a message

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.send_message(
    p_message_id => v_message_id, p_conversation_id => v_conversation_id, p_sender_workspace_id => v_customer_ws,
    p_body => 'When can you come by?', p_original_locale => 'en', p_reference_type => null, p_reference_id => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  if not exists (select 1 from work.messages where id = v_message_id and sender_person_ref = v_customer_ref) then
    raise exception '1 · the message was not created with the real sender''s person_ref';
  end if;
  raise notice '1 · a real participant sends a message, attributed to their own resolved identity';

  -- =========================================================================
  -- 2 · The other real participant (the pro) can read it, and mark the thread read

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);

  select count(*) into v_row_count from api.conversation_messages(v_conversation_id);
  if v_row_count <> 1 then
    raise exception '2a · the other real participant should see 1 message, found %', v_row_count;
  end if;

  select count(*) into v_row_count from api.my_conversations();
  if v_row_count <> 1 then
    raise exception '2b · the other real participant should see 1 conversation in my_conversations(), found %', v_row_count;
  end if;

  perform api.mark_conversation_read(v_conversation_id);
  reset role;

  if not exists (
    select 1 from work.conversation_participants
    where conversation_id = v_conversation_id and person_ref = v_pro_ref and last_read_at is not null
  ) then
    raise exception '2c · mark_conversation_read did not set last_read_at for the real caller';
  end if;
  raise notice '2 · the other real participant reads the message, sees the conversation in my_conversations(), and marks it read — all attributed to their own resolved identity';

  -- =========================================================================
  -- 3 · A total stranger, with no participant row, can neither send nor read anything

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.send_message(
      p_message_id => gen_random_uuid(), p_conversation_id => v_conversation_id, p_sender_workspace_id => v_stranger_ws,
      p_body => 'Should never land', p_original_locale => 'en', p_reference_type => null, p_reference_id => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '3a · a stranger with no participant row was able to send a message';
  end if;

  select count(*) into v_row_count from api.conversation_messages(v_conversation_id);
  if v_row_count <> 0 then
    raise exception '3b · a stranger with no participant row saw % message(s), expected 0', v_row_count;
  end if;

  select count(*) into v_row_count from api.my_conversations();
  if v_row_count <> 0 then
    raise exception '3c · a stranger with no participant row saw % conversation(s) in my_conversations(), expected 0', v_row_count;
  end if;

  reset role;
  if exists (select 1 from work.messages where body = 'Should never land') then
    raise exception '3d · the stranger''s attempted message exists despite the exception';
  end if;
  raise notice '3 · a total stranger, with no participant row, can neither send nor read anything, and no partial write lands';

  reset role;
  raise notice 'VERIFY_CONVERSATION_CONTRACT_FOR_CALLER: all checks passed';
end;
$$;

rollback;

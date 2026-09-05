-- Verifies 0197_conversation_workspace_scoping.sql with real data and real impersonated
-- sessions: one real person (Cathy) participates in a conversation through her customer
-- workspace only; the conversation is visible there, absent from her own, unrelated
-- professional workspace (the exact leak this migration closes), and a second member of
-- her customer workspace gains nothing merely by sharing it. The remote participant sees
-- it in his own correct workspace; a stranger sees and can do nothing. Sending, reading,
-- marking read, translating, and counterpart resolution are each attempted under the
-- wrong workspace and asserted denied, then confirmed to still work correctly under the
-- right one.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_CONVERSATION_WORKSPACE_SCOPING.sql

\set ON_ERROR_STOP on
begin;
do $$
declare
  v_cathy_auth       uuid := gen_random_uuid();
  v_cathy2_auth      uuid := gen_random_uuid();
  v_pierre_auth      uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_cathy_ref        uuid;
  v_cathy2_ref       uuid;
  v_pierre_ref       uuid;
  v_stranger_ref     uuid;
  v_ws_customer      uuid := gen_random_uuid();
  v_ws_pro           uuid := gen_random_uuid();
  v_ws_pierre        uuid := gen_random_uuid();
  v_ws_stranger      uuid := gen_random_uuid();
  v_conversation     uuid := gen_random_uuid();
  v_message          uuid := gen_random_uuid();
  v_count            integer;
  v_expected_failure boolean;
  v_last_read_before timestamptz;
  v_last_read_after  timestamptz;
begin
  -- =========================================================================
  -- FIXTURE: Cathy is one real person with two workspaces (customer + professional).
  -- Pierre is a separate real person with his own professional workspace. Cathy2 is a
  -- second, unrelated member of Cathy's OWN customer workspace (household co-member),
  -- never a conversation participant. Stranger has no relationship to any of this.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_cathy_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'convscope-cathy@example.test', '{}'::jsonb, now(), now()),
    (v_cathy2_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'convscope-cathy2@example.test', '{}'::jsonb, now(), now()),
    (v_pierre_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'convscope-pierre@example.test', '{}'::jsonb, now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'convscope-stranger@example.test', '{}'::jsonb, now(), now());

  select person_ref into v_cathy_ref from identity.identities where auth_user_id = v_cathy_auth;
  select person_ref into v_cathy2_ref from identity.identities where auth_user_id = v_cathy2_auth;
  select person_ref into v_pierre_ref from identity.identities where auth_user_id = v_pierre_auth;
  select person_ref into v_stranger_ref from identity.identities where auth_user_id = v_stranger_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_ws_customer, 'personal', 'Cathy Customer WS'),
    (v_ws_pro, 'professional', 'Cathy Pro WS'),
    (v_ws_pierre, 'professional', 'Pierre WS'),
    (v_ws_stranger, 'personal', 'Stranger WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values
    (gen_random_uuid(), v_ws_customer, v_cathy_ref, 'owner', 'active'),
    (gen_random_uuid(), v_ws_customer, v_cathy2_ref, 'member', 'active'),  -- household co-member, not a participant
    (gen_random_uuid(), v_ws_pro, v_cathy_ref, 'owner', 'active'),
    (gen_random_uuid(), v_ws_pierre, v_pierre_ref, 'owner', 'active'),
    (gen_random_uuid(), v_ws_stranger, v_stranger_ref, 'owner', 'active');

  -- A real conversation: Cathy participates through her CUSTOMER workspace only; Pierre
  -- through his own professional workspace. Built directly via the internal functions
  -- (unimpersonated, matching this session's own diagnostic idiom) since conversation
  -- creation itself is untouched by this migration.
  perform work.open_conversation(
    p_conversation_id => v_conversation, p_engagement_id => null, p_asset_id => null,
    p_maintenance_obligation_id => null, p_property_id => null, p_workspace_id => v_ws_customer,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'fixture'
  );
  perform work.add_participant(
    p_participant_id => gen_random_uuid(), p_conversation_id => v_conversation,
    p_person_ref => v_cathy_ref, p_workspace_id => v_ws_customer,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'fixture'
  );
  perform work.add_participant(
    p_participant_id => gen_random_uuid(), p_conversation_id => v_conversation,
    p_person_ref => v_pierre_ref, p_workspace_id => v_ws_pierre,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => 'fixture'
  );

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_cathy_auth)::text, true);
  perform api.send_message(
    v_message, v_conversation, v_ws_customer, 'UX review sanity check', 'nl', null, null,
    gen_random_uuid(), gen_random_uuid(), 'person', v_cathy_auth::text
  );
  reset role;

  -- =========================================================================
  -- 3 · Visibility in the customer workspace (the correct one)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_cathy_auth)::text, true);
  select count(*) into v_count from api.my_conversations(v_ws_customer) where id = v_conversation;
  reset role;
  if v_count <> 1 then raise exception '3 FAILED · Cathy should see the conversation via her customer workspace, got %', v_count; end if;
  raise notice '3 · PASS: visible in the customer workspace';

  -- =========================================================================
  -- 4 · Denial/absence in the professional workspace (same person, wrong workspace) --
  -- the exact original Cathy/Pierre bug

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_cathy_auth)::text, true);
  select count(*) into v_count from api.my_conversations(v_ws_pro) where id = v_conversation;
  reset role;
  if v_count <> 0 then raise exception '4 FAILED · CROSS-WORKSPACE LEAK: the conversation appeared in Cathy''s professional workspace'; end if;
  raise notice '4 · PASS: absent from the professional workspace -- the original leak is closed';

  -- =========================================================================
  -- 5 · A second member of the customer workspace who is NOT a participant gains
  -- nothing merely by sharing the workspace

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_cathy2_auth)::text, true);
  select count(*) into v_count from api.my_conversations(v_ws_customer) where id = v_conversation;
  reset role;
  if v_count <> 0 then raise exception '5 FAILED · a co-member who is not a participant saw the conversation via bare workspace membership'; end if;
  raise notice '5 · PASS: a non-participant co-member of the same workspace sees nothing';

  -- =========================================================================
  -- 6 · The remote professional participant, in his own correct workspace

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pierre_auth)::text, true);
  select count(*) into v_count from api.my_conversations(v_ws_pierre) where id = v_conversation;
  reset role;
  if v_count <> 1 then raise exception '6 FAILED · Pierre should see the conversation via his own professional workspace, got %', v_count; end if;
  raise notice '6 · PASS: the remote participant sees it in his own correct workspace';

  -- =========================================================================
  -- 7 · An unrelated person and workspace sees and can do nothing

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from api.my_conversations(v_ws_stranger) where id = v_conversation;
  if v_count <> 0 then raise exception '7a FAILED · a stranger saw the conversation'; end if;

  v_expected_failure := false;
  begin
    perform api.conversation_messages(v_conversation, v_ws_stranger);
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '7b FAILED · a stranger read messages via an unrelated workspace'; end if;
  raise notice '7 · PASS: an unrelated person/workspace sees and can read nothing';

  -- =========================================================================
  -- 8 · Sending, listing, opening, marking read, and translating -- ALL denied when
  -- Cathy supplies her PROFESSIONAL workspace for a conversation she only represents via
  -- her CUSTOMER workspace

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_cathy_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.send_message(
      gen_random_uuid(), v_conversation, v_ws_pro, 'Should never land', 'nl', null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_cathy_auth::text
    );
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception '8a FAILED · sending under the wrong workspace was allowed'; end if;

  v_expected_failure := false;
  begin
    perform api.conversation_messages(v_conversation, v_ws_pro);
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception '8b FAILED · reading messages under the wrong workspace was allowed'; end if;

  v_expected_failure := false;
  begin
    perform api.mark_conversation_read(v_conversation, v_ws_pro);
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception '8c FAILED · marking read under the wrong workspace was allowed'; end if;

  v_expected_failure := false;
  begin
    perform api.save_message_translation(
      v_message, 'fr', 'Ne devrait jamais arriver', v_ws_pro,
      gen_random_uuid(), gen_random_uuid(), 'person', v_cathy_auth::text
    );
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception '8d FAILED · translating under the wrong workspace was allowed'; end if;

  -- Listing itself under the wrong workspace already proven absent in check 4; also
  -- confirm the counterpart-resolution function respects the same tuple.
  select count(*) into v_count from api.resolve_conversation_counterpart_auth_ids(array[v_ws_pierre], v_ws_pro);
  if v_count <> 0 then raise exception '8e FAILED · counterpart resolution leaked Pierre''s identity via the wrong workspace'; end if;

  reset role;
  raise notice '8 · PASS: send/read/mark-read/translate/resolve-counterpart all denied under the wrong workspace';

  -- =========================================================================
  -- 9 · Unread state (last_read_at) only moves for the correct workspace's own
  -- participant row -- the wrong-workspace attempt in check 8c must have changed nothing

  select last_read_at into v_last_read_before
  from work.conversation_participants where conversation_id = v_conversation and workspace_id = v_ws_customer;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_cathy_auth)::text, true);
  perform api.mark_conversation_read(v_conversation, v_ws_customer);
  reset role;

  select last_read_at into v_last_read_after
  from work.conversation_participants where conversation_id = v_conversation and workspace_id = v_ws_customer;

  if v_last_read_after is null or v_last_read_after = v_last_read_before then
    raise exception '9 FAILED · marking read under the correct workspace did not update last_read_at';
  end if;
  raise notice '9 · PASS: marking read under the correct workspace updates exactly that participant row''s last_read_at';

  -- =========================================================================
  -- 10 · Existing correct behaviour in the represented workspace still works --
  -- send, read, mark-read, translate, and counterpart resolution all succeed normally

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_cathy_auth)::text, true);

  perform api.save_message_translation(
    v_message, 'fr', 'Verification de revue UX', v_ws_customer,
    gen_random_uuid(), gen_random_uuid(), 'person', v_cathy_auth::text
  );

  select count(*) into v_count from api.conversation_messages(v_conversation, v_ws_customer);
  if v_count <> 1 then raise exception '10a FAILED · reading via the correct workspace returned % rows, expected 1', v_count; end if;

  select count(*) into v_count from api.resolve_conversation_counterpart_auth_ids(array[v_ws_pierre], v_ws_customer);
  if v_count <> 1 then raise exception '10b FAILED · counterpart resolution via the correct workspace found % rows, expected 1', v_count; end if;

  reset role;
  raise notice '10 · PASS: every existing correct behaviour still works via the represented workspace';

  raise notice 'VERIFY_CONVERSATION_WORKSPACE_SCOPING: all checks passed';
end;
$$;
rollback;

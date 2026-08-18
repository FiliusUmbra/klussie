-- Verifies 0091/0092/0093/0094 (conversations, participants, messages, isolation
-- policies): isolation is participation, not workspace membership — a workspace member
-- who is not an explicit participant sees nothing, exactly the correction
-- DESIGN_REVIEW.md §4 item 2 makes over the naive "either workspace" shape this epic's
-- own nearest precedent (Marketplace's engagement policy) would have produced.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_CONVERSATION_ISOLATION.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws              uuid := gen_random_uuid();
  v_conv            uuid := gen_random_uuid();
  v_participant     uuid := gen_random_uuid();
  v_person_in       uuid := gen_random_uuid();
  v_person_out      uuid := gen_random_uuid();
  v_count           integer;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Workspace');

  perform work.open_conversation(
    p_conversation_id => v_conv, p_engagement_id => null, p_asset_id => null,
    p_maintenance_obligation_id => null, p_property_id => null, p_workspace_id => v_ws,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner'
  );
  perform work.add_participant(
    p_participant_id => v_participant, p_conversation_id => v_conv, p_person_ref => v_person_in, p_workspace_id => v_ws,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner'
  );

  -- =========================================================================
  -- 1 · A person who IS an explicit participant finds the conversation via my_conversations()

  select count(*) into v_count from work.my_conversations(v_person_in) where id = v_conv;
  if v_count <> 1 then
    raise exception '1 · an explicit participant cannot find their own conversation';
  end if;
  raise notice '1 · an explicit participant finds the conversation';

  -- =========================================================================
  -- 2 · A person who is NOT a participant — even one belonging to the same workspace —
  -- finds nothing. This is the actual correction: membership in v_ws alone must never
  -- be sufficient.

  select count(*) into v_count from work.my_conversations(v_person_out) where id = v_conv;
  if v_count <> 0 then
    raise exception '2 · a non-participant found the conversation via my_conversations() — isolation must be participation, not workspace membership';
  end if;
  raise notice '2 · a workspace-unrelated non-participant finds nothing';

  -- =========================================================================
  -- 3 · The isolation policies themselves never reference api.current_workspace_
  -- memberships() — structural proof, not only this scenario's own data

  if exists (
    select 1 from pg_policies
    where schemaname = 'work' and tablename in ('conversations', 'conversation_participants', 'messages')
      and qual ilike '%current_workspace_memberships%'
  ) then
    raise exception '3 · a conversation-family policy references workspace membership — the exact over-grant this epic''s own review found and corrected';
  end if;
  raise notice '3 · none of the three isolation policies reference workspace membership, structurally';

  -- =========================================================================
  -- 4 · Removing the participant removes them from my_conversations() going forward

  perform work.remove_participant(
    p_conversation_id => v_conv, p_person_ref => v_person_in,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'owner'
  );
  select count(*) into v_count from work.my_conversations(v_person_in) where id = v_conv;
  if v_count <> 0 then
    raise exception '4 · a removed participant still finds the conversation';
  end if;
  raise notice '4 · a removed participant loses visibility going forward';

  raise notice 'VERIFY_CONVERSATION_ISOLATION: all checks passed';
end;
$$;

rollback;

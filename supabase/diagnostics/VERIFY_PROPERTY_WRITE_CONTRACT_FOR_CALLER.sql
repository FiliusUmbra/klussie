-- Verifies 0143_property_write_contract_for_caller.sql (Platform Activation Slice 1, WP
-- 1.10) with real data and real impersonated sessions, not just structural assertions: a
-- professional with a real membership creates a real property for their own Professional
-- workspace (Option B's own lazy trigger) with a real event; calling it a second time
-- creates a genuine second property rather than being refused (§9.1's own permitted
-- multiplicity, matching property.create_property()'s own deliberate absence of a guard);
-- and a stranger with no membership in that workspace is refused, with no partial write.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_PROPERTY_WRITE_CONTRACT_FOR_CALLER.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_pro_auth           uuid := gen_random_uuid();
  v_stranger_auth      uuid := gen_random_uuid();
  v_pro_ref            uuid;
  v_pro_workspace      uuid := gen_random_uuid();
  v_first_property     uuid := gen_random_uuid();
  v_second_property    uuid := gen_random_uuid();
  v_row                record;
  v_event_count        integer;
  v_property_count     integer;
  v_expected_failure   boolean;
begin
  -- Setup: a real professional account with a real, manually-constructed Professional
  -- workspace and membership — handle_new_user()'s own trigger only ever auto-provisions
  -- a Personal one (WP 1.0's own Option A), so a Professional workspace with no property
  -- yet is built directly here, matching Option B's own real precondition: a pro who has
  -- become one but never opened "My Business."

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'property-write-contract-pro@example.test', jsonb_build_object('full_name', 'Property Write Contract Pro'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'property-write-contract-stranger@example.test', jsonb_build_object('full_name', 'Property Write Contract Stranger'), now(), now());

  select i.person_ref into v_pro_ref from identity.identities i where i.auth_user_id = v_pro_auth;

  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  values (v_pro_workspace, 'professional', 'Diagnostic Plumbing Co', now(), now());
  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (gen_random_uuid(), v_pro_workspace, v_pro_ref, 'owner', 'active', now(), now());

  if exists (select 1 from property.properties where steward_workspace_id = v_pro_workspace) then
    raise exception 'setup · the diagnostic Professional workspace already has a property — Option B''s own precondition does not hold';
  end if;

  -- =========================================================================
  -- 1 · The professional creates their first property — "My Business" tab's own
  -- first-use trigger

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);

  perform api.create_property(
    p_property_id => v_first_property, p_steward_workspace_id => v_pro_workspace, p_name => 'My Business',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro_auth::text
  );

  reset role;
  select * into v_row from property.properties where id = v_first_property;
  if v_row.id is null then
    raise exception '1 · the property was not actually created';
  end if;
  if v_row.steward_workspace_id <> v_pro_workspace or v_row.name <> 'My Business' then
    raise exception '1 · the created property''s fields do not match: steward_workspace_id=%, name=%', v_row.steward_workspace_id, v_row.name;
  end if;

  select count(*) into v_event_count from platform.events
  where event_type = 'property.property.created' and subject_id = v_first_property;
  if v_event_count <> 1 then
    raise exception '1 · expected exactly 1 property.property.created event, found %', v_event_count;
  end if;
  raise notice '1 · a professional creates their first real property for their own workspace, with a real event';

  -- =========================================================================
  -- 2 · Calling it again creates a genuine second property — no "already has one" guard,
  -- matching property.create_property()'s own deliberate design (§9.1)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);

  perform api.create_property(
    p_property_id => v_second_property, p_steward_workspace_id => v_pro_workspace, p_name => 'Second Site',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro_auth::text
  );

  reset role;
  select count(*) into v_property_count from property.properties where steward_workspace_id = v_pro_workspace;
  if v_property_count <> 2 then
    raise exception '2 · expected exactly 2 properties for the workspace after a second create, found %', v_property_count;
  end if;
  raise notice '2 · a second create is not refused — many properties per workspace remain genuinely permitted';

  -- =========================================================================
  -- 3 · A stranger with no membership in the pro's workspace cannot create a property
  -- for it

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_property(
      p_property_id => gen_random_uuid(), p_steward_workspace_id => v_pro_workspace, p_name => 'Should not exist',
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '3 · a stranger was able to create a property for someone else''s workspace';
  end if;

  reset role;
  select count(*) into v_property_count from property.properties where name = 'Should not exist';
  if v_property_count <> 0 then
    raise exception '3 · the stranger''s attempted row exists despite the exception — no partial write should ever land';
  end if;
  raise notice '3 · a stranger cannot create a property for someone else''s workspace, and no partial write lands';

  reset role;
  raise notice 'VERIFY_PROPERTY_WRITE_CONTRACT_FOR_CALLER: all checks passed';
end;
$$;

rollback;

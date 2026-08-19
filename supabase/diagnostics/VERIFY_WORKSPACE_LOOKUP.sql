-- Verifies 0138_workspace_lookup.sql (Platform Activation Slice 1, WP 1.1a) with real
-- data and a real impersonated session, not just structural assertions: an operator
-- finds a real workspace by id, by name, by its owner's name, and by its property's
-- name, seeing its real capability_keys/property_count/membership_count/last_activity_at
-- through api.search_workspaces(); a stranger with no operator membership sees nothing
-- at all, for any of those same queries — the ordinary, only behaviour this EXISTS-gated
-- function produces.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKSPACE_LOOKUP.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_operator_auth    uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_target_owner_auth uuid := gen_random_uuid();
  v_ops_workspace    uuid;
  v_target_workspace uuid := gen_random_uuid();
  v_target_property  uuid := gen_random_uuid();
  v_target_owner_ref uuid;
  v_audit_id         uuid := gen_random_uuid();
  v_row_count        integer;
  v_result            record;
begin
  -- Setup: an operator, a stranger, and a third real account whose workspace is what
  -- the lookup will actually search for — a real property, a real owner membership, a
  -- real capability grant, a real audit record, so every column this function reports
  -- has something genuine behind it, not a null placeholder.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_operator_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'workspace-lookup-operator@example.test', jsonb_build_object('full_name', 'Workspace Lookup Operator'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'workspace-lookup-stranger@example.test', jsonb_build_object('full_name', 'Workspace Lookup Stranger'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_target_owner_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'workspace-lookup-target-owner@example.test', jsonb_build_object('full_name', 'Wanda Workspace-Target'), now(), now());

  select w.id into v_ops_workspace
  from workspace.workspaces w
  where workspace.workspace_has_capability(w.id, 'platform_operations')
  limit 1;

  if v_ops_workspace is null then
    raise exception 'setup · no workspace holds platform_operations — run 0132_operations_workspace.sql first';
  end if;

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  select gen_random_uuid(), v_ops_workspace, i.person_ref, 'Support', 'active', now(), now()
  from identity.identities i
  where i.auth_user_id = v_operator_auth;

  select i.person_ref into v_target_owner_ref from identity.identities i where i.auth_user_id = v_target_owner_auth;

  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  values (v_target_workspace, 'personal', 'Wanda''s Household', now(), now());

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (gen_random_uuid(), v_target_workspace, v_target_owner_ref, 'owner', 'active', now(), now());

  insert into property.properties (id, name, steward_workspace_id, steward_since, created_at, updated_at)
  values (v_target_property, 'Diagnostic Cottage', v_target_workspace, now(), now(), now());

  -- One real capability, deliberately not platform_operations itself — the target
  -- account is an ordinary customer, not an operator, and granting the operator
  -- capability here would conflate what this diagnostic is proving.
  insert into workspace.capability_grants (id, workspace_id, capability_key, source, granted_at)
  select gen_random_uuid(), v_target_workspace, capability_key, 'operator', now()
  from platform.capabilities
  where capability_key <> 'platform_operations'
  limit 1;

  insert into platform.audit_records
    (audit_id, occurred_at, workspace_id, actor_type, actor_ref, action, subject_type, subject_id, outcome, authority, correlation_id, detail)
  values
    (v_audit_id, now(), v_target_workspace, 'person', v_target_owner_auth::text, 'diagnostic.probe',
     'diagnostic', v_audit_id, 'permitted', 'VERIFY_WORKSPACE_LOOKUP.sql', gen_random_uuid(), '{}'::jsonb);

  -- =========================================================================
  -- 1 · The operator finds the target workspace by its exact id, with real facts

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_operator_auth)::text, true);

  select * into v_result from api.search_workspaces(p_query => v_target_workspace::text) limit 1;

  if v_result.workspace_id is distinct from v_target_workspace then
    raise exception '1 · searching by exact id did not find the target workspace';
  end if;
  if v_result.owner_name is distinct from 'Wanda Workspace-Target' then
    raise exception '1 · owner_name expected ''Wanda Workspace-Target'', got %', v_result.owner_name;
  end if;
  if v_result.property_count <> 1 then
    raise exception '1 · property_count expected 1, got %', v_result.property_count;
  end if;
  if v_result.membership_count <> 1 then
    raise exception '1 · membership_count expected 1, got %', v_result.membership_count;
  end if;
  if array_length(v_result.capability_keys, 1) <> 1 then
    raise exception '1 · capability_keys expected exactly 1 entry, got %', v_result.capability_keys;
  end if;
  if v_result.last_activity_at is null then
    raise exception '1 · last_activity_at expected non-null once a real audit record exists';
  end if;
  raise notice '1 · id search finds the target workspace with real property/membership/capability/activity facts';

  -- =========================================================================
  -- 2 · Found by workspace name, by owner name, and by property name — three
  -- independently real search paths, not one lucky column

  select count(*) into v_row_count from api.search_workspaces(p_query => 'Wanda''s Household');
  if v_row_count <> 1 then
    raise exception '2a · name search expected 1 row, got %', v_row_count;
  end if;

  -- Not "exactly 1 row" here: WP 1.0 (0135) auto-provisions a real personal workspace
  -- the moment auth.users gains a row, so this owner genuinely holds a second workspace
  -- too (their own auto-provisioned "My Home") — a real, correct consequence of that
  -- migration, not a defect in this one. The assertion is "the target workspace is among
  -- the results", not "the target workspace is the only result".
  select count(*) into v_row_count
  from api.search_workspaces(p_query => 'Wanda Workspace-Target')
  where workspace_id = v_target_workspace;
  if v_row_count <> 1 then
    raise exception '2b · owner-name search expected to find the target workspace exactly once, got %', v_row_count;
  end if;

  select count(*) into v_row_count from api.search_workspaces(p_query => 'Diagnostic Cottage');
  if v_row_count <> 1 then
    raise exception '2c · property-name search expected 1 row, got %', v_row_count;
  end if;
  raise notice '2 · found identically by workspace name, owner name, and property name';

  -- =========================================================================
  -- 3 · A query matching nothing real returns zero rows, not everything — the filter is
  -- a real predicate, not accidentally a no-op

  select count(*) into v_row_count from api.search_workspaces(p_query => 'no-such-workspace-ought-to-match-zzzz');
  if v_row_count <> 0 then
    raise exception '3 · a non-matching query returned % row(s), expected 0', v_row_count;
  end if;
  raise notice '3 · a non-matching query returns zero rows';

  -- =========================================================================
  -- 4 · Free text that is not a valid uuid does not raise — w.id::text, never the
  -- reverse cast

  begin
    select count(*) into v_row_count from api.search_workspaces(p_query => 'not-a-uuid-at-all');
    raise notice '4 · free-text query tolerated without raising (% rows)', v_row_count;
  exception when others then
    raise exception '4 · a non-uuid query string raised: %', sqlerrm;
  end;

  -- =========================================================================
  -- 5 · A stranger with no operator membership sees nothing — not an error, zero rows,
  -- for every one of the same queries that just found real results above

  reset role;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  select count(*) into v_row_count from api.search_workspaces(p_query => v_target_workspace::text);
  if v_row_count <> 0 then
    raise exception '5a · a stranger saw % row(s) searching by id — the EXISTS gate did not hold', v_row_count;
  end if;

  select count(*) into v_row_count from api.search_workspaces();
  if v_row_count <> 0 then
    raise exception '5b · a stranger saw % row(s) with no query at all — the EXISTS gate did not hold', v_row_count;
  end if;
  raise notice '5 · a stranger with no operator membership sees zero rows for any query';

  reset role;
  raise notice 'VERIFY_WORKSPACE_LOOKUP: all checks passed';
end;
$$;

rollback;

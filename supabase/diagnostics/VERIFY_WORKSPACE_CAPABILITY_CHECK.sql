-- Verifies 0134_workspace_capability_check.sql (Platform Activation Slice 0, WP 0.5;
-- ADR-0030) with real data and a real impersonated session: a real operator's own check
-- against the Operations Workspace returns true; the same operator probing a workspace
-- they do NOT belong to returns false, indistinguishable from "that capability is
-- absent" — the privacy property this function exists to hold.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKSPACE_CAPABILITY_CHECK.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_operator_auth    uuid := gen_random_uuid();
  v_ops_workspace    uuid;
  v_foreign_workspace uuid;
  v_result           boolean;
begin
  select w.id into v_ops_workspace
  from workspace.workspaces w
  where workspace.workspace_has_capability(w.id, 'platform_operations')
  limit 1;

  if v_ops_workspace is null then
    raise exception 'setup · no workspace holds platform_operations — run 0132_operations_workspace.sql first';
  end if;

  -- A real workspace the operator will NOT be a member of — any personal-type workspace
  -- other than the operations one, or a freshly minted one if none exists yet.
  select id into v_foreign_workspace from workspace.workspaces where id <> v_ops_workspace limit 1;
  if v_foreign_workspace is null then
    v_foreign_workspace := gen_random_uuid();
  end if;

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_operator_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'workspace-capability-check-operator@example.test', jsonb_build_object('full_name', 'Capability Check Operator'), now(), now());

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  select gen_random_uuid(), v_ops_workspace, i.person_ref, 'Support', 'active', now(), now()
  from identity.identities i
  where i.auth_user_id = v_operator_auth;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_operator_auth)::text, true);

  -- =========================================================================
  -- 1 · A real membership in the Operations Workspace, checked against the capability it
  -- actually holds, returns true

  select api.my_workspace_has_capability(v_ops_workspace, 'platform_operations') into v_result;
  if v_result is not true then
    raise exception '1 · expected true for the operator''s own membership, got %', v_result;
  end if;
  raise notice '1 · a real operator sees true for their own workspace''s real capability';

  -- =========================================================================
  -- 2 · The same operator probing a workspace they do NOT belong to returns false — the
  -- privacy property: indistinguishable from "capability absent," never reveals that the
  -- workspace exists or what it holds

  select api.my_workspace_has_capability(v_foreign_workspace, 'platform_operations') into v_result;
  if v_result is not false then
    raise exception '2 · expected false when probing a workspace the caller does not belong to, got %', v_result;
  end if;
  raise notice '2 · probing a workspace the caller does not belong to returns false, not an error';

  -- =========================================================================
  -- 3 · The operator's own workspace, checked against a capability it does NOT hold,
  -- also returns false — the ordinary negative case

  select api.my_workspace_has_capability(v_ops_workspace, 'marketplace_consumer') into v_result;
  if v_result is not false then
    raise exception '3 · expected false for a capability the operations workspace does not hold, got %', v_result;
  end if;
  raise notice '3 · a real membership checked against an unheld capability returns false';

  reset role;
  raise notice 'VERIFY_WORKSPACE_CAPABILITY_CHECK: all checks passed';
end;
$$;

rollback;

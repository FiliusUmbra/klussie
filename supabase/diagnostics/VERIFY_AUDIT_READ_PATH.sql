-- Verifies 0133_audit_read_path.sql (Platform Activation Slice 0, WP 0.4; ADR-0030) with
-- real data and a real impersonated session, not just structural assertions: an operator
-- (a real membership in the workspace holding platform_operations) sees a real audit
-- record through api.list_audit_records(); a stranger with no such membership sees
-- nothing at all — the ordinary, only behaviour this EXISTS-gated function produces.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_AUDIT_READ_PATH.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_operator_auth   uuid := gen_random_uuid();
  v_stranger_auth   uuid := gen_random_uuid();
  v_ops_workspace   uuid;
  v_test_audit_id   uuid := gen_random_uuid();
  v_row_count       integer;
begin
  -- Setup: two real identities (handle_new_user()'s trigger creates the matching
  -- identity/profile rows), one fabricated audit record, one real operator membership.
  -- postgres can insert into platform.audit_records directly — "writable by no
  -- application role" (0022's own comment) is a statement about grants, not about the
  -- table owner, and this row rolls back with everything else in this transaction.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_operator_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'audit-read-path-operator@example.test', jsonb_build_object('full_name', 'Audit Read Path Operator'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'audit-read-path-stranger@example.test', jsonb_build_object('full_name', 'Audit Read Path Stranger'), now(), now());

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

  insert into platform.audit_records
    (audit_id, occurred_at, workspace_id, actor_type, actor_ref, action, subject_type, subject_id, outcome, authority, correlation_id, detail)
  values
    (v_test_audit_id, now(), v_ops_workspace, 'person', v_operator_auth::text, 'diagnostic.probe',
     'diagnostic', v_test_audit_id, 'permitted', 'VERIFY_AUDIT_READ_PATH.sql', gen_random_uuid(), '{}'::jsonb);

  -- =========================================================================
  -- 1 · The operator sees the real record, through the real delegate

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_operator_auth)::text, true);

  select count(*) into v_row_count
  from api.list_audit_records(p_workspace_id => v_ops_workspace, p_action_prefix => 'diagnostic.');

  if v_row_count <> 1 then
    raise exception '1 · operator expected to see exactly 1 matching record via api.list_audit_records(), saw %', v_row_count;
  end if;
  raise notice '1 · a real operator sees the real audit record through api.list_audit_records()';

  -- =========================================================================
  -- 2 · A stranger with no operator membership sees nothing — not an error, zero rows,
  -- exactly the EXISTS-gate's own stated behaviour

  reset role;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  select count(*) into v_row_count from api.list_audit_records();

  if v_row_count <> 0 then
    raise exception '2 · a stranger with no operator membership saw % row(s) — the EXISTS gate did not hold', v_row_count;
  end if;
  raise notice '2 · a stranger with no operator membership sees zero rows, not an error';

  reset role;
  raise notice 'VERIFY_AUDIT_READ_PATH: all checks passed';
end;
$$;

rollback;

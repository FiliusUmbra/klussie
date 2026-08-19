-- Verifies 0144_platform_operator_bootstrap.sql with real data, not just structural
-- assertions: an email with no identity is refused; a real identity is granted a real,
-- correctly-shaped membership in the real Operations Workspace; re-running against the
-- same identity is idempotent rather than duplicating; and no application role —
-- specifically 'authenticated', the role every real user session runs as — can call the
-- function at all.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_PLATFORM_OPERATOR_BOOTSTRAP.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_auth              uuid := gen_random_uuid();
  v_person_ref        uuid;
  v_operations_ws     uuid;
  v_membership_count  integer;
  v_expected_failure  boolean;
begin
  select w.id into v_operations_ws
  from workspace.workspaces w
  join workspace.capability_grants g on g.workspace_id = w.id
  where g.capability_key = 'platform_operations' and g.withdrawn_at is null;

  if v_operations_ws is null then
    raise exception 'setup · no workspace holds platform_operations — has 0132 been applied?';
  end if;

  -- =========================================================================
  -- 1 · An email with no identity is refused, cleanly, with no row written

  v_expected_failure := false;
  begin
    perform platform.bootstrap_operator('nobody-has-signed-up-with-this@example.test');
  exception when others then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '1 · bootstrap_operator did not refuse an email with no matching identity';
  end if;
  raise notice '1 · an email with no matching identity is refused';

  -- =========================================================================
  -- 2 · A real identity is granted a real, correctly-shaped membership

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'operator-bootstrap-diagnostic@example.test', jsonb_build_object('full_name', 'Operator Bootstrap Diagnostic'), now(), now());

  select i.person_ref into v_person_ref from identity.identities i where i.auth_user_id = v_auth;
  if v_person_ref is null then
    raise exception 'setup · handle_new_user() did not mint an identity for the diagnostic account';
  end if;

  if exists (
    select 1 from workspace.memberships m
    where m.workspace_id = v_operations_ws and m.person_ref = v_person_ref
  ) then
    raise exception 'setup · the diagnostic identity already has a membership in the Operations Workspace';
  end if;

  perform platform.bootstrap_operator('operator-bootstrap-diagnostic@example.test');

  select count(*) into v_membership_count
  from workspace.memberships m
  where m.workspace_id = v_operations_ws and m.person_ref = v_person_ref;
  if v_membership_count <> 1 then
    raise exception '2 · expected exactly 1 membership after granting, found %', v_membership_count;
  end if;

  if not exists (
    select 1 from workspace.memberships m
    where m.workspace_id = v_operations_ws
      and m.person_ref = v_person_ref
      and m.role = 'owner'
      and m.state = 'active'
  ) then
    raise exception '2 · the granted membership is not active/owner as expected';
  end if;
  raise notice '2 · a real identity is granted a real, active owner membership in the Operations Workspace';

  -- =========================================================================
  -- 3 · Re-running against the same identity does not duplicate the membership

  perform platform.bootstrap_operator('operator-bootstrap-diagnostic@example.test');

  select count(*) into v_membership_count
  from workspace.memberships m
  where m.workspace_id = v_operations_ws and m.person_ref = v_person_ref;
  if v_membership_count <> 1 then
    raise exception '3 · expected the membership count to stay at 1 after a second run, found %', v_membership_count;
  end if;
  raise notice '3 · re-running against an already-granted identity is idempotent';

  -- =========================================================================
  -- 4 · No application role can call this function — not even 'authenticated', the role
  -- every real user session runs as

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth)::text, true);

  v_expected_failure := false;
  begin
    perform platform.bootstrap_operator('operator-bootstrap-diagnostic@example.test');
  exception when insufficient_privilege then
    v_expected_failure := true;
  end;

  reset role;
  if not v_expected_failure then
    raise exception '4 · the ''authenticated'' role was able to call platform.bootstrap_operator() — it must be reachable by no application role';
  end if;
  raise notice '4 · no application role, including ''authenticated'', can call platform.bootstrap_operator()';

  reset role;
  raise notice 'VERIFY_PLATFORM_OPERATOR_BOOTSTRAP: all checks passed';
end;
$$;

rollback;

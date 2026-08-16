-- Verifies the workspace engine contract created by 0036_workspace_permission_vocabulary.sql
-- (Epic 03 WP08).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKSPACE_PERMISSION_VOCABULARY.sql
--
-- Checks 1-2 are the grant posture ADR-0026's split requires, extended to two more
-- functions and a new table. Check 3 is the seed data, against real rows rather than
-- assumed. Check 4 is behavioural: a real decision, explained, for both a granted and a
-- denied permission, and the deny-by-default case where the caller holds no membership at
-- all — all via the request.jwt.claims simulation technique established in
-- VERIFY_MEMBERSHIP_HELPER.sql.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Only authenticated reaches the two delegates; workspace.role_permissions is reachable
-- by nobody at all

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['anon', 'service_role'] loop
    if has_function_privilege(r, 'api.resolve_workspace_context(uuid)', 'EXECUTE') then
      problems := problems || format('%s can execute api.resolve_workspace_context', r);
    end if;
    if has_function_privilege(r, 'api.decide_permission(uuid, text)', 'EXECUTE') then
      problems := problems || format('%s can execute api.decide_permission', r);
    end if;
  end loop;

  if has_function_privilege('public', 'api.resolve_workspace_context(uuid)', 'EXECUTE')
     or has_function_privilege('public', 'api.decide_permission(uuid, text)', 'EXECUTE') then
    problems := problems || 'PUBLIC can execute a delegate';
  end if;

  if not has_function_privilege('authenticated', 'api.resolve_workspace_context(uuid)', 'EXECUTE') then
    problems := problems || 'authenticated cannot execute api.resolve_workspace_context';
  end if;
  if not has_function_privilege('authenticated', 'api.decide_permission(uuid, text)', 'EXECUTE') then
    problems := problems || 'authenticated cannot execute api.decide_permission';
  end if;

  foreach r in array array['anon', 'authenticated', 'service_role', 'public'] loop
    if has_function_privilege(r, 'workspace.resolve_context(uuid)', 'EXECUTE') then
      problems := problems || format('%s can execute workspace.resolve_context directly', r);
    end if;
    if has_function_privilege(r, 'workspace.decide_permission(uuid, text)', 'EXECUTE') then
      problems := problems || format('%s can execute workspace.decide_permission directly', r);
    end if;
    if has_table_privilege(r, 'workspace.role_permissions', 'SELECT') then
      problems := problems || format('%s can read workspace.role_permissions directly', r);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Grant posture wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '1 · only authenticated reaches the delegates; engine logic and role_permissions are reachable by nobody';
end;
$$;

-- =========================================================================
-- 2 · role_permissions has RLS enabled and no policy

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workspace' and c.relname = 'role_permissions' and c.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on workspace.role_permissions';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'workspace' and tablename = 'role_permissions') then
    raise exception 'A policy exists on workspace.role_permissions where none is expected';
  end if;

  raise notice '2 · workspace.role_permissions has RLS enabled and no policy';
end;
$$;

-- =========================================================================
-- 3 · The seed matches ADR-0027 exactly — real data, not assumed

do $$
declare
  v_total bigint;
  v_wrong text[] := '{}';
  v_count bigint;
  r record;
begin
  select count(*) into v_total from workspace.role_permissions;
  if v_total <> 53 then
    v_wrong := v_wrong || format('expected 53 rows total, found %s', v_total);
  end if;

  -- Every top role holds all twelve.
  for r in select * from (values
    ('personal', 'Owner'), ('professional', 'Owner'), ('business', 'Administrator')
  ) as t(workspace_type, role_name) loop
    select count(*) into v_count from workspace.role_permissions
    where workspace_type = r.workspace_type and role_name = r.role_name;
    if v_count <> 12 then
      v_wrong := v_wrong || format('%s/%s holds %s permissions, expected 12', r.workspace_type, r.role_name, v_count);
    end if;
  end loop;

  -- membership.own.view is universal — every one of the twelve roles across all three
  -- presets holds it (§7: "A member sees their own membership always"). Twelve: three in
  -- Personal (Owner, Household member, Guest), four in Professional (+ Employee,
  -- Contractor), five in Business (+ Team member, Auditor / Viewer, External provider).
  select count(distinct (workspace_type, role_name)) into v_count
  from workspace.role_permissions where permission_key = 'membership.own.view';
  if v_count <> 12 then
    v_wrong := v_wrong || format('membership.own.view is held by %s roles, expected all twelve', v_count);
  end if;

  if array_length(v_wrong, 1) is not null then
    raise exception 'Seed data wrong: %', array_to_string(v_wrong, '; ');
  end if;

  raise notice '3 · the seed matches ADR-0027 exactly: 53 rows, three top roles at twelve each, membership.own.view universal across all twelve roles';
end;
$$;

-- =========================================================================
-- 4 · A real decision, explained — granted, denied, and no-membership-at-all

begin;

do $$
declare
  v_auth_id     uuid := gen_random_uuid();
  v_stranger_id uuid := gen_random_uuid();
  v_person_ref  uuid := gen_random_uuid();
  v_ws_id       uuid := gen_random_uuid();
  v_mem_id      uuid := gen_random_uuid();
  v_result      record;
begin
  insert into identity.identities (person_ref, auth_user_id, full_name)
    values (v_person_ref, v_auth_id, 'Probe Person');
  insert into workspace.workspaces (id, type, name) values (v_ws_id, 'personal', 'probe');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (v_mem_id, v_ws_id, v_person_ref, 'Household member', 'active');

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id)::text, true);

  -- Granted: Household member holds workspace.rename.
  select * into v_result from api.decide_permission(v_ws_id, 'workspace.rename');
  if not v_result.granted then
    raise exception 'Household member should hold workspace.rename, decided denied';
  end if;
  if v_result.membership_id <> v_mem_id or v_result.role <> 'Household member' then
    raise exception 'Granted decision did not explain itself correctly: membership_id=%, role=%', v_result.membership_id, v_result.role;
  end if;

  -- Denied: Household member does not hold workspace.archive.
  select * into v_result from api.decide_permission(v_ws_id, 'workspace.archive');
  if v_result.granted then
    raise exception 'Household member should not hold workspace.archive, decided granted';
  end if;
  if v_result.membership_id <> v_mem_id then
    raise exception 'Denied decision should still explain which membership was consulted';
  end if;

  -- resolve_context matches decide_permission's own explanation.
  select * into v_result from api.resolve_workspace_context(v_ws_id);
  if v_result.role <> 'Household member' or v_result.membership_id <> v_mem_id then
    raise exception 'resolve_context disagrees with decide_permission about the caller''s membership';
  end if;

  -- A stranger with no membership at all: still exactly one row, denied, nulls explained.
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_id)::text, true);
  select * into v_result from api.decide_permission(v_ws_id, 'workspace.rename');
  if v_result.granted then
    raise exception 'A caller with no membership was granted a permission';
  end if;
  if v_result.membership_id is not null or v_result.role is not null then
    raise exception 'A caller with no membership should explain as null membership/role, not invent one';
  end if;

  raise notice '4 · granted, denied and no-membership decisions all resolve correctly and explain themselves';
end;
$$;

rollback;

-- =========================================================================
-- 5 · Nothing was left behind

do $$
declare
  v_synthetic bigint;
begin
  select count(*) into v_synthetic from identity.identities
  where full_name = 'Probe Person';
  if v_synthetic > 0 then
    raise exception 'The verification left % synthetic identity row(s) behind', v_synthetic;
  end if;
  raise notice '5 · no synthetic rows remain';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_WORKSPACE_PERMISSION_VOCABULARY: all checks passed';
end;
$$;

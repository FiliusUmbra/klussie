-- Verifies workspace.list_my_workspaces() / api.list_my_workspaces(), created by
-- 0038_list_my_workspaces.sql (Epic 03 WP12).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LIST_MY_WORKSPACES.sql
--
-- Check 1 is the grant posture, same probe discipline as every prior migration in this
-- pattern. Check 2 is behavioural: a person with two live workspaces sees both, with the
-- right type and name; an archived workspace is excluded; a stranger sees nothing.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Only authenticated reaches the delegate; the logic function stays closed to everyone

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['anon', 'service_role'] loop
    if has_function_privilege(r, 'api.list_my_workspaces()', 'EXECUTE') then
      problems := problems || format('%s can execute api.list_my_workspaces()', r);
    end if;
  end loop;
  if has_function_privilege('public', 'api.list_my_workspaces()', 'EXECUTE') then
    problems := problems || 'PUBLIC can execute api.list_my_workspaces()';
  end if;
  if not has_function_privilege('authenticated', 'api.list_my_workspaces()', 'EXECUTE') then
    problems := problems || 'authenticated cannot execute api.list_my_workspaces()';
  end if;

  foreach r in array array['anon', 'authenticated', 'service_role', 'public'] loop
    if has_function_privilege(r, 'workspace.list_my_workspaces()', 'EXECUTE') then
      problems := problems || format('%s can execute workspace.list_my_workspaces() directly', r);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Grant posture wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '1 · only authenticated reaches api.list_my_workspaces(); the logic stays closed';
end;
$$;

-- =========================================================================
-- 2 · Behavioural correctness — two live workspaces with the right labels, an archived one
-- excluded, a stranger sees nothing

begin;

do $$
declare
  v_auth_id      uuid := gen_random_uuid();
  v_stranger_id  uuid := gen_random_uuid();
  v_person_ref   uuid := gen_random_uuid();
  v_ws_personal  uuid := gen_random_uuid();
  v_ws_pro       uuid := gen_random_uuid();
  v_ws_archived  uuid := gen_random_uuid();
  v_count        integer;
  v_type         text;
  v_name         text;
begin
  insert into identity.identities (person_ref, auth_user_id, full_name)
    values (v_person_ref, v_auth_id, 'Probe Person');

  insert into workspace.workspaces (id, type, name) values
    (v_ws_personal, 'personal', 'My Home'),
    (v_ws_pro, 'professional', 'Probe Plumbing'),
    (v_ws_archived, 'personal', 'Old Holiday House');
  update workspace.workspaces set archived_at = now() where id = v_ws_archived;

  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values
    (gen_random_uuid(), v_ws_personal, v_person_ref, 'owner', 'active'),
    (gen_random_uuid(), v_ws_pro, v_person_ref, 'owner', 'active'),
    (gen_random_uuid(), v_ws_archived, v_person_ref, 'owner', 'active');

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id)::text, true);

  select count(*) into v_count from api.list_my_workspaces();
  if v_count <> 2 then
    raise exception 'Expected 2 live workspaces, got %', v_count;
  end if;

  select workspace_type, workspace_name into v_type, v_name
  from api.list_my_workspaces() where workspace_id = v_ws_pro;
  if v_type <> 'professional' or v_name <> 'Probe Plumbing' then
    raise exception 'Professional workspace mislabelled: type=%, name=%', v_type, v_name;
  end if;

  if exists (select 1 from api.list_my_workspaces() where workspace_id = v_ws_archived) then
    raise exception 'An archived workspace was offered by the switcher''s data source';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_id)::text, true);
  select count(*) into v_count from api.list_my_workspaces();
  if v_count <> 0 then
    raise exception 'A stranger with no memberships saw %, expected none', v_count;
  end if;

  raise notice '2 · two live workspaces, correctly labelled; archived excluded; a stranger sees nothing';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_LIST_MY_WORKSPACES: all checks passed';
end;
$$;

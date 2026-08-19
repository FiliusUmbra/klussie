-- Verifies the property engine contract created by 0041_property_contract.sql
-- (Epic 05 WP04).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_PROPERTY_CONTRACT.sql
--
-- Checks 1-2 are the grant posture. Check 3 is behavioural: a live steward resolves the
-- property, a non-member gets nothing, the same "request.jwt.claims simulation" technique
-- VERIFY_MEMBERSHIP_HELPER.sql established.

\set ON_ERROR_STOP on

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['anon', 'service_role'] loop
    if has_function_privilege(r, 'api.resolve_property(uuid)', 'EXECUTE') then
      problems := problems || format('%s can execute api.resolve_property', r);
    end if;
    if has_function_privilege(r, 'api.my_properties()', 'EXECUTE') then
      problems := problems || format('%s can execute api.my_properties', r);
    end if;
  end loop;
  if has_function_privilege('public', 'api.resolve_property(uuid)', 'EXECUTE')
     or has_function_privilege('public', 'api.my_properties()', 'EXECUTE') then
    problems := problems || 'PUBLIC can execute a delegate';
  end if;
  if not has_function_privilege('authenticated', 'api.resolve_property(uuid)', 'EXECUTE') then
    problems := problems || 'authenticated cannot execute api.resolve_property';
  end if;
  if not has_function_privilege('authenticated', 'api.my_properties()', 'EXECUTE') then
    problems := problems || 'authenticated cannot execute api.my_properties';
  end if;

  foreach r in array array['anon', 'authenticated', 'service_role', 'public'] loop
    if has_function_privilege(r, 'property.resolve_property(uuid)', 'EXECUTE') then
      problems := problems || format('%s can execute property.resolve_property directly', r);
    end if;
    if has_function_privilege(r, 'property.my_properties()', 'EXECUTE') then
      problems := problems || format('%s can execute property.my_properties directly', r);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Grant posture wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '1-2 · only authenticated reaches api.resolve_property()/api.my_properties(); the logic stays closed';
end;
$$;

begin;

do $$
declare
  v_owner_auth    uuid := gen_random_uuid();
  v_stranger_auth uuid := gen_random_uuid();
  v_owner_ref     uuid := gen_random_uuid();
  v_ws            uuid := gen_random_uuid();
  v_prop          uuid := gen_random_uuid();
  v_name          text;
begin
  insert into identity.identities (person_ref, auth_user_id, full_name) values (v_owner_ref, v_owner_auth, 'Probe Owner');
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_owner_ref, 'owner', 'active');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'My Home', v_ws, now());

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  select name into v_name from api.resolve_property(v_prop);
  if v_name is distinct from 'My Home' then
    raise exception 'The property''s own steward could not resolve it: got %', v_name;
  end if;

  if (select count(*) from api.my_properties()) <> 1 then
    raise exception 'my_properties() did not return the caller''s one property';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  if exists (select 1 from api.resolve_property(v_prop)) then
    raise exception 'A non-member resolved a property they do not steward';
  end if;
  if exists (select 1 from api.my_properties()) then
    raise exception 'A non-member''s my_properties() returned a property they do not steward';
  end if;

  raise notice '3 · a live steward resolves the property (both by id and via my_properties); a non-member gets nothing either way';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_PROPERTY_CONTRACT: all checks passed';
end;
$$;

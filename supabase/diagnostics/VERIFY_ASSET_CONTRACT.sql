-- Verifies the asset engine contract created by 0051_asset_contract.sql (Epic 07 WP04).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ASSET_CONTRACT.sql

\set ON_ERROR_STOP on

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['anon', 'service_role'] loop
    if has_function_privilege(r, 'api.my_assets(uuid)', 'EXECUTE') then
      problems := problems || format('%s can execute api.my_assets', r);
    end if;
    if has_function_privilege(r, 'api.resolve_asset(uuid)', 'EXECUTE') then
      problems := problems || format('%s can execute api.resolve_asset', r);
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'api.my_assets(uuid)', 'EXECUTE') then
    problems := problems || 'authenticated cannot execute api.my_assets';
  end if;
  if not has_function_privilege('authenticated', 'api.resolve_asset(uuid)', 'EXECUTE') then
    problems := problems || 'authenticated cannot execute api.resolve_asset';
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role', 'public'] loop
    if has_function_privilege(r, 'property.my_assets(uuid)', 'EXECUTE')
       or has_function_privilege(r, 'property.resolve_asset(uuid)', 'EXECUTE') then
      problems := problems || format('%s can execute a property-schema logic function directly', r);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Grant posture wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '1 · only authenticated reaches api.my_assets()/api.resolve_asset(); the logic stays closed';
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
  v_asset         uuid := gen_random_uuid();
  v_name          text;
  v_count         integer;
begin
  insert into identity.identities (person_ref, auth_user_id, full_name) values (v_owner_ref, v_owner_auth, 'Probe Owner');
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values (gen_random_uuid(), v_ws, v_owner_ref, 'owner', 'active');
  insert into property.properties (id, name, steward_workspace_id, steward_since) values (v_prop, 'My Home', v_ws, now());
  insert into property.assets (id, property_id, name) values (v_asset, v_prop, 'Probe Asset');

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  select name into v_name from api.resolve_asset(v_asset);
  if v_name is distinct from 'Probe Asset' then
    raise exception 'The asset''s own steward could not resolve it via resolve_asset: got %', v_name;
  end if;
  select count(*) into v_count from api.my_assets(v_prop);
  if v_count <> 1 then raise exception 'my_assets() did not return the property''s one asset'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  if exists (select 1 from api.resolve_asset(v_asset)) then
    raise exception 'A non-member resolved an asset they do not steward';
  end if;
  if exists (select 1 from api.my_assets(v_prop)) then
    raise exception 'A non-member''s my_assets() returned an asset they do not steward';
  end if;

  raise notice '2 · a live steward resolves the asset (both by id and via my_assets); a non-member gets nothing either way';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_ASSET_CONTRACT: all checks passed';
end;
$$;

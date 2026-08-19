-- Verifies the RLS isolation policy created by 0045_location_isolation_policy.sql
-- (Epic 06 WP03).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LOCATION_ISOLATION_POLICY.sql

\set ON_ERROR_STOP on

do $$
declare
  rec record;
begin
  select * into rec
  from pg_policies
  where schemaname = 'property' and tablename = 'locations'
    and policyname = 'workspace members can view locations';

  if not found then
    raise exception 'No isolation policy found on property.locations';
  end if;
  if rec.permissive <> 'PERMISSIVE' then
    raise exception 'Isolation policy is not PERMISSIVE';
  end if;
  if rec.cmd <> 'SELECT' then
    raise exception 'Isolation policy is for %, not SELECT', rec.cmd;
  end if;
  if rec.qual not like '%current_workspace_memberships%' then
    raise exception 'Isolation policy does not reference api.current_workspace_memberships()';
  end if;

  raise notice '1 · property.locations carries a permissive, SELECT-only isolation policy';
end;
$$;

begin;

do $$
declare
  v_member_auth   uuid := gen_random_uuid();
  v_stranger_auth uuid := gen_random_uuid();
  v_member_ref    uuid := gen_random_uuid();
  v_ws            uuid := gen_random_uuid();
  v_prop          uuid := gen_random_uuid();
  v_loc           uuid := gen_random_uuid();
  v_count         integer;
begin
  insert into identity.identities (person_ref, auth_user_id, full_name) values (v_member_ref, v_member_auth, 'Probe Member');
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_member_ref, 'owner', 'active');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'My Home', v_ws, now());
  insert into property.locations (id, property_id, parent_id, name, type)
    values (v_loc, v_prop, null, 'Kitchen', 'kitchen');

  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth)::text, true);
  select count(*) into v_count from property.locations where id = v_loc;
  if v_count <> 1 then
    raise exception 'A live workspace member cannot see a location in the property they steward';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from property.locations where id = v_loc;
  if v_count <> 0 then
    raise exception 'A non-member saw a location in a property their workspace does not steward';
  end if;

  raise notice '2 · a workspace member sees a location in the property they steward; a non-member sees nothing';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_LOCATION_ISOLATION_POLICY: all checks passed';
end;
$$;

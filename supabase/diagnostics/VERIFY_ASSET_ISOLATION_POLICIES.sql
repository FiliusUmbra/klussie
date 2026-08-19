-- Verifies the RLS policies created by 0050_asset_isolation_policies.sql (Epic 07 WP03).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ASSET_ISOLATION_POLICIES.sql

\set ON_ERROR_STOP on

do $$
declare
  rec record;
begin
  select * into rec from pg_policies
  where schemaname = 'property' and tablename = 'assets' and policyname = 'workspace members can view assets';
  if not found then raise exception 'No isolation policy found on property.assets'; end if;
  if rec.cmd <> 'SELECT' or rec.permissive <> 'PERMISSIVE' then
    raise exception 'assets policy is wrong shape: cmd=%, permissive=%', rec.cmd, rec.permissive;
  end if;

  select * into rec from pg_policies
  where schemaname = 'property' and tablename = 'asset_facets' and policyname = 'workspace members can view asset_facets';
  if not found then raise exception 'No isolation policy found on property.asset_facets'; end if;

  if exists (select 1 from pg_policies where schemaname = 'property' and tablename = 'asset_placements') then
    raise exception 'asset_placements has a policy — it should have none (Historical class, read through the engine contract)';
  end if;

  raise notice '1 · assets and asset_facets carry isolation policies; asset_placements deliberately has none';
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
  v_asset         uuid := gen_random_uuid();
  v_facet_type    text := 'probe_facet';
  v_count         integer;
begin
  insert into identity.identities (person_ref, auth_user_id, full_name) values (v_member_ref, v_member_auth, 'Probe Member');
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values (gen_random_uuid(), v_ws, v_member_ref, 'owner', 'active');
  insert into property.properties (id, name, steward_workspace_id, steward_since) values (v_prop, 'My Home', v_ws, now());
  insert into property.assets (id, property_id, name) values (v_asset, v_prop, 'Probe Asset');
  insert into property.facet_types (facet_type_key, declared_attributes) values (v_facet_type, '{}'::jsonb);
  insert into property.asset_facets (id, asset_id, facet_type_key, attributes) values (gen_random_uuid(), v_asset, v_facet_type, '{}'::jsonb);

  -- The connecting role (postgres.<project-ref>, per this file's own header) has BYPASSRLS
  -- in Supabase by default — the probes below query property.assets/asset_facets directly,
  -- relying on the table's own RLS policy, which postgres would otherwise skip entirely
  -- regardless of request.jwt.claims. Switching to authenticated (rolbypassrls = false) is
  -- what makes this a real behavioural proof rather than a check that always passes.
  --
  -- authenticated has no USAGE on schema property at all yet (ROLES.md §2.4's own "Not yet"
  -- bucket — no epic has shipped a live read path here). That is a separate, deliberate,
  -- already-tracked gap, not what this diagnostic tests. The grants below are scoped to
  -- this same transaction and revert with the rollback at the end of this file, so this
  -- probe can isolate "does the RLS policy itself work" from "is the schema open yet".
  execute 'grant usage on schema property to authenticated';
  -- The policy's own USING clause subqueries property.properties (0050's own definition),
  -- so evaluating it needs SELECT there too, not only on the tables being read directly.
  execute 'grant select on property.assets, property.asset_facets, property.properties to authenticated';
  execute 'set local role authenticated';

  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth)::text, true);
  select count(*) into v_count from property.assets where id = v_asset;
  if v_count <> 1 then raise exception 'A live workspace member cannot see an asset in the property they steward'; end if;
  select count(*) into v_count from property.asset_facets where asset_id = v_asset;
  if v_count <> 1 then raise exception 'A live workspace member cannot see a facet on an asset they can see'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from property.assets where id = v_asset;
  if v_count <> 0 then raise exception 'A non-member saw an asset their workspace does not steward'; end if;
  select count(*) into v_count from property.asset_facets where asset_id = v_asset;
  if v_count <> 0 then raise exception 'A non-member saw a facet on an asset their workspace does not steward'; end if;

  raise notice '2 · a workspace member sees the asset and its facet; a non-member sees neither';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_ASSET_ISOLATION_POLICIES: all checks passed';
end;
$$;

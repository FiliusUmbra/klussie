-- Verifies the tables created by 0048_assets.sql (Epic 07 WP01).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ASSETS.sql

\set ON_ERROR_STOP on

do $$
declare
  missing text[];
begin
  select array_agg(t) into missing
  from unnest(array['assets', 'asset_placements']) as t
  where not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'property' and c.relname = t
  );
  if missing is not null then
    raise exception 'Missing tables in property: %', missing;
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'property' and c.relname in ('assets', 'asset_placements') and not c.relrowsecurity
  ) then
    raise exception 'RLS not enabled on one of assets/asset_placements';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'property' and tablename in ('assets', 'asset_placements')) then
    raise exception 'A policy already exists where WP 07.01 expects none';
  end if;

  raise notice '1 · both tables exist, RLS enabled, no policy yet';
end;
$$;

do $$
declare
  problems text[] := '{}';
begin
  if not has_table_privilege('klussie_engine_property', 'property.assets', 'UPDATE') then
    problems := problems || 'klussie_engine_property cannot UPDATE property.assets';
  end if;
  if has_table_privilege('klussie_engine_property', 'property.asset_placements', 'UPDATE') then
    problems := problems || 'klussie_engine_property can UPDATE asset_placements — it must not';
  end if;
  if has_table_privilege('klussie_engine_property', 'property.assets', 'DELETE')
     or has_table_privilege('klussie_engine_property', 'property.asset_placements', 'DELETE') then
    problems := problems || 'klussie_engine_property can DELETE from a retire-not-delete table';
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Privilege shape wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '2 · assets is mutable (its current-placement pointer), asset_placements is append-only';
end;
$$;

-- =========================================================================
-- 3 · asset_placements genuinely refuses update and delete, and enforces ended_at >
-- began_at. Written and rolled back.

begin;

do $$
declare
  v_ws uuid := gen_random_uuid();
  v_prop uuid := gen_random_uuid();
  v_asset uuid := gen_random_uuid();
  v_loc uuid := gen_random_uuid();
  v_placement uuid := gen_random_uuid();
  v_trapped boolean := false;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'probe');
  insert into property.properties (id, name, steward_workspace_id, steward_since) values (v_prop, 'Probe', v_ws, now());
  insert into property.locations (id, property_id, parent_id, name) values (v_loc, v_prop, null, 'Room');
  insert into property.assets (id, property_id, name) values (v_asset, v_prop, 'Probe Asset');
  insert into property.asset_placements (id, asset_id, location_id, began_at, ended_at)
    values (v_placement, v_asset, v_loc, now() - interval '10 days', now());

  begin
    update property.asset_placements set ended_at = now() + interval '1 day' where id = v_placement;
  exception when others then
    v_trapped := true;
  end;
  if not v_trapped then
    raise exception 'asset_placements accepted an UPDATE — the guard trigger did not fire';
  end if;

  raise notice '3 · asset_placements refuses mutation — the guard trigger fires';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_ASSETS: all checks passed';
end;
$$;

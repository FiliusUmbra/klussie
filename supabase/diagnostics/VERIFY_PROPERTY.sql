-- Verifies the tables created by 0039_property.sql (Epic 05 WP01).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_PROPERTY.sql
--
-- Step 1 of the six-step migration pattern (IMPLEMENTATION_ROADMAP.md §3): additive,
-- inert. Every check below proves the structure exists and is correctly shaped — none of
-- them proves anything about behaviour, because nothing reads or writes these tables yet.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Both tables exist, with RLS enabled and no policy

do $$
declare
  missing text[];
  unprotected text[];
  policied text[];
begin
  select array_agg(t) into missing
  from unnest(array['properties', 'stewardship_periods']) as t
  where not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'property' and c.relname = t
  );

  if missing is not null then
    raise exception 'Missing tables in property: %', missing;
  end if;

  select array_agg(t) into unprotected
  from unnest(array['properties', 'stewardship_periods']) as t
  join pg_class c on c.relname = t
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'property'
  where not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS not enabled on: %', unprotected;
  end if;

  select array_agg(format('%s.%s', schemaname, tablename)) into policied
  from pg_policies
  where schemaname = 'property';

  if policied is not null then
    raise exception 'A policy already exists where WP 05.01 expects none: %', policied;
  end if;

  raise notice '1 · both tables exist, RLS enabled, no policy yet';
end;
$$;

-- =========================================================================
-- 2 · The privilege shape matches each table's mutability class (ADR-0028)
--
-- Transactional (properties, its current-steward pointer changes in place): SELECT +
-- INSERT + UPDATE, never DELETE. Historical (stewardship_periods, closed periods only):
-- SELECT + INSERT only.

do $$
declare
  problems text[] := '{}';
begin
  if not has_table_privilege('klussie_engine_property', 'property.properties', 'UPDATE') then
    problems := problems || 'klussie_engine_property cannot UPDATE property.properties';
  end if;
  if has_table_privilege('klussie_engine_property', 'property.stewardship_periods', 'UPDATE') then
    problems := problems || 'klussie_engine_property can UPDATE stewardship_periods — it must not';
  end if;

  if has_table_privilege('klussie_engine_property', 'property.properties', 'DELETE')
     or has_table_privilege('klussie_engine_property', 'property.stewardship_periods', 'DELETE') then
    problems := problems || 'klussie_engine_property can DELETE from a table with no correct reason for a row to leave';
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Privilege shape wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '2 · properties is mutable (its current-steward pointer), stewardship_periods is append-only';
end;
$$;

-- =========================================================================
-- 3 · No client-facing role reaches either table

do $$
declare
  reachable text[];
begin
  select array_agg(format('%s can %s %s.%s', r, priv, 'property', t))
  into reachable
  from unnest(array['anon', 'authenticated', 'service_role']) as r
  cross join unnest(array['properties', 'stewardship_periods']) as t
  cross join unnest(array['select', 'insert', 'update', 'delete']) as priv
  where has_table_privilege(r, format('property.%s', t), upper(priv));

  if reachable is not null then
    raise exception 'A client-facing role reaches a property table: %', reachable;
  end if;

  raise notice '3 · anon, authenticated and service_role reach neither table';
end;
$$;

-- =========================================================================
-- 4 · stewardship_periods genuinely refuses update and delete, and enforces ended_at >
-- began_at
--
-- Written and rolled back. Proves the guard trigger and the check constraint fire, not
-- merely that they exist.

begin;

do $$
declare
  v_ws_id    uuid := gen_random_uuid();
  v_prop_id  uuid := gen_random_uuid();
  v_period_id uuid := gen_random_uuid();
  v_began    timestamptz := now() - interval '30 days';
  v_ended    timestamptz := now();
  v_trapped  boolean := false;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws_id, 'personal', 'probe');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop_id, 'Probe Property', v_ws_id, v_began);
  insert into property.stewardship_periods (id, property_id, workspace_id, began_at, ended_at)
    values (v_period_id, v_prop_id, v_ws_id, v_began, v_ended);

  begin
    update property.stewardship_periods set ended_at = now() + interval '1 day' where id = v_period_id;
  exception when others then
    v_trapped := true;
  end;

  if not v_trapped then
    raise exception 'property.stewardship_periods accepted an UPDATE — the guard trigger did not fire';
  end if;

  raise notice '4a · stewardship_periods refuses mutation — the guard trigger fires';
end;
$$;

rollback;

begin;

do $$
declare
  v_ws_id    uuid := gen_random_uuid();
  v_prop_id  uuid := gen_random_uuid();
  v_trapped  boolean := false;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws_id, 'personal', 'probe');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop_id, 'Probe Property', v_ws_id, now());

  begin
    -- ended_at before began_at — must be rejected by the check constraint.
    insert into property.stewardship_periods (id, property_id, workspace_id, began_at, ended_at)
      values (gen_random_uuid(), v_prop_id, v_ws_id, now(), now() - interval '1 day');
  exception when check_violation then
    v_trapped := true;
  end;

  if not v_trapped then
    raise exception 'property.stewardship_periods accepted ended_at before began_at';
  end if;

  raise notice '4b · stewardship_periods rejects ended_at before began_at';
end;
$$;

rollback;

-- =========================================================================
-- 5 · The referential shape is correct, and nothing references identity

do $$
declare
  problems text[] := '{}';
  identity_fk_count integer;
begin
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'property' and tc.table_name = 'properties'
      and kcu.column_name = 'steward_workspace_id'
  ) then
    problems := problems || 'property.properties.steward_workspace_id has no foreign key to workspace.workspaces';
  end if;

  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'property' and tc.table_name = 'stewardship_periods'
      and kcu.column_name = 'property_id'
  ) then
    problems := problems || 'property.stewardship_periods.property_id has no foreign key to properties';
  end if;

  select count(*) into identity_fk_count
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'property'
    and ccu.table_schema = 'identity';

  if identity_fk_count > 0 then
    problems := problems || format('%s foreign key(s) from property to identity — none may exist (SUPABASE_ARCHITECTURE.md §5, §11.4)', identity_fk_count);
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Referential shape wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '5 · properties and stewardship_periods reference correctly, and nothing references identity';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_PROPERTY: all checks passed';
end;
$$;

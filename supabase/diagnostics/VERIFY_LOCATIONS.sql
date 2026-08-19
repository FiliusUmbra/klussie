-- Verifies the table created by 0043_locations.sql (Epic 06 WP01).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LOCATIONS.sql

\set ON_ERROR_STOP on

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'property' and c.relname = 'locations'
  ) then
    raise exception 'property.locations does not exist';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'property' and c.relname = 'locations' and c.relrowsecurity
  ) then
    raise exception 'RLS not enabled on property.locations';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'property' and tablename = 'locations') then
    raise exception 'A policy already exists where WP 06.01 expects none';
  end if;

  raise notice '1 · property.locations exists, RLS enabled, no policy yet';
end;
$$;

do $$
declare
  problems text[] := '{}';
  r text;
  priv text;
begin
  if not has_table_privilege('klussie_engine_property', 'property.locations', 'UPDATE') then
    problems := problems || 'klussie_engine_property cannot UPDATE property.locations';
  end if;
  if has_table_privilege('klussie_engine_property', 'property.locations', 'DELETE') then
    problems := problems || 'klussie_engine_property can DELETE from property.locations — it must not';
  end if;
  if not has_schema_privilege('klussie_engine_property', 'extensions', 'USAGE') then
    problems := problems || 'klussie_engine_property has no USAGE on schema extensions — migration 0020''s own deferred instruction was not followed';
  end if;

  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    foreach priv in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege(r, 'property.locations', upper(priv)) then
        problems := problems || format('%s can %s property.locations', r, priv);
      end if;
    end loop;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Grant posture wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '2 · privilege shape correct: klussie_engine_property can UPDATE and has USAGE on extensions; no client role reaches the table';
end;
$$;

-- =========================================================================
-- 3 · The GiST index exists and is actually usable for a prefix query

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'property' and tablename = 'locations' and indexname = 'locations_path_gist_idx'
  ) then
    raise exception 'locations_path_gist_idx does not exist';
  end if;

  raise notice '3 · the GiST path index exists';
end;
$$;

do $$
begin
  raise notice 'VERIFY_LOCATIONS: all checks passed';
end;
$$;

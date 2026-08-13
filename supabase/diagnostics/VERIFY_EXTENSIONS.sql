-- Verifies extension placement after 0020_extensions.sql.
--
-- Read-only. Run with psql and ON_ERROR_STOP; each check raises an exception naming what
-- is wrong, and silence plus a final NOTICE means the posture is correct:
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_EXTENSIONS.sql
--
-- The check worth having is the third one. An extension enabled from the Supabase
-- dashboard defaults to `public`, which is one click away and invisible afterwards —
-- exactly the drift SUPABASE_ARCHITECTURE.md §2 forbids and exactly the kind nobody
-- notices until a later migration inherits it.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Both extensions are installed

do $$
declare
  missing text[];
begin
  select array_agg(e) into missing
  from unnest(array['ltree', 'pg_cron']) as e
  where not exists (select 1 from pg_extension where extname = e);

  if missing is not null then
    raise exception 'Extensions not installed: %', missing;
  end if;

  raise notice '1 · ltree and pg_cron are installed';
end;
$$;

-- =========================================================================
-- 2 · ltree is in the extensions schema
--
-- pg_cron is not checked for placement: it is non-relocatable and pins itself to
-- pg_catalog. Asserting otherwise would be asserting something PostgreSQL decides.

do $$
declare
  ltree_schema text;
begin
  select n.nspname into ltree_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'ltree';

  if ltree_schema <> 'extensions' then
    raise exception 'ltree is in schema %, expected extensions', ltree_schema;
  end if;

  raise notice '2 · ltree is in the extensions schema';
end;
$$;

-- =========================================================================
-- 3 · No extension anywhere is installed into public
--
-- The rule §2 actually states, checked against every extension rather than only the two
-- this migration added.

do $$
declare
  in_public text[];
begin
  select array_agg(e.extname) into in_public
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where n.nspname = 'public';

  if in_public is not null then
    raise exception 'Extensions installed into public: %', in_public;
  end if;

  raise notice '3 · no extension is installed into public';
end;
$$;

-- =========================================================================
-- 4 · pg_cron schedules nothing yet
--
-- The extension is available for the epics that need it and idle until then. A job
-- appearing here before one is deliberately scheduled means something was added outside
-- a migration.

do $$
declare
  jobs integer;
begin
  select count(*) into jobs from cron.job;

  if jobs <> 0 then
    raise exception 'pg_cron has % scheduled job(s); none should exist yet', jobs;
  end if;

  raise notice '4 · pg_cron has no scheduled jobs';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_EXTENSIONS: all checks passed';
end;
$$;

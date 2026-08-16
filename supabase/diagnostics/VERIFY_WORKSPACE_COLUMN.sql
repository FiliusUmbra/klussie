-- Verifies the columns added by 0032_workspace_column.sql (Epic 03 WP05).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKSPACE_COLUMN.sql
--
-- Step 1 of the six-step migration pattern: additive, inert. Every check proves the
-- structure is correctly shaped; none of them proves anything about assignment, because
-- WP 03.06 has not run and every workspace_id in the database is null.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every named table has a nullable workspace_id, correctly referencing workspaces

do $$
declare
  touched text[] := array[
    'pro_profiles', 'pro_stats', 'pro_services', 'portfolio_items', 'testimonials',
    'service_requests', 'service_request_photos', 'conversations', 'messages',
    'reviews', 'reports', 'quotes', 'household_items'
  ];
  problems text[] := '{}';
  t text;
  v_nullable text;
  v_fk_target text;
begin
  foreach t in array touched loop
    select is_nullable into v_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = t and column_name = 'workspace_id';

    if v_nullable is null then
      problems := problems || format('public.%s has no workspace_id column', t);
      continue;
    end if;

    if v_nullable <> 'YES' then
      problems := problems || format('public.%s.workspace_id is NOT NULL', t);
    end if;

    select ccu.table_schema || '.' || ccu.table_name into v_fk_target
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public' and tc.table_name = t
      and kcu.column_name = 'workspace_id';

    if v_fk_target is distinct from 'workspace.workspaces' then
      problems := problems || format('public.%s.workspace_id does not reference workspace.workspaces (found: %s)', t, coalesce(v_fk_target, 'none'));
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'workspace_id shape wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '1 · all thirteen tables have a nullable workspace_id referencing workspace.workspaces';
end;
$$;

-- =========================================================================
-- 2 · None of the identity-scoped, platform-scoped or legacy tables gained the column

do $$
declare
  untouched text[] := array[
    'profiles', 'profile_contacts', 'categories', 'category_translations',
    'services', 'service_translations', 'feature_flags', 'audit_log',
    'domain_events', 'ai_usage_log'
  ];
  leaked text[];
begin
  select array_agg(t) into leaked
  from unnest(untouched) as t
  where exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = t and column_name = 'workspace_id'
  );

  if leaked is not null then
    raise exception 'A table that should stay untouched gained workspace_id: %', leaked;
  end if;

  raise notice '2 · identity-scoped, platform-scoped and legacy tables remain untouched';
end;
$$;

-- =========================================================================
-- 3 · Every touched table has its index, and every workspace_id is null so far
--
-- Check 2's counterpart: this package is step 1 only. A non-null value here means WP 03.06
-- ran ahead of its own gate, or a stray write happened outside the backfill this table is
-- waiting for.

do $$
declare
  touched text[] := array[
    'pro_profiles', 'pro_stats', 'pro_services', 'portfolio_items', 'testimonials',
    'service_requests', 'service_request_photos', 'conversations', 'messages',
    'reviews', 'reports', 'quotes', 'household_items'
  ];
  problems text[] := '{}';
  t text;
  v_count bigint;
begin
  foreach t in array touched loop
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = t and indexname = t || '_workspace_id_idx'
    ) then
      problems := problems || format('public.%s has no %s_workspace_id_idx', t, t);
    end if;

    execute format('select count(*) from public.%I where workspace_id is not null', t) into v_count;
    if v_count > 0 then
      problems := problems || format('public.%s has %s non-null workspace_id row(s) before WP 03.06 has run', t, v_count);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Index or population state wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '3 · every table is indexed, and every workspace_id is still null';
end;
$$;

-- =========================================================================
-- 4 · The application is unaffected — no existing policy references workspace_id

do $$
declare
  referencing text[];
begin
  select array_agg(format('%s.%s', schemaname, policyname)) into referencing
  from pg_policies
  where schemaname = 'public'
    and (qual ilike '%workspace_id%' or with_check ilike '%workspace_id%');

  if referencing is not null then
    raise exception 'A policy already references workspace_id — that is WP 03.10''s job: %', referencing;
  end if;

  raise notice '4 · no existing policy references workspace_id yet';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_WORKSPACE_COLUMN: all checks passed';
end;
$$;

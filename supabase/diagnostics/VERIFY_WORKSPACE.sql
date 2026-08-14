-- Verifies the tables created by 0030_workspace.sql (Epic 03 WP01).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKSPACE.sql
--
-- Step 1 of the six-step migration pattern (IMPLEMENTATION_ROADMAP.md §3): additive,
-- inert. Every check below proves the structure exists and is correctly shaped —
-- none of them proves anything about behaviour, because nothing reads or writes these
-- tables yet.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · The three tables exist, with RLS enabled and no policy
--
-- The absent policy is the deny, exactly as identity.identities held between WP 02.01 and
-- WP 02.06.

do $$
declare
  missing text[];
  unprotected text[];
  policied text[];
begin
  select array_agg(t) into missing
  from unnest(array['workspaces', 'memberships', 'membership_history']) as t
  where not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'workspace' and c.relname = t
  );

  if missing is not null then
    raise exception 'Missing tables in workspace: %', missing;
  end if;

  select array_agg(t) into unprotected
  from unnest(array['workspaces', 'memberships', 'membership_history']) as t
  join pg_class c on c.relname = t
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'workspace'
  where not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'RLS not enabled on: %', unprotected;
  end if;

  select array_agg(format('%s.%s', schemaname, tablename)) into policied
  from pg_policies
  where schemaname = 'workspace';

  if policied is not null then
    raise exception 'A policy already exists where WP 03.01 expects none: %', policied;
  end if;

  raise notice '1 · three tables exist, RLS enabled, no policy yet';
end;
$$;

-- =========================================================================
-- 2 · The privilege shape matches each table's mutability class
--
-- Mutable (workspaces, memberships): SELECT + INSERT + UPDATE, never DELETE.
-- Append-only (membership_history): SELECT + INSERT only.

do $$
declare
  problems text[] := '{}';
begin
  if not has_table_privilege('klussie_engine_workspace', 'workspace.workspaces', 'UPDATE') then
    problems := problems || 'klussie_engine_workspace cannot UPDATE workspace.workspaces';
  end if;
  if not has_table_privilege('klussie_engine_workspace', 'workspace.memberships', 'UPDATE') then
    problems := problems || 'klussie_engine_workspace cannot UPDATE workspace.memberships';
  end if;
  if has_table_privilege('klussie_engine_workspace', 'workspace.membership_history', 'UPDATE') then
    problems := problems || 'klussie_engine_workspace can UPDATE membership_history — it must not';
  end if;

  if has_table_privilege('klussie_engine_workspace', 'workspace.workspaces', 'DELETE')
     or has_table_privilege('klussie_engine_workspace', 'workspace.memberships', 'DELETE')
     or has_table_privilege('klussie_engine_workspace', 'workspace.membership_history', 'DELETE') then
    problems := problems || 'klussie_engine_workspace can DELETE from a table with no correct reason for a row to leave';
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Privilege shape wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '2 · workspaces and memberships are mutable, membership_history is append-only';
end;
$$;

-- =========================================================================
-- 3 · No client-facing role reaches any of the three
--
-- Extends VERIFY_GRANTS.sql check 3 now that workspace holds real tables.

do $$
declare
  reachable text[];
begin
  select array_agg(format('%s can %s %s.%s', r, priv, 'workspace', t))
  into reachable
  from unnest(array['anon', 'authenticated', 'service_role']) as r
  cross join unnest(array['workspaces', 'memberships', 'membership_history']) as t
  cross join unnest(array['select', 'insert', 'update', 'delete']) as priv
  where has_table_privilege(r, format('workspace.%s', t), upper(priv));

  if reachable is not null then
    raise exception 'A client-facing role reaches a workspace table: %', reachable;
  end if;

  raise notice '3 · anon, authenticated and service_role reach none of the three tables';
end;
$$;

-- =========================================================================
-- 4 · membership_history genuinely refuses update and delete
--
-- Written and rolled back. Proves the guard trigger fires, not merely that it exists.

begin;

do $$
declare
  v_ws_id uuid := gen_random_uuid();
  v_mem_id uuid := gen_random_uuid();
  v_hist_id uuid := gen_random_uuid();
  v_trapped boolean := false;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws_id, 'personal', 'probe');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (v_mem_id, v_ws_id, gen_random_uuid(), 'owner', 'active');
  insert into workspace.membership_history (id, membership_id, workspace_id, person_ref, role, state)
    values (v_hist_id, v_mem_id, v_ws_id, gen_random_uuid(), 'owner', 'active');

  begin
    update workspace.membership_history set role = 'changed' where id = v_hist_id;
  exception when others then
    v_trapped := true;
  end;

  if not v_trapped then
    raise exception 'workspace.membership_history accepted an UPDATE — the guard trigger did not fire';
  end if;

  raise notice '4 · membership_history refuses mutation — the guard trigger fires';
end;
$$;

rollback;

-- =========================================================================
-- 5 · The referential shape is correct
--
-- memberships -> workspaces, membership_history -> memberships and -> workspaces. No
-- foreign key anywhere toward identity.identities.

do $$
declare
  problems text[] := '{}';
  identity_fk_count integer;
begin
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'workspace' and tc.table_name = 'memberships'
      and kcu.column_name = 'workspace_id'
  ) then
    problems := problems || 'workspace.memberships.workspace_id has no foreign key to workspaces';
  end if;

  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'workspace' and tc.table_name = 'membership_history'
      and kcu.column_name = 'membership_id'
  ) then
    problems := problems || 'workspace.membership_history.membership_id has no foreign key to memberships';
  end if;

  select count(*) into identity_fk_count
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'workspace'
    and ccu.table_schema = 'identity';

  if identity_fk_count > 0 then
    problems := problems || format('%s foreign key(s) from workspace to identity — none may exist (SUPABASE_ARCHITECTURE.md §5, §11.4)', identity_fk_count);
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Referential shape wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '5 · memberships and history reference workspace correctly, and nothing references identity';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_WORKSPACE: all checks passed';
end;
$$;

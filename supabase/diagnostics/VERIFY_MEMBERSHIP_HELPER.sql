-- Verifies the membership helper created by 0031_membership_helper.sql (Epic 03 WP02).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MEMBERSHIP_HELPER.sql
--
-- Checks 1–2 are the grant posture ADR-0026 exists to hold — the same probe discipline
-- that found two anonymously callable resolvers in Epic 02: verified, not assumed. Check 3
-- is behavioural correctness. Check 4 is the finding that changed this package's design —
-- ADR-0026's "As implemented" section — captured as evidence a human reviewer reads, not a
-- brittle automated assertion on plan text that varies across Postgres versions.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Only authenticated reaches api, and only for the one function
--
-- Mirrors VERIFY_IDENTITY_READ_PATH.sql check 3 exactly, extended to the schema grant.

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['anon', 'service_role'] loop
    if has_schema_privilege(r, 'api', 'USAGE') then
      problems := problems || format('%s has USAGE on schema api', r);
    end if;
    if has_function_privilege(r, 'api.current_workspace_memberships()', 'EXECUTE') then
      problems := problems || format('%s can execute api.current_workspace_memberships()', r);
    end if;
  end loop;

  if has_function_privilege('public', 'api.current_workspace_memberships()', 'EXECUTE') then
    problems := problems || 'PUBLIC can execute api.current_workspace_memberships()';
  end if;

  if not has_schema_privilege('authenticated', 'api', 'USAGE') then
    problems := problems || 'authenticated cannot use schema api';
  end if;
  if not has_function_privilege('authenticated', 'api.current_workspace_memberships()', 'EXECUTE') then
    problems := problems || 'authenticated cannot execute api.current_workspace_memberships()';
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'api grant posture wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '1 · only authenticated reaches api.current_workspace_memberships()';
end;
$$;

-- =========================================================================
-- 2 · The engine logic is reachable by nobody, and workspace stays closed
--
-- workspace.current_memberships() must not be independently callable — it is the object
-- ADR-0026's split exists to keep out of client reach. And the whole point of the split is
-- that this holds without authenticated ever gaining USAGE on workspace itself.

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'public'] loop
    if has_function_privilege(r, 'workspace.current_memberships()', 'EXECUTE') then
      problems := problems || format('%s can execute workspace.current_memberships() directly', r);
    end if;
  end loop;

  if has_schema_privilege('authenticated', 'workspace', 'USAGE') then
    problems := problems || 'authenticated has USAGE on schema workspace — ADR-0026''s whole point is that it must not';
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Engine logic is reachable: %', array_to_string(problems, '; ');
  end if;

  raise notice '2 · workspace.current_memberships() is reachable by nobody; workspace stays closed to authenticated';
end;
$$;

-- =========================================================================
-- 3 · Behavioural correctness — an active membership resolves, an expired one does not,
-- and a person with no memberships sees nothing
--
-- request.jwt.claims is the GUC PostgREST sets per request and the same mechanism
-- auth.uid() reads (Supabase's own local-testing pattern). Written and rolled back.

begin;

do $$
declare
  v_auth_id      uuid := gen_random_uuid();
  v_stranger_id  uuid := gen_random_uuid();
  v_person_ref   uuid := gen_random_uuid();
  v_ws_active    uuid := gen_random_uuid();
  v_ws_expired   uuid := gen_random_uuid();
  v_count        integer;
begin
  insert into identity.identities (person_ref, auth_user_id, full_name)
    values (v_person_ref, v_auth_id, 'Probe Person');

  insert into workspace.workspaces (id, type, name) values (v_ws_active, 'personal', 'active probe');
  insert into workspace.workspaces (id, type, name) values (v_ws_expired, 'personal', 'expired probe');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws_active, v_person_ref, 'owner', 'active');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state, expires_at)
    values (gen_random_uuid(), v_ws_expired, v_person_ref, 'contractor', 'active', now() - interval '1 day');

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id)::text, true);

  select count(*) into v_count from api.current_workspace_memberships() where workspace_id = v_ws_active;
  if v_count <> 1 then
    raise exception 'An active membership did not resolve: % row(s) for %', v_count, v_ws_active;
  end if;

  select count(*) into v_count from api.current_workspace_memberships() where workspace_id = v_ws_expired;
  if v_count <> 0 then
    raise exception 'An expired membership resolved as live — expiry is not evaluated at read time';
  end if;

  -- A different caller, with no memberships at all, sees nothing — not an error.
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_id)::text, true);
  select count(*) into v_count from api.current_workspace_memberships();
  if v_count <> 0 then
    raise exception 'A caller with no memberships resolved %, expected none', v_count;
  end if;

  raise notice '3 · an active membership resolves, an expired one does not, a stranger sees nothing';
end;
$$;

rollback;

-- =========================================================================
-- 4 · Once-per-statement evidence
--
-- ADR-0024's acceptance condition, and the finding that changed this package's design
-- (ADR-0026 "As implemented"): STABLE alone does not achieve this. A function taking the
-- scanned row's own column as an argument is re-invoked per row regardless of the marking;
-- only a parameterless delegate, used as an uncorrelated subquery, lets the planner
-- evaluate it once.
--
-- This prints the plan for a human to read rather than asserting on its text, which varies
-- across Postgres versions. What to look for: ONE evaluation of
-- api.current_workspace_memberships() — typically as an InitPlan or a single Subquery Scan
-- feeding a Hash Semi Join — not once per row of the left-hand scan.

do $$
begin
  raise notice '4 · reading the plan below: api.current_workspace_memberships() must appear once, not once per row of the scan it filters';
end;
$$;

explain (analyze, verbose, costs off, summary off)
select g.i
from generate_series(1, 1000) as g(i)
where g.i in (select 1 from api.current_workspace_memberships() limit 0); -- shape-only probe; no real rows required

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_MEMBERSHIP_HELPER: all checks passed';
end;
$$;

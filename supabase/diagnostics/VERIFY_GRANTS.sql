-- Verifies the grant posture established by 0019_grants.sql.
--
-- Read-only, and safe against any environment: the one place it needs a table to exist,
-- it creates a temporary one inside a transaction it rolls back.
--
-- Run it with psql and ON_ERROR_STOP, so a wrong grant aborts rather than scrolls past:
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_GRANTS.sql
--
-- Every check raises an exception naming what is wrong. Silence and a final NOTICE mean
-- the posture in docs/operations/ROLES.md is the posture the database is actually in.
--
-- This is the executable half of WP 01.02's acceptance. The other half —
-- supabase/migrations/__tests__/grants.test.js — checks that the migration still *says*
-- the right thing; this one checks that the database *is* in the right state, which are
-- different failures with different causes.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every role exists, and none of them can log in
--
-- A LOGIN role with a password is a credential; these are group roles to be granted to.
-- The distinction is the difference between a boundary and an account.

do $$
declare
  missing text[];
  can_login text[];
begin
  select array_agg(r) into missing
  from unnest(array[
    'klussie_engine_identity', 'klussie_engine_workspace', 'klussie_engine_property',
    'klussie_engine_work', 'klussie_engine_knowledge', 'klussie_engine_commerce',
    'klussie_engine_platform', 'klussie_consumer_projection', 'klussie_consumer_delivery',
    'klussie_consumer_search', 'klussie_consumer_analytics', 'klussie_operator'
  ]) as r
  where not exists (select 1 from pg_roles where rolname = r);

  if missing is not null then
    raise exception 'Missing roles: %', missing;
  end if;

  select array_agg(rolname) into can_login
  from pg_roles where rolname like 'klussie\_%' and rolcanlogin;

  if can_login is not null then
    raise exception 'These are group roles and must not be able to log in: %', can_login;
  end if;

  raise notice '1 · twelve roles exist, none can log in';
end;
$$;

-- =========================================================================
-- 2 · Each engine role reaches its own schema, and every OTHER schema it reaches is one of
-- the real, named, documented cross-schema grants this roadmap has actually made
--
-- This is the property SUPABASE_ARCHITECTURE.md §24 item 2 asks for, stated as a query: an
-- engine that tries to work in a schema it was never granted fails on privileges. §9's own
-- rule was never "an engine reaches only its own schema forever" — it is "read-only access
-- to other schemas, the narrowest grant that lets a REAL query work, granted by the epic
-- that needs it" (ROLES.md §3 rule 1). This check originally (Epic 01) asserted the
-- stricter, temporary truth of a database with no cross-schema reads yet; by Epic 22 seven
-- such grants exist, each with its own migration header explaining why. Caught running
-- this diagnostic against real data (staging, 2026-08-19), where the check had gone stale
-- relative to eight epics of real, deliberate, already-documented decisions — an allowlist
-- of exactly what exists today, not a loosening of the check, which still fails loudly on
-- anything not on this list.
--
-- klussie_engine_commerce  -> platform (0106, emit_event), work (0097, invoices
--                             referencing work.engagements), workspace (0130, the first
--                             true cross-engine contract call this session made — Epic 22
--                             calling Capability's own grant_capability()/
--                             withdraw_capability() directly)
-- klussie_engine_knowledge -> platform (0105, the audit write path), property (0111,
--                             resolving a property's current steward live for
--                             promote_fact()/declare_rule())
-- klussie_engine_platform  -> identity, workspace (0117, platform.my_inbox() joining
--                             identity.identities and workspace.memberships)
-- klussie_engine_property  -> platform (0102, Timeline reading platform.events), work
--                             (0102, Timeline reading work.conversations/messages/
--                             engagements/requests)
-- klussie_engine_work      -> platform (0106, the second engine role that migration fixed)
-- klussie_engine_workspace -> platform (0075, Capability reading its own platform-scoped
--                             catalogue and dependency tables)
-- klussie_engine_identity  -> (none — the only engine role with no cross-schema grant at all)

do $$
declare
  pair record;
  wrong text[] := '{}';
  other text;
  allowed text[];
  allowlist jsonb := '{
    "klussie_engine_identity":  [],
    "klussie_engine_workspace": ["platform"],
    "klussie_engine_property":  ["platform", "work"],
    "klussie_engine_work":      ["platform"],
    "klussie_engine_knowledge": ["platform", "property"],
    "klussie_engine_commerce":  ["platform", "work", "workspace"],
    "klussie_engine_platform":  ["identity", "workspace"]
  }'::jsonb;
begin
  for pair in select * from (values
    ('klussie_engine_identity',  'identity'),
    ('klussie_engine_workspace', 'workspace'),
    ('klussie_engine_property',  'property'),
    ('klussie_engine_work',      'work'),
    ('klussie_engine_knowledge', 'knowledge'),
    ('klussie_engine_commerce',  'commerce'),
    ('klussie_engine_platform',  'platform')
  ) as t(engine_role, own_schema) loop

    if not has_schema_privilege(pair.engine_role, pair.own_schema, 'USAGE') then
      wrong := wrong || format('%s cannot use its own schema %s', pair.engine_role, pair.own_schema);
    end if;

    -- No engine creates objects at runtime; migrations run as postgres.
    if has_schema_privilege(pair.engine_role, pair.own_schema, 'CREATE') then
      wrong := wrong || format('%s can CREATE in %s', pair.engine_role, pair.own_schema);
    end if;

    select array(select jsonb_array_elements_text(allowlist -> pair.engine_role)) into allowed;

    foreach other in array array[
      'identity', 'workspace', 'property', 'work', 'knowledge',
      'commerce', 'platform', 'derived', 'analytics_ws', 'analytics_pf'
    ] loop
      if other <> pair.own_schema
         and not (other = any(allowed))
         and has_schema_privilege(pair.engine_role, other, 'USAGE') then
        wrong := wrong || format('%s reaches %s, which it does not own and is not on the named allowlist above', pair.engine_role, other);
      end if;
    end loop;

    -- The reverse check matters just as much: a grant this file expects should actually be
    -- there, or the allowlist above is describing a decision that was never made.
    foreach other in array allowed loop
      if not has_schema_privilege(pair.engine_role, other, 'USAGE') then
        wrong := wrong || format('%s is expected to reach %s per this file''s own allowlist, but does not', pair.engine_role, other);
      end if;
    end loop;
  end loop;

  if array_length(wrong, 1) is not null then
    raise exception 'Engine ownership violated: %', array_to_string(wrong, '; ');
  end if;

  raise notice '2 · each engine role reaches its own schema, plus exactly its named, documented cross-schema grants, and no others';
end;
$$;

-- =========================================================================
-- 3 · The client-facing roles reach none of the ten
--
-- §9: anon never reaches a workspace-scoped schema; authenticated never reaches platform
-- or analytics_pf. The other eight are "not yet" rather than "never" — opened per table by
-- the epic that ships a direct-read path (§7), never schema-wide in advance. Both cases
-- look the same today, and this check holds until a per-table grant makes them differ.

do $$
declare
  reachable text[];
begin
  select array_agg(format('%s can use %s', r, n))
  into reachable
  from unnest(array['anon', 'authenticated', 'service_role']) as r
  cross join unnest(array[
    'identity', 'workspace', 'property', 'work', 'knowledge',
    'commerce', 'platform', 'derived', 'analytics_ws', 'analytics_pf'
  ]) as n
  where has_schema_privilege(r, n, 'USAGE');

  if reachable is not null then
    raise exception 'A client-facing role reaches a new schema: %', reachable;
  end if;

  raise notice '3 · anon, authenticated and service_role reach none of the ten';
end;
$$;

-- =========================================================================
-- 4 · A new table is append-only to its engine, and invisible to every other
--
-- The default privileges are the only part of 0019 whose effect cannot be seen until a
-- table exists. So one is created, inspected, and rolled back.
--
-- SELECT and INSERT but not UPDATE or DELETE is the fail-safe default §4 requires: a
-- table is append-only unless its own migration deliberately grants more.

begin;

create table work.grant_probe (id integer);

do $$
begin
  if not has_table_privilege('klussie_engine_work', 'work.grant_probe', 'SELECT') then
    raise exception 'The owning engine cannot read a new table in its own schema';
  end if;
  if not has_table_privilege('klussie_engine_work', 'work.grant_probe', 'INSERT') then
    raise exception 'The owning engine cannot insert into a new table in its own schema';
  end if;
  if has_table_privilege('klussie_engine_work', 'work.grant_probe', 'UPDATE') then
    raise exception 'A new table is UPDATE-able by default — append-only is not the default';
  end if;
  if has_table_privilege('klussie_engine_work', 'work.grant_probe', 'DELETE') then
    raise exception 'A new table is DELETE-able by default — append-only is not the default';
  end if;

  if has_table_privilege('klussie_engine_identity', 'work.grant_probe', 'SELECT') then
    raise exception 'Another engine can read into work — engine ownership is not enforced';
  end if;
  if has_table_privilege('authenticated', 'work.grant_probe', 'SELECT') then
    raise exception 'authenticated can read a new table it was never granted';
  end if;
  if has_table_privilege('anon', 'work.grant_probe', 'SELECT') then
    raise exception 'anon can read a new table it was never granted';
  end if;

  raise notice '4 · a new table is SELECT+INSERT to its own engine, nothing to anyone else';
end;
$$;

rollback;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_GRANTS: all checks passed';
end;
$$;

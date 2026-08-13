-- Epic 01 WP02 — role grants mirroring engine ownership.
--
-- SUPABASE_ARCHITECTURE.md §24 item 2: "an engine writing another engine's schema must
-- fail on privileges." §9 says the role an engine's code runs under has write access to
-- its own schema and read-only access, or none, elsewhere. This file makes that literal:
-- one role per schema-owning engine tier, plus the four background consumer roles and
-- the operator role §9 names, each with the narrowest grants that let it work.
--
-- Nothing can connect as any of these roles. They are NOLOGIN group roles; membership is
-- granted to a real connection role by the epic that gives an engine its own connection.
-- Until then they exist to be granted to, which is what makes every later table's
-- privileges a one-line decision instead of an argument.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
-- 1. No cross-schema grants. §9 says "read-only access, OR NONE, elsewhere" and there is
--    not yet a single table to read, so granting a tier-wide SELECT now would be the
--    opposite of "the narrowest grants that let it work". Each cross-schema read is
--    granted by the epic that has a real query needing it.
-- 2. No UPDATE or DELETE in the default privileges. §4 enforces append-only by withholding
--    those privileges from every application role, and §24 item 7 makes the mutability
--    class a per-table declaration. Defaulting to SELECT and INSERT makes append-only the
--    condition a table is in unless its own migration says otherwise — the fail-safe
--    direction. A default that granted UPDATE and DELETE would make every append-only
--    table depend on someone remembering to revoke.
-- 3. Nothing to `public`. The running product's access to `public` is untouched, and this
--    file contains no reference to it.
--
-- Guarded throughout: `create role` is wrapped so re-running is a no-op, and grants and
-- revokes are idempotent by nature. Rollback: `docs/operations/ROLES.md` §7.

-- =========================================================================
-- THE ROLES
--
-- Named `klussie_*` without exception. Supabase owns `anon`, `authenticated`,
-- `service_role`, `authenticator`, `supabase_*` and `postgres`; a prefix makes "did we
-- create this, or did the platform" answerable by looking, and makes the whole set
-- greppable. `service_role` in particular is Supabase's elevated role and is NOT one of
-- §9's per-consumer service roles — the naming here keeps that confusion impossible.
--
-- create role has no `if not exists` form, hence the guard.

do $$
declare
  role_name text;
begin
  foreach role_name in array array[
    -- One per schema-owning engine tier (§2's ownership column).
    'klussie_engine_identity',
    'klussie_engine_workspace',
    'klussie_engine_property',
    'klussie_engine_work',
    'klussie_engine_knowledge',
    'klussie_engine_commerce',
    'klussie_engine_platform',
    -- §9: "Background consumers are not one role. The projection builder, the event
    -- deliverer, the search indexer and the analytics loader each get their own service
    -- role with their own grants." A single omnipotent background role is the same
    -- problem as an omnipotent user role, delayed.
    'klussie_consumer_projection',
    'klussie_consumer_delivery',
    'klussie_consumer_search',
    'klussie_consumer_analytics',
    -- §9's fourth class: configuration and platform catalogues, never customer content.
    'klussie_operator'
  ] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('create role %I nologin', role_name);
    end if;
  end loop;
end;
$$;

comment on role klussie_engine_identity is 'Identity engine. Owns schema identity.';
comment on role klussie_engine_workspace is 'Workspace and Capability engines. Owns schema workspace.';
comment on role klussie_engine_property is 'Property, Location, Asset and Document engines. Owns schema property.';
comment on role klussie_engine_work is 'Maintenance, Service Record, Workflow, Marketplace and Conversation engines. Owns schema work.';
comment on role klussie_engine_knowledge is 'Knowledge and Intelligence engines. Owns schema knowledge.';
comment on role klussie_engine_commerce is 'Subscription and Billing engines. Owns schema commerce.';
comment on role klussie_engine_platform is 'Event Backbone, Audit and Administration engines. Owns schema platform.';
comment on role klussie_consumer_projection is 'Background consumer: builds projections into derived.';
comment on role klussie_consumer_delivery is 'Background consumer: delivers events from platform.';
comment on role klussie_consumer_search is 'Background consumer: maintains search support in derived.';
comment on role klussie_consumer_analytics is 'Background consumer: loads analytics_ws and analytics_pf.';
comment on role klussie_operator is 'Operator: platform configuration and catalogues. Never customer content.';

-- =========================================================================
-- ENGINE OWNERSHIP
--
-- USAGE on its own schema and nothing else, plus default privileges so that every table a
-- later migration creates there is readable and insertable by its owning engine without
-- that migration having to remember.
--
-- No CREATE. Migrations run as `postgres`; an engine creating its own tables at runtime is
-- not a thing this architecture has.
--
-- `for role postgres` matters: default privileges attach to the role that creates the
-- object, and every migration in this repository is applied as postgres — which is also
-- who owns the ten schemas (verified after 0018).

do $$
declare
  pair record;
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
    execute format('grant usage on schema %I to %I', pair.own_schema, pair.engine_role);
    execute format(
      'alter default privileges for role postgres in schema %I grant select, insert on tables to %I',
      pair.own_schema, pair.engine_role
    );
    execute format(
      'alter default privileges for role postgres in schema %I grant usage, select on sequences to %I',
      pair.own_schema, pair.engine_role
    );
  end loop;
end;
$$;

-- =========================================================================
-- BACKGROUND CONSUMERS
--
-- USAGE only: which schemas a consumer may be inside at all. Table privileges are granted
-- per table by the epic that creates it, because §9 scopes a consumer's grants to "what a
-- specific consumer needs" and nothing here knows yet what that is.
--
-- The projection builder and the search indexer write derived; the analytics loader writes
-- the two analytics schemas; the event deliverer reads platform. None reaches an engine's
-- own schema without a later, specific grant.

grant usage on schema derived to klussie_consumer_projection;
grant usage on schema derived to klussie_consumer_search;
grant usage on schema analytics_ws to klussie_consumer_analytics;
grant usage on schema analytics_pf to klussie_consumer_analytics;
grant usage on schema platform to klussie_consumer_delivery;

-- =========================================================================
-- OPERATOR
--
-- Platform configuration and catalogues. Deliberately not derived, not analytics_ws, and
-- none of the six workspace-scoped tiers: §9's operator reaches customer content only
-- through an audited support membership, which is a Workspace-engine concept and not a
-- grant.

grant usage on schema platform to klussie_operator;

-- =========================================================================
-- THE CLIENT-FACING ROLES
--
-- Two different rules, written separately because they are not the same rule and a future
-- reader needs to be able to tell them apart.
--
-- NEVER: §9 states outright that `authenticated` never reaches `platform` or
-- `analytics_pf`, and that `anon` never reaches any workspace-scoped schema. Those are
-- permanent. Anything that appears to need them is a finding, not a grant.
--
-- NOT YET: `authenticated` will reach the six workspace-scoped tiers and `derived`, under
-- RLS, on the direct-read path (§7) — but only per table, and only where membership alone
-- is the complete permission answer. A schema-wide grant now would decide that for every
-- future table in advance, which is precisely the decision §7 reserves per table.
--
-- These revokes are no-ops today: PostgreSQL grants nothing to PUBLIC on a newly created
-- schema, verified for all three roles after 0018. They are written anyway, because the
-- posture should be stated where it is enforced rather than inferred from an absence.

do $$
declare
  target_schema text;
begin
  foreach target_schema in array array[
    'identity', 'workspace', 'property', 'work', 'knowledge',
    'commerce', 'platform', 'derived', 'analytics_ws', 'analytics_pf'
  ] loop
    execute format('revoke all on schema %I from public', target_schema);
    execute format('revoke all on schema %I from anon', target_schema);
    execute format('revoke all on schema %I from authenticated', target_schema);
    -- service_role is Supabase's elevated role (§7's third path). Background work gets
    -- the per-consumer roles above, not this one.
    execute format('revoke all on schema %I from service_role', target_schema);
  end loop;
end;
$$;

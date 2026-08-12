-- Epic 01 WP01 — the ten schemas, empty.
--
-- SUPABASE_ARCHITECTURE.md §2 puts one schema per engine tier, with grants mirroring
-- engine ownership. SYSTEM_ARCHITECTURE.md §1 rule 2 says an engine never reads or
-- writes another engine's aggregates; in application code that depends on discipline,
-- in PostgreSQL it can be enforced. These schemas are the structure that enforcement
-- hangs off. They are created before anything needs them so that every later epic has
-- a correct place to put its tables, and never has a reason to reach for `public`.
--
-- This file creates the boundaries and nothing else. Grants are 0019 (WP 01.02),
-- extensions are 0020 (WP 01.03), the events table 0021, audit 0022. Splitting them is
-- deliberate: each has its own rollback point, and a schema with no grants and no
-- objects cannot affect the running application no matter what else is true.
--
-- Why this is inert. A newly created schema grants nothing to PUBLIC, so `anon` and
-- `authenticated` cannot even resolve a name inside one. None of the ten is added to
-- PostgREST's exposed-schema list either, so nothing here is reachable over the API.
-- `public` is not touched, and the running product reads and writes only `public`.
--
-- Guarded with `if not exists` so re-running is a no-op. The CLI ledger means this file
-- should run once per environment, but a re-runnable migration is the standing rule
-- (IMPLEMENTATION_ROADMAP.md §3) and costs nothing here.
--
-- Rollback: `drop schema <name> restrict;` for each. `restrict` rather than `cascade` on
-- purpose — if a later epic has put something in one, the drop should fail loudly rather
-- than take the contents with it.

-- =========================================================================
-- TIER 1 — PLATFORM FOUNDATION
--
-- identity and workspace are separate because erasure and tenancy have different
-- lifetimes: DATABASE_ARCHITECTURE.md §8 requires a person reference that survives the
-- erasure of the person, which only works if no durable record lives beside it.

create schema if not exists identity;
comment on schema identity is
  'Identity, auth linkage, verified attributes. Owned by the Identity engine.';

create schema if not exists workspace;
comment on schema workspace is
  'Workspace, membership, invitations, capability grants. Owned by the Workspace and Capability engines.';

-- =========================================================================
-- TIER 2 — THE PHYSICAL MODEL
--
-- Property, Location, Asset and Document share one schema rather than four. They are
-- read together constantly — a property with its locations and the assets placed in
-- them is a single screen — and §2 chose tier-level grouping precisely so those joins
-- stay inside a schema. The boundaries that matter are the ones below.

create schema if not exists property;
comment on schema property is
  'Property, stewardship, location, asset, facets, placements, document metadata. Owned by the Property, Location, Asset and Document engines.';

-- =========================================================================
-- TIER 3 — WORK AND EXCHANGE
--
-- Where the current product's behaviour eventually moves. Marketplace, conversations
-- and the workflow definitions that replace today's Postgres triggers all land here.

create schema if not exists work;
comment on schema work is
  'Maintenance, service records and annexes, workflow definitions and instances, marketplace, conversations. Owned by the Maintenance, Service Record, Workflow, Marketplace and Conversation engines.';

-- =========================================================================
-- TIER 4 — MEMORY AND INTELLIGENCE

create schema if not exists knowledge;
comment on schema knowledge is
  'Workspace Knowledge, graph edges, world graph, memory versions. Owned by the Knowledge and Intelligence engines.';

-- =========================================================================
-- TIER 5 — COMMERCE
--
-- Physically distinct from work: financial records are immutable and jurisdictional,
-- and a role that can write a quote has no business writing a financial record.

create schema if not exists commerce;
comment on schema commerce is
  'Subscriptions, plans, financial records. Owned by the Subscription and Billing engines.';

-- =========================================================================
-- TIER 6 — PLATFORM AND DERIVED
--
-- platform holds what belongs to nobody's workspace — events, audit, jurisdiction
-- rules, catalogues. derived holds only projections, which are rebuildable by
-- definition (DATABASE_ARCHITECTURE.md §23): keeping them out of the schemas that hold
-- source-of-truth data is what makes "this can be dropped and rebuilt" obvious from
-- the table's name alone.

create schema if not exists platform;
comment on schema platform is
  'Events, audit, jurisdiction rules, taxonomies, catalogues, configuration. Owned by the Event Backbone, Audit and Administration engines.';

create schema if not exists derived;
comment on schema derived is
  'All projections — timeline, twin summaries, provider scores, reputation, inbox, search support. Owned by whichever engine owns each projection.';

-- =========================================================================
-- TIER 7 — ANALYTICS, PHYSICALLY SPLIT IN TWO
--
-- DATABASE_ARCHITECTURE.md §31 requires workspace-scoped and platform-scoped analytics
-- to be physically separate, so that the dangerous cross-tenant query is impossible to
-- write rather than merely discouraged. Two schemas with two grants deliver that: the
-- role that can read analytics_pf never sees workspace detail, and the role that can
-- read analytics_ws cannot aggregate across tenants. One schema with a convention
-- would not survive its first deadline.

create schema if not exists analytics_ws;
comment on schema analytics_ws is
  'Workspace-scoped analytics. Owned by the Analytics engine.';

create schema if not exists analytics_pf;
comment on schema analytics_pf is
  'Platform-scoped analytics — aggregates only, never workspace detail. Owned by the Analytics engine.';

-- Epic 16 WP04 — the world graph: `knowledge.world_nodes` and `knowledge.world_edges`.
--
-- DATABASE_ARCHITECTURE.md §6/§27: "Manufacturers, models, parts, compatibility,
-- regulations, general failure patterns... Aggregate, platform-scoped, curated." The
-- Crossing Registry (§6) names it explicitly as one of only two platform-level structures
-- guarded by the promotion rule — this table, and platform analytics.
--
-- A REAL NODE TABLE, UNLIKE THE WORKSPACE SIDE — BECAUSE THESE THINGS HAVE NO HOME
-- ANYWHERE ELSE IN THE PLATFORM
--
-- 0108's own header explains why the workspace graph needs no node table: every
-- workspace-side node is already a real row somewhere. Manufacturers, models, parts,
-- materials, suppliers, regulations and standards are not — nothing in this platform owns
-- them today. `knowledge.world_nodes` is their one home; `knowledge.world_edges`
-- (from_node_id -> to_node_id, both real foreign keys this time, since both sides are
-- rows in the same table) connects them. Real foreign keys are correct here in a way they
-- were not for 0108's own edges: the workspace graph's whole point is connecting many
-- different KINDS of existing aggregate; the world graph's nodes are all one kind, in one
-- table, so a foreign key costs nothing and buys real referential integrity.
--
-- NO WORKSPACE REFERENCE ANYWHERE IN EITHER TABLE — THE PLATFORM'S OWN STRONGEST PRIVACY
-- GUARANTEE, STRUCTURAL RATHER THAN A POLICY PROMISE
--
-- PLATFORM_DOMAIN_MODEL.md §19.2: "no node is specific to any property or person." Not a
-- single column here can carry a workspace_id, a property_id, or any other tenant
-- reference — the promotion rule (§6/DATABASE_ARCHITECTURE.md §33) requires a promoted
-- fact to "remain true once every reference to its origin is removed," and the
-- structurally correct way to guarantee that is to give the schema nowhere to put such a
-- reference, rather than trust every future caller to remember not to populate one.
-- Provenance — which workspace's activity led to a promotion, on whose authority — is
-- recorded separately, in platform.audit_records (WP 16.01), which is administrator-only
-- and never joined into anything the graph itself serves.
--
-- WRITABLE ONLY BY PROMOTION — NO DIRECT CREATE-NODE/CREATE-EDGE FUNCTION IN THIS EPIC
--
-- §9.1's own "Future expansion": "Ingested manufacturer and regulatory data" is named as
-- future work, not this epic's. The only write path this epic builds is
-- knowledge.promote_fact() (WP 16.06) — every world_nodes/world_edges row traces to an
-- explicit, audited promotion, never a bulk ingest job this epic does not build. A direct
-- "create world node" function with no promotion behind it would be exactly the "ambient
-- path from workspace data into platform scope" §6 prohibits outright, so none exists.
--
-- PERMANENT — NO GUARD TRIGGER, DELETE WITHHELD BY GRANT ALONE
--
-- "Asserted edges and world graph: permanent, versioned" (§27's own retention rule) — but
-- unlike knowledge.rules or knowledge.workspace_edges, nothing about a promoted world fact
-- is ever expected to change in place at all (no "retract" concept the way an assertion
-- has one — a promoted fact is curated and reviewed before promotion, not corrected after).
-- UPDATE and DELETE are withheld from the grant, the same fail-safe default 0019 already
-- establishes for every table until a real correction path is designed; a full
-- update/delete-rejecting trigger is not added because nothing yet demonstrates a need to
-- refuse an attempt that current grants already make impossible (ADR-0010's restraint).

create table if not exists knowledge.world_nodes (
  id          uuid        not null,

  node_type   text        not null,
  label       text        not null,
  attributes  jsonb       not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),

  constraint world_nodes_pkey primary key (id)
);

comment on table knowledge.world_nodes is
  'The world graph''s nodes (DATABASE_ARCHITECTURE.md §27) — manufacturers, models, parts, materials, suppliers, regulations, standards. Platform-scoped, curated, written only through knowledge.promote_fact() (WP 16.06). No workspace reference anywhere, structurally, per §19.2''s own privacy guarantee.';
comment on column knowledge.world_nodes.node_type is
  'Open text, matching knowledge.rules.category and knowledge.workspace_edges.edge_type''s own restraint — §19.2''s node list ("Manufacturers · Brands · Models · Materials · Parts · Components · Suppliers · Regulations · Standards") is illustrative, not closed.';

create index if not exists world_nodes_type_idx on knowledge.world_nodes (node_type);

create table if not exists knowledge.world_edges (
  id            uuid        not null,

  from_node_id  uuid        not null
                references knowledge.world_nodes (id),
  edge_type     text        not null,
  to_node_id    uuid        not null
                references knowledge.world_nodes (id),

  created_at    timestamptz not null default now(),

  constraint world_edges_pkey primary key (id),
  constraint world_edges_not_self_referencing check (from_node_id <> to_node_id)
);

comment on table knowledge.world_edges is
  'The world graph''s edges — real foreign keys into knowledge.world_nodes, since both endpoints are always the same kind of thing (unlike the workspace graph''s edges, 0108). Written only through knowledge.promote_fact().';

create index if not exists world_edges_from_idx on knowledge.world_edges (from_node_id);
create index if not exists world_edges_to_idx on knowledge.world_edges (to_node_id);

-- =========================================================================
-- MUTABILITY AND ACCESS — INSERT only, ever, for any role. No policy for anon/authenticated
-- yet (no client caller exists), but SELECT stays with the default engine grant since a
-- future read contract (world facts about this model or part, §9.1's own public contract
-- line) needs it and there is no reason to withhold reading platform-scoped, non-personal
-- data from the one engine that curates it.

revoke update, delete on knowledge.world_nodes from klussie_engine_knowledge;
revoke update, delete on knowledge.world_edges from klussie_engine_knowledge;
revoke all on knowledge.world_nodes from anon, authenticated, service_role;
revoke all on knowledge.world_edges from anon, authenticated, service_role;

alter table knowledge.world_nodes enable row level security;
alter table knowledge.world_edges enable row level security;
-- No policy yet — WP 16.05's own job.

-- Epic 17 WP01 — published memory versions: `knowledge.memory_versions`, the one
-- structural correction the Rebuild Test forced on Property Memory (DATABASE_ARCHITECTURE.md
-- §26, §36 finding 1).
--
-- CURRENT MEMORY IS A PROJECTION; PUBLISHED VERSIONS ARE AN AGGREGATE — AND ONLY THE
-- SECOND ONE IS A TABLE
--
-- §26: "Current memory is a projection. It may be recomputed at any time. Published
-- memory versions are an aggregate, append-only and Historical: what the platform
-- believed, when it believed it, and which facts supported it." §18.1's own words: memory
-- "must never be silently promoted into the timeline" and "must always be presented as
-- interpretation, with its supporting facts reachable." Without the split, rebuilding a
-- projection would silently destroy the record of what the platform told a customer last
-- year — which matters when a customer acted on it. This table IS that record. There is
-- no companion "current memory" table: knowledge.current_property_memory() (WP 17.04) is
-- a plain read of the latest row here, not a second, separately-maintained structure.
--
-- NO workspace_id COLUMN — PROPERTY MEMORY FOLLOWS THE PROPERTY, LIVE, THE SAME SHAPE
-- work.service_records AND property.assets/locations ALREADY USE
--
-- §18.1's own table: Property Memory "Survives: A change of steward, in principle." A
-- frozen workspace_id column would contradict that the moment stewardship transfers — the
-- memory would still say it belongs to a workspace that no longer stewards the property.
-- Visibility instead resolves through property_id -> property.properties.
-- steward_workspace_id, live, exactly the resolution work.service_records (Epic 11) and
-- property.assets/property.locations (Epics 06-07) already established for the identical
-- reason. WP 17.02's own isolation policy joins through property.properties rather than
-- checking a column this table does not have.
--
-- APPEND-ONLY BY GRANT ALONE, NO GUARD TRIGGER — THE SAME RESTRAINT knowledge.world_nodes
-- HELD (EPIC 16)
--
-- Nothing about a published version is ever expected to change in place — a newer,
-- better interpretation is a NEW row (superseding the old one only in the sense that
-- current_property_memory() reads whichever is latest by published_at), never an edit to
-- what the platform once believed. UPDATE and DELETE are withheld from the grant; no
-- update/delete-rejecting trigger is added because nothing yet demonstrates a need to
-- refuse an attempt the grants already make impossible (ADR-0010's restraint, the same
-- one 0109's own header already applied to the world graph).
--
-- basis IS WHAT MAKES §18.1'S "SUPPORTING FACTS REACHABLE" REAL, NOT ASPIRATIONAL
--
-- A jsonb array of references (event ids, service record ids, whatever the interpretation
-- actually drew on) — open-ended by necessity, the same restraint knowledge.rules.rule
-- already holds for content that varies by what produced it. Required, never defaulted to
-- an empty array: a memory version with no traceable basis is exactly the "opinion
-- presented as fact" §18.1 forbids.

create table if not exists knowledge.memory_versions (
  id                        uuid        not null,

  property_id               uuid        not null
                             references property.properties (id),

  content                   jsonb       not null,
  basis                     jsonb       not null,

  published_at              timestamptz not null default now(),
  published_by_actor_type   platform.actor_type not null,
  published_by_actor_ref    text        not null,

  constraint memory_versions_pkey primary key (id),
  constraint memory_versions_basis_not_empty check (jsonb_array_length(basis) > 0)
);

comment on table knowledge.memory_versions is
  'Published Property Memory (DATABASE_ARCHITECTURE.md §26, §36 finding 1) — an aggregate, append-only, Historical: what the platform believed, when, and which facts supported it. No workspace_id — visibility resolves through property_id -> property.properties.steward_workspace_id, live, the same shape work.service_records already uses (Epic 11).';
comment on column knowledge.memory_versions.content is
  'The interpretation itself — open-ended jsonb, the same restraint knowledge.rules.rule already holds, since what a memory version says varies by what kind of pattern it describes.';
comment on column knowledge.memory_versions.basis is
  'What supported this interpretation — event ids, service record ids, whatever it actually drew on. Required and non-empty: §18.1''s own "supporting facts reachable" is a structural requirement here, not a UI promise.';

create index if not exists memory_versions_property_idx
  on knowledge.memory_versions (property_id, published_at desc);

-- =========================================================================
-- ACCESS — insert-only, ever, for any role. The same posture 0109 already established
-- for the world graph, for the identical reason: nothing about a published version is
-- ever expected to change in place.

revoke update, delete on knowledge.memory_versions from klussie_engine_knowledge;
revoke all on knowledge.memory_versions from anon, authenticated, service_role;

alter table knowledge.memory_versions enable row level security;
-- No policy yet — WP 17.02's own job.

-- Epic 08 WP02 — attachment: what a document is *about*, scoped to the subjects that
-- actually exist today.
--
-- DATABASE_ARCHITECTURE.md §15: "A document attaches to any number of subjects —
-- property, location, asset, maintenance, service record, engagement, workspace." Plural
-- on purpose: one document may attach to several subjects, so this is a genuine linking
-- table, one row per (document, subject) pair, not a single subject column on
-- property.documents itself.
--
-- MAINTENANCE RECORD AND MARKETPLACE ENGAGEMENT ARE NAMED IN §15 AND DELIBERATELY NOT
-- INCLUDED
--
-- Neither table exists — Maintenance is Epic 10, Marketplace Engagement is Epic 12.
-- Adding a column that can never be populated is exactly the speculative structure
-- ADR-0010 rules out. Four real foreign keys instead of a stringly-typed
-- subject_type/subject_id pair, so referential integrity ("can't attach a document to a
-- property that doesn't exist") is enforced by the database rather than by convention —
-- the same reasoning that made property.assets.location_id a real FK rather than a
-- polymorphic pair in Epic 07. When Epic 10 or Epic 12 ship, the natural extension is one
-- more nullable column and one more arm in the check constraint below — additive, not a
-- redesign, the same shape every "add without switching" package in this roadmap takes.
--
-- ATTACHMENT IS NOT A VISIBILITY GRANT — SEE 0058 FOR WHERE THIS ACTUALLY MATTERS
--
-- §15, stated as a principle that was "nearly lost": "A document attached to an asset
-- does not become visible to a contractor with access to that asset." This table records
-- only what a document is about. No isolation policy anywhere in this schema may ever
-- join through it to decide who can see a document — 0058's own isolation policy and its
-- structural test both exist specifically to hold that line.

create table if not exists property.document_attachments (
  id            uuid        not null,

  document_id   uuid        not null
                references property.documents (id),

  property_id   uuid        references property.properties (id),
  location_id   uuid        references property.locations (id),
  asset_id      uuid        references property.assets (id),
  workspace_id  uuid        references workspace.workspaces (id),

  created_at    timestamptz not null default now(),

  constraint document_attachments_pkey primary key (id),

  -- Exactly one subject per row — a document attached to two subjects gets two rows,
  -- never one row with two columns set. num_nonnulls is pg_catalog, resolves under
  -- search_path = '' without qualification, the same as every bare pg_catalog function
  -- call elsewhere in this schema.
  constraint document_attachments_exactly_one_subject
    check (num_nonnulls(property_id, location_id, asset_id, workspace_id) = 1)
);

create index if not exists document_attachments_document_id_idx on property.document_attachments (document_id);
create index if not exists document_attachments_property_id_idx on property.document_attachments (property_id);
create index if not exists document_attachments_location_id_idx on property.document_attachments (location_id);
create index if not exists document_attachments_asset_id_idx on property.document_attachments (asset_id);
create index if not exists document_attachments_workspace_id_idx on property.document_attachments (workspace_id);

comment on table property.document_attachments is
  'What a document is about (DATABASE_ARCHITECTURE.md §15) — one row per (document, subject) pair, a document may have several. Scoped to the four subjects with a real table today: property, location, asset, workspace. Maintenance record and marketplace engagement are named in §15 but not included — neither table exists yet (Epic 10, Epic 12). NEVER a source of visibility — see property.document_shares (0057) and the isolation policy (0058) for who may see a document.';

alter table property.document_attachments enable row level security;

-- No policy — engine-internal only, reachable from property.my_documents()/
-- resolve_document() (0059), never from a direct client query. Matches
-- property.facet_types' and workspace.workspaces' own restraint before either had a real
-- direct caller — the absent policy is still the deny.

revoke all on property.document_attachments from anon, authenticated, service_role;

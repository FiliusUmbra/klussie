-- Epic 08 WP01 — the declared document-type catalog, the document aggregate (a mutable
-- current version), and its version history (closed versions only, append-only).
--
-- PLATFORM_DOMAIN_MODEL.md §12 / DATABASE_ARCHITECTURE.md §15: "evidence that outlives
-- what it was attached to, needed from more than one direction." Step 1 of the six-step
-- migration pattern (roadmap §3). Lives in `property`, the same schema as Property,
-- Location and Asset (migration 0018's own grouping comment: those engines "are read
-- together constantly... so those joins stay inside a schema"), owned by the same
-- klussie_engine_property role.
--
-- VERSIONING IS NOT A FUTURE EVOLUTION — IT IS ADR-0028's SHAPE, A THIRD TIME
--
-- PLATFORM_DOMAIN_MODEL.md §12 lists "versioning, since certificates are reissued" under
-- "how it evolves," which reads as deferred. DATABASE_ARCHITECTURE.md §15 states it as
-- the model itself: "Metadata mutable; content immutable — a reissued certificate is a
-- new version, not an edit. Version history is retained." The more specific, more
-- authoritative document wins (this session's standing rule for resolving exactly this
-- kind of tension). The shape is not new: ADR-0028's mutable-current-pointer-plus-
-- genuinely-append-only-log-of-closed-entries, already reused once for Asset placement
-- (Epic 07) without a new ADR, reused again here for the identical reason — no circular
-- foreign key, no new pattern. property.documents holds the CURRENT version's own fields
-- directly (the same shape property.properties.steward_workspace_id/.steward_since
-- already holds the current steward directly, not via a pointer into
-- stewardship_periods); property.document_versions holds only SUPERSEDED versions, each
-- with both began_at and superseded_at known at insert — exactly stewardship_periods'
-- and asset_placements' own shape, repeated.
--
-- DOCUMENT TYPE MUST BE A DECLARED CATALOG, NOT FREE TEXT — AND, UNLIKE facet_types
-- (EPIC 07), IT CANNOT SHIP EMPTY
--
-- DATABASE_ARCHITECTURE.md §15: "Documents that are evidence follow Historical
-- retention. Documents that are convenience may be deleted by their owner. The
-- distinction is carried by document type, so it is decided by configuration rather
-- than by a user's judgement in the moment." property.facet_types (Epic 07) shipped
-- with zero seeded rows because nothing needed one yet. This epic's own backfill
-- (WP 08.06) needs real rows to classify existing portfolio_items and
-- service_request_photos rows into — seeded below, the first declared catalog in this
-- roadmap that could not follow facet_types' own restraint unmodified.
--
-- DELETION IS CONDITIONAL ON TYPE, ENFORCED BY A GUARD TRIGGER, NOT BY A GRANT
--
-- A GRANT is table-wide; "convenience documents may be deleted, evidence documents may
-- not" is a per-row condition on a joined value, which only a trigger (or an RLS DELETE
-- policy) can express. A trigger is used here, matching this schema's own established
-- idiom for "this must never happen, regardless of role" (stewardship_periods_reject_
-- mutation, asset_placements_reject_mutation, membership_history_reject_mutation) —
-- the same defense-in-depth reasoning, applied conditionally rather than
-- unconditionally for the first time.

-- =========================================================================
-- THE DECLARED TYPE CATALOG

create table if not exists property.document_types (
  type_key         text        not null,
  retention_class  text        not null
                    check (retention_class in ('evidence', 'convenience')),
  created_at       timestamptz not null default now(),

  constraint document_types_pkey primary key (type_key)
);

comment on table property.document_types is
  'The declared catalog a document''s type must be registered in (DATABASE_ARCHITECTURE.md §15) — configuration, not an aggregate, matching property.facet_types'' own shape (Epic 07). Unlike facet_types, seeded below: WP 08.06''s backfill needs real values to classify existing rows into.';
comment on column property.document_types.retention_class is
  'What deletion means for a document of this type (§15): evidence follows Historical retention (never deleted, only superseded); convenience may be deleted by its owner. Enforced by property.documents_guard_deletion() below, not by a grant.';

insert into property.document_types (type_key, retention_class) values
  ('portfolio_photo', 'convenience'),
  ('request_photo', 'convenience')
on conflict (type_key) do nothing;

alter table property.document_types enable row level security;

-- No policy — configuration nobody reads directly from the client yet, the same
-- restraint property.facet_types (Epic 07) and workspace.workspaces (before WP 03.10)
-- both held before a real caller existed. The absent policy is still the deny.

-- =========================================================================
-- THE DOCUMENT AGGREGATE — a mutable current version, per ADR-0028's shape

create table if not exists property.documents (
  id                    uuid              not null,

  owning_workspace_id   uuid              not null
                        references workspace.workspaces (id),

  -- Set once, at creation. Nothing in DATABASE_ARCHITECTURE.md §15 describes document
  -- ownership transferring the way property stewardship does (ADR-0028) — no mutable-
  -- pointer-plus-history shape needed for this column specifically.
  type_key              text              not null
                        references property.document_types (type_key),

  -- THE CURRENT VERSION — mutable, per ADR-0028's shape (this migration's own header).
  -- One bucket for all Document Engine content ('documents'); the path itself carries
  -- tenancy, per SUPABASE_ARCHITECTURE.md §11.3's "bucket organisation follows tenancy
  -- rather than document type" — <owning_workspace_id>/<document id>/<random>. Explicit
  -- storage_bucket, not assumed: WP 08.06's backfill points at content that already
  -- lives in existing buckets (portfolio, request-photos) this migration cannot move —
  -- a database migration can move rows, not Storage objects. New documents written
  -- through this engine going forward use the canonical 'documents' bucket (the
  -- column's own default); backfilled rows name the bucket they actually live in.
  storage_bucket        text              not null default 'documents',
  storage_path           text              not null,
  issuer                text,
  valid_from             date,
  valid_until            date,
  version_since          timestamptz       not null default now(),

  created_at            timestamptz       not null default now(),
  updated_at            timestamptz       not null default now(),

  constraint documents_pkey primary key (id)
);

create index if not exists documents_owning_workspace_id_idx on property.documents (owning_workspace_id);
create index if not exists documents_type_key_idx on property.documents (type_key);
-- Powers the temporal signal already designed ahead of this epic
-- (GUIDANCE_SYSTEM.md §17.4.1/§A.5): "which documents expire soon."
create index if not exists documents_valid_until_idx on property.documents (valid_until) where valid_until is not null;

comment on table property.documents is
  'The document aggregate (DATABASE_ARCHITECTURE.md §15) — evidence that outlives what it was attached to. Holds the CURRENT version''s metadata directly (ADR-0028''s shape); superseded versions live in property.document_versions. Content itself lives in Supabase Storage, never here (§15: "metadata and content are separate concerns").';
comment on column property.documents.valid_until is
  'Structural, not decorative (§15: "a certificate with an expiry is actionable; a file is not"). Once real, supersedes property.assets.warranty_expires_on (Epic 07) as the source for the Guidance System''s own warranty-expiry signal — see GUIDANCE_SYSTEM.md §17.4.1.';

alter table property.documents enable row level security;

-- 0019's default privileges already grant klussie_engine_property SELECT and INSERT.
-- UPDATE is explicit, naming the class (Transactional, §4), matching property.properties
-- and property.assets. DELETE is explicit too, unlike Epic 07's assets (which withhold
-- it entirely) — here it is real but conditional, gated by the trigger below, never by
-- the grant alone.
grant update on property.documents to klussie_engine_property;
grant delete on property.documents to klussie_engine_property;

create or replace function property.documents_guard_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_retention_class text;
begin
  select dt.retention_class into v_retention_class
  from property.document_types dt
  where dt.type_key = old.type_key;

  if v_retention_class = 'evidence' then
    raise exception
      'property.documents: an evidence-class document cannot be deleted (type %)', old.type_key
      using
        hint = 'Evidence follows Historical retention (DATABASE_ARCHITECTURE.md §15). A correction is a new version, not a deletion.',
        errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

comment on function property.documents_guard_deletion() is
  'Deletion is conditional on document_type.retention_class (§15), which a GRANT alone cannot express — evidence-class documents are never deletable, convenience-class documents may be deleted by their owner. Same defense-in-depth idiom as the append-only guard triggers, applied conditionally rather than unconditionally.';

drop trigger if exists documents_guard_deletion on property.documents;
create trigger documents_guard_deletion
  before delete on property.documents
  for each row
  execute function property.documents_guard_deletion();

-- =========================================================================
-- VERSION HISTORY — superseded versions only, genuinely append-only (ADR-0028's shape)

create table if not exists property.document_versions (
  id            uuid        not null,

  document_id   uuid        not null
                references property.documents (id),

  storage_bucket text      not null default 'documents',
  storage_path  text        not null,
  issuer        text,
  valid_from    date,
  valid_until   date,

  began_at      timestamptz not null,
  superseded_at timestamptz not null,

  created_at    timestamptz not null default now(),

  constraint document_versions_pkey primary key (id),
  constraint document_versions_superseded_after_began check (superseded_at > began_at)
);

create index if not exists document_versions_document_id_idx
  on property.document_versions (document_id, superseded_at);

comment on table property.document_versions is
  'The permanent record of every SUPERSEDED document version (DATABASE_ARCHITECTURE.md §15, Historical class). Only closed versions are ever written; both began_at and superseded_at are known at insert time. The current, still-open version lives on property.documents (ADR-0028''s shape), not here. Empty until a document is reissued — nothing does that yet.';

alter table property.document_versions enable row level security;

-- Append-only, identical shape to property.asset_placements (migration 0048),
-- property.stewardship_periods (migration 0039) and workspace.membership_history
-- (migration 0030).

create or replace function property.document_versions_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'property.document_versions is append-only: % rejected', tg_op
    using
      hint = 'A superseded version is permanent. A correction is a new version describing the correction.',
      errcode = 'restrict_violation';
end;
$$;

comment on function property.document_versions_reject_mutation() is
  'Immutability guard for property.document_versions, identical in shape to property.asset_placements_reject_mutation() (migration 0048), property.stewardship_periods_reject_mutation() (migration 0039) and workspace.membership_history_reject_mutation() (migration 0030).';

drop trigger if exists document_versions_append_only on property.document_versions;
create trigger document_versions_append_only
  before update or delete on property.document_versions
  for each row execute function property.document_versions_reject_mutation();

-- DELETE is withheld — a superseded version is never removed, only ever superseded by a
-- later one (matching asset_placements/stewardship_periods, which withhold it too).

revoke all on property.document_types from anon, authenticated, service_role;
revoke all on property.documents from anon, authenticated, service_role;
revoke all on property.document_versions from anon, authenticated, service_role;

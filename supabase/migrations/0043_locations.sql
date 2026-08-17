-- Epic 06 WP01 — the locations table, empty.
--
-- PLATFORM_DOMAIN_MODEL.md §10: "A place within a property... Locations nest, recursively
-- and without a fixed depth." SUPABASE_ARCHITECTURE.md §11.2 chooses ltree for the
-- materialised path, containment as a prefix match rather than a recursive walk. Step 1 of
-- the six-step migration pattern (roadmap §3): structure only, nothing reads or writes it.
--
-- LOCATIONS LIVE IN `property`, NOT A NEW SCHEMA
--
-- Migration 0018 (Epic 01): "Property, Location, Asset and Document share one schema...
-- read together constantly... those joins stay inside a schema." property.locations,
-- owned by the same klussie_engine_property role as property.properties.
--
-- ISOLATION IS INHERITED, NOT OWNED (DATABASE_ARCHITECTURE.md §13)
--
-- "Workspace-scoped, inheriting the property's stewardship." A location carries
-- property_id and nothing else tenancy-shaped — no workspace_id, no steward_workspace_id
-- of its own. Duplicating the property's current steward onto every location would
-- recreate the exact two-answers problem ADR-0028 avoided for the property aggregate
-- itself: the property's steward can change (transfer), and a location-level copy would
-- have to change with it or silently disagree. The RLS policy (WP 06.03) joins through
-- property.properties.steward_workspace_id instead.
--
-- THE PATH COLUMN, DECLARED HERE, MAINTAINED IN WP 06.02
--
-- `path extensions.ltree not null` is declared in this migration but nothing populates it
-- yet — WP 06.02's trigger does, and nothing can insert a location before then anyway
-- (this table is empty and unread, same as every "add" package in this roadmap). Declared
-- not null now rather than nullable-then-tightened, because every row this table will
-- ever hold needs one — there is no valid "location with no position in the tree."
--
-- extensions.ltree, not a bare `ltree` — migration 0020's own instruction: "not on the
-- default search_path for a migration... qualifying explicitly is correct regardless."
--
-- grant usage on schema extensions to klussie_engine_property — migration 0020's own
-- words, executed here: "Epic 06 grants usage on schema extensions to
-- klussie_engine_property when it creates the first ltree column."
--
-- TYPE IS UNCONSTRAINED, DELIBERATELY (domain model §10)
--
-- "Taxonomies are configuration and vary by jurisdiction and industry — never hardcoded."
-- No check constraint, the same restraint workspace.memberships.role held (migration
-- 0030) for the identical reason: a closed list would have to be revisited the day a new
-- taxonomy value is needed, and this column is exactly where that would happen first.
--
-- RETIRED, NOT DELETED (§13)
--
-- "A room that no longer exists still hosted work that happened." retired_at is soft-retire
-- (§4's Mutability Classes), nullable, null means active — the same shape
-- workspace.workspaces.archived_at already established.

create table if not exists property.locations (
  -- Application-generated UUIDv7, no default — the same reasoning as every other
  -- aggregate identifier in this schema (SUPABASE_ARCHITECTURE.md §3).
  id            uuid              not null,

  property_id   uuid              not null
                references property.properties (id),

  -- Self-referencing. Null means top-level — directly under the property, not under
  -- another location. No `on delete` clause: a location is retired, never deleted, so
  -- there is no delete for a child to react to.
  parent_id     uuid
                references property.locations (id),

  name          text              not null,
  type          text,

  -- Materialised path (SUPABASE_ARCHITECTURE.md §11.2). Maintained by WP 06.02's trigger,
  -- never set directly by a caller. Includes the property's own label as its first
  -- segment (WP 06.02) — the property is the tree's root, which is what lets containment
  -- be checked from the path alone, with no second join to confirm which property a
  -- location belongs to.
  path          extensions.ltree  not null,

  created_at    timestamptz       not null default now(),
  updated_at    timestamptz       not null default now(),
  retired_at    timestamptz,

  constraint locations_pkey primary key (id)
);

-- GiST, not btree — what makes ltree's containment operators (<@, @>) affordable at
-- hospital-campus depth (§13's own scale requirement).
create index if not exists locations_path_gist_idx
  on property.locations using gist (path extensions.gist_ltree_ops);
create index if not exists locations_property_id_idx
  on property.locations (property_id);
create index if not exists locations_parent_id_idx
  on property.locations (parent_id);

comment on table property.locations is
  'The location tree (PLATFORM_DOMAIN_MODEL.md §10) — space within a property, nesting to whatever depth the customer''s world requires. Owned by the property it belongs to; isolation inherits the property''s current stewardship (DATABASE_ARCHITECTURE.md §13), never its own workspace column. Inert until Epic 06''s later packages.';
comment on column property.locations.parent_id is
  'Null means top-level, directly under the property. Authoritative structure — path (below) is a maintained denormalisation of this, never the other way round (SUPABASE_ARCHITECTURE.md §11.2).';
comment on column property.locations.type is
  'A configurable taxonomy value (kitchen, plant room, cold storage...) — never hardcoded or constrained here (domain model §10). No check constraint, deliberately, the same restraint workspace.memberships.role holds.';
comment on column property.locations.path is
  'Materialised path, GiST-indexed, maintained by a trigger (WP 06.02) from parent_id and this row''s own id. Never set directly. Recomputable from parent_id if it ever disagrees (§11.2).';
comment on column property.locations.retired_at is
  'Soft-retire, matching workspace.workspaces.archived_at''s shape. Null means active. A retired location referenced by history is never removed (§13).';

alter table property.locations enable row level security;

-- =========================================================================
-- ACCESS
--
-- 0019's default privileges already grant klussie_engine_property SELECT and INSERT on
-- every table created in `property` (the fail-safe append-only default, ROLES.md §3 rule
-- 2). property.locations is Transactional (§4): fully mutable, including re-parenting
-- (§13). UPDATE is granted explicitly, naming the class, exactly as property.properties
-- did in migration 0039.
grant update on property.locations to klussie_engine_property;

-- DELETE is withheld. A location is retired, never removed, for the identical reason a
-- property is archived and a workspace is archived: history that references it must
-- survive it.

-- extensions.ltree needs USAGE on schema extensions to be referenced at all — migration
-- 0020's own deferred instruction, executed here, the first time an ltree column exists.
grant usage on schema extensions to klussie_engine_property;

-- Explicit, verified rather than assumed — the same discipline every table-creating
-- migration in this pattern holds itself to.
revoke all on property.locations from anon, authenticated, service_role;

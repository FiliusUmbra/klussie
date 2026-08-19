-- Epic 07 WP01 — the assets and asset_placements tables, empty.
--
-- PLATFORM_DOMAIN_MODEL.md §11: "A physical thing that has a lifecycle, needs care, and
-- whose history is worth remembering." Step 1 of the six-step migration pattern (roadmap
-- §3). Lives in `property`, the same schema as Property and Location (migration 0018's own
-- design), owned by the same klussie_engine_property role.
--
-- PLACEMENT REPEATS STEWARDSHIP'S EXACT SHAPE — ADR-0028, NOT A NEW DECISION
--
-- DATABASE_ARCHITECTURE.md §14: "Placement is a period, not a field. As with stewardship:
-- an asset's relationship to a location is a time-bounded placement, appended rather than
-- overwritten." This is the identical contradiction ADR-0028 already resolved for
-- stewardship (§4 classifies "stewardship periods" Historical/write-once while "property"
-- is Transactional; the same split applies here even though §14 doesn't cite §4 by number).
-- No new ADR: property.assets.location_id / .placed_since is the mutable current pointer
-- (Transactional); property.asset_placements holds only CLOSED placements, both began_at
-- and ended_at known at insert (Historical, genuinely append-only, migration 0044's guard
-- trigger shape repeated exactly).
--
-- location_id IS NULLABLE — EVERY BACKFILLED ASSET STARTS UNPLACED
--
-- Epic 06 built no location backfill (its own roadmap §16 scope note: nothing creates a
-- real location yet). WP 07.05's backfill therefore cannot place any asset anywhere real —
-- room_label carries the free-text room name forward instead, the exact bridge migration
-- 0016 already promised for public.household_items.room: "When rooms become real, this
-- column is what gets backfilled from." That backfill belongs to whichever epic gives
-- households real location rows, not this one.
--
-- type IS UNCONSTRAINED, UNLIKE household_items.category
--
-- domain model §11: type comes "from a configurable taxonomy" — the same restraint
-- property.locations.type already holds (migration 0043), not household_items.category's
-- hardcoded six-value check (migration 0016). The backfill (WP 07.05) carries the six
-- existing category values across as plain text; nothing constrains what a new asset's type
-- may be going forward.
--
-- source MATCHES household_items' EXISTING TWO-VALUE CHECK, NOT A WIDER ONE
--
-- domain model §11 names "Bulk provision" and "Inference from work" as future arrival
-- paths, but nothing in the current product produces a 'bulk_import' or 'inferred' row —
-- widening the check now would be speculative structure (ADR-0010). manual and
-- ai_confirmed only, identical to migration 0016's own constraint and its own reasoning:
-- "There is deliberately no value for unconfirmed AI output... a row that nobody confirmed
-- is a row that should not exist."
--
-- lifecycle_state IS CONSTRAINED; type AND condition ARE NOT — DELIBERATELY DIFFERENT RULES
--
-- The same distinction workspace.memberships draws between .state (constrained: a real
-- state machine) and .role (unconstrained: an open taxonomy) — migration 0030's own
-- reasoning, repeated here. active/retired/disposed is this platform's own lifecycle, not
-- something a customer's vocabulary could ever need to extend.
--
-- NO ltree FOR ASSET NESTING
--
-- domain model §11 states assets nest ("a production line contains machines"), but neither
-- it nor DATABASE_ARCHITECTURE.md §14 states a depth-at-scale requirement the way §13 does
-- for locations ("hospital campus... a hundred thousand across six levels"). A materialised
-- path answers a containment question nothing in this epic asks yet — parent_asset_id alone
-- is what's needed, and a path can be added later without touching existing rows if a real
-- containment requirement ever appears (the same recomputable-denormalisation property
-- migration 0043's own path column has).

-- =========================================================================
-- ASSETS

create table if not exists property.assets (
  id                    uuid              not null,

  property_id           uuid              not null
                        references property.properties (id),

  parent_asset_id       uuid
                        references property.assets (id),

  name                  text              not null,
  type                  text,

  make                  text,
  model                 text,
  serial_number         text,

  -- THE CURRENT PLACEMENT — mutable, per ADR-0028's shape. Both null together (unplaced)
  -- or both set together; nothing in this migration enforces that pairing structurally,
  -- the same restraint property.properties.jurisdiction's mutable-only-by-correction rule
  -- holds itself to (documented, not constrained).
  location_id           uuid
                        references property.locations (id),
  placed_since          timestamptz,

  -- The free-text bridge — see this migration's header. Carried from household_items.room
  -- by WP 07.05; not a location reference.
  room_label            text,

  acquired_on            date,
  installed_on            date,
  expected_service_life_months integer,
  warranty_expires_on      date,

  condition             text,

  lifecycle_state       text              not null default 'active'
                        check (lifecycle_state in ('active', 'retired', 'disposed')),

  photo_path            text,
  notes                 text,

  -- AI PROVENANCE — identical shape and identical reasoning to household_items' own pair
  -- (migration 0016): "nothing a model guessed about someone's home is saved without them
  -- saying yes, so a row that nobody confirmed is a row that should not exist."
  source                text              not null default 'manual'
                        check (source in ('manual', 'ai_confirmed')),
  ai_suggestion         jsonb,

  created_at            timestamptz       not null default now(),
  updated_at            timestamptz       not null default now(),

  constraint assets_pkey primary key (id)
);

create index if not exists assets_property_id_idx on property.assets (property_id);
create index if not exists assets_parent_asset_id_idx on property.assets (parent_asset_id);
create index if not exists assets_location_id_idx on property.assets (location_id);

comment on table property.assets is
  'The asset aggregate (PLATFORM_DOMAIN_MODEL.md §11) — the anchor of maintenance history and prediction. Retired, never deleted, while history references it. Inert until this epic''s later packages.';
comment on column property.assets.location_id is
  'The CURRENT placement (ADR-0028''s shape, repeated from property.properties.steward_workspace_id) — mutable, null means unplaced. Every asset WP 07.05 backfills starts unplaced; Epic 06 built no location backfill for this to point at yet.';
comment on column property.assets.room_label is
  'Free text, not a location reference — the exact bridge public.household_items.room already promised (migration 0016: "when rooms become real, this column is what gets backfilled from"). Populated by WP 07.05''s backfill; superseded once a real location backfill exists.';
comment on column property.assets.type is
  'A configurable taxonomy value — never hardcoded or constrained here (domain model §11), unlike household_items.category''s six-value check it succeeds.';
comment on column property.assets.source is
  'How this row came to exist. Matches household_items.source''s own two values and its own reasoning exactly: no value exists for unconfirmed AI output.';

alter table property.assets enable row level security;

-- =========================================================================
-- ASSET PLACEMENTS — closed placements only, genuinely append-only (ADR-0028's shape)

create table if not exists property.asset_placements (
  id            uuid        not null,

  asset_id      uuid        not null
                references property.assets (id),

  location_id   uuid        not null
                references property.locations (id),

  began_at      timestamptz not null,
  ended_at      timestamptz not null,

  created_at    timestamptz not null default now(),

  constraint asset_placements_pkey primary key (id),
  constraint asset_placements_ended_after_began check (ended_at > began_at)
);

create index if not exists asset_placements_asset_id_idx
  on property.asset_placements (asset_id, ended_at);

comment on table property.asset_placements is
  'The permanent record of every COMPLETED placement (DATABASE_ARCHITECTURE.md §14, Historical class). Only closed placements are ever written; both began_at and ended_at are known and set at insert time. The current, still-open placement lives on property.assets (ADR-0028''s shape), not here. Empty until an asset is moved and a placement closes — nothing does that yet.';

alter table property.asset_placements enable row level security;

-- Append-only, enforced the same way as workspace.membership_history (migration 0030) and
-- property.stewardship_periods (migration 0039).

create or replace function property.asset_placements_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'property.asset_placements is append-only: % rejected', tg_op
    using
      hint = 'A closed placement is permanent. A correction is a new row describing the correction.',
      errcode = 'restrict_violation';
end;
$$;

comment on function property.asset_placements_reject_mutation() is
  'Immutability guard for property.asset_placements, identical in shape to property.stewardship_periods_reject_mutation() (migration 0039) and workspace.membership_history_reject_mutation() (migration 0030).';

drop trigger if exists asset_placements_append_only on property.asset_placements;
create trigger asset_placements_append_only
  before update or delete on property.asset_placements
  for each row execute function property.asset_placements_reject_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS
--
-- 0019's default privileges already grant klussie_engine_property SELECT and INSERT on
-- every table created in `property`. property.assets is Transactional (§4): fully mutable,
-- including its current-placement pointer. UPDATE is granted explicitly, naming the class,
-- exactly as property.properties and property.locations already do.
grant update on property.assets to klussie_engine_property;

-- DELETE is withheld from both tables — an asset is retired, never removed (§14); a closed
-- placement is never removed, only superseded by a later one.

revoke all on property.assets from anon, authenticated, service_role;
revoke all on property.asset_placements from anon, authenticated, service_role;

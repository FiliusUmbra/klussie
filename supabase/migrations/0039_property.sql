-- Epic 05 WP01 — the property and stewardship-period tables, empty.
--
-- PLATFORM_DOMAIN_MODEL.md §9: "A property is a place in the world that someone is
-- responsible for... Memory attaches to a property, not to a person and not to a
-- workspace." This is step 1 of the six-step migration pattern (roadmap §3): structure
-- only, nothing reads or writes it, the application is entirely unaffected.
--
-- The `property` schema and its role (klussie_engine_property) already exist, empty,
-- since Epic 01 (0018_schemas.sql, 0019_grants.sql) — this migration is what populates
-- them for the first time.
--
-- THE SHAPE, AND WHY IT IS NOT WHAT DATABASE_ARCHITECTURE.md §12 READS AS ON FIRST PASS
--
-- ADR-0028 has the full reasoning. In short: §12's own sentence ("stewardship is a
-- period... those periods are append-only") reads as one table with a nullable ended_at
-- set once to close it. §4's Storage Classes table contradicts that literal reading --
-- it puts "property" under Transactional and "stewardship periods" under Historical
-- ("write-once, never updated"), SEPARATELY. A row that starts null and is later set is,
-- by definition, updated -- so the two sections of the same frozen document, read
-- together, describe the shape Epic 03 already built for membership: a mutable current
-- pointer (Transactional) plus a permanent, append-only log of what has already closed
-- (Historical). Not a new pattern -- workspace.memberships / workspace.membership_history
-- (migration 0030) is this exact split, for the identical reason.
--
-- WHAT THIS MEANS CONCRETELY
--
--   property.properties.steward_workspace_id / .steward_since
--     The CURRENT pointer. Mutable -- this is "the one place in the architecture where
--     tenancy is not a static stamp" (§12), and a plain, indexed, directly-queryable
--     column is the simplest thing that can be dynamic in that sense: it changes when
--     stewardship transfers (a future operation this epic does not build -- no gated
--     action exists yet, see roadmap §15's scope note), it does not need a resolver to
--     answer "who stewards this right now."
--
--   property.stewardship_periods
--     The HISTORICAL log. Only CLOSED periods are ever written here -- began_at and
--     ended_at both known and set at insert time. Nothing has ever transferred yet, so
--     WP 05.02's backfill leaves this table empty; it starts having rows the day the
--     stewardship-transfer operation ships and writes its first one.
--
-- ISOLATION NEEDS NO NEW RESOLVER
--
-- Because steward_workspace_id is a plain workspace_id-shaped column, WP 05.05's RLS
-- policy reuses api.current_workspace_memberships() (migration 0031) directly -- the
-- exact predicate every Epic 03 table's isolation policy already uses. No
-- property-specific membership helper is built in this epic (ADR-0028 "Rules out").
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- No backfill (WP 05.02). No RLS policy beyond "enabled, no grant" -- the isolation
-- predicate needs nothing new to exist first (unlike Epic 03's membership helper), but
-- writing the policy is still a separate package so this one stays purely additive. No
-- jurisdiction value populated -- nullable until a package states and applies a rule for
-- it, the same restraint migration 0032 held for workspace_id.

-- =========================================================================
-- PROPERTY

create table if not exists property.properties (
  -- Application-generated UUIDv7, no default -- same reasoning as
  -- workspace.workspaces.id (migration 0030): an engine must know an aggregate's identity
  -- before it writes, so it can emit an event referencing it in the same transaction
  -- (SUPABASE_ARCHITECTURE.md §3).
  id                     uuid        not null,

  -- "A name and a visual identity, chosen by its members" -- the same phrase
  -- PLATFORM_DOMAIN_MODEL.md §5 uses for a workspace's name, §9 does not repeat verbatim
  -- for a property but the backfill (WP 05.02) needs one, and "My Home" is already the
  -- existing product's own name for this exact concept (ADR-0008,
  -- docs/product/HOME_OPERATING_SYSTEM.md).
  name                   text,

  -- Distinct from the steward's own jurisdiction (SYSTEM_ARCHITECTURE.md §7.1:
  -- "Recording property jurisdiction, which is distinct from the workspace's").
  -- "Mutable only by correction" (§12) -- a real column with no attached logic; nothing
  -- in this migration enforces the correction-only rule structurally, matching how
  -- workspace.workspaces.type (migration 0030) states a similar restraint in a comment
  -- rather than a constraint the schema milestone left to the engine layer.
  jurisdiction           text,

  -- THE CURRENT STEWARD -- mutable, per ADR-0028. No default: every property must be
  -- created already knowing who stewards it (WP 05.02's backfill sets it in the same
  -- statement that inserts the row).
  steward_workspace_id   uuid        not null
                         references workspace.workspaces (id),
  steward_since          timestamptz not null,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint properties_pkey primary key (id)
);

create index if not exists properties_steward_workspace_id_idx
  on property.properties (steward_workspace_id);

comment on table property.properties is
  'The property aggregate (PLATFORM_DOMAIN_MODEL.md §9) -- a place in the world someone is responsible for. Permanent; never deleted while any historical record references it (§9). Inert until Epic 05''s backfill and read-switch packages.';
comment on column property.properties.steward_workspace_id is
  'The CURRENT steward (ADR-0028) -- mutable, unlike every other workspace_id column in this schema, because stewardship is a relationship that transfers (§9), not a static stamp. This is what api.current_workspace_memberships() is checked against for isolation (WP 05.05); no property-specific resolver exists.';
comment on column property.properties.steward_since is
  'When the CURRENT stewardship began. Paired with steward_workspace_id; both change together when stewardship transfers, and the just-ended period is what gets written to property.stewardship_periods at that moment.';
comment on column property.properties.jurisdiction is
  'Distinct from the steward workspace''s own jurisdiction (SYSTEM_ARCHITECTURE.md §7.1). Mutable only by correction (§12); nullable and unpopulated until a later package states and applies a rule for it.';

alter table property.properties enable row level security;

-- =========================================================================
-- STEWARDSHIP PERIODS -- closed periods only, genuinely append-only (ADR-0028)

create table if not exists property.stewardship_periods (
  id            uuid        not null,

  property_id   uuid        not null
                references property.properties (id),

  workspace_id  uuid        not null
                references workspace.workspaces (id),

  began_at      timestamptz not null,
  ended_at      timestamptz not null,

  created_at    timestamptz not null default now(),

  constraint stewardship_periods_pkey primary key (id),
  constraint stewardship_periods_ended_after_began check (ended_at > began_at)
);

create index if not exists stewardship_periods_property_id_idx
  on property.stewardship_periods (property_id, ended_at);

comment on table property.stewardship_periods is
  'The permanent record of every COMPLETED stewardship (DATABASE_ARCHITECTURE.md §4, Historical class -- "write-once, never updated"). Only closed periods are ever written; both began_at and ended_at are known and set at insert time. The current, still-open period lives on property.properties (ADR-0028), not here. Empty until a stewardship transfer operation exists and writes its first row -- none does yet (roadmap §15''s scope note).';

alter table property.stewardship_periods enable row level security;

-- Append-only, enforced the same way as workspace.membership_history (migration 0030):
-- withheld privileges below, plus a guard trigger here.

create or replace function property.stewardship_periods_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'property.stewardship_periods is append-only: % rejected', tg_op
    using
      hint = 'A closed period is permanent. A correction is a new row describing the correction.',
      errcode = 'restrict_violation';
end;
$$;

comment on function property.stewardship_periods_reject_mutation() is
  'Immutability guard for property.stewardship_periods, identical in shape to workspace.membership_history_reject_mutation() (migration 0030). An integrity constraint, not a business rule (SUPABASE_ARCHITECTURE.md §4).';

drop trigger if exists stewardship_periods_append_only on property.stewardship_periods;
create trigger stewardship_periods_append_only
  before update or delete on property.stewardship_periods
  for each row execute function property.stewardship_periods_reject_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS
--
-- 0019's default privileges already grant klussie_engine_property SELECT and INSERT on
-- every table created here (the fail-safe append-only default, ROLES.md §3 rule 2).
--
-- property.properties is Transactional (§4): its current-steward pointer changes in
-- place. UPDATE is granted explicitly, naming the class, exactly as workspace.workspaces
-- did in migration 0030.
grant update on property.properties to klussie_engine_property;

-- DELETE is withheld from both tables. A property is archived by outliving every
-- reference to it, never deleted while one exists (§9); a closed stewardship period is
-- never removed, only ever superseded by a later one.

-- property.stewardship_periods is Historical (§4): the default SELECT+INSERT is already
-- correct and complete. Nothing to grant beyond it.

-- Explicit, verified rather than assumed (the same discipline workspace.workspaces'
-- migration 0030 holds itself to, and Epic 02's own finding: default privileges have
-- surprised this project before). No client role has ever been granted anything on
-- `property`, so this should be a no-op -- and is written anyway.
revoke all on property.properties from anon, authenticated, service_role;
revoke all on property.stewardship_periods from anon, authenticated, service_role;

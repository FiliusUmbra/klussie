-- Epic 07 WP04 — the asset engine contract: list a property's assets, and resolve one
-- asset's state.
--
-- SAME SPLIT, A FIFTH TIME — AND, UNLIKE EPIC 06'S CONTAINMENT FUNCTIONS, WITH REAL
-- CLIENT DELEGATES
--
-- Logic in `property`, reachable by nothing client-facing. Thin SECURITY DEFINER delegates
-- in `api` (ADR-0026). Epic 06's location_within/_ancestors/_descendants deliberately got
-- no api delegate, because nothing consumes them and nothing will soon — pure engine-to-
-- engine reach. This contract is different: WP 07.08 (decomposed, not built this session —
-- roadmap §17) is a real, near-term client caller once a session has database access to
-- verify it, the same relationship property.my_properties()/resolve_property() (migration
-- 0041) already has to My Home's UI. Built now, following that precedent rather than
-- Epic 06's.
--
-- SELF-ENFORCING BY CONSTRUCTION, THE SAME WAY EVERY CONTRACT FUNCTION SINCE 0036 IS
--
-- Both functions join through property.properties to workspace.current_memberships() —
-- a caller who is not a live member of the property's current steward gets no row, full
-- stop, regardless of what WP 07.03's RLS policy separately enforces.
--
-- NO FACETS, NO PLACEMENT HISTORY ASSEMBLY, DELIBERATELY
--
-- SYSTEM_ARCHITECTURE.md §7.3's "public contract" also names "Asset state with facets" and
-- "placement at a point in time." Both are real refinements with no real caller to prove
-- them against yet — nothing has ever placed or moved an asset, and no facet type exists
-- (migration 0049's own header). Building either now would be assembling a shape nobody
-- has asked for. Added when WP 07.08's real caller — or a later epic's — actually needs it.
--
-- NO decide_permission ANALOG, THE NOW-FAMILIAR RESTRAINT FROM WP 05.04 AND EPIC 06
--
-- Nothing in this epic has a gated action to decide yet.

-- =========================================================================
-- THE LOGIC — property.my_assets()

create or replace function property.my_assets(p_property_id uuid)
returns table (
  id                            uuid,
  name                          text,
  type                          text,
  make                          text,
  model                         text,
  serial_number                 text,
  location_id                   uuid,
  placed_since                   timestamptz,
  room_label                    text,
  acquired_on                    date,
  installed_on                    date,
  expected_service_life_months  integer,
  warranty_expires_on             date,
  condition                     text,
  lifecycle_state               text,
  photo_path                    text,
  notes                         text,
  source                        text,
  ai_suggestion                 jsonb,
  parent_asset_id                uuid,
  created_at                    timestamptz,
  updated_at                    timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    a.id, a.name, a.type, a.make, a.model, a.serial_number,
    a.location_id, a.placed_since, a.room_label,
    a.acquired_on, a.installed_on, a.expected_service_life_months,
    a.warranty_expires_on, a.condition, a.lifecycle_state,
    a.photo_path, a.notes, a.source, a.ai_suggestion,
    a.parent_asset_id, a.created_at, a.updated_at
  from property.assets a
  join property.properties p on p.id = a.property_id
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where a.property_id = p_property_id;
$$;

comment on function property.my_assets(uuid) is
  'Every asset a property holds, only if the caller holds a live membership in that property''s current steward (roadmap WP 07.04). Not SECURITY DEFINER, granted to nobody, reachable only from api.my_assets().';

-- =========================================================================
-- THE LOGIC — property.resolve_asset()

create or replace function property.resolve_asset(p_asset_id uuid)
returns table (
  id                            uuid,
  name                          text,
  type                          text,
  make                          text,
  model                         text,
  serial_number                 text,
  location_id                   uuid,
  placed_since                   timestamptz,
  room_label                    text,
  acquired_on                    date,
  installed_on                    date,
  expected_service_life_months  integer,
  warranty_expires_on             date,
  condition                     text,
  lifecycle_state               text,
  photo_path                    text,
  notes                         text,
  source                        text,
  ai_suggestion                 jsonb,
  parent_asset_id                uuid,
  created_at                    timestamptz,
  updated_at                    timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    a.id, a.name, a.type, a.make, a.model, a.serial_number,
    a.location_id, a.placed_since, a.room_label,
    a.acquired_on, a.installed_on, a.expected_service_life_months,
    a.warranty_expires_on, a.condition, a.lifecycle_state,
    a.photo_path, a.notes, a.source, a.ai_suggestion,
    a.parent_asset_id, a.created_at, a.updated_at
  from property.assets a
  join property.properties p on p.id = a.property_id
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where a.id = p_asset_id;
$$;

comment on function property.resolve_asset(uuid) is
  'Resolves one asset''s core state, only if the caller holds a live membership in its property''s current steward (roadmap WP 07.04). No facets, no placement history — see this migration''s header. Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_asset().';

-- =========================================================================
-- THE DELEGATES

create or replace function api.my_assets(p_property_id uuid)
returns table (
  id                            uuid,
  name                          text,
  type                          text,
  make                          text,
  model                         text,
  serial_number                 text,
  location_id                   uuid,
  placed_since                   timestamptz,
  room_label                    text,
  acquired_on                    date,
  installed_on                    date,
  expected_service_life_months  integer,
  warranty_expires_on             date,
  condition                     text,
  lifecycle_state               text,
  photo_path                    text,
  notes                         text,
  source                        text,
  ai_suggestion                 jsonb,
  parent_asset_id                uuid,
  created_at                    timestamptz,
  updated_at                    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.my_assets(p_property_id);
$$;

comment on function api.my_assets(uuid) is
  'Delegate for property.my_assets() (ADR-0026''s split). Every asset a property holds.';

create or replace function api.resolve_asset(p_asset_id uuid)
returns table (
  id                            uuid,
  name                          text,
  type                          text,
  make                          text,
  model                         text,
  serial_number                 text,
  location_id                   uuid,
  placed_since                   timestamptz,
  room_label                    text,
  acquired_on                    date,
  installed_on                    date,
  expected_service_life_months  integer,
  warranty_expires_on             date,
  condition                     text,
  lifecycle_state               text,
  photo_path                    text,
  notes                         text,
  source                        text,
  ai_suggestion                 jsonb,
  parent_asset_id                uuid,
  created_at                    timestamptz,
  updated_at                    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.resolve_asset(p_asset_id);
$$;

comment on function api.resolve_asset(uuid) is
  'Delegate for property.resolve_asset() (ADR-0026''s split). One asset''s core state.';

revoke all on function property.my_assets(uuid) from public, anon, authenticated, service_role;
revoke all on function property.resolve_asset(uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_assets(uuid) from public, anon, service_role;
revoke all on function api.resolve_asset(uuid) from public, anon, service_role;
grant execute on function api.my_assets(uuid) to authenticated;
grant execute on function api.resolve_asset(uuid) to authenticated;

-- Platform Activation Slice 1, WP 1.1 — the location read contract: the one engine of
-- the five this slice touches that had no client-facing read function at all (checked
-- exhaustively while scoping — SLICE_1_PROPERTY_ASSET_ACTIVATION.md §1.1).
-- property.location_within()/location_ancestors()/location_descendants() (0046) answer
-- containment questions about a location the caller already has an id for; none of them
-- *lists* a tree.
--
-- SAME TWO-LAYER SHAPE AS property.my_assets()/api.my_assets() — THE EXACT PRECEDENT THIS
-- FOLLOWS
--
-- Caller membership checked the identical way: `join workspace.current_memberships() m on
-- m.workspace_id = p.steward_workspace_id`. No SECURITY DEFINER on the logic function; the
-- api delegate carries it, matching every other read switch since Epic 07.
--
-- FLAT, NOT NESTED — THE CLIENT ASSEMBLES THE TREE FROM parent_id/path, NOT THIS FUNCTION
--
-- property.locations already carries everything a recursive tree needs (parent_id for
-- adjacency, the materialised path for depth/ordering — SUPABASE_ARCHITECTURE.md §11.2).
-- Returning a flat, path-ordered list and letting the client's own Location tree
-- component (WP 1.3) build the hierarchy is the same division of labour
-- property.my_assets() already uses for a workspace's own asset list — this function
-- answers "which rows," not "how are they nested," which is presentation, not data.
--
-- RETIRED LOCATIONS EXCLUDED BY DEFAULT, MATCHING property.my_assets()'S OWN
-- lifecycle_state = 'active' FILTER
--
-- A location is "retired, never deleted" (0043's own comment) — but the existing
-- containment functions (location_within/ancestors/descendants, 0046) deliberately do NOT
-- filter retired_at, because a containment question can legitimately be asked about a
-- location regardless of its current status. This function is different: it is
-- specifically the customer's own "what does my home look like right now" read, the
-- direct backing for WP 1.3's Location tree component — a customer browsing their current
-- home does not want a room they retired still showing. If a future work package needs a
-- "show retired locations too" view, that is a new parameter on this function, not a
-- reason to leave retired rows in by default here.

create or replace function property.locations_for_property(p_property_id uuid)
returns table (
  id         uuid,
  parent_id  uuid,
  name       text,
  type       text,
  path       extensions.ltree
)
language sql
stable
set search_path = ''
as $$
  select l.id, l.parent_id, l.name, l.type, l.path
  from property.locations l
  join property.properties p on p.id = l.property_id
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where l.property_id = p_property_id
    and l.retired_at is null
  order by l.path;
$$;

comment on function property.locations_for_property(uuid) is
  'Every current (non-retired) location under a property, flat and path-ordered, for the caller''s own client to assemble into a tree (WP 1.1). Scoped to the caller''s own membership in the property''s steward workspace, the same join property.my_assets() already uses.';

create or replace function api.locations_for_property(p_property_id uuid)
returns table (
  id         uuid,
  parent_id  uuid,
  name       text,
  type       text,
  path       extensions.ltree
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.locations_for_property(p_property_id);
$$;

comment on function api.locations_for_property(uuid) is
  'The Property engine''s client-facing delegate for the location tree (WP 1.1). Delegates entirely to property.locations_for_property(), which holds all the logic; this function holds none — the same shape as api.my_assets().';

-- =========================================================================
-- ACCESS — `authenticated` already holds USAGE on schema api (0031); not re-granted here.

revoke all on function api.locations_for_property(uuid) from public, anon, service_role;
grant execute on function api.locations_for_property(uuid) to authenticated;

-- property.locations_for_property() is granted to nobody at all, the same posture as
-- property.my_assets() (0054) and every other engine-schema logic function this session
-- has built — reachable only as a nested call inside the SECURITY DEFINER delegate above.
revoke all on function property.locations_for_property(uuid) from public, anon, authenticated, service_role;

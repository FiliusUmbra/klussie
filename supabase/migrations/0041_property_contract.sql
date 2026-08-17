-- Epic 05 WP04 — the property engine contract: list the caller's own properties, and
-- resolve one property's state and its current steward (roadmap §15).
--
-- TWO FUNCTIONS, NOT ONE, FOR THE SAME REASON WORKSPACE NEEDED BOTH
--
-- property.resolve_property(property_id) answers "what is this specific property" — but a
-- caller has to know a property's id before asking, and nothing yet tells them one. That is
-- exactly the gap workspace.list_my_workspaces() (migration 0038) closed for workspaces —
-- so property.my_properties() closes it here: parameterless, "what do I currently steward,"
-- the discovery function WP 05.06's client wiring actually needs first.
--
-- SAME SPLIT, A FOURTH TIME
--
-- Logic in `property`, reachable by nothing client-facing. A thin SECURITY DEFINER
-- delegate in `api`, which is what `authenticated` actually calls (ADR-0026). Mirrors
-- workspace.resolve_context() (migration 0036) exactly: "the caller's own membership in
-- one specific workspace" becomes "one specific property, resolved only if the caller
-- currently holds a live membership in its current steward."
--
-- SELF-ENFORCING BY CONSTRUCTION, THE SAME WAY workspace.resolve_context() IS
--
-- property.resolve_property() joins against workspace.current_memberships() (migration
-- 0031) rather than reading property.properties directly and trusting RLS alone: a caller
-- who is not a live member of the current steward gets no row, full stop, regardless of
-- what WP 05.05's RLS policy later adds. This is not a second isolation predicate (ADR-0026
-- and ADR-0028 both rule that out) — it is the platform's one membership predicate, reused
-- a fourth time (after 0031's own delegate, 0036, and 0038).
--
-- NO decide_permission ANALOG, DELIBERATELY (roadmap §15)
--
-- Nothing in this epic has a gated action to decide — no stewardship transfer, no
-- attribute edit routed through the engine. ADR-0027 built the workspace permission
-- vocabulary because WP 03.08 had memberships to gate; building an empty vocabulary here
-- would be that restraint in reverse. Added when Epic 06 or a stewardship-transfer feature
-- first needs one.

-- THE LOGIC — property.my_properties()
--
-- Parameterless, mirroring workspace.list_my_workspaces()'s shape: every property the
-- caller's live workspace memberships currently steward. Not used in any RLS policy — WP
-- 05.05's isolation predicate stays api.current_workspace_memberships(), a plain column
-- check — so this function carries no once-per-statement performance obligation the way
-- 0031's delegate does; it is a discovery read, the same class as list_my_workspaces().

create or replace function property.my_properties()
returns table (
  id                    uuid,
  name                  text,
  jurisdiction          text,
  steward_workspace_id  uuid,
  steward_since         timestamptz
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, p.jurisdiction, p.steward_workspace_id, p.steward_since
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id;
$$;

comment on function property.my_properties() is
  'Every property the caller currently stewards, through any live workspace membership (roadmap WP 05.04). Not SECURITY DEFINER, granted to nobody, reachable only from api.my_properties().';

create or replace function api.my_properties()
returns table (
  id                    uuid,
  name                  text,
  jurisdiction          text,
  steward_workspace_id  uuid,
  steward_since         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.my_properties();
$$;

comment on function api.my_properties() is
  'Delegate for property.my_properties() (ADR-0026''s split). What the client calls first — discovering which properties it currently stewards, before resolving any one of them by id.';

revoke all on function property.my_properties() from public, anon, authenticated, service_role;
revoke all on function api.my_properties() from public, anon, service_role;
grant execute on function api.my_properties() to authenticated;

-- =========================================================================
-- THE LOGIC — property.resolve_property()

create or replace function property.resolve_property(p_property_id uuid)
returns table (
  id                    uuid,
  name                  text,
  jurisdiction          text,
  steward_workspace_id  uuid,
  steward_since         timestamptz
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, p.jurisdiction, p.steward_workspace_id, p.steward_since
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = p_property_id;
$$;

comment on function property.resolve_property(uuid) is
  'Resolves one property''s state and current steward, only if the caller holds a live membership in that steward workspace (roadmap WP 05.04). Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_property().';

create or replace function api.resolve_property(p_property_id uuid)
returns table (
  id                    uuid,
  name                  text,
  jurisdiction          text,
  steward_workspace_id  uuid,
  steward_since         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.resolve_property(p_property_id);
$$;

comment on function api.resolve_property(uuid) is
  'Delegate for property.resolve_property() (ADR-0026''s split). What a client calls to read one property''s state and current steward.';

revoke all on function property.resolve_property(uuid) from public, anon, authenticated, service_role;
revoke all on function api.resolve_property(uuid) from public, anon, service_role;
grant execute on function api.resolve_property(uuid) to authenticated;

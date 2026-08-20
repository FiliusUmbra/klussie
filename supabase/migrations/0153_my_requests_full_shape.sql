-- Platform Activation Slice 2, WP 2.6 — my_requests() returns the full row, matching
-- resolve_request()'s own shape, instead of the five-column summary WP 2.1 shipped.
--
-- WHY, FOUND BUILDING THE CLIENT CUTOVER ITSELF
--
-- Every real caller of "the request list" — RequestsList.jsx's own subtitle, which needs
-- when_pref; ConversationHome.jsx's own request cards, which need details/budget — needs
-- the full row, not the five-column summary. The client cutover, as first drafted,
-- called my_requests() for the id list and then resolve_request() once per id to get
-- everything else — a redundant first call plus an avoidable N-call fan-out for data
-- every real caller needs anyway. Extending the one broad read once, now, is the
-- narrower fix: one query returns everything the request list has ever actually needed,
-- the same shape resolve_request() already returns for one row.
--
-- RETURN TYPE CHANGES REQUIRE THE SAME DROP-FIRST DISCIPLINE AS A PARAMETER CHANGE
--
-- CREATE OR REPLACE FUNCTION refuses to change an existing function's return type —
-- Postgres treats it as a definitional change a plain replace cannot make, not merely a
-- signature to overload. Dropped by its exact prior signature first, matching 0148's own
-- finding for a changed parameter list, applied here to a changed return type instead.

drop function if exists work.my_requests(uuid);
drop function if exists api.my_requests(uuid);

create or replace function work.my_requests(p_workspace_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz,
  directed_workspace_id uuid, directed_until timestamptz, auto_accept_max numeric
)
language sql
stable
set search_path = ''
as $$
  select r.id, r.requesting_workspace_id, r.property_id, r.asset_id, r.location_id,
         r.category_id, r.service_id, r.details, r.when_pref, r.budget,
         r.status, r.workflow_instance_id, r.created_at, r.updated_at,
         r.directed_workspace_id, r.directed_until, r.auto_accept_max
  from work.requests r
  join workspace.current_memberships() m on m.workspace_id = p_workspace_id
  where r.requesting_workspace_id = p_workspace_id;
$$;

comment on function work.my_requests(uuid) is
  'Every request the given workspace has made, full row, for a caller with a real, active membership in it. Extended in WP 2.6 (client cutover) to match resolve_request()''s own shape, plus the directed-booking columns resolve_request() itself still omits — every real list caller needs when_pref/details/budget, not only a summary.';

create or replace function api.my_requests(p_workspace_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz,
  directed_workspace_id uuid, directed_until timestamptz, auto_accept_max numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_requests(p_workspace_id);
$$;

revoke all on function work.my_requests(uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_requests(uuid) from public, anon, service_role;
grant execute on function api.my_requests(uuid) to authenticated;

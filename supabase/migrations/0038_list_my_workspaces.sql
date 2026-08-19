-- Epic 03 WP12 — the workspace switcher's data source.
--
-- api.current_workspace_memberships() (migration 0031) and api.resolve_workspace_context()
-- (migration 0036) both answer questions about ONE workspace's membership — isolation and
-- permission, never display. Neither returns a name or a type, because neither needed to.
-- A switcher does: PLATFORM_DOMAIN_MODEL.md §27 wants "recognition, not reading" — a person
-- picks a workspace by its name and visual identity, not by comparing UUIDs — and that
-- means workspace.workspaces.type and .name have to reach the client for the first time.
--
-- SAME SPLIT, A THIRD TIME
--
-- Logic in workspace.list_my_workspaces(), reachable by nothing client-facing. A thin
-- SECURITY DEFINER delegate, api.list_my_workspaces(), is what the client actually calls
-- (ADR-0026). Not a new membership predicate — ADR-0026 rules out a *second isolation
-- predicate*, and this is not one: it is never referenced by an RLS policy, never embedded
-- in a per-row WHERE clause, and built for a caller asking "what are my workspaces", the
-- same shape as api.resolve_workspace_context() and api.decide_permission() (migration
-- 0036) already established for non-isolation, client-facing questions.
--
-- Deliberately reuses workspace.current_memberships() (migration 0031) rather than
-- re-querying workspace.memberships directly — one place resolves "who is the caller, in
-- which workspaces, live," reused a third time now.
--
-- Archived workspaces (workspace.workspaces.archived_at) are excluded: a switcher that
-- offers a workspace nobody can act in anymore is a bug wearing a feature's shape.

create or replace function workspace.list_my_workspaces()
returns table (
  membership_id   uuid,
  workspace_id    uuid,
  role            text,
  scope           jsonb,
  workspace_type  text,
  workspace_name  text
)
language sql
stable
set search_path = ''
as $$
  select m.membership_id, m.workspace_id, m.role, m.scope, w.type, w.name
  from workspace.current_memberships() m
  join workspace.workspaces w on w.id = m.workspace_id
  where w.archived_at is null;
$$;

comment on function workspace.list_my_workspaces() is
  'The caller''s live memberships, with the workspace''s own type and name joined in for display (roadmap WP 03.12, PLATFORM_DOMAIN_MODEL.md §27 "recognition, not reading"). Built on workspace.current_memberships(); not SECURITY DEFINER, granted to nobody, reachable only from api.list_my_workspaces(). Never referenced by an RLS policy -- that role stays api.current_workspace_memberships()''s alone (0031).';

create or replace function api.list_my_workspaces()
returns table (
  membership_id   uuid,
  workspace_id    uuid,
  role            text,
  scope           jsonb,
  workspace_type  text,
  workspace_name  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from workspace.list_my_workspaces();
$$;

comment on function api.list_my_workspaces() is
  'Delegate for workspace.list_my_workspaces() (ADR-0026''s split). What the workspace switcher calls: the caller''s live, unarchived workspaces with type and name, for display and selection -- not an isolation predicate and must never be used as one.';

revoke all on function workspace.list_my_workspaces() from public, anon, authenticated, service_role;
revoke all on function api.list_my_workspaces() from public, anon, service_role;
grant execute on function api.list_my_workspaces() to authenticated;

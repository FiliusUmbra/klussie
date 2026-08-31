-- Fixes a real, live bug found during the Beta Mission's own UX review, 2026-08-31:
-- workspace.list_my_workspaces() (0038) returns one row per MEMBERSHIP, not one row per
-- WORKSPACE -- fine when every workspace has exactly one, but 0162's own engagement-access
-- grant consumer creates a brand new workspace.memberships row for every completed
-- engagement, on purpose (0162's own header: "a future consumer... would set state =
-- 'ended' on the existing row... never delete it," explicitly anticipating multiple grant
-- rows accumulating over multiple engagements between the same professional and the same
-- customer, until that future consumer exists). 0038 was written before that grant model
-- existed and never revisited once it landed.
--
-- Live and real, not theoretical: staging's own Pierre (pro@staging.klussie.test) has
-- completed three real jobs for Cathy, so workspace.memberships holds three separate
-- 'contractor' rows scoped to her personal workspace, two still active. The switcher --
-- 0038's own header calls it "the switcher's data source," built so "a person picks a
-- workspace by its name and visual identity" -- rendered three identical "My Home" tabs
-- for what is, from Pierre's side, one relationship with one customer's one home. Exactly
-- the "no duplicated navigation" gap the Beta Mission's own product principles name.
--
-- NOT a grant-model bug and NOT touched here. 0162 is explicit that redundant grant rows
-- are the accepted shape until the completion/cancellation consumer it names exists; this
-- migration does not add that consumer, does not end or delete any row, and does not touch
-- workspace.memberships or workspace.grant_engagement_access() at all. It is purely a
-- display-layer correction to the function whose own job, by its own header, already was
-- recognition-not-reading -- one row per workspace to choose from.
--
-- Still built on workspace.current_memberships() (0031), matching this file's own tested
-- constraint (listMyWorkspaces.test.js: "reuses ... rather than re-querying memberships
-- directly") -- only wrapped in a distinct on (workspace_id). current_memberships() does
-- not expose created_at, so the tiebreak orders by membership_id itself: every id in this
-- codebase is a uuidv7 (ADR-0022), so the highest membership_id for a given workspace is
-- also the most recently granted one -- the freshest active membership is what a person
-- sees, without reaching into a table this function's own test forbids it from querying.

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
  select distinct on (m.workspace_id)
    m.membership_id, m.workspace_id, m.role, m.scope, w.type, w.name
  from workspace.current_memberships() m
  join workspace.workspaces w on w.id = m.workspace_id
  where w.archived_at is null
  order by m.workspace_id, m.membership_id desc;
$$;

comment on function workspace.list_my_workspaces() is
  'The caller''s live memberships, with the workspace''s own type and name joined in for display (roadmap WP 03.12, PLATFORM_DOMAIN_MODEL.md §27 "recognition, not reading"). One row per workspace (0188): deduplicated by workspace_id, freshest membership_id wins, because 0162''s own engagement-access grant consumer can leave more than one live membership into the same workspace and the switcher must never offer the same destination twice. Built on workspace.current_memberships(); not SECURITY DEFINER, granted to nobody, reachable only from api.list_my_workspaces(). Never referenced by an RLS policy -- that role stays api.current_workspace_memberships()''s alone (0031).';

revoke all on function workspace.list_my_workspaces() from public, anon, authenticated, service_role;

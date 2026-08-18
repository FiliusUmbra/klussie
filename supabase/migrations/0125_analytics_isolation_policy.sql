-- Epic 21 WP02 — RLS isolation for analytics_ws.workspace_metrics. One policy, the same
-- ADR-0025 backstop shape every workspace-scoped table this session has used.
--
-- ONLY ONE TABLE NEEDS A POLICY HERE
--
-- analytics_pf.platform_metrics already has RLS enabled with no policy (0124) — the same
-- "platform is not client-readable" posture platform.events and platform.audit_records
-- both hold, correct because that store carries no workspace to scope a policy by in the
-- first place (DATABASE_ARCHITECTURE.md §31: platform-scoped analytics "may hold only
-- promoted aggregates," and this table structurally carries no workspace_id column at all
-- for a policy to key on).
--
-- Built now even though ROLES.md §2.4's own "Not yet" bucket defers the actual client
-- grant to whichever epic ships the live reporting surface — the same "policy correct
-- before the door opens" shape Epic 20's own search isolation policy already held.

drop policy if exists "workspace members can view their own workspace's metrics" on analytics_ws.workspace_metrics;
create policy "workspace members can view their own workspace's metrics"
  on analytics_ws.workspace_metrics for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

-- Epic 10 WP03 — the RLS isolation policies for both Maintenance aggregates.
--
-- Same posture as every isolation policy since Epic 03: a permissive `for select`
-- policy reusing api.current_workspace_memberships() (migration 0031), no new resolver.
-- Both tables carry workspace_id directly (0071, 0072) — ordinary membership isolation,
-- no sharing concept, the same shape work.workflow_instances holds (migration 0068).

drop policy if exists "workspace members can view maintenance_schedules" on work.maintenance_schedules;
create policy "workspace members can view maintenance_schedules"
  on work.maintenance_schedules for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "workspace members can view maintenance_obligations" on work.maintenance_obligations;
create policy "workspace members can view maintenance_obligations"
  on work.maintenance_obligations for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

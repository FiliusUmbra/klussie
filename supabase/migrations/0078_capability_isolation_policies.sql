-- Epic 04 WP04 — the RLS isolation policies for the Capability Grant aggregate, and the
-- catalogue's own read policy now that a real contract (WP 04.05) exists to serve it
-- through.
--
-- GRANTS AND HISTORY — ORDINARY WORKSPACE-SCOPED ISOLATION
--
-- Same posture as every isolation policy since Epic 03: a permissive `for select` policy
-- reusing api.current_workspace_memberships() (migration 0031), no new resolver.
-- capability_grants carries workspace_id directly; capability_grant_history follows
-- grant_id one join deep purely for symmetry with workflow_transitions' own shape
-- (migration 0068) — though history also carries workspace_id directly (0077), so the
-- simpler direct predicate is used instead, the same shortcut workflow_transitions could
-- not take (it has no workspace_id column of its own).
--
-- THE CATALOGUE — READABLE TO EVERY AUTHENTICATED WORKSPACE MEMBER, NOT GATED FURTHER
--
-- platform.capabilities, platform.capability_dependencies, platform.capability_presets
-- and platform.capability_preset_grants are platform-scoped configuration (§11) with no
-- workspace content in any of them — every workspace sees the same catalogue, the same
-- posture property.document_types (Epic 08) and property.facet_types (Epic 07) both
-- hold. `to authenticated`, not `to anon` — nothing about the catalogue needs to be
-- visible signed out, unlike property.document_types.is_public's one deliberate
-- exception (Epic 08).

drop policy if exists "workspace members can view capability_grants" on workspace.capability_grants;
create policy "workspace members can view capability_grants"
  on workspace.capability_grants for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "workspace members can view capability_grant_history" on workspace.capability_grant_history;
create policy "workspace members can view capability_grant_history"
  on workspace.capability_grant_history for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "authenticated can view capabilities" on platform.capabilities;
create policy "authenticated can view capabilities"
  on platform.capabilities for select
  to authenticated
  using (true);

drop policy if exists "authenticated can view capability_dependencies" on platform.capability_dependencies;
create policy "authenticated can view capability_dependencies"
  on platform.capability_dependencies for select
  to authenticated
  using (true);

drop policy if exists "authenticated can view capability_presets" on platform.capability_presets;
create policy "authenticated can view capability_presets"
  on platform.capability_presets for select
  to authenticated
  using (true);

drop policy if exists "authenticated can view capability_preset_grants" on platform.capability_preset_grants;
create policy "authenticated can view capability_preset_grants"
  on platform.capability_preset_grants for select
  to authenticated
  using (true);

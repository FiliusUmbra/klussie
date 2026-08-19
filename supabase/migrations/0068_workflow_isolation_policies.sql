-- Epic 09 WP03 — the RLS isolation policies for both Workflow aggregates.
--
-- Same posture as every isolation policy since Epic 03: a permissive `for select`
-- policy reusing api.current_workspace_memberships() (migration 0031), no new resolver.
--
-- DEFINITIONS, STAGES AND TRANSITION RULES — CATALOG VISIBILITY, NOT MEMBERSHIP
--
-- A definition is either platform-scoped (workspace_id null — visible to every
-- authenticated workspace member, the same posture property.document_types and
-- property.facet_types hold once they gain their own first reader) or workspace-scoped
-- (visible only to that workspace's own members, for the "future workflow editor" §18
-- names — no writer yet, but the policy is correct the moment one exists). Stages and
-- transition rules have no workspace_id of their own; visibility follows their
-- definition_id, one join deep, the same shape asset_facets follows through asset_id
-- (migration 0050).
--
-- INSTANCES AND TRANSITIONS — ORDINARY WORKSPACE-SCOPED ISOLATION, PLUS ONE JOIN
--
-- work.workflow_instances carries workspace_id directly. work.workflow_transitions does
-- not (see 0067's own header: definition_id is denormalised there for a different
-- reason, not workspace_id) — its visibility follows instance_id, exactly the shape
-- asset_placements would need if it had ever needed a direct policy of its own, and the
-- same one-join-deeper shape document_shares' own visibility check already uses.

drop policy if exists "workspace members can view workflow_definitions" on work.workflow_definitions;
create policy "workspace members can view workflow_definitions"
  on work.workflow_definitions for select
  to authenticated
  using (
    workspace_id is null
    or workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "workspace members can view workflow_stages" on work.workflow_stages;
create policy "workspace members can view workflow_stages"
  on work.workflow_stages for select
  to authenticated
  using (
    definition_id in (
      select d.id from work.workflow_definitions d
      where d.workspace_id is null
         or d.workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

drop policy if exists "workspace members can view workflow_transition_rules" on work.workflow_transition_rules;
create policy "workspace members can view workflow_transition_rules"
  on work.workflow_transition_rules for select
  to authenticated
  using (
    definition_id in (
      select d.id from work.workflow_definitions d
      where d.workspace_id is null
         or d.workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

drop policy if exists "workspace members can view workflow_instances" on work.workflow_instances;
create policy "workspace members can view workflow_instances"
  on work.workflow_instances for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

comment on policy "workspace members can view workflow_instances" on work.workflow_instances is
  'Ordinary workspace-scoped isolation (§18: "Instances are workspace-scoped") — no sharing concept exists for a workflow instance, unlike property.documents.';

drop policy if exists "workspace members can view workflow_transitions" on work.workflow_transitions;
create policy "workspace members can view workflow_transitions"
  on work.workflow_transitions for select
  to authenticated
  using (
    instance_id in (
      select i.id from work.workflow_instances i
      where i.workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

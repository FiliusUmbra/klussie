-- Epic 22 WP02 — RLS isolation for commerce.subscriptions. One policy, the same
-- ADR-0025 backstop shape every workspace-scoped table this session has used.

drop policy if exists "workspace members can view their own subscription" on commerce.subscriptions;
create policy "workspace members can view their own subscription"
  on commerce.subscriptions for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

-- Epic 18 WP02 — the RLS isolation policy for work.provider_decisions, the same
-- ADR-0025 backstop shape every workspace-scoped table has held since.
--
-- ORDINARY DIRECT MEMBERSHIP
--
-- work.provider_decisions.workspace_id is the customer's own workspace making the
-- selection — a single, ordinary membership check, the same shape work.requests already
-- uses (Epic 12). No second party to combine-OR against: a provider recommendation is
-- shown to the requesting workspace alone, never the candidate providers themselves (they
-- learn they were selected through the marketplace engagement it produces, not through
-- this table).

drop policy if exists "workspace members can view provider decisions" on work.provider_decisions;
create policy "workspace members can view provider decisions"
  on work.provider_decisions for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

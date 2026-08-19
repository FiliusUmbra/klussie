-- Epic 16 WP05 — the RLS isolation policies for the two workspace-scoped Knowledge
-- tables, the same backstop shape every workspace-scoped table has held since ADR-0025.
--
-- RULES AND WORKSPACE_EDGES — ORDINARY DIRECT MEMBERSHIP
--
-- Both tables carry workspace_id directly, no denormalised second party the way
-- commerce.invoices does (Epic 14) — a single, ordinary membership check, the same shape
-- work.maintenance_obligations already uses.
--
-- WORLD GRAPH GETS NO POLICY HERE, DELIBERATELY — SEE 0109's OWN HEADER
--
-- knowledge.world_nodes/world_edges carry no workspace reference at all to have a policy
-- against; RLS is enabled on both (§24 rule 5: no exceptions) with no policy, the same
-- deny-all-by-default shape platform.events held until Epic 15 gave two trusted internal
-- roles a named exception. No client role needs one yet — no read contract exists (0109's
-- own header), and adding a policy ahead of a real caller would be exactly the
-- speculative-structure restraint ADR-0010 rules out.

drop policy if exists "workspace members can view rules" on knowledge.rules;
create policy "workspace members can view rules"
  on knowledge.rules for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "workspace members can view workspace_edges" on knowledge.workspace_edges;
create policy "workspace members can view workspace_edges"
  on knowledge.workspace_edges for select
  to authenticated
  using (
    workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

-- Epic 17 WP02 — the RLS isolation policy for knowledge.memory_versions.
--
-- ONE JOIN DEEPER THROUGH property.properties — THE SAME SHAPE commerce.credits ALREADY
-- USES THROUGH ITS PARENT INVOICE (EPIC 14)
--
-- knowledge.memory_versions carries no workspace_id (0112's own header explains why —
-- Property Memory follows the property, live, surviving a change of steward). Visibility
-- instead resolves through the same predicate property.properties' own policy (0042)
-- already uses, joined one level deeper: a workspace may read a memory version only if it
-- is the CURRENT steward of the property that version is about.

drop policy if exists "workspace members can view memory versions" on knowledge.memory_versions;
create policy "workspace members can view memory versions"
  on knowledge.memory_versions for select
  to authenticated
  using (
    exists (
      select 1 from property.properties p
      where p.id = memory_versions.property_id
        and p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

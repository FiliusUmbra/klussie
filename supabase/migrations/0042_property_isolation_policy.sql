-- Epic 05 WP05 — the RLS isolation policy for property.properties.
--
-- Unlike every table WP 03.10 touched, this one has no pre-existing policy to add
-- alongside — property.properties has never had one (WP 05.01 left it "enabled, no
-- policy," the absent policy the deny). So there is no "adds, does not remove" tension to
-- narrate the way Epic 03's ADR-0025 had to: this policy simply exists where nothing did.
--
-- REUSES EPIC 03'S MEMBERSHIP HELPER DIRECTLY — NO PROPERTY-SPECIFIC RESOLVER
--
-- ADR-0028's whole point: steward_workspace_id is a plain, mutable, workspace_id-shaped
-- column, so the isolation predicate is the identical uncorrelated-subquery shape every
-- Epic 03 table's policy already uses:
--
--   using (steward_workspace_id in (select workspace_id from api.current_workspace_memberships()))
--
-- api.current_workspace_memberships() (migration 0031) — never a property-specific
-- function. A second membership predicate anywhere is exactly what ADR-0026 rules out,
-- and ADR-0028 confirms this table needs none.
--
-- SELECT ONLY, SAME REASONING AS WP 03.10
--
-- SUPABASE_ARCHITECTURE.md §7 puts writes on the gateway-mediated path, which does not
-- exist (ADR-0024). property.properties has no application write path yet at all — WP
-- 05.06 is a read switch, not a write — so there is nothing for a WITH CHECK to guard
-- even in principle. Written when a stewardship-transfer operation first needs one.

drop policy if exists "workspace members can view properties" on property.properties;
create policy "workspace members can view properties"
  on property.properties for select
  to authenticated
  using (steward_workspace_id in (select workspace_id from api.current_workspace_memberships()));

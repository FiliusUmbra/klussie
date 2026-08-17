-- Epic 06 WP03 — the RLS isolation policy for property.locations.
--
-- DATABASE_ARCHITECTURE.md §13: "Workspace-scoped, inheriting the property's
-- stewardship." A location carries no workspace column of its own (migration 0043's own
-- header), so the predicate joins through property.properties.steward_workspace_id rather
-- than checking a column directly, the way property.properties' own policy (migration
-- 0042) and every Epic 03 table's policy could.
--
-- STILL AN UNCORRELATED SUBQUERY, DESPITE THE EXTRA JOIN
--
-- The subquery below — which properties does the caller currently steward — references
-- nothing from property.locations, the outer table this policy filters. Postgres can
-- therefore evaluate it once as a semi-join, not once per scanned row, the same
-- uncorrelated shape ADR-0026's "As implemented" section requires and every isolation
-- policy since has used. No new resolver is built for this: api.current_workspace_
-- memberships() (migration 0031) is still the only membership predicate anywhere in the
-- platform (ADR-0026's own rule), reused a third time now.
--
-- FIRST POLICY ON THIS TABLE, SAME POSTURE AS EPIC 05
--
-- property.locations has never had a policy — WP 06.01 left it "enabled, no policy," the
-- absent policy the deny. Nothing to add alongside; this simply exists where nothing did.
--
-- SELECT ONLY, SAME REASONING AS EVERY ISOLATION POLICY SO FAR
--
-- Writes stay on whatever path eventually creates and re-parents locations
-- (property.reparent_location(), WP 06.05, plus a future create/retire path) — there is no
-- gateway (ADR-0024) and no client write path to this table at all yet, so there is
-- nothing for a WITH CHECK to guard even in principle.

drop policy if exists "workspace members can view locations" on property.locations;
create policy "workspace members can view locations"
  on property.locations for select
  to authenticated
  using (
    property_id in (
      select p.id from property.properties p
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

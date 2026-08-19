-- Epic 07 WP03 — the RLS isolation policies for assets and asset facets.
--
-- Same posture as every isolation policy since Epic 03: a permissive `for select` policy,
-- reusing api.current_workspace_memberships() (migration 0031) through however many joins
-- the aggregate's own ownership chain requires. No new resolver — the fourth epic in a row
-- where ADR-0026/0028's pattern needs none.
--
-- ASSETS — ONE JOIN, IDENTICAL SHAPE TO property.locations (migration 0045)
--
-- Isolation inherits the property's current stewardship, the same as a location: an asset
-- carries property_id and no workspace column of its own.
--
-- ASSET_FACETS — ONE JOIN DEEPER, THROUGH THE ASSET
--
-- A facet has no property_id of its own — it belongs to an asset, which belongs to a
-- property. The predicate reaches through both, still an uncorrelated subquery (neither
-- inner select references asset_facets' own scanned row), so it remains a semi-join rather
-- than a per-row correlated lookup regardless of the extra hop.
--
-- ASSET_PLACEMENTS — NO POLICY, DELIBERATELY
--
-- Closed placement history is Historical class (migration 0048's own header) and, like
-- every Historical object in this schema so far, is read through the owning engine's own
-- contract (WP 07.04's property.resolve_asset(), which will assemble an asset's placement
-- history), never through a direct table grant a client could query unfiltered. The absent
-- policy is the deny, the same posture every table in this schema starts with before its
-- first policy lands — except this one is deliberately never given one, not merely "not
-- yet."

drop policy if exists "workspace members can view assets" on property.assets;
create policy "workspace members can view assets"
  on property.assets for select
  to authenticated
  using (
    property_id in (
      select p.id from property.properties p
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

drop policy if exists "workspace members can view asset_facets" on property.asset_facets;
create policy "workspace members can view asset_facets"
  on property.asset_facets for select
  to authenticated
  using (
    asset_id in (
      select a.id from property.assets a
      where a.property_id in (
        select p.id from property.properties p
        where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
      )
    )
  );

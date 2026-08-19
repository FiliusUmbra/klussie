-- Epic 11 WP03 — the RLS isolation policies for the Service Record engine.
--
-- THE CORE — THE FIRST TABLE IN THIS SCHEMA WHERE TWO INDEPENDENT VISIBILITY PATHS
-- COMBINE, NOT ONE JOIN DEEPER THROUGH THE SAME PATH
--
-- Every isolation policy since Epic 03 has been a single chain: property-inherited
-- (assets, locations), one-join-deeper (asset_facets, document_shares), or direct
-- membership (workflow_instances, maintenance_obligations). work.service_records is
-- visible through EITHER of two unrelated relationships at once — the property's
-- CURRENT steward (live, through property_id, matching property.assets' own predicate
-- exactly) OR direct membership in performing_workspace_id (matching work.
-- workflow_instances' own predicate exactly) — because §17 gives the record to both
-- parties independently, not to whichever one happens to resolve first. Reusing
-- api.current_workspace_memberships() twice in one policy, combined with `or`, is still
-- no new resolver — the combination is new, the primitives are not.
--
-- THE ANNEXES — ORDINARY, BUT ASYMMETRIC, MATCHING 0082's OWN ASYMMETRY
--
-- The performing annex has no workspace_id of its own (0082's own header) — its policy
-- joins through service_records.performing_workspace_id, the identical one-join-deeper
-- shape asset_facets already uses through asset_id. The property annex carries its own
-- frozen owning_workspace_id directly — an ordinary direct-membership predicate, the
-- same shape property.documents' own owning-workspace half already uses.
--
-- AMENDMENTS — VISIBLE TO WHOEVER CAN SEE THE PARENT CORE, THE SAME COMBINED PREDICATE
-- REPEATED THROUGH A JOIN
--
-- §17: "The current reading of a record is the core plus its amendment chain" — an
-- amendment carries no narrower visibility than the core it corrects. The policy below
-- re-states the core's own OR predicate through service_record_id rather than trusting a
-- view or a simpler-looking shortcut, because this is the one table in this epic where a
-- shortcut that got the boundary wrong would be the exact failure §17 warns about.

drop policy if exists "workspace members can view service_records" on work.service_records;
create policy "workspace members can view service_records"
  on work.service_records for select
  to authenticated
  using (
    performing_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or property_id in (
      select p.id from property.properties p
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

comment on policy "workspace members can view service_records" on work.service_records is
  'Two independent paths, both real, neither a shortcut for the other (§17): direct membership in the performing workspace, OR current stewardship of the property. A workspace satisfying neither sees nothing — including a business that merely has an unrelated grant over the same asset via a document share or a capability, since neither of those is either of these two relationships.';

drop policy if exists "workspace members can view service_record_performing_annexes" on work.service_record_performing_annexes;
create policy "workspace members can view service_record_performing_annexes"
  on work.service_record_performing_annexes for select
  to authenticated
  using (
    service_record_id in (
      select sr.id from work.service_records sr
      where sr.performing_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

comment on policy "workspace members can view service_record_performing_annexes" on work.service_record_performing_annexes is
  'Performing-workspace membership only — never the property''s steward, however current. "A business''s cost base is its own information" (§13.2) is enforced here, not merely stated.';

drop policy if exists "workspace members can view service_record_property_annexes" on work.service_record_property_annexes;
create policy "workspace members can view service_record_property_annexes"
  on work.service_record_property_annexes for select
  to authenticated
  using (
    owning_workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

comment on policy "workspace members can view service_record_property_annexes" on work.service_record_property_annexes is
  'The frozen owning_workspace_id (0082), not the property''s current steward — a later steward change must NOT grant visibility into a previous steward''s private annotations, matching §17''s own transfer table exactly.';

drop policy if exists "workspace members can view service_record_amendments" on work.service_record_amendments;
create policy "workspace members can view service_record_amendments"
  on work.service_record_amendments for select
  to authenticated
  using (
    service_record_id in (
      select sr.id from work.service_records sr
      where sr.performing_workspace_id in (select workspace_id from api.current_workspace_memberships())
         or sr.property_id in (
           select p.id from property.properties p
           where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
         )
    )
  );

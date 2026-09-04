-- Restores the RLS policies on 14 tables across property.* and work.* -- all authenticated
-- -only, read-only grants, none exposed to anon, all currently fail-safe (RLS enabled,
-- zero policies = default-deny) -- found missing in the same systematic sweep that found
-- 0191 (work.requests/quotes/engagements) and 0192 (public.audit_log/domain_events).
--
-- Every one of the 14 has a clear, unambiguous, most-recently-defined source migration
-- that was never subsequently dropped or replaced -- staging simply does not have any of
-- them right now. Bodies below are copied byte-identically from each table's own latest
-- authoritative definition, not re-derived:
--
--   property.properties/locations/assets/asset_facets/documents  -- 0161 §3 (supersedes
--     0042/0045/0050/0058/0062)
--   work.service_records/service_record_performing_annexes/
--     service_record_property_annexes/service_record_amendments  -- 0083 (never redefined)
--   work.conversations/conversation_participants/messages         -- 0160 §2 (supersedes
--     0094; 0160's own header explains why this whole class of gap is easy to miss: every
--     diagnostic in this programme calls work.*/api.* as postgres, which is exempt from
--     RLS as the table owner -- RLS on these tables is never actually evaluated except by
--     a real `authenticated` session, which is exactly the gap this migration closes)
--   work.location_disclosures/engagement_access_notes (2 policies) -- 0182 (never
--     redefined)
--
-- Confirmed live before writing this: every resolver function these policies reference
-- (api.current_workspace_memberships, api.current_property_scope,
-- api.my_active_conversation_ids, public.current_identity) already exists and is intact,
-- and the authenticated SELECT grants on all 14 tables already match what each source
-- migration intended -- only the policies themselves are missing. Nothing here changes a
-- grant, a function, or a table structure -- policies only, restored exactly as last
-- defined.

-- =========================================================================
-- 1 · property.* -- byte-identical to 0161 §3

drop policy if exists "workspace members can view properties" on property.properties;
create policy "workspace members can view properties"
  on property.properties for select
  to authenticated
  using (
    steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or id in (select property_id from api.current_property_scope())
  );

comment on policy "workspace members can view properties" on property.properties is
  'Unscoped workspace membership (unchanged) OR a real, currently-active scoped grant over this exact property (WP 2.4) -- never broader. See 0161''s own header for why every other engine''s policy stays untouched.';

drop policy if exists "workspace members can view locations" on property.locations;
create policy "workspace members can view locations"
  on property.locations for select
  to authenticated
  using (
    property_id in (
      select p.id from property.properties p
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
    or property_id in (select property_id from api.current_property_scope())
  );

drop policy if exists "workspace members can view assets" on property.assets;
create policy "workspace members can view assets"
  on property.assets for select
  to authenticated
  using (
    property_id in (
      select p.id from property.properties p
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
    or property_id in (select property_id from api.current_property_scope())
  );

drop policy if exists "workspace members can view asset_facets" on property.asset_facets;
create policy "workspace members can view asset_facets"
  on property.asset_facets for select
  to authenticated
  using (
    asset_id in (
      select a.id from property.assets a
      join property.properties p on p.id = a.property_id
      where p.steward_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
    or asset_id in (
      select a.id from property.assets a
      where a.property_id in (select property_id from api.current_property_scope())
    )
  );

drop policy if exists "workspace members can view documents" on property.documents;
create policy "workspace members can view documents"
  on property.documents for select
  to authenticated
  using (
    exists (select 1 from property.document_types dt where dt.type_key = documents.type_key and dt.is_public)
    or (
      auth.uid() is not null
      and (
        owning_workspace_id in (select workspace_id from api.current_workspace_memberships())
        or exists (
          select 1 from property.document_shares ds
          where ds.document_id = documents.id
            and ds.shared_with_workspace_id in (select workspace_id from api.current_workspace_memberships())
        )
        or exists (
          select 1
          from property.document_attachments da
          left join property.assets a on a.id = da.asset_id
          left join property.locations l on l.id = da.location_id
          where da.document_id = documents.id
            and coalesce(da.property_id, a.property_id, l.property_id) in (
              select property_id from api.current_property_scope()
            )
        )
      )
    )
  );

comment on policy "workspace members can view documents" on property.documents is
  'Unchanged unscoped-membership and explicit-share branches, plus a new scoped branch (WP 2.4): visible under a property scope only when attached to that property directly, or to one of its own assets/locations -- never a workspace- or request-attached document, which the Location/Asset/Document twin does not name.';

-- =========================================================================
-- 2 · work.service_records + its three annex/amendment tables -- byte-identical to 0083

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
  'Two independent paths, both real, neither a shortcut for the other (§17): direct membership in the performing workspace, OR current stewardship of the property. A workspace satisfying neither sees nothing -- including a business that merely has an unrelated grant over the same asset via a document share or a capability, since neither of those is either of these two relationships.';

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
  'Performing-workspace membership only -- never the property''s steward, however current. "A business''s cost base is its own information" (§13.2) is enforced here, not merely stated.';

drop policy if exists "workspace members can view service_record_property_annexes" on work.service_record_property_annexes;
create policy "workspace members can view service_record_property_annexes"
  on work.service_record_property_annexes for select
  to authenticated
  using (
    owning_workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

comment on policy "workspace members can view service_record_property_annexes" on work.service_record_property_annexes is
  'The frozen owning_workspace_id (0082), not the property''s current steward -- a later steward change must NOT grant visibility into a previous steward''s private annotations, matching §17''s own transfer table exactly.';

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

-- =========================================================================
-- 3 · work.conversations/conversation_participants/messages -- byte-identical to 0160 §2

drop policy if exists "participants can view conversations" on work.conversations;
create policy "participants can view conversations"
  on work.conversations for select
  to authenticated
  using (id in (select conversation_id from api.my_active_conversation_ids()));

drop policy if exists "participants can view conversation_participants" on work.conversation_participants;
create policy "participants can view conversation_participants"
  on work.conversation_participants for select
  to authenticated
  using (conversation_id in (select conversation_id from api.my_active_conversation_ids()));

comment on policy "participants can view conversation_participants" on work.conversation_participants is
  'A participant sees the full roster of their own conversation (0094''s own reasoning, unchanged). Rewritten (0160) to resolve via api.my_active_conversation_ids() instead of a self-referencing subquery against this same table, which caused infinite recursion the moment RLS on this table was ever actually evaluated.';

drop policy if exists "participants can view messages" on work.messages;
create policy "participants can view messages"
  on work.messages for select
  to authenticated
  using (conversation_id in (select conversation_id from api.my_active_conversation_ids()));

-- =========================================================================
-- 4 · work.location_disclosures + work.engagement_access_notes -- byte-identical to 0182

drop policy if exists "workspace members can view own location disclosures" on work.location_disclosures;
create policy "workspace members can view own location disclosures"
  on work.location_disclosures for select
  to authenticated
  using (
    disclosing_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or receiving_workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

drop policy if exists "active contractor can view own engagement's access notes" on work.engagement_access_notes;
create policy "active contractor can view own engagement's access notes"
  on work.engagement_access_notes for select
  to authenticated
  using (
    cleared_at is null
    and exists (
      select 1 from work.engagements e
      where e.id = engagement_access_notes.engagement_id
        and e.status = 'active'
        and e.performing_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

drop policy if exists "requesting workspace can view own engagement's access notes" on work.engagement_access_notes;
create policy "requesting workspace can view own engagement's access notes"
  on work.engagement_access_notes for select
  to authenticated
  using (
    exists (
      select 1 from work.engagements e
      where e.id = engagement_access_notes.engagement_id
        and e.requesting_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

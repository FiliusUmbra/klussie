-- Epic 08 WP04 — the RLS isolation policy for property.documents: owning-workspace
-- membership, or an explicit share. Never attachment.
--
-- THE ONE PLACE THIS EPIC CAN VIOLATE ITS OWN STATED PRINCIPLE
--
-- DATABASE_ARCHITECTURE.md §15 calls "attachment is not a visibility grant" a principle
-- that was "nearly lost." The failure mode it's warning about is exactly the one this
-- migration must not write: a policy that joins property.documents through
-- property.document_attachments to whatever the attached subject's own visibility rule
-- is (e.g. "if you can see the asset, you can see its documents"). That would silently
-- leak a firm's private costing sheet to anyone who merely has access to the property
-- it happens to be attached to. The only two paths to visibility, both below, are
-- membership in the owning workspace, or a row in property.document_shares — the same
-- api.current_workspace_memberships() predicate every policy since Epic 03 reuses,
-- never a new resolver.
--
-- assetIsolationPolicies.test.js and locationIsolationPolicy.test.js both assert their
-- policies contain the expected join; this migration's own test additionally asserts a
-- NEGATIVE — that the policy text does not reference document_attachments at all — so a
-- future edit cannot reintroduce the exact mistake §15 says was nearly made once
-- already.

drop policy if exists "workspace members can view documents" on property.documents;
create policy "workspace members can view documents"
  on property.documents for select
  to authenticated
  using (
    owning_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or exists (
      select 1
      from property.document_shares ds
      where ds.document_id = documents.id
        and ds.shared_with_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

comment on policy "workspace members can view documents" on property.documents is
  'Isolation is owning-workspace membership OR an explicit share (DATABASE_ARCHITECTURE.md §15) — never inferred from what the document is about. See this migration''s own header.';

-- property.document_types, property.document_attachments, property.document_versions
-- and property.document_shares deliberately get NO policy of their own — engine-internal
-- only, reachable through property.my_documents()/resolve_document() (0059), never
-- queried directly by a client. The absent policy is still the deny (0055/0056/0057's own
-- comments already state this; restated here only because this migration is where a
-- reader would otherwise expect to find one).

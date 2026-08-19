-- Epic 08 WP09 (part 1) — resolves the architectural gap found while designing the read
-- switch (implementation/epic-08/COMPLETION.md §5.5): property.documents' isolation model
-- had exactly two visibility paths (owning workspace, explicit share), but
-- public.portfolio_items is genuinely public today. Product decision: add explicit
-- public-visibility support to the isolation model, rather than a dedicated lookup path
-- or reconsidering whether portfolio_items belongs in the Document model at all.
--
-- WHY THIS IS ITS OWN MIGRATION, NOT AN EDIT TO 0055/0058/0059
--
-- All three are already committed and pushed (PR #7). This codebase's own discipline
-- treats a committed migration as history — every correction so far (the ltree fix, the
-- household_items_id FK fix, this epic's own document_attachments/document_shares FK fix)
-- has been a new migration extending a prior one, never an edit to a file that already
-- shipped. Same move here: ALTER TABLE and CREATE OR REPLACE FUNCTION, in a new file.
--
-- PUBLIC VISIBILITY IS CARRIED BY DOCUMENT TYPE, NOT A PER-ROW FLAG — THE SAME REASONING
-- §15 ALREADY GIVES FOR RETENTION_CLASS
--
-- DATABASE_ARCHITECTURE.md §15: "Documents that are evidence follow Historical retention.
-- Documents that are convenience may be deleted by their owner. The distinction is
-- carried by document type, so it is decided by configuration rather than by a user's
-- judgement in the moment." The identical argument applies to public visibility: whether
-- a document is inherently public is a fact about what KIND of document it is (a
-- portfolio photo, always, by design — public.portfolio_items has no private/public
-- toggle today, matching this exactly) rather than something a user should be able to
-- flip per-row, accidentally or otherwise. property.document_types.is_public, mirroring
-- retention_class's own placement, not a column on property.documents itself.
--
-- request_photo STAYS false — THIS DOES NOT SOLVE THE SECOND GAP §5.5 NAMED
--
-- The other finding from §5.5 — service_request_photos-sourced documents are
-- deliberately unattached and cannot be discovered via my_documents(subject) at all — is
-- a different problem with a different, narrower shape (discoverability, not visibility)
-- and is resolved separately in 0063, by a dedicated lookup rather than widening
-- visibility. Nothing here makes a request photo public; it was never meant to be.

-- =========================================================================
-- THE COLUMN

alter table property.document_types
  add column if not exists is_public boolean not null default false;

comment on column property.document_types.is_public is
  'Whether every document of this type is visible to anyone, signed in or not — carried by type, the same reasoning DATABASE_ARCHITECTURE.md §15 already gives for retention_class (a fact about what kind of document this is, not a per-row toggle a user could set). Added in 0062 to resolve the gap found designing WP 08.09''s read switch: public.portfolio_items is genuinely public today (migration 0006) and the isolation model had no path for that.';

update property.document_types set is_public = true where type_key = 'portfolio_photo';

-- =========================================================================
-- THE ISOLATION POLICY — a third visibility path, alongside owning-workspace membership
-- and an explicit share

drop policy if exists "workspace members can view documents" on property.documents;
create policy "workspace members can view documents"
  on property.documents for select
  to anon, authenticated
  using (
    exists (select 1 from property.document_types dt where dt.type_key = documents.type_key and dt.is_public)
    or (
      auth.uid() is not null
      and (
        owning_workspace_id in (select workspace_id from api.current_workspace_memberships())
        or exists (
          select 1
          from property.document_shares ds
          where ds.document_id = documents.id
            and ds.shared_with_workspace_id in (select workspace_id from api.current_workspace_memberships())
        )
      )
    )
  );

comment on policy "workspace members can view documents" on property.documents is
  'Three visibility paths, in this order: a public document type (0062); owning-workspace membership; an explicit share (both DATABASE_ARCHITECTURE.md §15). auth.uid() is not null guards the membership/share branches so an anonymous caller — who has no workspace_id to match against — falls through cleanly to only the public branch, rather than api.current_workspace_memberships() being evaluated against a null identity.';

-- Widened from "to authenticated" (0058) to "to anon, authenticated" — an anonymous
-- visitor to a pro's public profile must be able to see public.portfolio_items' mirrored
-- documents, matching that table's own real RLS (migration 0006: "to anon, authenticated
-- using (true)").

-- =========================================================================
-- THE ENGINE CONTRACT — the same three-path rule, since api.my_documents()/
-- resolve_document() run as SECURITY DEFINER and bypass RLS entirely (ADR-0026's own
-- established shape); the isolation policy above is defense in depth, not the real gate
-- for these two functions.

create or replace function property.my_documents(
  p_property_id  uuid default null,
  p_location_id  uuid default null,
  p_asset_id     uuid default null,
  p_workspace_id uuid default null
)
returns table (
  id                  uuid,
  owning_workspace_id uuid,
  type_key            text,
  storage_bucket      text,
  storage_path        text,
  issuer              text,
  valid_from          date,
  valid_until         date,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if num_nonnulls(p_property_id, p_location_id, p_asset_id, p_workspace_id) <> 1 then
    raise exception 'property.my_documents: exactly one subject must be given'
      using errcode = 'invalid_parameter_value';
  end if;

  return query
    select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
           d.valid_from, d.valid_until, d.version_since, d.created_at, d.updated_at
    from property.documents d
    join property.document_attachments da on da.document_id = d.id
    where (p_property_id is not null and da.property_id = p_property_id)
       or (p_location_id is not null and da.location_id = p_location_id)
       or (p_asset_id is not null and da.asset_id = p_asset_id)
       or (p_workspace_id is not null and da.workspace_id = p_workspace_id)
    and (
      exists (select 1 from property.document_types dt where dt.type_key = d.type_key and dt.is_public)
      or (
        auth.uid() is not null
        and (
          d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
          or exists (
            select 1 from property.document_shares ds
            where ds.document_id = d.id
              and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
          )
        )
      )
    );
end;
$$;

comment on function property.my_documents(uuid, uuid, uuid, uuid) is
  'Every document attached to one subject, visible via a public document type (0062), a live membership in the owning workspace, or an explicit share (roadmap WP 08.05/08.09). auth.uid() is not null guards the membership/share branches for anonymous callers. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_documents().';

create or replace function property.resolve_document(p_document_id uuid)
returns table (
  id                  uuid,
  owning_workspace_id uuid,
  type_key            text,
  storage_bucket      text,
  storage_path        text,
  issuer              text,
  valid_from          date,
  valid_until         date,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
set search_path = ''
as $$
  select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
         d.valid_from, d.valid_until, d.version_since, d.created_at, d.updated_at
  from property.documents d
  where d.id = p_document_id
    and (
      exists (select 1 from property.document_types dt where dt.type_key = d.type_key and dt.is_public)
      or (
        auth.uid() is not null
        and (
          d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
          or exists (
            select 1 from property.document_shares ds
            where ds.document_id = d.id
              and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
          )
        )
      )
    );
$$;

comment on function property.resolve_document(uuid) is
  'Resolves one document''s current version, visible via a public document type (0062), a live membership in the owning workspace, or an explicit share. Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_document().';

-- =========================================================================
-- THE DELEGATES — granted to anon as well as authenticated, matching portfolio_items'
-- own real grant (migration 0006)

grant execute on function api.my_documents(uuid, uuid, uuid, uuid) to anon;
grant execute on function api.resolve_document(uuid) to anon;

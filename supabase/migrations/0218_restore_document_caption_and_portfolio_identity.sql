-- Two real bugs found live during a UX review of a pro's own portfolio, both in the same
-- function, fixed together.
--
-- BUG 1 — A REAL REGRESSION: 0149 SILENTLY DROPPED 0064's OWN CAPTION FIX
--
-- 0064_document_caption.sql added `caption` to property.my_documents()/api.my_documents()'s
-- return shape specifically because "switching that read would have silently dropped it"
-- (its own header, citing implementation/epic-08/COMPLETION.md §5.6) — the exact bug class
-- this migration is fixing a second time. 0149_document_request_attachment.sql, two
-- migrations later, needed to add a fifth p_request_id subject to the same function and
-- did so from an older template that predates 0064 — its own DROP FUNCTION + CREATE OR
-- REPLACE silently regressed the return shape back to eleven columns, no caption.
-- 0161_scoped_membership_authorization.sql redefined property.my_documents() again (a real
-- security fix, the AND/OR parenthesisation bug — preserved verbatim below) without
-- noticing the caption column was already missing from the version it built on.
--
-- Confirmed live on staging before writing this fix, not assumed from reading migrations:
-- a portfolio photo's caption is correctly saved to public.portfolio_items.caption and
-- correctly mirrored to property.documents.caption (0064's own UPDATE trigger, untouched
-- and still firing) — the data is fine. api.my_documents({ p_workspace_id }) simply never
-- returns the column anymore, so src/lib/portfolio.js's fetchPortfolioItems() (which reads
-- through this exact function whenever a pro has a resolvable Professional Workspace) has
-- shown every caption as blank since 0149 shipped.
--
-- resolve_document()/documents_for_service_request() were never touched by 0149 and still
-- correctly return caption per 0064 — this regression is isolated to my_documents().
--
-- BUG 2 — A REAL IDENTITY MISMATCH: THE UI EDITS/DELETES THE WRONG ROW'S ID
--
-- src/lib/portfolio.js's fetchPortfolioItems() uses this function's own `id` column as a
-- portfolio item's identity for updatePortfolioCaption()/deletePortfolioItem() — but that
-- id is property.documents' own id, a read-only mirror row's identity (0061's dual-write:
-- "portfolio_item_id... temporary by construction"), not the real, mutable
-- public.portfolio_items row those two functions actually operate on
-- (`update ... where id = $1` / `delete ... where id = $1`). Confirmed live: editing a
-- caption through the UI reported success and closed the sheet, but the underlying
-- portfolio_items row was untouched — a silent no-op with a false success signal, not an
-- error a pro could even notice. Deleting would have failed exactly the same way.
--
-- property.documents.portfolio_item_id already carries the real answer (set by the mirror
-- trigger at insert time) — it was simply never part of this function's own return shape
-- for anything to read. Added here, alongside caption, so the client-side half of this fix
-- (a separate commit in this same PR) can use it as the item's real, mutable identity.
-- service_request_photo_id is deliberately NOT added: nothing reads request photos through
-- this workspace-subject path today, and 0032's own six-step discipline applies here too —
-- a column with no reader is not added on the chance one arrives later.

drop function if exists property.my_documents(uuid, uuid, uuid, uuid, uuid);
drop function if exists api.my_documents(uuid, uuid, uuid, uuid, uuid);

create or replace function property.my_documents(
  p_property_id  uuid default null,
  p_location_id  uuid default null,
  p_asset_id     uuid default null,
  p_workspace_id uuid default null,
  p_request_id   uuid default null
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
  caption             text,
  portfolio_item_id   uuid,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if num_nonnulls(p_property_id, p_location_id, p_asset_id, p_workspace_id, p_request_id) <> 1 then
    raise exception 'property.my_documents: exactly one subject must be given'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Everything below this line is 0161's own body, byte-for-byte, including its own
  -- AND/OR parenthesisation fix — only the selected columns change (caption,
  -- portfolio_item_id added).
  return query
    select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
           d.valid_from, d.valid_until, d.caption, d.portfolio_item_id, d.version_since, d.created_at, d.updated_at
    from property.documents d
    join property.document_attachments da on da.document_id = d.id
    where (
      (p_property_id is not null and da.property_id = p_property_id)
      or (p_location_id is not null and da.location_id = p_location_id)
      or (p_asset_id is not null and da.asset_id = p_asset_id)
      or (p_workspace_id is not null and da.workspace_id = p_workspace_id)
      or (p_request_id is not null and da.request_id = p_request_id)
    )
    and (
      d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
      or exists (
        select 1 from property.document_shares ds
        where ds.document_id = d.id
          and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
      )
      -- Scoped access (WP 2.4): only the property/location/asset subject branches — a
      -- workspace- or request-attached document is never in scope, matching the RLS
      -- policy's own identical restraint above.
      or (
        p_property_id is not null
        and p_property_id in (select property_id from workspace.current_property_scope())
      )
      or (
        p_location_id is not null
        and exists (
          select 1 from property.locations l
          where l.id = p_location_id
            and l.property_id in (select property_id from workspace.current_property_scope())
        )
      )
      or (
        p_asset_id is not null
        and exists (
          select 1 from property.assets a
          where a.id = p_asset_id
            and a.property_id in (select property_id from workspace.current_property_scope())
        )
      )
    );
end;
$$;

comment on function property.my_documents(uuid, uuid, uuid, uuid, uuid) is
  'Every document attached to one subject (property, location, asset, workspace or request — exactly one argument), visible only if the caller holds a live membership in the owning workspace, a workspace it has been explicitly shared with, or (property/location/asset only) a scoped grant. caption and portfolio_item_id restored to the return shape here (0218) — 0149 silently dropped caption when it added the request subject; both regressed to a state 0064 had already fixed once. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_documents().';

-- =========================================================================
-- THE DELEGATE — same signature, only the return shape changed

create or replace function api.my_documents(
  p_property_id  uuid default null,
  p_location_id  uuid default null,
  p_asset_id     uuid default null,
  p_workspace_id uuid default null,
  p_request_id   uuid default null
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
  caption             text,
  portfolio_item_id   uuid,
  version_since       timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.my_documents(p_property_id, p_location_id, p_asset_id, p_workspace_id, p_request_id);
$$;

comment on function api.my_documents(uuid, uuid, uuid, uuid, uuid) is
  'Delegate for property.my_documents(). caption and portfolio_item_id restored to the return shape (0218) — see that function''s own comment.';

-- =========================================================================
-- ACCESS — restated explicitly, unchanged from 0149 (CREATE OR REPLACE FUNCTION preserves
-- existing grants when the argument list does not change, which it does not here; verified
-- rather than assumed, ADR-0026 property 4's own discipline).

revoke all on function property.my_documents(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_documents(uuid, uuid, uuid, uuid, uuid) from public, anon, service_role;
grant execute on function api.my_documents(uuid, uuid, uuid, uuid, uuid) to authenticated;

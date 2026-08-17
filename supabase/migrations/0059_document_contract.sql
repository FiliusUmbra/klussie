-- Epic 08 WP05 — the document engine contract: list a subject's documents, and resolve
-- one document's current state.
--
-- SAME SPLIT, A SIXTH TIME — AND, LIKE EPIC 07's ASSET CONTRACT, WITH REAL CLIENT
-- DELEGATES
--
-- Logic in `property`, reachable by nothing client-facing. Thin SECURITY DEFINER
-- delegates in `api` (ADR-0026). Given real, buildable now this session: WP 08.09
-- (decomposed, not built this session — roadmap §18) is a genuine near-term client
-- caller, the same relationship property.my_assets()/resolve_asset() (migration 0051)
-- already has to the eventual "Mijn spullen" read switch.
--
-- ATTACHMENT ANSWERS "WHAT IS THIS ABOUT," VISIBILITY ANSWERS "CAN YOU SEE IT" — TWO
-- INDEPENDENT JOINS, NEVER ONE COLLAPSING INTO THE OTHER
--
-- my_documents() joins property.document_attachments to find which documents are about
-- the requested subject, then applies the SAME visibility rule 0058's isolation policy
-- states (owning workspace or an explicit share) as a completely separate filter. This
-- is the one place in this migration a reader might expect attachment to double as
-- visibility, precisely because it's convenient here too — it does not, for the same
-- reason 0058 does not.
--
-- ONE SUBJECT AT A TIME, FOUR NULLABLE PARAMETERS, EXACTLY ONE REQUIRED
--
-- Mirrors property.document_attachments' own "exactly one subject per row" shape
-- (0056) rather than a stringly-typed subject_type/subject_id pair — the same reasoning
-- both times: a real, typed parameter the database can check, not a discriminator string
-- a caller could get wrong silently.
--
-- NO SHARE/REVOKE MUTATION FUNCTION YET
--
-- Nothing in the product creates a share today — WP 08.06's backfill writes
-- document_shares rows directly, in SQL, snapshotting an existing RLS predicate, not
-- through a mutation path a client would ever call. Building one now would be structure
-- with no real caller, the same restraint decide_permission-style functions have been
-- held to since WP 05.04 and Epic 06.

-- =========================================================================
-- THE LOGIC — property.my_documents()

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
      d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
      or exists (
        select 1 from property.document_shares ds
        where ds.document_id = d.id
          and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
      )
    );
end;
$$;

comment on function property.my_documents(uuid, uuid, uuid, uuid) is
  'Every document attached to one subject (property, location, asset or workspace — exactly one argument), visible only if the caller holds a live membership in the owning workspace or a workspace it has been explicitly shared with (roadmap WP 08.05). Not SECURITY DEFINER, granted to nobody, reachable only from api.my_documents().';

-- =========================================================================
-- THE LOGIC — property.resolve_document()

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
      d.owning_workspace_id in (select workspace_id from workspace.current_memberships())
      or exists (
        select 1 from property.document_shares ds
        where ds.document_id = d.id
          and ds.shared_with_workspace_id in (select workspace_id from workspace.current_memberships())
      )
    );
$$;

comment on function property.resolve_document(uuid) is
  'Resolves one document''s current version and metadata, only if the caller holds a live membership in its owning workspace or a workspace it has been explicitly shared with (roadmap WP 08.05). No version history — see 0055''s own header for why property.document_versions gets no policy or contract exposure yet. Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_document().';

-- =========================================================================
-- THE DELEGATES

create or replace function api.my_documents(
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
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.my_documents(p_property_id, p_location_id, p_asset_id, p_workspace_id);
$$;

comment on function api.my_documents(uuid, uuid, uuid, uuid) is
  'Delegate for property.my_documents() (ADR-0026''s split). Every document attached to one subject.';

create or replace function api.resolve_document(p_document_id uuid)
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
security definer
set search_path = ''
as $$
  select * from property.resolve_document(p_document_id);
$$;

comment on function api.resolve_document(uuid) is
  'Delegate for property.resolve_document() (ADR-0026''s split). One document''s current version and metadata.';

revoke all on function property.my_documents(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function property.resolve_document(uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_documents(uuid, uuid, uuid, uuid) from public, anon, service_role;
revoke all on function api.resolve_document(uuid) from public, anon, service_role;
grant execute on function api.my_documents(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function api.resolve_document(uuid) to authenticated;

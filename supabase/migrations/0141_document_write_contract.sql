-- Platform Activation Slice 1, WP 1.6 — the document write contract:
-- property.create_document() / api.create_document(), plus the Storage-bucket upload
-- flow the Programme's own WP 1.6 line names as the real reason this is its own work
-- package rather than folded into WP 1.4: "unlike Asset/Location this genuinely touches
-- a second Supabase service, not only Postgres."
--
-- THE OPEN QUESTION THIS WORK PACKAGE WAS TOLD TO CHECK, NOT ASSUME — NOW ANSWERED
--
-- SLICE_1_PROPERTY_ASSET_ACTIVATION.md §5: "Document upload's Storage bucket policy —
-- storage_bucket/storage_path already exist as columns (Epic 08); whether the
-- Storage-level RLS policy for a customer-initiated upload already exists or needs its
-- own migration is unverified — check before starting WP 1.6." Checked: it does not
-- exist. 0055_documents.sql's own header names the 'documents' bucket and its intended
-- path shape (<owning_workspace_id>/<document id>/<random>) as a comment only — no
-- `insert into storage.buckets`, no policy, anywhere in this codebase before this
-- migration. Built below, following 0016_household_items.sql's own bucket-plus-policy
-- precedent exactly.
--
-- THE STORAGE POLICY NEEDS A DIFFERENT SHAPE THAN item-photos' OWN — WORKSPACE
-- MEMBERSHIP, NOT auth.uid()
--
-- item-photos' policies (0016) check (storage.foldername(name))[1] = auth.uid()::text —
-- correct for a path keyed by the uploading PERSON. The 'documents' bucket's own path is
-- keyed by owning_workspace_id (0055's own header), so the check is instead "is the
-- caller a live member of the workspace named in the path's first segment" —
-- api.current_workspace_memberships() (0031), whose own comment states this precisely:
-- "Use in RLS as an uncorrelated subquery... never as a per-row scalar check." This is
-- that function's first use inside a storage.objects policy rather than a table policy,
-- the identical idiom, a new context. api.list_my_workspaces() (0038) is NOT used here —
-- its own comment states plainly it must never be used as an isolation predicate.
--
-- THE FOLDER SEGMENT IS COMPARED AS TEXT, NEVER CAST TO uuid — SAME DISCIPLINE AS
-- 0138/0140
--
-- workspace_id::text = (storage.foldername(name))[1], not the reverse. A malformed or
-- unexpected path segment must fail the comparison, not raise "invalid input syntax for
-- type uuid" and abort the whole policy check.
--
-- NEW document_types SEEDED — THE EXISTING CATALOG HAS NOTHING A CUSTOMER'S OWN DOCUMENT
-- FITS
--
-- 0055 seeded exactly two type_keys, both 'convenience', both for Epic 08's own backfill
-- targets: 'portfolio_photo' and 'request_photo'. Neither describes a warranty, a
-- certificate, an appliance manual, or anything else a customer would actually attach to
-- My Home through this contract — property.documents.type_key is a real foreign key
-- (0055's own header: "must be a declared catalog, not free text"), so create_document()
-- would be unusable end-to-end without at least one real type it could reference. Four
-- new types seeded below, all 'convenience' (deletable by their owner) — these are a
-- customer's own personal records, not the compliance-evidence documents Epic 08's
-- original two types were classifying. 0055's own header already anticipated this
-- catalog growing: "the first declared catalog in this roadmap that could not follow
-- facet_types' own restraint unmodified."
--
-- SCOPED TO PROPERTY-LEVEL ATTACHMENT ONLY — MATCHING WP 1.3's OWN READ-SIDE SCOPE,
-- DELIBERATELY, NOT A NEW LIMITATION
--
-- property.document_attachments (0056) can attach a document to a property, a location,
-- an asset, or a workspace directly — exactly one, structurally enforced. This contract
-- accepts only p_property_id. src/lib/homeInventory.js's loadDocuments() (WP 1.3) already
-- reads only property-level attachments, explicitly deferring per-location/per-asset
-- document browsing to those entities' own future detail views; a write contract that
-- could attach a document nowhere the read side ever looks would be a write nobody's UI
-- could ever show back. Widening both sides together, when a real location/asset detail
-- view exists to need it, is the natural next step — not silently building only one half
-- here.
--
-- storage_bucket IS NEVER A PARAMETER — ALWAYS 'documents', THE COLUMN'S OWN DEFAULT
--
-- 0055's own header: "New documents written through this engine going forward use the
-- canonical 'documents' bucket... backfilled rows name the bucket they actually live
-- in." A caller-supplied bucket name would only ever be wrong or pointless for a live
-- write — hardcoded here, not offered as a knob nothing legitimate would ever turn.
--
-- p_storage_path IS VALIDATED AGAINST THE CALLER'S OWN RESOLVED WORKSPACE, NOT TRUSTED
-- BLINDLY
--
-- The client uploads to Storage BEFORE calling this function (WP 1.8's own future
-- sequencing — Storage has no transaction spanning both writes). Nothing stops a caller
-- from uploading successfully under their own workspace folder and then calling this
-- function with a p_storage_path pointing somewhere else entirely, or nowhere real at
-- all. This function does not verify the object actually exists (an extra Storage API
-- round-trip this contract does not make), but it does refuse a storage_path that is not
-- even rooted under the caller's own resolved workspace folder — a cheap, real integrity
-- check that catches a stray or copy-pasted path before it becomes a document row nobody
-- can ever reach through the very policy that is supposed to gate it.
--
-- SAME AUTHORIZATION AND ONE-EXCEPTION SHAPE AS create_asset()/create_location()
--
-- See either migration's own header for the full reasoning — restated here only in
-- summary: a real, self-contained caller-membership check (this is the first end-user-
-- facing write contract for Document, the same posture the other two hold), one generic
-- 'insufficient_privilege' exception covering both "no such property" and "exists, but
-- not yours."

-- =========================================================================
-- STORAGE — private bucket, keyed by owning workspace, per 0055's own stated path shape.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "workspace members can upload own documents" on storage.objects;
create policy "workspace members can upload own documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] in (
    select workspace_id::text from api.current_workspace_memberships()
  )
);

drop policy if exists "workspace members can view own documents" on storage.objects;
create policy "workspace members can view own documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] in (
    select workspace_id::text from api.current_workspace_memberships()
  )
);

-- No UPDATE or DELETE policy — matching this migration's own scope (create only, no
-- delete_document()/update_document() at the Postgres level either). A reissued
-- document is a new version, a new Storage object, per ADR-0028's shape (0055's own
-- header) — objects are never edited in place, so no UPDATE policy is meaningful yet
-- either.

-- =========================================================================
-- THE DECLARED TYPE CATALOG — extended for a customer's own "My Home" documents.

insert into property.document_types (type_key, retention_class) values
  ('warranty', 'convenience'),
  ('certificate', 'convenience'),
  ('manual', 'convenience'),
  ('other', 'convenience')
on conflict (type_key) do nothing;

-- =========================================================================
-- THE LOGIC — property.create_document()

create or replace function property.create_document(
  p_document_id     uuid,
  p_attachment_id   uuid,
  p_property_id     uuid,
  p_type_key        text,
  p_storage_path    text,
  p_issuer          text,
  p_valid_from      date,
  p_valid_until     date,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward_workspace_id uuid;
begin
  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = p_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.create_document: caller may not create a document under property %', p_property_id
      using errcode = 'insufficient_privilege';
  end if;

  if not pg_catalog.starts_with(p_storage_path, v_steward_workspace_id::text || '/') then
    raise exception
      'property.create_document: storage_path must be rooted under the caller''s own workspace folder'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into property.documents
    (id, owning_workspace_id, type_key, storage_bucket, storage_path, issuer, valid_from, valid_until, version_since, created_at, updated_at)
  values
    (p_document_id, v_steward_workspace_id, p_type_key, 'documents', p_storage_path, p_issuer, p_valid_from, p_valid_until, now(), now(), now());

  insert into property.document_attachments (id, document_id, property_id)
  values (p_attachment_id, p_document_id, p_property_id);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.document.created',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'document',
    p_subject_id     => p_document_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('typeKey', p_type_key, 'propertyId', p_property_id, 'attachmentId', p_attachment_id)
  );
end;
$$;

comment on function property.create_document(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text) is
  'Creates a document owned by a property''s steward workspace and attaches it to that property (WP 1.6) — property-level attachment only, matching WP 1.3''s own read-side scope. storage_bucket is always ''documents''; storage_path must be rooted under the caller''s own resolved workspace folder, matching the Storage policy that gates it. One generic exception for both "no such property" and "not yours," matching create_asset()/create_location()''s own restraint. Emits property.document.created. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_document().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.create_document(
  p_document_id     uuid,
  p_attachment_id   uuid,
  p_property_id     uuid,
  p_type_key        text,
  p_storage_path    text,
  p_issuer          text,
  p_valid_from      date,
  p_valid_until     date,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select property.create_document(
    p_document_id, p_attachment_id, p_property_id, p_type_key, p_storage_path,
    p_issuer, p_valid_from, p_valid_until, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_document(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.create_document() (ADR-0026''s split). Creates a document under a property the caller has a live membership in, attached to it.';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed (ADR-0026 property 4), the
-- same discipline every prior api.* delegate in this codebase follows.

revoke all on function property.create_document(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

revoke all on function api.create_document(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.create_document(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text)
  to authenticated;

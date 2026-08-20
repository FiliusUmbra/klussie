-- Platform Activation Slice 2, WP 2.6 — extends the Document Engine's own attachment
-- table with a fifth real subject: work.requests. Exactly the extension
-- 0056_document_attachments.sql's own header named in advance: "When Epic 10 or Epic 12
-- ship, the natural extension is one more nullable column and one more arm in the check
-- constraint below — additive, not a redesign."
--
-- WHY THIS EXISTS — THE REAL GAP FOUND SCOPING THE CLIENT CUTOVER
--
-- public.service_request_photos.request_id (and property.documents_for_service_request(),
-- 0063) is keyed to the LEGACY service_requests.id. Per direct instruction, this
-- platform migrates request identity fully onto work.requests.id rather than keeping the
-- legacy id permanently load-bearing — meaning new requests, created through this
-- slice's own write contract, have no legacy row at all to key a photo against.
-- work.requests IS a real subject in DATABASE_ARCHITECTURE.md §15's own list ("a
-- document attaches to any number of subjects — property, location, asset, maintenance,
-- service record, engagement, workspace" — request specifically is not named there, but
-- request photos are exactly "evidence that outlives what it was attached to," §15's own
-- definition of what belongs in this engine, and 0060/0061 already mirror them here for
-- every legacy request that has one).
--
-- create_document_for_request() IS A NEW FUNCTION, NOT AN EXTENSION OF
-- property.create_document()
--
-- create_document()'s own authorization check resolves a steward workspace from a
-- PROPERTY (0141) — a request's requesting workspace is a genuinely different
-- resolution, and property_id on work.requests is nullable (most requests have none).
-- Redefining create_document() to branch on which subject was given would blur one
-- function's authorization logic across two unrelated resolution paths; a new function
-- with its own check is the same discipline every write-contract wrapper in this
-- programme already holds.
--
-- STORAGE NEEDS NO CHANGE — THE EXISTING POLICY ALREADY GENERALISES
--
-- 0141's own storage.objects policies key on "the path's first folder segment is a
-- workspace the caller is a real member of," never on what kind of subject the document
-- is about. A request photo path rooted under the requesting workspace's own id already
-- satisfies both policies unchanged — this migration adds no storage.objects statement.
--
-- PRO-SIDE VISIBILITY IS THE SAME DEFERRED GAP WP 2.4 ALREADY NAMES, NOT A NEW ONE
--
-- my_documents()'s own visibility rule (0059) is "the owning workspace, or an explicit
-- share" — a request photo's owning_workspace_id is the requesting (customer) workspace,
-- so the performing (pro) workspace cannot see it until something explicitly shares it.
-- This is DATABASE_ARCHITECTURE.md §19's own scoped-access-grant gap
-- (SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md §1.3), already found, already
-- deliberately deferred to WP 2.4 (moved after this slice's own client cutover, per the
-- Programme's own Platform Activation Priority) — visible here in document sharing, not
-- only in workspace.memberships, but the same one gap, not a second one. Named here so
-- WP 2.4's own eventual acceptance criteria (already stated: "a professional who accepts
-- a booking can see the customer's own Location/Asset/Document twin") is read as
-- literally covering this case too, not silently missing it.

-- =========================================================================
-- 1 · SCHEMA — the fifth subject

alter table property.document_attachments
  add column if not exists request_id uuid references work.requests (id);

alter table property.document_attachments drop constraint if exists document_attachments_exactly_one_subject;
alter table property.document_attachments add constraint document_attachments_exactly_one_subject
  check (num_nonnulls(property_id, location_id, asset_id, workspace_id, request_id) = 1);

create index if not exists document_attachments_request_id_idx
  on property.document_attachments (request_id);

comment on table property.document_attachments is
  'What a document is about (DATABASE_ARCHITECTURE.md §15) — one row per (document, subject) pair, a document may have several. Five real subjects: property, location, asset, workspace, request (WP 2.6''s own extension — Marketplace Engagement remains named in §15 but not included; still no real table for it). NEVER a source of visibility — see property.document_shares (0057) and the isolation policy (0058) for who may see a document.';

-- =========================================================================
-- 2 · READ — property.my_documents()/api.my_documents() extended with a fifth,
-- optional p_request_id. Dropped first, not merely "create or replace" — a changed
-- parameter list is a different signature (0148's own finding, restated here rather
-- than assumed forgotten).

drop function if exists property.my_documents(uuid, uuid, uuid, uuid);
drop function if exists api.my_documents(uuid, uuid, uuid, uuid);

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

  return query
    select d.id, d.owning_workspace_id, d.type_key, d.storage_bucket, d.storage_path, d.issuer,
           d.valid_from, d.valid_until, d.version_since, d.created_at, d.updated_at
    from property.documents d
    join property.document_attachments da on da.document_id = d.id
    where (p_property_id is not null and da.property_id = p_property_id)
       or (p_location_id is not null and da.location_id = p_location_id)
       or (p_asset_id is not null and da.asset_id = p_asset_id)
       or (p_workspace_id is not null and da.workspace_id = p_workspace_id)
       or (p_request_id is not null and da.request_id = p_request_id)
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

comment on function property.my_documents(uuid, uuid, uuid, uuid, uuid) is
  'Every document attached to one subject (property, location, asset, workspace or request — exactly one argument), visible only if the caller holds a live membership in the owning workspace or a workspace it has been explicitly shared with. WP 2.6''s own extension over 0059''s original four subjects — see this migration''s own header for the pro-visibility gap this does not yet close. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_documents().';

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
  'Delegate for property.my_documents() (ADR-0026''s split). Every document attached to one subject, now including request (WP 2.6).';

-- =========================================================================
-- 3 · WRITE — property.create_document_for_request()/api.create_document_for_request(),
-- a new function, not an extension of create_document() (see this migration's own
-- header for why)

create or replace function property.create_document_for_request(
  p_document_id     uuid,
  p_attachment_id   uuid,
  p_request_id      uuid,
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
  v_requesting_ws uuid;
begin
  select r.requesting_workspace_id into v_requesting_ws
  from work.requests r
  join workspace.current_memberships() m on m.workspace_id = r.requesting_workspace_id
  where r.id = p_request_id;

  if v_requesting_ws is null then
    raise exception
      'property.create_document_for_request: caller may not create a document under request %', p_request_id
      using errcode = 'insufficient_privilege';
  end if;

  if not pg_catalog.starts_with(p_storage_path, v_requesting_ws::text || '/') then
    raise exception
      'property.create_document_for_request: storage_path must be rooted under the caller''s own workspace folder'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into property.documents
    (id, owning_workspace_id, type_key, storage_bucket, storage_path, issuer, valid_from, valid_until, version_since, created_at, updated_at)
  values
    (p_document_id, v_requesting_ws, p_type_key, 'documents', p_storage_path, p_issuer, p_valid_from, p_valid_until, now(), now(), now());

  insert into property.document_attachments (id, document_id, request_id)
  values (p_attachment_id, p_document_id, p_request_id);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.document.created',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'document',
    p_subject_id     => p_document_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('typeKey', p_type_key, 'requestId', p_request_id)
  );
end;
$$;

comment on function property.create_document_for_request(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text) is
  'Creates a document for a caller with a real, active membership in the request''s own requesting workspace, attached to it — the request-photo write path (WP 2.6), matching create_document()''s own shape but checked against a request''s requesting workspace, never a property''s stewardship. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_document_for_request().';

create or replace function api.create_document_for_request(
  p_document_id     uuid,
  p_attachment_id   uuid,
  p_request_id      uuid,
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
  select property.create_document_for_request(
    p_document_id, p_attachment_id, p_request_id, p_type_key, p_storage_path,
    p_issuer, p_valid_from, p_valid_until, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_document_for_request(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.create_document_for_request() (ADR-0026''s split, WP 2.6). Creates a document under a request the caller has a live requesting-workspace membership in.';

-- =========================================================================
-- ACCESS

revoke all on function property.my_documents(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_documents(uuid, uuid, uuid, uuid, uuid) from public, anon, service_role;
grant execute on function api.my_documents(uuid, uuid, uuid, uuid, uuid) to authenticated;

revoke all on function property.create_document_for_request(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function api.create_document_for_request(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.create_document_for_request(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text)
  to authenticated;

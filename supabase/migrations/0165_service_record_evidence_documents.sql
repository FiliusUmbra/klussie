-- Platform Activation Slice 3, WP 3.3 — the one genuinely-required new capability the
-- editor's own design note (WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md §4) found before any
-- UI was built: evidence photos are named as core, shared, visible-to-both content
-- (PLATFORM_DOMAIN_MODEL.md §13.2's own "what it can contain" table), but
-- property.document_attachments has no service_record_id subject, and no existing write
-- path lets the PERFORMING side attach a document to a request at all.
--
-- NOT A NEW SUBJECT COLUMN — REUSES THE REQUEST-SCOPED ATTACHMENT ALREADY ESTABLISHED
--
-- property.document_attachments already allows request_id as one of its five subjects
-- (0149), and a Service Record's own originating request is always resolvable via
-- work.engagements.request_id (the same join api.resolve_service_record_for_request(),
-- 0164, already makes). No schema change to document_attachments; evidence attaches
-- exactly where request_photo documents already do.
--
-- property.create_document_for_request() (0149) CANNOT BE REUSED DIRECTLY — IT IS
-- SINGLE-SIDED, AND THAT SIDEDNESS IS LOAD-BEARING, NOT INCIDENTAL
--
-- Checked directly: it resolves and authorizes against e.requesting_workspace_id alone,
-- sets owning_workspace_id to that same value unconditionally, and roots the storage
-- path under it. That is correct for its one existing caller (a customer attaching
-- photos of the problem when creating a request) and wrong for this one (the
-- PERFORMING workspace attaching evidence of the work). Widening the existing function
-- to accept either side would silently let a customer author a "service_evidence"
-- document under their own workspace too — a real authorization boundary this migration
-- does not want to blur. A new, narrowly-scoped function, checked against the
-- performing side alone and with type_key hardcoded (not a caller-supplied parameter,
-- so this function can never be used to create any other document type), is the
-- narrower change — the same restraint 0164's own header already applied once this
-- session, for the identical reason (a new dedicated function beats widening a shipped
-- one's shape).
--
-- 'evidence' RETENTION CLASS — NEVER DELETABLE, MATCHING §13.2's OWN FRAMING
--
-- property.document_types.retention_class (0055) already distinguishes 'evidence'
-- (documents_guard_deletion refuses ever deleting one) from 'convenience'. §13.2 calls
-- evidence photos exactly that — "the evidence base," useful "in a warranty claim, an
-- insurance claim, a compliance audit, a dispute, or a sale." request_photo (the
-- pre-job photo) stays 'convenience'; service_evidence is seeded 'evidence' here,
-- deliberately not reusing request_photo's own type_key for a different-permanence kind
-- of photo.

insert into property.document_types (type_key, retention_class, is_public)
values ('service_evidence', 'evidence', false)
on conflict (type_key) do nothing;

create or replace function property.create_document_for_service_record(
  p_document_id        uuid,
  p_attachment_id      uuid,
  p_service_record_id  uuid,
  p_storage_path       text,
  p_event_id           uuid,
  p_correlation_id     uuid,
  p_actor_type         platform.actor_type,
  p_actor_ref          text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_performing_ws  uuid;
  v_requesting_ws  uuid;
  v_request_id     uuid;
begin
  select e.performing_workspace_id, e.requesting_workspace_id, e.request_id
  into v_performing_ws, v_requesting_ws, v_request_id
  from work.engagements e
  where e.service_record_id = p_service_record_id
    and e.performing_workspace_id in (select workspace_id from workspace.current_memberships());

  if v_performing_ws is null then
    raise exception
      'property.create_document_for_service_record: caller may not attach evidence to service record %', p_service_record_id
      using errcode = 'insufficient_privilege';
  end if;

  if not pg_catalog.starts_with(p_storage_path, v_performing_ws::text || '/') then
    raise exception
      'property.create_document_for_service_record: storage_path must be rooted under the caller''s own workspace folder'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into property.documents
    (id, owning_workspace_id, type_key, storage_bucket, storage_path, issuer, valid_from, valid_until, version_since, created_at, updated_at)
  values
    (p_document_id, v_performing_ws, 'service_evidence', 'documents', p_storage_path, null, null, null, now(), now(), now());

  insert into property.document_attachments (id, document_id, request_id)
  values (p_attachment_id, p_document_id, v_request_id);

  -- property.my_documents()'s own visibility predicate (0161) grants a request-attached
  -- document no two-sided read at all — only owning_workspace_id, or an explicit
  -- document_shares row, or property/location/asset scope (none of which apply to a
  -- request subject). Owned by the performing workspace here (unlike request_photo,
  -- owned by the requesting side), so without this the customer could never read back
  -- evidence §13.2 requires to be shared and visible to both. document_shares already
  -- exists for exactly this (0055/0060) — sharing here, not widening my_documents()'s own
  -- shipped predicate, keeps this migration's change scoped to the one write it adds.
  insert into property.document_shares (id, document_id, shared_with_workspace_id)
  values (gen_random_uuid(), p_document_id, v_requesting_ws);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.document.created',
    p_workspace_id   => v_performing_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'document',
    p_subject_id     => p_document_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('typeKey', 'service_evidence', 'serviceRecordId', p_service_record_id, 'requestId', v_request_id)
  );
end;
$$;

comment on function property.create_document_for_service_record(uuid, uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'Creates a service_evidence document for a caller with a real, active membership in the service record''s own performing workspace — resolved from work.engagements.service_record_id, never trusted from the caller. type_key is hardcoded, not a parameter: this function has exactly one purpose. Attached under the record''s own originating request_id (property.document_attachments already supports it, 0149) — mirrors property.create_document_for_request()''s shape but checked against the PERFORMING side, since that function''s own single-sidedness to the requesting workspace is load-bearing, not reusable here (see this migration''s own header). Not SECURITY DEFINER, granted to nobody, reachable only from api.create_document_for_service_record().';

create or replace function api.create_document_for_service_record(
  p_document_id        uuid,
  p_attachment_id      uuid,
  p_service_record_id  uuid,
  p_storage_path       text,
  p_event_id           uuid,
  p_correlation_id     uuid,
  p_actor_type         platform.actor_type,
  p_actor_ref          text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select property.create_document_for_service_record(
    p_document_id, p_attachment_id, p_service_record_id, p_storage_path,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_document_for_service_record(uuid, uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.create_document_for_service_record() (WP 3.3). The Service Record editor''s own evidence-photo upload.';

revoke all on function property.create_document_for_service_record(uuid, uuid, uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function api.create_document_for_service_record(uuid, uuid, uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.create_document_for_service_record(uuid, uuid, uuid, text, uuid, uuid, platform.actor_type, text)
  to authenticated;

-- NO NEW READ — api.my_documents(p_request_id) (0149/0161) already returns type_key on
-- every row; the client filters service_evidence from request_photo client-side, the
-- same design note's own §4 flagged as a real decision belonging to implementation, not
-- to this migration.

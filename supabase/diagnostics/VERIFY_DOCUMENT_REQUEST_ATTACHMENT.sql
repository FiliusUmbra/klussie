-- Verifies 0149_document_request_attachment.sql (Platform Activation Slice 2, WP 2.6)
-- with real data and real impersonated sessions: a customer with a real membership in a
-- request's requesting workspace can create and read a document attached to it; a
-- stranger can neither create nor read one; storage_path is validated against the
-- caller's own workspace, never a caller-supplied one.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_DOCUMENT_REQUEST_ATTACHMENT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth    uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_customer_ws      uuid := gen_random_uuid();
  v_stranger_ws      uuid := gen_random_uuid();
  v_customer_ref     uuid;
  v_request          uuid := gen_random_uuid();
  v_document_id      uuid := gen_random_uuid();
  v_row_count        integer;
  v_expected_failure boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'document-request-attachment-customer@example.test', jsonb_build_object('full_name', 'Document Request Attachment Customer'), now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'document-request-attachment-stranger@example.test', jsonb_build_object('full_name', 'Document Request Attachment Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Document Request Attachment Customer WS'),
    (v_stranger_ws, 'professional', 'Document Request Attachment Stranger WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active', now(), now());

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Leaking tap', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  -- =========================================================================
  -- 1 · The customer creates a photo attached to their own request

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_document_for_request(
    p_document_id => v_document_id, p_attachment_id => gen_random_uuid(), p_request_id => v_request,
    p_type_key => 'request_photo', p_storage_path => v_customer_ws::text || '/' || v_document_id::text || '/photo.jpg',
    p_issuer => null, p_valid_from => null, p_valid_until => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  select count(*) into v_row_count from api.my_documents(null, null, null, null, v_request);
  if v_row_count <> 1 then
    raise exception '1a · the customer should see their own 1 document, found %', v_row_count;
  end if;
  reset role;

  if not exists (
    select 1 from property.document_attachments where document_id = v_document_id and request_id = v_request
  ) then
    raise exception '1b · the document was not attached to the request via request_id';
  end if;
  raise notice '1 · a customer with a real membership creates a document attached to their own request, and can read it back';

  -- =========================================================================
  -- 2 · A storage_path rooted under someone else's workspace is refused

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_document_for_request(
      p_document_id => gen_random_uuid(), p_attachment_id => gen_random_uuid(), p_request_id => v_request,
      p_type_key => 'request_photo', p_storage_path => v_stranger_ws::text || '/should-not-work/photo.jpg',
      p_issuer => null, p_valid_from => null, p_valid_until => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_customer_auth::text
    );
  exception when sqlstate '22023' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '2 · a storage_path rooted under a different workspace was accepted';
  end if;
  raise notice '2 · a storage_path rooted under someone else''s workspace is refused';

  -- =========================================================================
  -- 3 · A total stranger can neither create a document under the request nor read the
  -- one that exists

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_document_for_request(
      p_document_id => gen_random_uuid(), p_attachment_id => gen_random_uuid(), p_request_id => v_request,
      p_type_key => 'request_photo', p_storage_path => v_stranger_ws::text || '/photo.jpg',
      p_issuer => null, p_valid_from => null, p_valid_until => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '3a · a stranger created a document under someone else''s request';
  end if;

  select count(*) into v_row_count from api.my_documents(null, null, null, null, v_request);
  if v_row_count <> 0 then
    raise exception '3b · a stranger saw % document(s) attached to a request they have no membership in, expected 0', v_row_count;
  end if;

  reset role;
  if exists (select 1 from property.documents where storage_path like '%should-not-work%') then
    raise exception '3c · the stranger''s attempted document exists despite the exception';
  end if;
  raise notice '3 · a total stranger can neither create a document under the request nor read the one that exists';

  reset role;
  raise notice 'VERIFY_DOCUMENT_REQUEST_ATTACHMENT: all checks passed';
end;
$$;

rollback;

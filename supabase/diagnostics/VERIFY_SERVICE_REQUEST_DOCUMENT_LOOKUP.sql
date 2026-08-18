-- Verifies 0063_service_request_document_lookup.sql (Epic 08 WP09, part 2).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SERVICE_REQUEST_DOCUMENT_LOOKUP.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth uuid := gen_random_uuid();
  v_customer_ref  uuid := gen_random_uuid();
  v_customer_ws   uuid := gen_random_uuid();
  v_category_id   uuid := gen_random_uuid();
  v_service_id    uuid := gen_random_uuid();
  v_request_id    uuid := gen_random_uuid();
  v_photo_id      uuid := gen_random_uuid();
  v_doc_id        uuid := gen_random_uuid();
  v_found         integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'doc-lookup-customer@example.test',
    jsonb_build_object('full_name', 'Lookup Customer', 'person_ref', v_customer_ref::text), now(), now());
  insert into workspace.workspaces (id, type, name) values (v_customer_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active');

  insert into public.categories (id, name) values (v_category_id, 'Lookup Category') on conflict do nothing;
  insert into public.services (id, category_id, name, certified_only)
    values (v_service_id, v_category_id, 'Lookup Service', false) on conflict do nothing;
  insert into public.service_requests (id, customer_id, service_id, category_id, details, status)
    values (v_request_id, v_customer_auth, v_service_id, v_category_id, 'Lookup test job', 'collecting');
  insert into public.service_request_photos (id, request_id, storage_path)
    values (v_photo_id, v_request_id, 'req/lookup.jpg');
  insert into property.documents (id, owning_workspace_id, type_key, storage_bucket, storage_path, service_request_photo_id)
    values (v_doc_id, v_customer_ws, 'request_photo', 'request-photos', 'req/lookup.jpg', v_photo_id);

  -- =========================================================================
  -- 1 · The document is found by request id, via the bookkeeping join, unattached

  select count(*) into v_found
  from property.documents d
  join public.service_request_photos srp on srp.id = d.service_request_photo_id
  where srp.request_id = v_request_id;

  if v_found <> 1 then
    raise exception '1 · expected exactly one document for the request, found %', v_found;
  end if;
  if exists (select 1 from property.document_attachments where document_id = v_doc_id) then
    raise exception '1 · the request-photo document has an attachment row — it must stay unattached';
  end if;
  raise notice '1 · the request-photo document is found via the bookkeeping join, still unattached';

  -- =========================================================================
  -- 2 · It is not marked publicly visible

  if exists (
    select 1 from property.document_types dt
    join property.documents d on d.type_key = dt.type_key
    where d.id = v_doc_id and dt.is_public
  ) then
    raise exception '2 · the request-photo document was incorrectly public';
  end if;
  raise notice '2 · the request-photo document is not publicly visible';

  raise notice 'VERIFY_SERVICE_REQUEST_DOCUMENT_LOOKUP: all checks passed';
end;
$$;

rollback;

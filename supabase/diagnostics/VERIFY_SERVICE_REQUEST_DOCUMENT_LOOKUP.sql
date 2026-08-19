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
  v_category_id   text := 'diagnostic-' || gen_random_uuid()::text;
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

  -- public.categories has no name column (that lives in category_translations) and its id
  -- is text, not uuid — caught running this diagnostic against real data (staging,
  -- 2026-08-19).
  insert into public.categories (id, icon) values (v_category_id, 'wrench') on conflict do nothing;
  -- public.services has no name column (that lives in service_translations) and requires
  -- mode and base_price, neither with a default — caught running this diagnostic against
  -- real data (staging, 2026-08-19).
  insert into public.services (id, category_id, mode, base_price, certified_only)
    values (v_service_id, v_category_id, 'quote', 50.00, false) on conflict do nothing;
  -- when_pref is required, no default — caught running this diagnostic against real data
  -- (staging, 2026-08-19).
  insert into public.service_requests (id, customer_id, service_id, category_id, details, when_pref, status, directed_until)
    values (v_request_id, v_customer_auth, v_service_id, v_category_id, 'Lookup test job', 'flexible', 'collecting', null);
  insert into public.service_request_photos (id, request_id, storage_path)
    values (v_photo_id, v_request_id, 'req/lookup.jpg');

  -- 0061_document_dual_write.sql (which post-dates this diagnostic) mirrors this insert
  -- into property.documents automatically — a manual insert here collides with it on
  -- documents_service_request_photo_id_uidx. Read the mirrored row back instead of
  -- creating a second one, caught running this diagnostic against real data (staging,
  -- 2026-08-19).
  select id into v_doc_id from property.documents where service_request_photo_id = v_photo_id;
  if v_doc_id is null then
    raise exception 'setup · the dual-write trigger did not mirror the request photo';
  end if;

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

-- Verifies the dual-write triggers in 0061_document_dual_write.sql (Epic 08 WP07).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_DOCUMENT_DUAL_WRITE.sql
--
-- Every check inserts real auth.users rows and rolls back — the real production path.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · A new portfolio_items row gets a mirrored document, attached to the pro's workspace

begin;

do $$
declare
  v_auth_id    uuid := gen_random_uuid();
  v_person_ref uuid := gen_random_uuid();
  v_ws         uuid := gen_random_uuid();
  v_item       uuid := gen_random_uuid();
  v_doc        property.documents;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'doc-dualwrite-pro@example.test',
    jsonb_build_object('full_name', 'Dual Write Pro', 'person_ref', v_person_ref::text), now(), now());
  insert into workspace.workspaces (id, type, name) values (v_ws, 'professional', 'Dual Write Pro Services');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_person_ref, 'owner', 'active');

  insert into public.portfolio_items (id, pro_id, image_url, storage_path, caption)
    values (v_item, v_auth_id, 'https://example.test/x.jpg', 'pro/x.jpg', 'Nice work');

  select * into v_doc from property.documents where portfolio_item_id = v_item;
  if v_doc.id is null then raise exception '1 · no document was mirrored for the new portfolio item'; end if;
  if v_doc.owning_workspace_id <> v_ws then raise exception '1 · mirrored document has the wrong owning workspace'; end if;
  if not exists (select 1 from property.document_attachments where document_id = v_doc.id and workspace_id = v_ws) then
    raise exception '1 · mirrored document was not attached to the pro''s own workspace';
  end if;

  raise notice '1 · a new portfolio_items row is mirrored and attached correctly';
end;
$$;

rollback;

-- =========================================================================
-- 2 · Deleting a portfolio_items row deletes its mirrored document AND its attachment —
-- the FK cascade fix, proven, not just asserted structurally

begin;

do $$
declare
  v_auth_id    uuid := gen_random_uuid();
  v_person_ref uuid := gen_random_uuid();
  v_ws         uuid := gen_random_uuid();
  v_item       uuid := gen_random_uuid();
  v_doc_id     uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'doc-dualwrite-delete@example.test',
    jsonb_build_object('full_name', 'Delete Pro', 'person_ref', v_person_ref::text), now(), now());
  insert into workspace.workspaces (id, type, name) values (v_ws, 'professional', 'Delete Pro Services');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_person_ref, 'owner', 'active');
  insert into public.portfolio_items (id, pro_id, image_url, storage_path)
    values (v_item, v_auth_id, 'https://example.test/y.jpg', 'pro/y.jpg');

  select id into v_doc_id from property.documents where portfolio_item_id = v_item;
  if v_doc_id is null then raise exception '2 · setup failed: no document mirrored'; end if;

  -- Before the FK fix, this would raise a foreign-key violation from document_attachments.
  delete from public.portfolio_items where id = v_item;

  if exists (select 1 from property.documents where id = v_doc_id) then
    raise exception '2 · the mirrored document was not deleted';
  end if;
  if exists (select 1 from property.document_attachments where document_id = v_doc_id) then
    raise exception '2 · the attachment row survived its document''s deletion — CASCADE did not fire';
  end if;

  raise notice '2 · deleting the source row deletes the document and cascades to its attachment';
end;
$$;

rollback;

-- =========================================================================
-- 3 · A new service_request_photos row is mirrored, left unattached, and shared with
-- every currently-matching pro's workspace

begin;

do $$
declare
  v_customer_auth uuid := gen_random_uuid();
  v_customer_ref  uuid := gen_random_uuid();
  v_customer_ws   uuid := gen_random_uuid();
  v_pro_auth      uuid := gen_random_uuid();
  v_pro_ref       uuid := gen_random_uuid();
  v_pro_ws        uuid := gen_random_uuid();
  v_category_id   uuid := gen_random_uuid();
  v_service_id    uuid := gen_random_uuid();
  v_request_id    uuid := gen_random_uuid();
  v_photo_id      uuid := gen_random_uuid();
  v_doc           property.documents;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'doc-dualwrite-customer@example.test',
    jsonb_build_object('full_name', 'Dual Write Customer', 'person_ref', v_customer_ref::text), now(), now());
  insert into workspace.workspaces (id, type, name) values (v_customer_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active');

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'doc-dualwrite-matchpro@example.test',
    jsonb_build_object('full_name', 'Match Pro', 'person_ref', v_pro_ref::text), now(), now());
  insert into workspace.workspaces (id, type, name) values (v_pro_ws, 'professional', 'Match Pro Services');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_pro_ws, v_pro_ref, 'owner', 'active');
  insert into public.profiles (id, full_name) values (v_pro_auth, 'Match Pro') on conflict (id) do nothing;
  insert into public.pro_profiles (profile_id, paused) values (v_pro_auth, false)
    on conflict (profile_id) do update set paused = false;
  insert into public.categories (id, name) values (v_category_id, 'Dual Write Category') on conflict do nothing;
  insert into public.services (id, category_id, name, certified_only)
    values (v_service_id, v_category_id, 'Dual Write Service', false) on conflict do nothing;
  insert into public.pro_services (pro_id, service_id) values (v_pro_auth, v_service_id) on conflict do nothing;

  insert into public.service_requests (id, customer_id, service_id, category_id, details, status)
    values (v_request_id, v_customer_auth, v_service_id, v_category_id, 'Dual write test job', 'collecting');

  insert into public.service_request_photos (id, request_id, storage_path)
    values (v_photo_id, v_request_id, 'req/z.jpg');

  select * into v_doc from property.documents where service_request_photo_id = v_photo_id;
  if v_doc.id is null then raise exception '3 · no document was mirrored for the new request photo'; end if;
  if v_doc.owning_workspace_id <> v_customer_ws then raise exception '3 · mirrored document has the wrong owning workspace'; end if;
  if exists (select 1 from property.document_attachments where document_id = v_doc.id) then
    raise exception '3 · a request-photo document was attached to something — it must stay unattached';
  end if;
  if not exists (select 1 from property.document_shares where document_id = v_doc.id and shared_with_workspace_id = v_pro_ws) then
    raise exception '3 · the matching pro''s workspace was not granted a live share';
  end if;

  raise notice '3 · a new request photo is mirrored, unattached, and shared with the matching pro live';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_DOCUMENT_DUAL_WRITE: all checks passed';
end;
$$;

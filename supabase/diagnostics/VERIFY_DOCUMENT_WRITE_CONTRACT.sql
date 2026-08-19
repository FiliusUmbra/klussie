-- Verifies 0141_document_write_contract.sql (Platform Activation Slice 1, WP 1.6) with
-- real data and real impersonated sessions, not just structural assertions: the new
-- 'documents' Storage bucket's workspace-membership policies actually gate a real
-- storage.objects insert (not only api.create_document() — the two are independent
-- layers, and this is the FIRST diagnostic in this codebase to exercise a Storage RLS
-- policy directly, going beyond CHECK_STATE.sql's own "bucket exists, is private"
-- structural check); a customer creates a real document attached to their own property,
-- with a real event; storage_path validation refuses a path outside the caller's own
-- workspace folder; and a stranger is refused both the Storage insert and the Postgres
-- write, with no partial write landing.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_DOCUMENT_WRITE_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth      uuid := gen_random_uuid();
  v_stranger_auth      uuid := gen_random_uuid();
  v_customer_ref       uuid;
  v_customer_workspace uuid;
  v_customer_property  uuid;
  v_document_id        uuid := gen_random_uuid();
  v_attachment_id      uuid := gen_random_uuid();
  v_storage_path        text;
  v_row                record;
  v_event_count        integer;
  v_expected_failure   boolean;
begin
  -- Setup: two real accounts, each auto-provisioned a real Personal workspace and a real
  -- property by WP 1.0's handle_new_user() extension (0135) — the same reliance
  -- VERIFY_ASSET_WRITE_CONTRACT.sql and VERIFY_LOCATION_WRITE_CONTRACT.sql already
  -- established.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'document-write-contract-customer@example.test', jsonb_build_object('full_name', 'Document Write Contract Customer'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'document-write-contract-stranger@example.test', jsonb_build_object('full_name', 'Document Write Contract Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;

  select p.id, p.steward_workspace_id into v_customer_property, v_customer_workspace
  from property.properties p
  join workspace.memberships m on m.workspace_id = p.steward_workspace_id
  where m.person_ref = v_customer_ref and m.role = 'owner';

  if v_customer_property is null then
    raise exception 'setup · the customer''s auto-provisioned property was not found — has 0135''s handle_new_user() extension regressed?';
  end if;

  v_storage_path := v_customer_workspace::text || '/' || v_document_id::text || '/warranty.pdf';

  -- =========================================================================
  -- 1 · The Storage layer itself: the customer can insert an object under their own
  -- workspace folder in the 'documents' bucket — the new policy, exercised directly,
  -- not only through api.create_document()

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  insert into storage.objects (bucket_id, name, owner)
  values ('documents', v_storage_path, v_customer_auth);

  reset role;
  if not exists (select 1 from storage.objects where bucket_id = 'documents' and name = v_storage_path) then
    raise exception '1 · the customer''s own storage object was not actually created';
  end if;
  raise notice '1 · a customer can insert a Storage object under their own workspace folder in the documents bucket';

  -- =========================================================================
  -- 2 · A stranger cannot insert a Storage object under the CUSTOMER's workspace folder

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('documents', v_customer_workspace::text || '/hijack/evil.pdf', v_stranger_auth);
  exception when others then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '2 · a stranger was able to insert a Storage object under someone else''s workspace folder';
  end if;
  raise notice '2 · a stranger cannot insert a Storage object under someone else''s workspace folder';

  -- =========================================================================
  -- 3 · The customer creates a real document attached to their own property, referencing
  -- the object they actually uploaded in check 1

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  perform api.create_document(
    p_document_id => v_document_id, p_attachment_id => v_attachment_id, p_property_id => v_customer_property,
    p_type_key => 'warranty', p_storage_path => v_storage_path, p_issuer => 'Vaillant',
    p_valid_from => '2024-01-20', p_valid_until => '2029-01-20',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  reset role;
  select * into v_row from property.documents where id = v_document_id;
  if v_row.id is null then
    raise exception '3 · the document was not actually created';
  end if;
  if v_row.owning_workspace_id <> v_customer_workspace or v_row.storage_bucket <> 'documents' or v_row.storage_path <> v_storage_path then
    raise exception '3 · the created document''s fields do not match: owning_workspace_id=%, storage_bucket=%, storage_path=%', v_row.owning_workspace_id, v_row.storage_bucket, v_row.storage_path;
  end if;

  if not exists (
    select 1 from property.document_attachments
    where id = v_attachment_id and document_id = v_document_id and property_id = v_customer_property
  ) then
    raise exception '3 · the property attachment row was not actually created';
  end if;

  select count(*) into v_event_count from platform.events
  where event_type = 'property.document.created' and subject_id = v_document_id;
  if v_event_count <> 1 then
    raise exception '3 · expected exactly 1 property.document.created event, found %', v_event_count;
  end if;
  raise notice '3 · a customer creates a real document attached to their own property, with a real event';

  -- =========================================================================
  -- 4 · A storage_path outside the caller's own workspace folder is refused, even for a
  -- real property the caller does own

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_document(
      p_document_id => gen_random_uuid(), p_attachment_id => gen_random_uuid(), p_property_id => v_customer_property,
      p_type_key => 'warranty', p_storage_path => gen_random_uuid()::text || '/elsewhere/file.pdf',
      p_issuer => null, p_valid_from => null, p_valid_until => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_customer_auth::text
    );
  exception when sqlstate '22023' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '4 · a storage_path outside the caller''s own workspace folder was accepted';
  end if;
  raise notice '4 · a storage_path outside the caller''s own workspace folder is refused';

  -- =========================================================================
  -- 5 · A stranger cannot create a document under the customer's property at all

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_document(
      p_document_id => gen_random_uuid(), p_attachment_id => gen_random_uuid(), p_property_id => v_customer_property,
      p_type_key => 'warranty', p_storage_path => v_customer_workspace::text || '/hijack/evil.pdf',
      p_issuer => null, p_valid_from => null, p_valid_until => null,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  if not v_expected_failure then
    raise exception '5 · a stranger was able to create a document under someone else''s property';
  end if;

  reset role;
  select count(*) into v_event_count from property.documents where owning_workspace_id = v_customer_workspace;
  if v_event_count <> 1 then
    raise exception '5 · expected exactly 1 real document for the customer''s workspace after the refused attempt, found %', v_event_count;
  end if;
  raise notice '5 · a stranger cannot create a document under someone else''s property, and no partial write lands';

  reset role;
  raise notice 'VERIFY_DOCUMENT_WRITE_CONTRACT: all checks passed';
end;
$$;

rollback;

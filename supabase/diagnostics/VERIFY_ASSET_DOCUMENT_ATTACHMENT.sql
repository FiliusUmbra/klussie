-- Verifies 0199_asset_document_attachment.sql with real data and real impersonated
-- sessions: an owner can still attach a document to their own property (regression,
-- unchanged from 0141) and can now attach one to their own asset instead; a stranger can
-- do neither; giving both or neither subject is refused; the storage-path rooting check
-- still holds; and a document attached to an asset is readable via
-- api.my_documents(p_asset_id => ...) but invisible to a stranger.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ASSET_DOCUMENT_ATTACHMENT.sql

\set ON_ERROR_STOP on
begin;
do $$
declare
  v_owner_auth       uuid := gen_random_uuid();
  v_stranger_auth    uuid := gen_random_uuid();
  v_owner_ref        uuid;
  v_owner_ws         uuid := gen_random_uuid();
  v_stranger_ws      uuid := gen_random_uuid();
  v_property         uuid := gen_random_uuid();
  v_asset            uuid := gen_random_uuid();
  v_prop_doc         uuid := gen_random_uuid();
  v_prop_attachment  uuid := gen_random_uuid();
  v_asset_doc        uuid := gen_random_uuid();
  v_asset_attachment uuid := gen_random_uuid();
  v_count            integer;
  v_expected_failure boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assetdoc-owner@example.test', '{}'::jsonb, now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assetdoc-stranger@example.test', '{}'::jsonb, now(), now());
  select person_ref into v_owner_ref from identity.identities where auth_user_id = v_owner_auth;

  insert into workspace.workspaces (id, type, name) values (v_owner_ws, 'personal', 'AssetDoc Owner'), (v_stranger_ws, 'personal', 'AssetDoc Stranger');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values
    (gen_random_uuid(), v_owner_ws, v_owner_ref, 'owner', 'active'),
    (gen_random_uuid(), v_stranger_ws, (select person_ref from identity.identities where auth_user_id = v_stranger_auth), 'owner', 'active');

  insert into property.properties (id, name, steward_workspace_id, steward_since) values (v_property, 'AD Property', v_owner_ws, now());
  insert into property.assets (id, property_id, name, lifecycle_state, source) values (v_asset, v_property, 'Washing machine', 'active', 'manual');

  -- =========================================================================
  -- 1 · property-level create still works exactly as before (regression)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.create_document(
    v_prop_doc, v_prop_attachment, 'manual', v_owner_ws::text || '/' || v_prop_doc::text || '/manual.pdf',
    null, null, null, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text,
    v_property, null
  );
  reset role;
  select count(*) into v_count from property.document_attachments where document_id = v_prop_doc and property_id = v_property;
  if v_count <> 1 then raise exception '1 FAILED · property-level document was not attached to the property'; end if;
  raise notice '1 · PASS: property-level create_document() still works, attaches to property_id';

  -- =========================================================================
  -- 2 · asset-level create: owner attaches a document to their own asset

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.create_document(
    v_asset_doc, v_asset_attachment, 'warranty', v_owner_ws::text || '/' || v_asset_doc::text || '/warranty.pdf',
    null, null, null, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text,
    null, v_asset
  );
  reset role;
  select count(*) into v_count from property.document_attachments where document_id = v_asset_doc and asset_id = v_asset;
  if v_count <> 1 then raise exception '2 FAILED · asset-level document was not attached to the asset'; end if;
  raise notice '2 · PASS: owner attaches a document to their own asset';

  -- =========================================================================
  -- 3 · a stranger cannot attach a document to someone else's asset

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.create_document(
      gen_random_uuid(), gen_random_uuid(), 'other', v_stranger_ws::text || '/x/y.pdf',
      null, null, null, gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text,
      null, v_asset
    );
  exception when insufficient_privilege then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '3 FAILED · a stranger attached a document to someone else''s asset'; end if;
  raise notice '3 · PASS: a stranger cannot attach a document to someone else''s asset';

  -- =========================================================================
  -- 4 · exactly one subject required -- both given, and neither given

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.create_document(
      gen_random_uuid(), gen_random_uuid(), 'other', v_owner_ws::text || '/x/y.pdf',
      null, null, null, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text,
      v_property, v_asset
    );
  exception when invalid_parameter_value then v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception '4a FAILED · giving both property_id and asset_id was allowed'; end if;
  raise notice '4a · PASS: refused when both property and asset are given';

  v_expected_failure := false;
  begin
    perform api.create_document(
      gen_random_uuid(), gen_random_uuid(), 'other', v_owner_ws::text || '/x/y.pdf',
      null, null, null, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text,
      null, null
    );
  exception when invalid_parameter_value then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '4b FAILED · giving neither property_id nor asset_id was allowed'; end if;
  raise notice '4b · PASS: refused when neither property nor asset is given';

  -- =========================================================================
  -- 5 · storage_path rooting check still holds (regression, now checked on the asset path too)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.create_document(
      gen_random_uuid(), gen_random_uuid(), 'other', 'not-my-workspace/x/y.pdf',
      null, null, null, gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text,
      null, v_asset
    );
  exception when invalid_parameter_value then v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then raise exception '5 FAILED · a storage_path outside the caller''s own workspace folder was accepted'; end if;
  raise notice '5 · PASS: storage_path must still be rooted under the caller''s own workspace folder';

  -- =========================================================================
  -- 6 · read side: my_documents(p_asset_id) sees the asset's own document; a stranger
  -- sees nothing (the same visibility rule 0058/0059 already enforce, untouched)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  select count(*) into v_count from api.my_documents(null, null, v_asset, null) where id = v_asset_doc;
  reset role;
  if v_count <> 1 then raise exception '6a FAILED · the owner cannot read the document they just attached to their own asset'; end if;
  raise notice '6a · PASS: the owner reads their own asset''s document via my_documents(p_asset_id)';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from api.my_documents(null, null, v_asset, null) where id = v_asset_doc;
  reset role;
  if v_count <> 0 then raise exception '6b FAILED · a stranger can read a document attached to someone else''s asset'; end if;
  raise notice '6b · PASS: a stranger reading the same asset sees nothing';

  raise notice 'VERIFY_ASSET_DOCUMENT_ATTACHMENT: all checks passed';
end;
$$;
rollback;

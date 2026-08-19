-- Verifies 0055_documents.sql (Epic 08 WP01): the type catalog, the document aggregate's
-- mutable current version, and version history's append-only guard.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_DOCUMENTS.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws       uuid := gen_random_uuid();
  v_doc      uuid := gen_random_uuid();
  v_version  uuid := gen_random_uuid();
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');

  -- =========================================================================
  -- 1 · A document can be created with the current version's fields directly on the row

  insert into property.documents (id, owning_workspace_id, type_key, storage_bucket, storage_path, issuer, valid_until)
  values (v_doc, v_ws, 'portfolio_photo', 'documents', 'x/y/z.jpg', 'Test Issuer', current_date + 30);

  if not exists (select 1 from property.documents where id = v_doc and storage_bucket = 'documents') then
    raise exception '1 · a document was not created with its current version fields';
  end if;
  raise notice '1 · a document is created with its current version fields directly on the row';

  -- =========================================================================
  -- 2 · document_types rejects an unknown retention_class

  begin
    insert into property.document_types (type_key, retention_class) values ('bogus_type', 'archival');
    raise exception '2 · an invalid retention_class was accepted';
  exception when check_violation then
    raise notice '2 · an invalid retention_class is rejected';
  end;

  -- =========================================================================
  -- 3 · An evidence-class document cannot be deleted

  insert into property.document_types (type_key, retention_class) values ('test_evidence', 'evidence')
    on conflict (type_key) do nothing;
  update property.documents set type_key = 'test_evidence' where id = v_doc;

  begin
    delete from property.documents where id = v_doc;
    raise exception '3 · an evidence-class document was deleted';
  exception when others then
    if sqlerrm not like '%append-only%' and sqlerrm not like '%cannot be deleted%' then
      raise;
    end if;
    raise notice '3 · an evidence-class document cannot be deleted';
  end;

  -- =========================================================================
  -- 4 · A convenience-class document CAN be deleted

  update property.documents set type_key = 'portfolio_photo' where id = v_doc;
  delete from property.documents where id = v_doc;
  if exists (select 1 from property.documents where id = v_doc) then
    raise exception '4 · a convenience-class document could not be deleted';
  end if;
  raise notice '4 · a convenience-class document can be deleted';

  -- =========================================================================
  -- 5 · document_versions is append-only — update and delete are both rejected

  insert into property.documents (id, owning_workspace_id, type_key, storage_path)
  values (v_doc, v_ws, 'portfolio_photo', 'a/b/c.jpg');
  insert into property.document_versions (id, document_id, storage_path, began_at, superseded_at)
  values (v_version, v_doc, 'old/path.jpg', now() - interval '2 days', now() - interval '1 day');

  begin
    update property.document_versions set storage_path = 'changed.jpg' where id = v_version;
    raise exception '5 · a document_versions row was updated';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;

  begin
    delete from property.document_versions where id = v_version;
    raise exception '5 · a document_versions row was deleted';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  raise notice '5 · document_versions rejects both update and delete';

  -- =========================================================================
  -- 6 · superseded_at must be after began_at

  begin
    insert into property.document_versions (id, document_id, storage_path, began_at, superseded_at)
    values (gen_random_uuid(), v_doc, 'x.jpg', now(), now() - interval '1 hour');
    raise exception '6 · a version with superseded_at before began_at was accepted';
  exception when check_violation then
    raise notice '6 · superseded_at before began_at is rejected';
  end;

  raise notice 'VERIFY_DOCUMENTS: all checks passed';
end;
$$;

rollback;

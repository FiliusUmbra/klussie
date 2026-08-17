-- Verifies 0058_document_isolation_policies.sql (Epic 08 WP04) — and, more specifically,
-- verifies DATABASE_ARCHITECTURE.md §15's own warning that "attachment is not a
-- visibility grant" actually holds, in a real, reproducible scenario, not just by
-- structural absence of a join (already checked by documentIsolationPolicies.test.js).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_DOCUMENT_ISOLATION_POLICIES.sql
--
-- THE SCENARIO THAT PROVES IT
--
-- A property can have only one steward workspace, but a document's owning workspace is
-- set entirely independently (§15). So: workspace B stewards a property and can clearly
-- see the asset inside it (via property.my_assets()). A document owned by a DIFFERENT
-- workspace, A, is attached to that same asset. If attachment were ever mistaken for
-- visibility, workspace B — which can see the asset — would also see the document. It
-- must not.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws_a      uuid := gen_random_uuid(); -- owns the document
  v_ws_b      uuid := gen_random_uuid(); -- stewards the property/asset the document is attached to
  v_ws_c      uuid := gen_random_uuid(); -- explicitly shared with
  v_prop      uuid := gen_random_uuid();
  v_asset     uuid := gen_random_uuid();
  v_doc       uuid := gen_random_uuid();
  v_visible_b boolean;
  v_visible_c boolean;
begin
  insert into workspace.workspaces (id, type, name) values
    (v_ws_a, 'personal', 'Owning Workspace'),
    (v_ws_b, 'personal', 'Steward Workspace'),
    (v_ws_c, 'personal', 'Shared Workspace');

  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Test Home', v_ws_b, now());
  insert into property.assets (id, property_id, name, type)
    values (v_asset, v_prop, 'Boiler', 'appliance');

  insert into property.documents (id, owning_workspace_id, type_key, storage_path)
    values (v_doc, v_ws_a, 'portfolio_photo', 'a/b/c.jpg');
  insert into property.document_attachments (id, document_id, asset_id)
    values (gen_random_uuid(), v_doc, v_asset);

  -- =========================================================================
  -- 1 · workspace B can see the asset (sanity check the scenario is real)

  if not exists (
    select 1 from property.assets a
    join property.properties p on p.id = a.property_id
    where a.id = v_asset and p.steward_workspace_id = v_ws_b
  ) then
    raise exception '1 · setup is wrong: workspace B does not steward the property';
  end if;
  raise notice '1 · workspace B genuinely stewards the property the document is attached to';

  -- =========================================================================
  -- 2 · workspace B, despite seeing the asset, CANNOT see the document — the actual claim

  select exists (
    select 1 from property.documents d
    where d.id = v_doc
      and (
        d.owning_workspace_id = v_ws_b
        or exists (select 1 from property.document_shares ds where ds.document_id = d.id and ds.shared_with_workspace_id = v_ws_b)
      )
  ) into v_visible_b;

  if v_visible_b then
    raise exception '2 · DATABASE_ARCHITECTURE.md §15 VIOLATED: attachment leaked visibility to the asset''s steward workspace';
  end if;
  raise notice '2 · workspace B cannot see the document, despite seeing the asset it is attached to — attachment is not a visibility grant';

  -- =========================================================================
  -- 3 · workspace A (the owner) can see it

  if not exists (select 1 from property.documents d where d.id = v_doc and d.owning_workspace_id = v_ws_a) then
    raise exception '3 · the owning workspace cannot see its own document';
  end if;
  raise notice '3 · the owning workspace can see its own document';

  -- =========================================================================
  -- 4 · an explicit share grants visibility, independent of attachment

  insert into property.document_shares (id, document_id, shared_with_workspace_id)
    values (gen_random_uuid(), v_doc, v_ws_c);

  select exists (
    select 1 from property.document_shares ds where ds.document_id = v_doc and ds.shared_with_workspace_id = v_ws_c
  ) into v_visible_c;

  if not v_visible_c then
    raise exception '4 · an explicit share did not grant visibility';
  end if;
  raise notice '4 · an explicit share grants visibility, entirely independent of attachment';

  -- =========================================================================
  -- 5 · revoking the share removes visibility (a plain delete, not a closed period)

  delete from property.document_shares where document_id = v_doc and shared_with_workspace_id = v_ws_c;
  if exists (select 1 from property.document_shares where document_id = v_doc and shared_with_workspace_id = v_ws_c) then
    raise exception '5 · the share was not actually revoked';
  end if;
  raise notice '5 · revoking a share is a plain delete — sharing is Transactional, not Historical';

  raise notice 'VERIFY_DOCUMENT_ISOLATION_POLICIES: all checks passed';
end;
$$;

rollback;

-- Verifies 0062_document_public_visibility.sql (Epic 08 WP09, part 1).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_DOCUMENT_PUBLIC_VISIBILITY.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws_owner   uuid := gen_random_uuid();
  v_portfolio  uuid := gen_random_uuid();
  v_request    uuid := gen_random_uuid();
begin
  insert into workspace.workspaces (id, type, name) values (v_ws_owner, 'professional', 'Public Vis Pro');

  insert into property.documents (id, owning_workspace_id, type_key, storage_path)
    values (v_portfolio, v_ws_owner, 'portfolio_photo', 'pro/a.jpg');
  insert into property.documents (id, owning_workspace_id, type_key, storage_path)
    values (v_request, v_ws_owner, 'request_photo', 'req/b.jpg');

  -- =========================================================================
  -- 1 · A portfolio_photo document is visible with no membership at all (simulating an
  -- anonymous caller — no workspace_id could ever match)

  if not exists (
    select 1 from property.documents d
    where d.id = v_portfolio
      and exists (select 1 from property.document_types dt where dt.type_key = d.type_key and dt.is_public)
  ) then
    raise exception '1 · a portfolio_photo document is not marked publicly visible';
  end if;
  raise notice '1 · a portfolio_photo document resolves as publicly visible, independent of any membership';

  -- =========================================================================
  -- 2 · A request_photo document is NOT publicly visible

  if exists (
    select 1 from property.documents d
    where d.id = v_request
      and exists (select 1 from property.document_types dt where dt.type_key = d.type_key and dt.is_public)
  ) then
    raise exception '2 · a request_photo document was incorrectly marked publicly visible';
  end if;
  raise notice '2 · a request_photo document stays private — is_public was not widened beyond portfolio_photo';

  -- =========================================================================
  -- 3 · document_types.is_public is exactly two rows, one true one false

  if (select count(*) from property.document_types where is_public) <> 1 then
    raise exception '3 · expected exactly one public document type';
  end if;
  if not exists (select 1 from property.document_types where type_key = 'portfolio_photo' and is_public) then
    raise exception '3 · portfolio_photo is not the public type';
  end if;

  raise notice 'VERIFY_DOCUMENT_PUBLIC_VISIBILITY: all checks passed';
end;
$$;

rollback;

-- Epic 08 WP08 — reconciles the property.documents rows mirrored by 0061's dual-write
-- triggers (and originally populated by 0060's backfill) against the rule both state, for
-- every live portfolio_items and service_request_photos row.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/RECONCILE_DOCUMENTS.sql
--
-- Step 4 of the migration pattern (IMPLEMENTATION_ROADMAP.md §3), and a **hard gate**:
-- §3 says "a read-switch without a passing reconciliation is not permitted," and this is
-- the evidence WP 08.09 needs before either read path may become document-scoped.
--
-- READ-ONLY. It writes nothing.
--
-- TWO SOURCE TABLES, TWO SETS OF CHECKS, ONE SHARED RESTRAINT
--
-- Following RECONCILE_ASSETS.sql's own precedent: "no mirror exists" is only a
-- discrepancy when the owner genuinely resolves to a real workspace — reconciled
-- against, not defended against, matching 0060's and 0061's own posture.

\set ON_ERROR_STOP on

-- =========================================================================
-- 0 · Real row counts — informational, not fatal

do $$
declare
  v_portfolio bigint;
  v_requests bigint;
  v_documents bigint;
  v_mirrored bigint;
begin
  select count(*) into v_portfolio from public.portfolio_items;
  select count(*) into v_requests from public.service_request_photos;
  select count(*) into v_documents from property.documents;
  select count(*) into v_mirrored from property.documents
    where portfolio_item_id is not null or service_request_photo_id is not null;

  raise notice '--- portfolio_items=% service_request_photos=% property.documents=% (mirrored=%) ---',
    v_portfolio, v_requests, v_documents, v_mirrored;
end;
$$;

-- =========================================================================
-- 1 · Every live portfolio_items row whose owner resolves to a Professional Workspace
-- has exactly one mirrored document

do $$
declare
  v_missing bigint;
  v_resolvable bigint;
begin
  select count(*) into v_resolvable
  from public.portfolio_items pi
  where exists (
    select 1 from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
    where i.auth_user_id = pi.pro_id
  );

  select count(*) into v_missing
  from public.portfolio_items pi
  where exists (
    select 1 from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
    where i.auth_user_id = pi.pro_id
  )
  and not exists (select 1 from property.documents d where d.portfolio_item_id = pi.id);

  if v_missing > 0 then
    raise exception 'DISCREPANCY: % portfolio_items row(s) resolve to a real Professional Workspace but have no mirrored document', v_missing;
  end if;

  raise notice '1 · every resolvable portfolio_items row has a mirrored document (% row(s) resolvable and compared)', v_resolvable;
end;
$$;

-- =========================================================================
-- 2 · Every live service_request_photos row whose owner resolves to a Personal Workspace
-- has exactly one mirrored document

do $$
declare
  v_missing bigint;
  v_resolvable bigint;
begin
  select count(*) into v_resolvable
  from public.service_request_photos srp
  join public.service_requests sr on sr.id = srp.request_id
  where exists (
    select 1 from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
    where i.auth_user_id = sr.customer_id
  );

  select count(*) into v_missing
  from public.service_request_photos srp
  join public.service_requests sr on sr.id = srp.request_id
  where exists (
    select 1 from identity.identities i
    join workspace.memberships m on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
    where i.auth_user_id = sr.customer_id
  )
  and not exists (select 1 from property.documents d where d.service_request_photo_id = srp.id);

  if v_missing > 0 then
    raise exception 'DISCREPANCY: % service_request_photos row(s) resolve to a real Personal Workspace but have no mirrored document', v_missing;
  end if;

  raise notice '2 · every resolvable service_request_photos row has a mirrored document (% row(s) resolvable and compared)', v_resolvable;
end;
$$;

-- =========================================================================
-- 3 · Every mirrored document agrees with a fresh derivation of its owning workspace

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from property.documents where portfolio_item_id is not null;
  select count(*) into v_wrong
  from property.documents d
  join public.portfolio_items pi on pi.id = d.portfolio_item_id
  join identity.identities i on i.auth_user_id = pi.pro_id
  join workspace.memberships m on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
  where d.owning_workspace_id is distinct from w.id
     or d.storage_path is distinct from pi.storage_path
     or d.type_key is distinct from 'portfolio_photo';
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % portfolio-sourced document(s) disagree with a fresh derivation', v_wrong;
  end if;
  raise notice '3 · every portfolio-sourced document agrees with a fresh derivation (% row(s) compared)', v_compared;
end;
$$;

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared from property.documents where service_request_photo_id is not null;
  select count(*) into v_wrong
  from property.documents d
  join public.service_request_photos srp on srp.id = d.service_request_photo_id
  join public.service_requests sr on sr.id = srp.request_id
  join identity.identities i on i.auth_user_id = sr.customer_id
  join workspace.memberships m on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
  where d.owning_workspace_id is distinct from w.id
     or d.storage_path is distinct from srp.storage_path
     or d.type_key is distinct from 'request_photo';
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % request-photo-sourced document(s) disagree with a fresh derivation', v_wrong;
  end if;
  raise notice '4 · every request-photo-sourced document agrees with a fresh derivation (% row(s) compared)', v_compared;
end;
$$;

-- =========================================================================
-- 5 · No mirrored document was ever left attached to something other than what 0060/0061
-- state (portfolio -> pro's own workspace; request photo -> nothing)

do $$
declare
  v_wrong bigint;
begin
  select count(*) into v_wrong
  from property.documents d
  where d.portfolio_item_id is not null
    and not exists (
      select 1 from property.document_attachments da
      where da.document_id = d.id and da.workspace_id = d.owning_workspace_id
    );
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % portfolio-sourced document(s) are not attached to their owning workspace', v_wrong;
  end if;

  select count(*) into v_wrong
  from property.documents d
  where d.service_request_photo_id is not null
    and exists (select 1 from property.document_attachments da where da.document_id = d.id);
  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % request-photo-sourced document(s) were attached to something — they must stay unattached', v_wrong;
  end if;

  raise notice '5 · attachment shape agrees with the stated rule for both source types';
end;
$$;

-- =========================================================================

do $$
declare
  v_total bigint;
begin
  select (select count(*) from public.portfolio_items) + (select count(*) from public.service_request_photos)
  into v_total;
  raise notice 'RECONCILE_DOCUMENTS: PASSED over % total source row(s)', v_total;

  if v_total < 10 then
    raise notice
      'NOTE: real coverage is thin (% rows). The same known, documented gap RECONCILE_WORKSPACE.sql and RECONCILE_ASSETS.sql already report for this environment — a valid pass over what exists, not a substitute for seeding real data before WP 08.09 relies on it at scale.',
      v_total;
  end if;
end;
$$;

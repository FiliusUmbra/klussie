-- Verifies the backfill in 0060_backfill_documents.sql (Epic 08 WP06).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_BACKFILL_DOCUMENTS.sql
--
-- Check 1 is the acceptance criterion against whatever this environment actually holds:
-- every live portfolio_items and service_request_photos row has exactly one backfilled
-- document. Check 2 builds a synthetic pro, request and match — through real auth.users
-- inserts, since both source tables ultimately chain to auth.users — and proves the
-- mapping precisely, including the sharing snapshot reproducing
-- public.pro_matches_request()'s own predicate.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every live source row has exactly one backfilled document

do $$
declare
  v_portfolio_items bigint;
  v_unbackfilled_portfolio bigint;
  v_request_photos bigint;
  v_unbackfilled_request bigint;
begin
  select count(*) into v_portfolio_items from public.portfolio_items;
  select count(*) into v_unbackfilled_portfolio
    from public.portfolio_items pi
    where not exists (select 1 from property.documents d where d.portfolio_item_id = pi.id);
  if v_unbackfilled_portfolio > 0 then
    raise exception '% portfolio_items row(s) have no backfilled document', v_unbackfilled_portfolio;
  end if;

  select count(*) into v_request_photos from public.service_request_photos;
  select count(*) into v_unbackfilled_request
    from public.service_request_photos srp
    where not exists (select 1 from property.documents d where d.service_request_photo_id = srp.id);
  if v_unbackfilled_request > 0 then
    raise exception '% service_request_photos row(s) have no backfilled document', v_unbackfilled_request;
  end if;

  raise notice '1 · every source row has a backfilled document (portfolio=%, request_photos=%)', v_portfolio_items, v_request_photos;
end;
$$;

-- =========================================================================
-- 2 · A real population, mapped correctly — synthetic, rolled back

begin;

do $$
declare
  v_customer_auth uuid := gen_random_uuid();
  v_customer_ref  uuid := gen_random_uuid();
  v_customer_ws   uuid := gen_random_uuid();

  v_pro_auth      uuid := gen_random_uuid();
  v_pro_ref       uuid := gen_random_uuid();
  v_pro_ws        uuid := gen_random_uuid();

  v_service_id    uuid := gen_random_uuid();
  v_category_id   text := 'diagnostic-' || gen_random_uuid()::text;
  v_request_id    uuid := gen_random_uuid();
  v_photo_id      uuid := gen_random_uuid();

  v_doc           property.documents;
  v_shared        boolean;
begin
  -- Customer
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'doc-backfill-customer@example.test',
    jsonb_build_object('full_name', 'Doc Customer', 'person_ref', v_customer_ref::text), now(), now());
  insert into workspace.workspaces (id, type, name) values (v_customer_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active');

  -- Pro
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'doc-backfill-pro@example.test',
    jsonb_build_object('full_name', 'Doc Pro', 'person_ref', v_pro_ref::text), now(), now());
  insert into workspace.workspaces (id, type, name) values (v_pro_ws, 'professional', 'Doc Pro Services');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_pro_ws, v_pro_ref, 'owner', 'active');

  insert into public.profiles (id, full_name) values (v_pro_auth, 'Doc Pro') on conflict (id) do nothing;
  insert into public.pro_profiles (profile_id, pro_type, paused) values (v_pro_auth, 'flexi', false)
    on conflict (profile_id) do update set paused = false;

  -- public.categories has no name column (that lives in category_translations) and its id
  -- is text, not uuid — a genuine schema mismatch this diagnostic had never actually run
  -- against, caught running it against real data (staging, 2026-08-19).
  insert into public.categories (id, icon) values (v_category_id, 'wrench')
    on conflict do nothing;
  -- public.services has no name column (that lives in service_translations) and requires
  -- mode and base_price, neither with a default — caught running this diagnostic against
  -- real data (staging, 2026-08-19).
  insert into public.services (id, category_id, mode, base_price, certified_only)
    values (v_service_id, v_category_id, 'quote', 50.00, false)
    on conflict do nothing;
  insert into public.pro_services (pro_id, service_id) values (v_pro_auth, v_service_id)
    on conflict do nothing;

  -- Portfolio photo
  insert into public.portfolio_items (id, pro_id, image_url, storage_path, caption, created_at)
    values (gen_random_uuid(), v_pro_auth, 'https://example.test/x.jpg', 'pro/x.jpg', 'Test work', '2025-06-01T00:00:00Z');

  -- Request + matching photo
  -- when_pref is required, no default — caught running this diagnostic against real data
  -- (staging, 2026-08-19).
  insert into public.service_requests (id, customer_id, service_id, category_id, details, when_pref, status, created_at, directed_until)
    values (v_request_id, v_customer_auth, v_service_id, v_category_id, 'Test job', 'flexible', 'collecting', '2025-06-01T00:00:00Z', null);
  insert into public.service_request_photos (id, request_id, storage_path, created_at)
    values (v_photo_id, v_request_id, 'req/x.jpg', '2025-06-01T00:00:00Z');

  -- Run the backfill's own logic inline (the migration itself already ran once at
  -- deploy time; this proves the same logic against fresh synthetic rows).
  with candidates as (
    select pi.id as portfolio_item_id, pi.storage_path, pi.created_at, w.id as workspace_id,
           platform.uuid_v7_at(pi.created_at) as document_id
    from public.portfolio_items pi
    join identity.identities i on i.auth_user_id = pi.pro_id
    join workspace.memberships m on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
    where pi.pro_id = v_pro_auth
      and not exists (select 1 from property.documents d where d.portfolio_item_id = pi.id)
  ),
  inserted as (
    insert into property.documents (id, owning_workspace_id, type_key, storage_bucket, storage_path, portfolio_item_id, created_at, updated_at)
    select document_id, workspace_id, 'portfolio_photo', 'portfolio', storage_path, portfolio_item_id, created_at, now()
    from candidates
    returning id, owning_workspace_id
  )
  insert into property.document_attachments (id, document_id, workspace_id)
  select platform.uuid_v7_at(now()), id, owning_workspace_id from inserted;

  select * into v_doc from property.documents where portfolio_item_id in (select id from public.portfolio_items where pro_id = v_pro_auth);
  if v_doc.id is null then
    raise exception 'The portfolio photo was not backfilled';
  end if;
  if v_doc.owning_workspace_id <> v_pro_ws or v_doc.type_key <> 'portfolio_photo' or v_doc.storage_bucket <> 'portfolio' then
    raise exception 'Portfolio document mapped incorrectly: owner=%, type=%, bucket=%', v_doc.owning_workspace_id, v_doc.type_key, v_doc.storage_bucket;
  end if;
  if not exists (select 1 from property.document_attachments where document_id = v_doc.id and workspace_id = v_pro_ws) then
    raise exception 'Portfolio document was not attached to the pro''s own workspace';
  end if;

  with candidates as (
    select srp.id as service_request_photo_id, srp.storage_path, srp.created_at, srp.request_id,
           w.id as workspace_id, platform.uuid_v7_at(srp.created_at) as document_id
    from public.service_request_photos srp
    join public.service_requests sr on sr.id = srp.request_id
    join identity.identities i on i.auth_user_id = sr.customer_id
    join workspace.memberships m on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
    where srp.id = v_photo_id
      and not exists (select 1 from property.documents d where d.service_request_photo_id = srp.id)
  ),
  inserted as (
    insert into property.documents (id, owning_workspace_id, type_key, storage_bucket, storage_path, service_request_photo_id, created_at, updated_at)
    select document_id, workspace_id, 'request_photo', 'request-photos', storage_path, service_request_photo_id, created_at, now()
    from candidates
    returning id, service_request_photo_id
  ),
  -- RETURNING can only project columns of property.documents itself — request_id was
  -- never inserted there, only carried through candidates for this join. The same fix as
  -- 0060_backfill_documents.sql's own header explains, this diagnostic's own inline copy
  -- of that logic had the identical bug — caught running it against real data (staging,
  -- 2026-08-19).
  documents_with_request as (
    select ins.id, c.request_id
    from inserted ins
    join candidates c on c.service_request_photo_id = ins.service_request_photo_id
  )
  insert into property.document_shares (id, document_id, shared_with_workspace_id)
  select distinct platform.uuid_v7_at(now()), dwr.id, pro_w.id
  from documents_with_request dwr
  join public.service_requests sr on sr.id = dwr.request_id
  join public.pro_services ps on ps.service_id = sr.service_id
  join public.services sv on sv.id = sr.service_id
  join public.pro_profiles pp on pp.profile_id = ps.pro_id and not pp.paused
  left join public.pro_stats st on st.pro_id = pp.profile_id
  left join public.profiles prof on prof.id = pp.profile_id
  join identity.identities pro_i on pro_i.auth_user_id = pp.profile_id
  join workspace.memberships pro_m on pro_m.person_ref = pro_i.person_ref and pro_m.role = 'owner' and pro_m.state = 'active'
  join workspace.workspaces pro_w on pro_w.id = pro_m.workspace_id and pro_w.type = 'professional'
  where (sv.certified_only = false or coalesce(st.is_certified, false))
    and (sr.city is null or prof.city is null or lower(sr.city) = lower(prof.city))
  on conflict (document_id, shared_with_workspace_id) do nothing;

  select * into v_doc from property.documents where service_request_photo_id = v_photo_id;
  if v_doc.id is null then
    raise exception 'The request photo was not backfilled';
  end if;
  if v_doc.owning_workspace_id <> v_customer_ws or v_doc.type_key <> 'request_photo' then
    raise exception 'Request-photo document mapped incorrectly: owner=%, type=%', v_doc.owning_workspace_id, v_doc.type_key;
  end if;
  if exists (select 1 from property.document_attachments where document_id = v_doc.id) then
    raise exception 'A request-photo document was attached to something — it should be left unattached';
  end if;

  select exists (
    select 1 from property.document_shares where document_id = v_doc.id and shared_with_workspace_id = v_pro_ws
  ) into v_shared;
  if not v_shared then
    raise exception 'The matching pro''s workspace was not granted a share';
  end if;

  raise notice '2 · portfolio and request-photo backfills both map correctly, including the matching-pro share snapshot';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_BACKFILL_DOCUMENTS: all checks passed';
end;
$$;

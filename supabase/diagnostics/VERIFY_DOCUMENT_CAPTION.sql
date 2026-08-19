-- Verifies 0064_document_caption.sql and 0065_resolve_public_professional_workspace.sql
-- (Epic 08 WP09, parts 3-4) — the caption gap (§5.6) and the public workspace resolver
-- the portfolio read switch needed to actually work.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_DOCUMENT_CAPTION.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_auth_id    uuid := gen_random_uuid();
  v_person_ref uuid := gen_random_uuid();
  v_ws         uuid := gen_random_uuid();
  v_item       uuid := gen_random_uuid();
  v_doc        property.documents;
  v_resolved   uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'doc-caption-pro@example.test',
    jsonb_build_object('full_name', 'Caption Pro', 'person_ref', v_person_ref::text), now(), now());
  insert into workspace.workspaces (id, type, name) values (v_ws, 'professional', 'Caption Pro Services');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_person_ref, 'owner', 'active');

  -- portfolio_items.pro_id -> public.pro_profiles(profile_id) — missing here originally,
  -- caught only by running this diagnostic against real data (staging, 2026-08-19), where
  -- the FK violation surfaced on the very first insert below.
  insert into public.profiles (id, full_name) values (v_auth_id, 'Caption Pro') on conflict (id) do nothing;
  insert into public.pro_profiles (profile_id, pro_type, paused) values (v_auth_id, 'flexi', false)
    on conflict (profile_id) do update set paused = false;

  -- =========================================================================
  -- 1 · A new portfolio item's caption is mirrored on insert

  insert into public.portfolio_items (id, pro_id, image_url, storage_path, caption)
    values (v_item, v_auth_id, 'https://example.test/x.jpg', 'pro/x.jpg', 'Before the caption changed');

  select * into v_doc from property.documents where portfolio_item_id = v_item;
  if v_doc.caption <> 'Before the caption changed' then
    raise exception '1 · caption was not mirrored on insert: got %', v_doc.caption;
  end if;
  raise notice '1 · a new portfolio item''s caption is mirrored on insert';

  -- =========================================================================
  -- 2 · Updating the caption updates the mirrored document

  update public.portfolio_items set caption = 'After the caption changed' where id = v_item;

  select caption into v_doc.caption from property.documents where portfolio_item_id = v_item;
  if v_doc.caption <> 'After the caption changed' then
    raise exception '2 · caption update was not mirrored: got %', v_doc.caption;
  end if;
  raise notice '2 · updating a portfolio item''s caption updates the mirrored document';

  -- =========================================================================
  -- 3 · workspace.resolve_public_professional_workspace() resolves the same workspace

  select workspace.resolve_public_professional_workspace(v_auth_id) into v_resolved;
  if v_resolved <> v_ws then
    raise exception '3 · resolver returned % , expected %', v_resolved, v_ws;
  end if;
  raise notice '3 · the public workspace resolver returns the pro''s real Professional Workspace';

  raise notice 'VERIFY_DOCUMENT_CAPTION: all checks passed';
end;
$$;

rollback;

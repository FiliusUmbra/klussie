-- Verifies 0151_workspace_owner_identity_read.sql (Platform Activation Slice 2, WP 2.6)
-- with real data: a professional workspace's real owner resolves to their real auth id;
-- a customer's own personal workspace does NOT resolve at all, even though it has an
-- equally real owner membership — the one thing this function must never leak.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKSPACE_OWNER_IDENTITY_READ.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_pro_auth      uuid := gen_random_uuid();
  v_customer_auth uuid := gen_random_uuid();
  v_pro_ws        uuid := gen_random_uuid();
  v_customer_ws   uuid := gen_random_uuid();
  v_pro_ref       uuid;
  v_customer_ref  uuid;
  v_resolved      uuid;
  v_row_count     integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'workspace-owner-identity-pro@example.test', jsonb_build_object('full_name', 'Workspace Owner Identity Pro'), now(), now()),
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'workspace-owner-identity-customer@example.test', jsonb_build_object('full_name', 'Workspace Owner Identity Customer'), now(), now());

  select i.person_ref into v_pro_ref from identity.identities i where i.auth_user_id = v_pro_auth;
  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_pro_ws, 'professional', 'Workspace Owner Identity Pro WS'),
    (v_customer_ws, 'personal', 'Workspace Owner Identity Customer WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at) values
    (gen_random_uuid(), v_pro_ws, v_pro_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active', now(), now());

  -- =========================================================================
  -- 1 · A professional workspace's real owner resolves to their real auth id

  select auth_user_id into v_resolved
  from api.resolve_workspace_owner_auth_ids(array[v_pro_ws]);

  if v_resolved <> v_pro_auth then
    raise exception '1 · expected the pro workspace to resolve to %, got %', v_pro_auth, v_resolved;
  end if;
  raise notice '1 · a professional workspace''s real owner resolves to their real auth id';

  -- =========================================================================
  -- 2 · A customer's own personal workspace does not resolve at all — the one thing
  -- this function must never leak, even though it has an equally real owner membership

  select count(*) into v_row_count from api.resolve_workspace_owner_auth_ids(array[v_customer_ws]);
  if v_row_count <> 0 then
    raise exception '2 · a customer''s own personal workspace resolved to an owner, found % row(s)', v_row_count;
  end if;
  raise notice '2 · a customer''s own personal workspace never resolves, even with a real owner membership';

  -- =========================================================================
  -- 3 · A batch request resolves only the professional workspace among a mix of both

  select count(*) into v_row_count from api.resolve_workspace_owner_auth_ids(array[v_pro_ws, v_customer_ws]);
  if v_row_count <> 1 then
    raise exception '3 · a batch of one professional and one personal workspace should resolve exactly 1 row, found %', v_row_count;
  end if;
  raise notice '3 · a batch request resolves only the professional workspace among a mix of both';

  raise notice 'VERIFY_WORKSPACE_OWNER_IDENTITY_READ: all checks passed';
end;
$$;

rollback;

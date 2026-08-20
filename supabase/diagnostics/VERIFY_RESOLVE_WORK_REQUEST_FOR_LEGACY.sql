-- Verifies 0155_resolve_work_request_for_legacy.sql (Platform Activation Slice 2, WP
-- 2.6) with real data: a real dual-written correlation resolves; a legacy id with no
-- correlated work.requests row (predating dual-write, or never written) resolves to
-- null, not an error.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_RESOLVE_WORK_REQUEST_FOR_LEGACY.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth   uuid := gen_random_uuid();
  v_customer_ws     uuid := gen_random_uuid();
  v_customer_ref    uuid;
  v_legacy_request  uuid := gen_random_uuid();
  v_orphan_legacy    uuid := gen_random_uuid();
  v_request         uuid := gen_random_uuid();
  v_resolved        uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'resolve-work-request-customer@example.test', jsonb_build_object('full_name', 'Resolve Work Request Customer'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;

  insert into workspace.workspaces (id, type, name) values (v_customer_ws, 'personal', 'Resolve Work Request Customer WS');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active', now(), now());

  insert into public.service_requests (id, customer_id, service_id, category_id, details, status, when_pref, directed_until)
  values
    (v_legacy_request, v_customer_auth, '00000000-0000-0000-0000-000000000003', 'cleaning', 'Correlated', 'collecting', 'flexible', null),
    (v_orphan_legacy, v_customer_auth, '00000000-0000-0000-0000-000000000003', 'cleaning', 'Never dual-written', 'collecting', 'flexible', null);

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Correlated', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );
  update work.requests set service_request_id = v_legacy_request where id = v_request;

  -- =========================================================================
  -- 1 · A real dual-written correlation resolves

  select api.resolve_work_request_for_legacy(v_legacy_request) into v_resolved;
  if v_resolved <> v_request then
    raise exception '1 · expected %, got %', v_request, v_resolved;
  end if;
  raise notice '1 · a real dual-written correlation resolves to the real work.requests id';

  -- =========================================================================
  -- 2 · A legacy id with no correlated work.requests row resolves to null, not an error

  select api.resolve_work_request_for_legacy(v_orphan_legacy) into v_resolved;
  if v_resolved is not null then
    raise exception '2 · expected null for an uncorrelated legacy id, got %', v_resolved;
  end if;
  raise notice '2 · a legacy id with no correlated work.requests row resolves to null, not an error';

  raise notice 'VERIFY_RESOLVE_WORK_REQUEST_FOR_LEGACY: all checks passed';
end;
$$;

rollback;

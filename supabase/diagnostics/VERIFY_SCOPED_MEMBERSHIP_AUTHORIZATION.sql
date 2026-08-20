-- Verifies 0161_scoped_membership_authorization.sql (Platform Activation Slice 2, WP 2.4)
-- with real data and real impersonated sessions — the platform's own hottest,
-- most-reused authorization path, verified accordingly: regression first (owner and
-- ordinary household member behave exactly as before), then the new positive case
-- (a scoped grant sees exactly its own property's twin), then DELIBERATE privilege
-- escalation attempts against every adjacent boundary (a different property in the same
-- workspace, an expired grant, an ended grant, a stranger, and every schema this fix
-- promises stays untouched), each one asserted denied.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SCOPED_MEMBERSHIP_AUTHORIZATION.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_owner_auth        uuid := gen_random_uuid();
  v_member_auth       uuid := gen_random_uuid();
  v_contractor_auth   uuid := gen_random_uuid();
  v_expired_auth      uuid := gen_random_uuid();
  v_ended_auth        uuid := gen_random_uuid();
  v_stranger_auth     uuid := gen_random_uuid();
  v_owner_ref         uuid;
  v_member_ref        uuid;
  v_contractor_ref    uuid;
  v_expired_ref       uuid;
  v_ended_ref         uuid;
  v_stranger_ref      uuid;
  v_customer_ws       uuid := gen_random_uuid();
  v_stranger_ws       uuid := gen_random_uuid();
  v_prop_a            uuid := gen_random_uuid();
  v_prop_b            uuid := gen_random_uuid();
  v_loc_a             uuid := gen_random_uuid();
  v_loc_b             uuid := gen_random_uuid();
  v_asset_a           uuid := gen_random_uuid();
  v_asset_b           uuid := gen_random_uuid();
  v_doc_a_property    uuid := gen_random_uuid();
  v_doc_a_asset       uuid := gen_random_uuid();
  v_doc_b             uuid := gen_random_uuid();
  v_doc_workspace     uuid := gen_random_uuid();
  v_request_id        uuid := gen_random_uuid();
  v_row                record;
  v_count              integer;
begin
  -- =========================================================================
  -- FIXTURE

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scope-owner@example.test', '{}'::jsonb, now(), now()),
    (v_member_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scope-member@example.test', '{}'::jsonb, now(), now()),
    (v_contractor_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scope-contractor@example.test', '{}'::jsonb, now(), now()),
    (v_expired_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scope-expired@example.test', '{}'::jsonb, now(), now()),
    (v_ended_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scope-ended@example.test', '{}'::jsonb, now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scope-stranger@example.test', '{}'::jsonb, now(), now());

  select person_ref into v_owner_ref from identity.identities where auth_user_id = v_owner_auth;
  select person_ref into v_member_ref from identity.identities where auth_user_id = v_member_auth;
  select person_ref into v_contractor_ref from identity.identities where auth_user_id = v_contractor_auth;
  select person_ref into v_expired_ref from identity.identities where auth_user_id = v_expired_auth;
  select person_ref into v_ended_ref from identity.identities where auth_user_id = v_ended_auth;
  select person_ref into v_stranger_ref from identity.identities where auth_user_id = v_stranger_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Scope Test Customer WS'),
    (v_stranger_ws, 'personal', 'Scope Test Stranger WS');

  -- Owner: real, unscoped membership — the pre-existing shape, unchanged.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_owner_ref, 'owner', null, 'active', now(), now());
  -- Household member: a SECOND unscoped membership, non-owner role — the other pre-existing shape.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_member_ref, 'member', null, 'active', now(), now());
  -- Contractor: a real, active, scoped grant over property A only — the new shape.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, expires_at, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_contractor_ref, 'contractor', jsonb_build_object('propertyId', v_prop_a), 'active', now() + interval '90 days', now(), now());
  -- Adversarial: identical scope, but expired.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, expires_at, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_expired_ref, 'contractor', jsonb_build_object('propertyId', v_prop_a), 'active', now() - interval '1 day', now(), now());
  -- Adversarial: identical scope, active window, but state = 'ended'.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, expires_at, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_ended_ref, 'contractor', jsonb_build_object('propertyId', v_prop_a), 'ended', now() + interval '90 days', now(), now());
  -- Stranger: no membership anywhere.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, created_at, updated_at) values
    (gen_random_uuid(), v_stranger_ws, v_stranger_ref, 'owner', null, 'active', now(), now());

  insert into property.properties (id, name, steward_workspace_id, steward_since) values
    (v_prop_a, 'Property A', v_customer_ws, now()),
    (v_prop_b, 'Property B', v_customer_ws, now());

  insert into property.locations (id, property_id, name) values
    (v_loc_a, v_prop_a, 'Kitchen A'),
    (v_loc_b, v_prop_b, 'Kitchen B');

  insert into property.assets (id, property_id, location_id, name, lifecycle_state, source) values
    (v_asset_a, v_prop_a, v_loc_a, 'Boiler A', 'active', 'manual'),
    (v_asset_b, v_prop_b, v_loc_b, 'Boiler B', 'active', 'manual');

  insert into property.facet_types (facet_type_key, declared_attributes) values ('scope_test_facet', '{}'::jsonb)
    on conflict (facet_type_key) do nothing;
  insert into property.asset_facets (id, asset_id, facet_type_key, attributes) values
    (gen_random_uuid(), v_asset_a, 'scope_test_facet', '{}'::jsonb);

  -- property.assemble_twin() is deliberately NOT exercised as an impersonated
  -- authenticated session below: it has no api.* delegate yet (checked directly — not a
  -- real client entry point today), is not itself SECURITY DEFINER, and reaches
  -- workspace.current_memberships() directly — live-testing it as authenticated would
  -- require also granting USAGE on schema workspace, the platform's single most
  -- sensitive engine schema, for a function nothing can actually call yet. Its own
  -- migration-level structural test (scopedMembershipAuthorization.test.js) already
  -- confirms the added branch is present and correctly shaped; its predicate is
  -- otherwise identical to property.resolve_property()'s own, which check 3/4 below do
  -- exercise live. Revisit once a real api.assemble_twin() delegate exists.

  insert into property.documents (id, owning_workspace_id, type_key, storage_bucket, storage_path) values
    (v_doc_a_property, v_customer_ws, 'warranty', 'documents', v_customer_ws::text || '/doc-a-property.jpg'),
    (v_doc_a_asset, v_customer_ws, 'warranty', 'documents', v_customer_ws::text || '/doc-a-asset.jpg'),
    (v_doc_b, v_customer_ws, 'warranty', 'documents', v_customer_ws::text || '/doc-b.jpg'),
    (v_doc_workspace, v_customer_ws, 'warranty', 'documents', v_customer_ws::text || '/doc-workspace.jpg');

  insert into property.document_attachments (id, document_id, property_id) values (gen_random_uuid(), v_doc_a_property, v_prop_a);
  insert into property.document_attachments (id, document_id, asset_id) values (gen_random_uuid(), v_doc_a_asset, v_asset_a);
  insert into property.document_attachments (id, document_id, property_id) values (gen_random_uuid(), v_doc_b, v_prop_b);
  insert into property.document_attachments (id, document_id, workspace_id) values (gen_random_uuid(), v_doc_workspace, v_customer_ws);

  -- A real marketplace request on the customer's own workspace, to prove a scoped grant
  -- cannot see it (current_memberships()'s own scope-null filter, not a new check).
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  perform api.create_request(
    v_request_id, v_customer_ws, null, null, null,
    'renovation', '00000000-0000-0000-0000-000000000001',
    'Unrelated request the contractor must never see', 'flexible', null,
    null, null, null, null, null, null,
    gen_random_uuid(), gen_random_uuid(), 'person', v_owner_auth::text
  );
  reset role;

  -- =========================================================================
  -- 1 · REGRESSION — the owner sees both properties, unchanged

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  select count(*) into v_count from property.properties where id in (v_prop_a, v_prop_b);
  reset role;
  if v_count <> 2 then
    raise exception '1 · REGRESSION: the owner lost visibility into their own properties (saw %, expected 2)', v_count;
  end if;
  raise notice '1 · regression: the owner still sees both of their own properties, unchanged';

  -- =========================================================================
  -- 2 · REGRESSION — an ordinary (non-owner) household member sees both properties too

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth)::text, true);
  select count(*) into v_count from property.properties where id in (v_prop_a, v_prop_b);
  reset role;
  if v_count <> 2 then
    raise exception '2 · REGRESSION: an ordinary household member lost visibility (saw %, expected 2)', v_count;
  end if;
  raise notice '2 · regression: an ordinary (non-owner) household member still sees both properties, unchanged';

  -- =========================================================================
  -- 3 · POSITIVE — the contractor sees exactly property A's own twin: the property
  -- itself, its location, its asset, the asset's facet, both documents attached to it
  -- (property-level and asset-level)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_contractor_auth)::text, true);

  select * into v_row from property.properties where id = v_prop_a;
  if v_row.id is null then raise exception '3a · the contractor cannot see property A, which their own grant names'; end if;

  select * into v_row from api.resolve_property(v_prop_a);
  if v_row.id is null then raise exception '3b · api.resolve_property() denies the contractor property A'; end if;

  select count(*) into v_count from api.locations_for_property(v_prop_a);
  if v_count <> 1 then raise exception '3c · locations_for_property(propA) returned % rows, expected 1', v_count; end if;

  select count(*) into v_count from api.my_assets(v_prop_a);
  if v_count <> 1 then raise exception '3d · my_assets(propA) returned % rows, expected 1', v_count; end if;

  select * into v_row from api.resolve_asset(v_asset_a);
  if v_row.id is null then raise exception '3e · resolve_asset(assetA) denies the contractor'; end if;

  select count(*) into v_count from property.asset_facets where asset_id = v_asset_a;
  if v_count <> 1 then raise exception '3f · the contractor cannot see asset A''s own facet'; end if;

  select count(*) into v_count from api.my_documents(p_property_id => v_prop_a);
  if v_count <> 1 then raise exception '3g · my_documents(propA) returned % rows, expected 1 (the property-attached one)', v_count; end if;

  select count(*) into v_count from api.my_documents(p_asset_id => v_asset_a);
  if v_count <> 1 then raise exception '3h · my_documents(assetA) returned % rows, expected 1 (the asset-attached one)', v_count; end if;

  select * into v_row from api.resolve_document(v_doc_a_property);
  if v_row.id is null then raise exception '3i · resolve_document(the property-attached doc) denies the contractor'; end if;

  reset role;
  raise notice '3 · positive: the contractor sees exactly property A''s own twin — property, location, asset, facet, and both attached documents';

  -- =========================================================================
  -- 4 · ADVERSARIAL — no cross-property disclosure: the SAME contractor, same session,
  -- deliberately reads property B (a different property in the SAME customer workspace)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_contractor_auth)::text, true);

  select count(*) into v_count from property.properties where id = v_prop_b;
  if v_count <> 0 then raise exception '4a · CROSS-PROPERTY DISCLOSURE: the contractor read property B directly'; end if;

  select count(*) into v_count from api.resolve_property(v_prop_b);
  if v_count <> 0 then raise exception '4b · CROSS-PROPERTY DISCLOSURE: resolve_property(propB) leaked'; end if;

  select count(*) into v_count from api.locations_for_property(v_prop_b);
  if v_count <> 0 then raise exception '4c · CROSS-PROPERTY DISCLOSURE: locations_for_property(propB) leaked'; end if;

  select count(*) into v_count from api.my_assets(v_prop_b);
  if v_count <> 0 then raise exception '4d · CROSS-PROPERTY DISCLOSURE: my_assets(propB) leaked'; end if;

  select count(*) into v_count from api.resolve_asset(v_asset_b);
  if v_count <> 0 then raise exception '4e · CROSS-PROPERTY DISCLOSURE: resolve_asset(assetB) leaked'; end if;

  select count(*) into v_count from api.my_documents(p_property_id => v_prop_b);
  if v_count <> 0 then raise exception '4f · CROSS-PROPERTY DISCLOSURE: my_documents(propB) leaked'; end if;

  select count(*) into v_count from api.resolve_document(v_doc_b);
  if v_count <> 0 then raise exception '4g · CROSS-PROPERTY DISCLOSURE: resolve_document(the property-B doc) leaked'; end if;

  -- The workspace-attached document must stay invisible even though it lives in the
  -- exact workspace the contractor has a real, active grant in — the deliberate
  -- workspace/request exclusion.
  select count(*) into v_count from api.resolve_document(v_doc_workspace);
  if v_count <> 0 then raise exception '4i · a workspace-attached document leaked through a property scope, which must never cover it'; end if;

  reset role;
  raise notice '4 · adversarial: no cross-property disclosure — every read of property B, its own location/asset/document twin, and the workspace-attached document, all correctly denied';

  -- =========================================================================
  -- 5 · ADVERSARIAL — the contractor's scoped grant must not leak into any OTHER schema:
  -- marketplace, via current_memberships()'s own scope-null filter

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_contractor_auth)::text, true);
  select count(*) into v_count from work.requests where id = v_request_id;
  reset role;
  if v_count <> 0 then
    raise exception '5a · CROSS-SCHEMA DISCLOSURE: the scoped contractor read the customer''s own unrelated marketplace request';
  end if;
  raise notice '5 · adversarial: the scoped grant does not leak into work.requests (marketplace stays workspace-membership-only, unaffected)';

  -- =========================================================================
  -- 6 · ADVERSARIAL — api.current_workspace_memberships() itself never returns the
  -- customer's own workspace for the contractor, proving the scope-null filter is the
  -- actual mechanism, not an accident of the property policies alone. It correctly still
  -- returns the contractor's OWN personal workspace (every real signup mints one via
  -- handle_new_user(), including this diagnostic's own fixture users) — asserting a bare
  -- zero-row count here would be testing a wrong expectation, not the real one.

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_contractor_auth)::text, true);
  select count(*) into v_count from api.current_workspace_memberships() where workspace_id = v_customer_ws;
  reset role;
  if v_count <> 0 then
    raise exception '6 · api.current_workspace_memberships() returned the customer''s own workspace for a purely-scoped identity — the scope-null filter is not working';
  end if;
  raise notice '6 · adversarial: api.current_workspace_memberships() never returns the customer''s workspace for a purely-scoped identity — only their own, unrelated, unscoped memberships';

  -- =========================================================================
  -- 7 · ADVERSARIAL — an EXPIRED scoped grant, otherwise identical, is denied

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_expired_auth)::text, true);
  select count(*) into v_count from property.properties where id = v_prop_a;
  reset role;
  if v_count <> 0 then raise exception '7 · EXPIRED-GRANT ESCALATION: an expired scoped membership still granted access'; end if;
  raise notice '7 · adversarial: an expired scoped grant is correctly denied';

  -- =========================================================================
  -- 8 · ADVERSARIAL — an ENDED (state <> 'active') scoped grant, otherwise identical
  -- and not expired, is denied

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_ended_auth)::text, true);
  select count(*) into v_count from property.properties where id = v_prop_a;
  reset role;
  if v_count <> 0 then raise exception '8 · ENDED-GRANT ESCALATION: a state=ended scoped membership still granted access'; end if;
  raise notice '8 · adversarial: an ended scoped grant is correctly denied';

  -- =========================================================================
  -- 9 · ADVERSARIAL — a total stranger, no membership anywhere, sees nothing at all
  -- (baseline cross-tenant denial)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from property.properties where id in (v_prop_a, v_prop_b);
  reset role;
  if v_count <> 0 then raise exception '9 · CROSS-TENANT DISCLOSURE: a stranger with no membership anywhere saw a property'; end if;
  raise notice '9 · adversarial: a stranger with no membership anywhere sees nothing — baseline cross-tenant isolation holds';

  raise notice 'VERIFY_SCOPED_MEMBERSHIP_AUTHORIZATION: all checks passed';
end;
$$;

rollback;

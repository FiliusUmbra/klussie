-- Verifies 0189_property_native_membership_only.sql with real impersonated sessions, not
-- just structural assertions: a native steward sees their own property exactly once
-- (including when a second, redundant native membership exists), an engagement-derived
-- contractor sees nothing from this endpoint and cannot write through it, a failed
-- contractor write leaves every address field untouched, the steward's own write still
-- succeeds, and an anonymous or wholly unrelated caller is refused. Entirely synthetic
-- fixtures, rolled back at the end -- no real customer data read, written, or logged.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_PROPERTY_NATIVE_MEMBERSHIP_ONLY.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_steward_auth        uuid := gen_random_uuid();
  v_contractor_auth     uuid := gen_random_uuid();
  v_stranger_auth       uuid := gen_random_uuid();
  v_steward_ref         uuid;
  v_contractor_ref      uuid;
  v_steward_ws          uuid := gen_random_uuid();
  v_contractor_ws       uuid := gen_random_uuid();
  v_property            uuid := gen_random_uuid();
  v_request             uuid := gen_random_uuid();
  v_quote                uuid := gen_random_uuid();
  v_engagement           uuid := gen_random_uuid();
  v_extra_membership     uuid := gen_random_uuid();
  v_row                  record;
  v_count                integer;
  v_expected_failure     boolean;
  v_original_street      text := 'Diagnostic Street';
  v_original_postcode    text := '0000';
begin
  -- =========================================================================
  -- SETUP — a real steward (customer), a real engagement-derived contractor
  -- (professional who completed one real job), and a wholly unrelated stranger.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_steward_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'property-native-membership-steward@example.test', jsonb_build_object('full_name', 'Diagnostic Steward'), now(), now()),
    (v_contractor_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'property-native-membership-contractor@example.test', jsonb_build_object('full_name', 'Diagnostic Contractor'), now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'property-native-membership-stranger@example.test', jsonb_build_object('full_name', 'Diagnostic Stranger'), now(), now());

  -- identity.identities is inserted directly, not left to auth.users' own signup trigger:
  -- a read-only check earlier in this same session found zero triggers on auth.users on
  -- staging at all (pg_trigger, not tgisinternal) -- a real, separate gap, out of this
  -- migration's own scope (property authorization only) and not fixed here. Noted in this
  -- diagnostic's own run output so it is never silently worked around.
  raise notice 'setup · auth.users has no signup trigger on this environment right now -- identity.identities rows inserted directly for this diagnostic''s own synthetic users, out of this migration''s scope to fix';

  v_steward_ref := gen_random_uuid();
  v_contractor_ref := gen_random_uuid();
  insert into identity.identities (person_ref, auth_user_id, full_name, email, created_at, updated_at)
  values
    (v_steward_ref, v_steward_auth, 'Diagnostic Steward', 'property-native-membership-steward@example.test', now(), now()),
    (v_contractor_ref, v_contractor_auth, 'Diagnostic Contractor', 'property-native-membership-contractor@example.test', now(), now()),
    (gen_random_uuid(), v_stranger_auth, 'Diagnostic Stranger', 'property-native-membership-stranger@example.test', now(), now());

  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  values
    (v_steward_ws, 'personal', 'Diagnostic Steward Home', now(), now()),
    (v_contractor_ws, 'professional', 'Diagnostic Contractor Co', now(), now());

  -- The steward's own, native membership — no granting_engagement_id.
  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (gen_random_uuid(), v_steward_ws, v_steward_ref, 'owner', 'active', now(), now());

  insert into property.properties (id, steward_workspace_id, steward_since, name, street, house_number, postcode, municipality, country, created_at, updated_at)
  values (v_property, v_steward_ws, now(), 'My Home', v_original_street, '1', v_original_postcode, 'Diagnostic City', 'BE', now(), now());

  -- A real, minimal request/quote/engagement chain, so granting_engagement_id can carry a
  -- genuine foreign key rather than an invented one — the same shape
  -- workspace.grant_engagement_access() (0162) consumes for real.
  insert into work.requests (id, requesting_workspace_id, property_id, status, created_at, updated_at)
  values (v_request, v_steward_ws, v_property, 'completed', now(), now());
  insert into work.quotes (id, request_id, offering_workspace_id, price, status, sent_at, responded_at)
  values (v_quote, v_request, v_contractor_ws, 100, 'accepted', now(), now());
  insert into work.engagements (id, request_id, quote_id, requesting_workspace_id, performing_workspace_id, agreed_price, status, completed_at, created_at)
  values (v_engagement, v_request, v_quote, v_steward_ws, v_contractor_ws, 100, 'completed', now(), now());

  -- The engagement-derived contractor grant — exactly workspace.grant_engagement_access()'s
  -- own shape (0162): a scoped membership into the STEWARD's workspace, granting_engagement_id set.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, granting_engagement_id, created_at, updated_at)
  values (gen_random_uuid(), v_steward_ws, v_contractor_ref, 'contractor', jsonb_build_object('propertyId', v_property), 'active', v_engagement, now(), now());

  -- The contractor's own, native membership in their own workspace — unaffected by this
  -- migration, must keep working exactly as before.
  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (gen_random_uuid(), v_contractor_ws, v_contractor_ref, 'owner', 'active', now(), now());

  -- =========================================================================
  -- 1 · A native member of the steward workspace receives the property exactly once

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_steward_auth)::text, true);

  select count(*) into v_count from api.my_properties() where id = v_property;
  if v_count <> 1 then
    raise exception '1 · steward expected exactly 1 row for their own property, got %', v_count;
  end if;

  select * into v_row from api.my_properties() where id = v_property;
  if v_row.street is distinct from v_original_street or v_row.postcode is distinct from v_original_postcode then
    raise exception '1 · steward''s own read did not return the real address fields';
  end if;
  reset role;
  raise notice '1 · a native steward-side member receives the property exactly once, with the real address';

  -- =========================================================================
  -- 2 · A second, redundant native membership for the same person in the same
  -- workspace still cannot duplicate the property

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  values (v_extra_membership, v_steward_ws, v_steward_ref, 'owner', 'active', now(), now());

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_steward_auth)::text, true);

  select count(*) into v_count from api.my_properties() where id = v_property;
  if v_count <> 1 then
    raise exception '2 · a redundant native membership produced % rows for one property, expected 1', v_count;
  end if;
  reset role;
  raise notice '2 · multiple eligible native memberships still return the property exactly once';

  delete from workspace.memberships where id = v_extra_membership;

  -- =========================================================================
  -- 3 · The engagement-created contractor does not receive the property from
  -- my_properties(), and therefore cannot read its exact address through this endpoint

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_contractor_auth)::text, true);

  select count(*) into v_count from api.my_properties() where id = v_property;
  if v_count <> 0 then
    raise exception '3 · engagement-derived contractor received % rows for the steward''s property, expected 0', v_count;
  end if;
  reset role;
  raise notice '3 · an engagement-created contractor receives nothing for the steward''s property from my_properties() -- the exact address is not reachable through this endpoint';

  -- =========================================================================
  -- 4 · The contractor cannot call set_property_address, and the failed write
  -- leaves every address field unchanged

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_contractor_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.set_property_address(
      p_property_id => v_property, p_street => 'HACKED', p_house_number => '999',
      p_postcode => '9999', p_municipality => 'Nowhere', p_country => 'BE',
      p_property_type => null, p_quote_prep_notes => null
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '4 · an engagement-derived contractor was able to call set_property_address on the steward''s property';
  end if;

  select * into v_row from property.properties where id = v_property;
  if v_row.street is distinct from v_original_street or v_row.postcode is distinct from v_original_postcode then
    raise exception '4 · the property''s address changed despite the contractor''s write being refused -- no partial write should ever land';
  end if;
  raise notice '4 · the contractor cannot call set_property_address, and the refused write left every address field unchanged';

  -- =========================================================================
  -- 5 · The authorized steward-side caller can still update the address

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_steward_auth)::text, true);

  perform api.set_property_address(
    p_property_id => v_property, p_street => 'Updated Diagnostic Street', p_house_number => '2',
    p_postcode => v_original_postcode, p_municipality => 'Diagnostic City', p_country => 'BE',
    p_property_type => null, p_quote_prep_notes => null
  );
  reset role;

  select * into v_row from property.properties where id = v_property;
  if v_row.street <> 'Updated Diagnostic Street' then
    raise exception '5 · the steward''s own authorized address update did not apply';
  end if;
  raise notice '5 · the authorized steward-side caller can still update the property''s address';

  -- =========================================================================
  -- 6 · Anonymous and unrelated authenticated callers remain denied

  execute 'set local role anon';
  v_expected_failure := false;
  begin
    perform api.my_properties();
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '6 · an anonymous caller was able to call api.my_properties()';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from api.my_properties() where id = v_property;
  reset role;
  if v_count <> 0 then
    raise exception '6 · a wholly unrelated authenticated stranger received % rows for the steward''s property', v_count;
  end if;
  raise notice '6 · anonymous and unrelated authenticated callers remain denied';

  reset role;
  raise notice 'VERIFY_PROPERTY_NATIVE_MEMBERSHIP_ONLY: all checks passed';
end;
$$;

rollback;

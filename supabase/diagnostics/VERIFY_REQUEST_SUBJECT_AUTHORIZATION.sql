-- Verifies work.create_request_for_caller() end-to-end with real data and real
-- impersonated sessions, covering both 0208_request_property_location_ownership.sql
-- (property_id/location_id ownership, PR #153) and 0209_request_subject_consistency.sql
-- (property/asset/location must resolve to the same property when more than one is
-- given) as one contract, plus every adjacent subject path this checkpoint's own audit
-- named: native membership, support-role exclusion (0175), engagement-scoped membership
-- exclusion (0161/0194), and anonymous/stranger denial.
--
-- Check 0 proves this diagnostic can actually fail: it temporarily reinstalls the
-- pre-0209 function body (0208's own, real, already-shipped text — no invented weaker
-- version) inside this same transaction, shows the exact property/asset mismatch 0209
-- exists to catch is silently ACCEPTED by it, then restores the real fixed definition
-- (captured via pg_get_functiondef before check 0 runs) before any other check executes.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_REQUEST_SUBJECT_AUTHORIZATION.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth     uuid := gen_random_uuid();
  v_support_auth      uuid := gen_random_uuid();
  v_contractor_auth   uuid := gen_random_uuid();
  v_stranger_auth     uuid := gen_random_uuid();
  v_customer_ref      uuid;
  v_support_ref       uuid;
  v_contractor_ref    uuid;
  v_stranger_ref      uuid;
  v_customer_ws       uuid := gen_random_uuid();
  v_stranger_ws       uuid := gen_random_uuid();
  v_prop_a            uuid := gen_random_uuid();
  v_prop_b            uuid := gen_random_uuid();
  v_prop_stranger     uuid := gen_random_uuid();
  v_loc_a             uuid := gen_random_uuid();
  v_loc_b             uuid := gen_random_uuid();
  v_asset_a           uuid := gen_random_uuid();
  v_asset_b           uuid := gen_random_uuid();
  v_unknown_id        uuid := gen_random_uuid();
  v_fixed_def         text;
  v_probe_id          uuid;
  v_expected_failure  boolean;
  v_before_requests   bigint;
  v_before_events     bigint;
  v_before_legacy     bigint;
  v_before_engagements bigint;
  v_before_conversations bigint;
  v_before_quotes     bigint;
  v_before_memberships bigint;
begin
  -- =========================================================================
  -- FIXTURE

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subject-auth-customer@example.test', '{}'::jsonb, now(), now()),
    (v_support_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subject-auth-support@example.test', '{}'::jsonb, now(), now()),
    (v_contractor_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subject-auth-contractor@example.test', '{}'::jsonb, now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subject-auth-stranger@example.test', '{}'::jsonb, now(), now());

  select person_ref into v_customer_ref from identity.identities where auth_user_id = v_customer_auth;
  select person_ref into v_support_ref from identity.identities where auth_user_id = v_support_auth;
  select person_ref into v_contractor_ref from identity.identities where auth_user_id = v_contractor_auth;
  select person_ref into v_stranger_ref from identity.identities where auth_user_id = v_stranger_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Subject Auth Customer WS'),
    (v_stranger_ws, 'personal', 'Subject Auth Stranger WS');

  -- Native, unscoped owner membership -- the only one that should ever authorize a write.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', null, 'active', now(), now());
  -- A support-role membership on the SAME workspace (0175's own case).
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_support_ref, 'support', null, 'active', now(), now());
  -- An engagement-scoped contractor membership on the SAME workspace, narrowed to
  -- property A -- the real shape workspace.grant_engagement_access() creates (0162),
  -- inserted directly here the same way VERIFY_SCOPED_MEMBERSHIP_AUTHORIZATION.sql does.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, expires_at, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_contractor_ref, 'contractor', jsonb_build_object('propertyId', v_prop_a), 'active', now() + interval '90 days', now(), now());
  -- Stranger: a real, unrelated authenticated account with no membership in the customer
  -- workspace at all.
  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, created_at, updated_at) values
    (gen_random_uuid(), v_stranger_ws, v_stranger_ref, 'owner', null, 'active', now(), now());

  insert into property.properties (id, name, steward_workspace_id, steward_since) values
    (v_prop_a, 'Subject Auth Property A', v_customer_ws, now()),
    (v_prop_b, 'Subject Auth Property B', v_customer_ws, now()),
    (v_prop_stranger, 'Subject Auth Stranger Property', v_stranger_ws, now());

  insert into property.locations (id, property_id, name) values
    (v_loc_a, v_prop_a, 'Subject Auth Kitchen A'),
    (v_loc_b, v_prop_b, 'Subject Auth Kitchen B');

  insert into property.assets (id, property_id, location_id, name, lifecycle_state, source) values
    (v_asset_a, v_prop_a, v_loc_a, 'Subject Auth Boiler A', 'active', 'manual'),
    (v_asset_b, v_prop_b, v_loc_b, 'Subject Auth Boiler B', 'active', 'manual');

  select pg_get_functiondef(
    'work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text)'::regprocedure
  ) into v_fixed_def;

  -- =========================================================================
  -- 0 · PROVE THE DIAGNOSTIC CAN FAIL — temporarily reinstall 0208's own real, already-
  -- shipped body (property/location ownership checked, but NOT cross-checked against each
  -- other) and show the exact property A + asset B mismatch 0209 exists to catch is
  -- silently accepted under it. No invented weaker version — this is 0208's real text.

  create or replace function work.create_request_for_caller(
    p_request_id              uuid,
    p_requesting_workspace_id uuid,
    p_property_id             uuid,
    p_asset_id                uuid,
    p_location_id             uuid,
    p_category_id             text,
    p_service_id              uuid,
    p_details                 text,
    p_when_pref               text,
    p_budget                  numeric,
    p_details_json            jsonb,
    p_ai_analysis             jsonb,
    p_city                    text,
    p_service_request_id      uuid,
    p_directed_workspace_id   uuid,
    p_auto_accept_max         numeric,
    p_event_id                uuid,
    p_correlation_id          uuid,
    p_actor_type              platform.actor_type,
    p_actor_ref               text
  )
  returns void
  language plpgsql
  set search_path = ''
  as $body$
  begin
    if not exists (
      select 1 from workspace.current_memberships() m where m.workspace_id = p_requesting_workspace_id and m.role <> 'support'
    ) then
      raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
    end if;

    if p_property_id is not null and not exists (
      select 1 from property.properties p
      where p.id = p_property_id and p.steward_workspace_id = p_requesting_workspace_id
    ) then
      raise exception 'work.create_request_for_caller: property % is not stewarded by workspace %', p_property_id, p_requesting_workspace_id
        using errcode = 'insufficient_privilege';
    end if;

    if p_asset_id is not null and not exists (
      select 1 from property.assets a
      join property.properties p on p.id = a.property_id
      where a.id = p_asset_id and p.steward_workspace_id = p_requesting_workspace_id
    ) then
      raise exception 'work.create_request_for_caller: asset % is not stewarded by workspace %', p_asset_id, p_requesting_workspace_id
        using errcode = 'insufficient_privilege';
    end if;

    if p_location_id is not null and not exists (
      select 1 from property.locations l
      join property.properties p on p.id = l.property_id
      where l.id = p_location_id and p.steward_workspace_id = p_requesting_workspace_id
    ) then
      raise exception 'work.create_request_for_caller: location % is not stewarded by workspace %', p_location_id, p_requesting_workspace_id
        using errcode = 'insufficient_privilege';
    end if;

    if p_directed_workspace_id is not null then
      if p_auto_accept_max is null or p_auto_accept_max <= 0 then
        raise exception 'work.create_request_for_caller: a directed request requires a positive auto_accept_max'
          using errcode = 'invalid_parameter_value';
      end if;
      if not exists (select 1 from workspace.workspaces w where w.id = p_directed_workspace_id) then
        raise exception 'work.create_request_for_caller: directed_workspace_id does not name a real workspace'
          using errcode = 'invalid_parameter_value';
      end if;
    end if;

    perform work.create_request(
      p_request_id => p_request_id, p_requesting_workspace_id => p_requesting_workspace_id,
      p_property_id => p_property_id, p_asset_id => p_asset_id, p_location_id => p_location_id,
      p_category_id => p_category_id, p_service_id => p_service_id, p_details => p_details,
      p_when_pref => p_when_pref, p_budget => p_budget,
      p_event_id => p_event_id, p_correlation_id => p_correlation_id,
      p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
    );

    update work.requests set details_json = p_details_json, ai_analysis = p_ai_analysis, city = p_city where id = p_request_id;

    if p_directed_workspace_id is not null then
      update work.requests
      set directed_workspace_id = p_directed_workspace_id, directed_until = now() + interval '24 hours', auto_accept_max = p_auto_accept_max
      where id = p_request_id;
    end if;

    if p_service_request_id is not null then
      update work.requests set service_request_id = p_service_request_id where id = p_request_id;
    end if;
  end;
  $body$;

  v_probe_id := gen_random_uuid();
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  perform api.create_request(
    v_probe_id, v_customer_ws, v_prop_a, v_asset_b, null,
    null, null, 'Vulnerability probe -- property A + asset B mismatch', 'flexible', null,
    null, null, null, null, null, null,
    gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
  );
  reset role;

  if not exists (select 1 from work.requests where id = v_probe_id and property_id = v_prop_a and asset_id = v_asset_b) then
    raise exception '0 · the diagnostic failed to reproduce the pre-0209 vulnerability -- a property/asset mismatch was rejected even under 0208''s own real, unmodified body, so this diagnostic cannot prove the fix does anything';
  end if;
  raise notice '0 · CONFIRMED REPRODUCIBLE: under 0208''s own real body (pre-0209), property A + asset B -- two subjects belonging to DIFFERENT properties -- was silently accepted. This is exactly the gap 0209 closes.';

  -- platform.events is deliberately append-only (events_reject_mutation()) -- the probe's
  -- own event row is left in place rather than worked around, and every "before" baseline
  -- below is captured AFTER this point so the probe's own rows don't skew it. The probe's
  -- work.requests row is removable (no such trigger on that table) and is removed so it
  -- cannot be mistaken for a real check's own result.
  delete from work.requests where id = v_probe_id;

  execute v_fixed_def;
  if not exists (
    select 1 from pg_proc where proname = 'create_request_for_caller' and pronamespace = 'work'::regnamespace
      and prosrc ilike '%does not belong to property%'
  ) then
    raise exception '0 · failed to restore the real, fixed function definition after the vulnerability probe -- aborting rather than running further checks against an unknown function body';
  end if;
  raise notice '0 · the real, fixed (0209) definition is restored -- every check below runs against it';

  select count(*) into v_before_requests from work.requests;
  select count(*) into v_before_events from platform.events;
  select count(*) into v_before_legacy from public.service_requests;
  select count(*) into v_before_engagements from work.engagements;
  select count(*) into v_before_conversations from work.conversations;
  select count(*) into v_before_quotes from work.quotes;
  select count(*) into v_before_memberships from workspace.memberships;

  -- =========================================================================
  -- 1 · A native workspace member creates a request for their own property -- succeeds

  declare
    v_own_property uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
    perform api.create_request(
      v_own_property, v_customer_ws, v_prop_a, null, null,
      null, null, 'Own property', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
    );
    reset role;
    if not exists (select 1 from work.requests where id = v_own_property) then
      raise exception '1 · a native member could not create a request for their own property';
    end if;
  end;
  raise notice '1 · a native workspace member creates a request for their own property -- succeeds';

  -- =========================================================================
  -- 2/3/4/5/6 · Foreign property and unknown UUID fail identically, non-enumerating, with
  -- no side effect of any kind

  declare
    v_foreign_attempt uuid := gen_random_uuid();
    v_unknown_attempt uuid := gen_random_uuid();
    v_foreign_sqlstate text;
    v_unknown_sqlstate text;
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

    v_expected_failure := false;
    begin
      perform api.create_request(
        v_foreign_attempt, v_customer_ws, v_prop_stranger, null, null,
        null, null, 'Foreign property', 'flexible', null,
        null, null, null, null, null, null,
        gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
      );
    exception when others then
      v_expected_failure := true;
      get stacked diagnostics v_foreign_sqlstate = returned_sqlstate;
    end;
    if not v_expected_failure then
      raise exception '2 · a request against another workspace''s property (unknown vs. foreign, foreign case) was accepted';
    end if;

    v_expected_failure := false;
    begin
      perform api.create_request(
        v_unknown_attempt, v_customer_ws, v_unknown_id, null, null,
        null, null, 'Unknown property', 'flexible', null,
        null, null, null, null, null, null,
        gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
      );
    exception when others then
      v_expected_failure := true;
      get stacked diagnostics v_unknown_sqlstate = returned_sqlstate;
    end;
    if not v_expected_failure then
      raise exception '3 · a request against a wholly unknown property id was accepted';
    end if;

    reset role;

    if v_foreign_sqlstate <> '42501' or v_unknown_sqlstate <> '42501' then
      raise exception '2/3 · expected sqlstate 42501 for both foreign (%) and unknown (%) property ids', v_foreign_sqlstate, v_unknown_sqlstate;
    end if;
    if v_foreign_sqlstate <> v_unknown_sqlstate then
      raise exception '2/3 · foreign and unknown property ids produced DIFFERENT sqlstates (% vs %) -- an enumeration leak', v_foreign_sqlstate, v_unknown_sqlstate;
    end if;
    raise notice '2/3 · a foreign workspace''s property and a wholly unknown property id both fail with the identical sqlstate 42501 -- non-enumerating';

    if exists (select 1 from work.requests where id in (v_foreign_attempt, v_unknown_attempt)) then
      raise exception '4 · a request row exists after a rejected foreign or unknown property id';
    end if;
    raise notice '4 · no work.requests row exists after either rejected attempt';

    if exists (select 1 from platform.events where subject_id in (v_foreign_attempt, v_unknown_attempt)) then
      raise exception '5 · a platform.events row exists after a rejected foreign or unknown property id';
    end if;
    raise notice '5 · no platform.events row was emitted after either rejected attempt';

    if (select count(*) from public.service_requests) <> v_before_legacy
      or (select count(*) from work.engagements) <> v_before_engagements
      or (select count(*) from work.conversations) <> v_before_conversations
      or (select count(*) from work.quotes) <> v_before_quotes
      or (select count(*) from workspace.memberships) <> v_before_memberships
    then
      raise exception '6 · a rejected attempt left behind a legacy mirror, engagement, conversation, quote, or membership/access-grant row it should not have';
    end if;
    raise notice '6 · no legacy mirror, notification, conversation, quote, engagement, or access-grant row was created by either rejected attempt';
  end;

  -- =========================================================================
  -- 7 · A subject-less (one-time-address-shaped) request still behaves as designed

  declare
    v_subjectless uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
    perform api.create_request(
      v_subjectless, v_customer_ws, null, null, null,
      null, null, 'No property, asset, or location at all', 'flexible', null,
      null, null, 'Some other city', null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
    );
    reset role;
    if not exists (select 1 from work.requests where id = v_subjectless and property_id is null and asset_id is null and location_id is null) then
      raise exception '7 · a valid subject-less request path regressed';
    end if;
  end;
  raise notice '7 · a subject-less (one-time-address-shaped) request still succeeds, unchanged';

  -- =========================================================================
  -- 8 · A valid asset-only path still works

  declare
    v_asset_only uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
    perform api.create_request(
      v_asset_only, v_customer_ws, null, v_asset_a, null,
      null, null, 'Asset only', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
    );
    reset role;
    if not exists (select 1 from work.requests where id = v_asset_only and asset_id = v_asset_a) then
      raise exception '8 · a valid asset-only request path regressed';
    end if;
  end;
  raise notice '8 · a valid asset path still works, unchanged since 0204';

  -- =========================================================================
  -- 9 · A valid location-only path still works

  declare
    v_location_only uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
    perform api.create_request(
      v_location_only, v_customer_ws, null, null, v_loc_a,
      null, null, 'Location only', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
    );
    reset role;
    if not exists (select 1 from work.requests where id = v_location_only and location_id = v_loc_a) then
      raise exception '9 · a valid location-only request path regressed';
    end if;
  end;
  raise notice '9 · a valid location path still works, unchanged since 0208';

  -- Positive controls for the consistency checks themselves: property A + asset A
  -- together (the real shape createServiceRequest() sends), and property A + location A
  -- together, both genuinely the same property -- must succeed. (property_id+asset_id+
  -- location_id all three together is not a real input shape: work.requests' own
  -- requests_at_most_one_subject check constraint already forbids asset_id and
  -- location_id ever being non-null on the same row -- see check 10c below.)

  declare
    v_consistent_pa uuid := gen_random_uuid();
    v_consistent_pl uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
    perform api.create_request(
      v_consistent_pa, v_customer_ws, v_prop_a, v_asset_a, null,
      null, null, 'Consistent property+asset', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
    );
    perform api.create_request(
      v_consistent_pl, v_customer_ws, v_prop_a, null, v_loc_a,
      null, null, 'Consistent property+location', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
    );
    reset role;
    if not exists (select 1 from work.requests where id = v_consistent_pa) then
      raise exception '9b · a consistent property+asset pair (both property A) was rejected';
    end if;
    if not exists (select 1 from work.requests where id = v_consistent_pl) then
      raise exception '9c · a consistent property+location pair (both property A) was rejected';
    end if;
  end;
  raise notice '9b/9c · a consistent property+asset pair and a consistent property+location pair (same property, the real shapes createServiceRequest() sends) both succeed';

  -- =========================================================================
  -- 10 · Mismatched property/asset/location identifiers are rejected

  declare
    v_mismatch_pa uuid := gen_random_uuid();
    v_mismatch_pl uuid := gen_random_uuid();
    v_mismatch_al uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);

    v_expected_failure := false;
    begin
      perform api.create_request(
        v_mismatch_pa, v_customer_ws, v_prop_a, v_asset_b, null,
        null, null, 'Mismatch property+asset', 'flexible', null,
        null, null, null, null, null, null,
        gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
      );
    exception when sqlstate '42501' then
      v_expected_failure := true;
    end;
    if not v_expected_failure then
      raise exception '10a · property A + asset B (different properties, both stewarded by the same workspace) was accepted';
    end if;

    v_expected_failure := false;
    begin
      perform api.create_request(
        v_mismatch_pl, v_customer_ws, v_prop_a, null, v_loc_b,
        null, null, 'Mismatch property+location', 'flexible', null,
        null, null, null, null, null, null,
        gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
      );
    exception when sqlstate '42501' then
      v_expected_failure := true;
    end;
    if not v_expected_failure then
      raise exception '10b · property A + location B (different properties) was accepted';
    end if;

    -- asset_id+location_id together is not an authorization question at all here --
    -- work.requests' own requests_at_most_one_subject check constraint forbids the PAIR
    -- unconditionally (sqlstate 23514, check_violation), regardless of whether they'd
    -- agree on a property. Confirmed directly rather than assumed: even a MATCHING pair
    -- (asset A + location A, genuinely the same property) is rejected by the table itself.
    v_expected_failure := false;
    begin
      perform api.create_request(
        v_mismatch_al, v_customer_ws, null, v_asset_a, v_loc_a,
        null, null, 'Asset+location together, even matching, is not a real input shape', 'flexible', null,
        null, null, null, null, null, null,
        gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
      );
    exception when sqlstate '23514' then
      v_expected_failure := true;
    end;
    if not v_expected_failure then
      raise exception '10c · asset A + location A (a MATCHING pair) was accepted with both non-null -- requests_at_most_one_subject no longer holds, which would make 0209''s design assumption wrong';
    end if;

    reset role;
  end;
  raise notice '10 · mismatched property+asset and property+location combinations are rejected by 0209''s own checks; asset_id+location_id together (matching or not) is rejected unconditionally by the table''s own pre-existing constraint';

  -- =========================================================================
  -- 11 · A support-derived membership cannot create the customer's request

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_support_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.create_request(
      gen_random_uuid(), v_customer_ws, v_prop_a, null, null,
      null, null, 'Support should not be able to do this', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_support_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '11 · a support-role membership was able to create the customer''s request';
  end if;
  raise notice '11 · a support-derived membership cannot create the customer''s request -- support access is not equivalent to native ownership';

  -- =========================================================================
  -- 12 · An engagement-scoped contractor membership cannot create the customer's request
  -- -- not even naming the exact property (property A) their own scope covers for reads

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_contractor_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.create_request(
      gen_random_uuid(), v_customer_ws, v_prop_a, null, null,
      null, null, 'Scoped contractor should not be able to do this', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_contractor_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '12 · an engagement-scoped contractor membership was able to create the customer''s request';
  end if;
  raise notice '12 · an engagement-scoped contractor membership cannot create the customer''s request, even naming the property their own scope covers -- engagement-scoped access is not equivalent to native ownership';

  -- =========================================================================
  -- 13 · Anonymous and unrelated authenticated callers remain denied

  execute 'set local role anon';
  v_expected_failure := false;
  begin
    perform api.create_request(
      gen_random_uuid(), v_customer_ws, v_prop_a, null, null,
      null, null, 'Anonymous should not be able to do this', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', null
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '13a · an anonymous caller was able to call api.create_request()';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  v_expected_failure := false;
  begin
    perform api.create_request(
      gen_random_uuid(), v_customer_ws, v_prop_a, null, null,
      null, null, 'Unrelated stranger should not be able to do this', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '13b · an unrelated authenticated stranger was able to create the customer''s request';
  end if;
  raise notice '13 · anonymous and unrelated authenticated callers both remain denied';

  raise notice 'VERIFY_REQUEST_SUBJECT_AUTHORIZATION: all checks passed';
end;
$$;

rollback;

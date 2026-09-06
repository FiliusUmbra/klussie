-- Verifies work.create_request_for_caller()'s p_service_request_id check (0210), found
-- by a systematic sweep of every *_for_caller() function for the exact class of bug
-- 0204/0208/0209 already fixed in this same function.
--
-- Check 0 proves this diagnostic can actually fail: it temporarily reinstalls 0209's own
-- real, already-shipped body (every other subject checked, service_request_id not) inside
-- this same transaction, shows the exact attack this migration closes -- correlating a
-- caller's own new request to ANOTHER workspace's real legacy request, then using that
-- correlation to make the victim's request vanish from every pro's lead list -- actually
-- works under it, then restores the real fixed definition (captured via
-- pg_get_functiondef) before any other check runs.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SERVICE_REQUEST_OWNERSHIP.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_victim_auth       uuid := gen_random_uuid();
  v_attacker_auth     uuid := gen_random_uuid();
  v_victim_ref        uuid;
  v_attacker_ref      uuid;
  v_victim_ws         uuid := gen_random_uuid();
  v_attacker_ws       uuid := gen_random_uuid();
  v_victim_legacy     uuid := gen_random_uuid();
  v_fixed_def         text;
  v_probe_request     uuid;
  v_expected_failure  boolean;
  v_victim_status     text;
begin
  -- =========================================================================
  -- FIXTURE

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_victim_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'svcreq-auth-victim@example.test', '{}'::jsonb, now(), now()),
    (v_attacker_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'svcreq-auth-attacker@example.test', '{}'::jsonb, now(), now());

  select person_ref into v_victim_ref from identity.identities where auth_user_id = v_victim_auth;
  select person_ref into v_attacker_ref from identity.identities where auth_user_id = v_attacker_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_victim_ws, 'personal', 'Service Request Ownership Victim WS'),
    (v_attacker_ws, 'personal', 'Service Request Ownership Attacker WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, scope, state, created_at, updated_at) values
    (gen_random_uuid(), v_victim_ws, v_victim_ref, 'owner', null, 'active', now(), now()),
    (gen_random_uuid(), v_attacker_ws, v_attacker_ref, 'owner', null, 'active', now(), now());

  -- The victim's own real, still-open legacy request -- customer_id is genuinely theirs.
  insert into public.service_requests (id, customer_id, service_id, category_id, details, status, when_pref)
  values (v_victim_legacy, v_victim_auth, '00000000-0000-0000-0000-000000000001', 'renovation', 'Victim''s real, still-open request', 'collecting', 'flexible');

  select pg_get_functiondef(
    'work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text)'::regprocedure
  ) into v_fixed_def;

  -- =========================================================================
  -- 0 · PROVE THE DIAGNOSTIC CAN FAIL — temporarily reinstall 0209's own real,
  -- already-shipped body (service_request_id unchecked) and show the attacker
  -- successfully correlating their own new request to the VICTIM's real legacy row.

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

    if p_property_id is not null and p_asset_id is not null and not exists (
      select 1 from property.assets a where a.id = p_asset_id and a.property_id = p_property_id
    ) then
      raise exception 'work.create_request_for_caller: asset % does not belong to property %', p_asset_id, p_property_id
        using errcode = 'insufficient_privilege';
    end if;

    if p_property_id is not null and p_location_id is not null and not exists (
      select 1 from property.locations l where l.id = p_location_id and l.property_id = p_property_id
    ) then
      raise exception 'work.create_request_for_caller: location % does not belong to property %', p_location_id, p_property_id
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

  v_probe_request := gen_random_uuid();
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_attacker_auth)::text, true);
  perform api.create_request(
    v_probe_request, v_attacker_ws, null, null, null,
    null, null, 'Attacker''s own new request, correlated to the VICTIM''s legacy row', 'flexible', null,
    null, null, null, v_victim_legacy, null, null,
    gen_random_uuid(), gen_random_uuid(), 'person', v_attacker_auth::text
  );
  reset role;

  if not exists (select 1 from work.requests where id = v_probe_request and service_request_id = v_victim_legacy) then
    raise exception '0 · the diagnostic failed to reproduce the pre-0210 vulnerability -- the cross-tenant correlation was rejected even under 0209''s own real, unmodified body, so this diagnostic cannot prove the fix does anything';
  end if;
  raise notice '0 · CONFIRMED REPRODUCIBLE: under 0209''s own real body (pre-0210), an attacker correlated their OWN new request to a VICTIM''s real, unrelated legacy service_requests row -- with no ownership check at all. This is exactly the gap 0210 closes.';

  -- Demonstrate the actual attack completes: withdrawing the attacker's own (correlated)
  -- request now moves the CORRELATED work.requests row past 'collecting' -- exactly what
  -- fetchProLeads() uses to drop the victim's own lead from every pro's list.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_attacker_auth)::text, true);
  perform api.withdraw_request(
    v_probe_request, gen_random_uuid(), gen_random_uuid(), 'person', v_attacker_auth::text
  );
  reset role;

  select status into v_victim_status
  from api.request_lifecycle_statuses(array[v_victim_legacy]);
  if v_victim_status = 'collecting' then
    raise exception '0b · the diagnostic failed to reproduce the attack''s actual effect -- the status bridge still reports the victim''s legacy id as collecting even after the attacker withdrew the correlated request';
  end if;
  raise notice '0b · CONFIRMED: the attacker withdrawing their OWN request changed the status bridge''s report for the VICTIM''s real legacy id to "%" -- exactly the mechanism that silently drops a real customer''s lead from every pro''s list.', v_victim_status;

  delete from work.requests where id = v_probe_request;

  execute v_fixed_def;
  if not exists (
    select 1 from pg_proc where proname = 'create_request_for_caller' and pronamespace = 'work'::regnamespace
      and prosrc ilike '%service_request % is not owned by workspace%'
  ) then
    raise exception '0 · failed to restore the real, fixed function definition after the vulnerability probe -- aborting rather than running further checks against an unknown function body';
  end if;
  raise notice '0 · the real, fixed (0210) definition is restored -- every check below runs against it';

  -- =========================================================================
  -- 1 · A caller correlating their OWN new request to their OWN real legacy row succeeds
  -- (the real, legitimate shape createServiceRequest()/createDirectedRequest() both use)

  declare
    v_own_legacy  uuid := gen_random_uuid();
    v_own_request uuid := gen_random_uuid();
  begin
    insert into public.service_requests (id, customer_id, service_id, category_id, details, status, when_pref)
    values (v_own_legacy, v_attacker_auth, '00000000-0000-0000-0000-000000000001', 'renovation', 'Attacker''s own real request', 'collecting', 'flexible');

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_attacker_auth)::text, true);
    perform api.create_request(
      v_own_request, v_attacker_ws, null, null, null,
      null, null, 'Own legacy correlation', 'flexible', null,
      null, null, null, v_own_legacy, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_attacker_auth::text
    );
    reset role;

    if not exists (select 1 from work.requests where id = v_own_request and service_request_id = v_own_legacy) then
      raise exception '1 · a caller correlating their own new request to their own real legacy row was rejected -- the legitimate path regressed';
    end if;
  end;
  raise notice '1 · a caller correlating a new request to their own real legacy row still succeeds, unchanged';

  -- =========================================================================
  -- 2 · The exact attack (correlating to another workspace's real legacy row) is now
  -- rejected, non-enumerating, with no side effect

  declare
    v_attack_request uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_attacker_auth)::text, true);
    v_expected_failure := false;
    begin
      perform api.create_request(
        v_attack_request, v_attacker_ws, null, null, null,
        null, null, 'Cross-tenant correlation attempt', 'flexible', null,
        null, null, null, v_victim_legacy, null, null,
        gen_random_uuid(), gen_random_uuid(), 'person', v_attacker_auth::text
      );
    exception when sqlstate '42501' then
      v_expected_failure := true;
    end;
    reset role;

    if not v_expected_failure then
      raise exception '2 · correlating a new request to another workspace''s real legacy row was accepted -- the fix did not take effect';
    end if;
    if exists (select 1 from work.requests where id = v_attack_request) then
      raise exception '2 · a work.requests row exists after the rejected cross-tenant correlation attempt';
    end if;
    if exists (select 1 from platform.events where subject_id = v_attack_request) then
      raise exception '2 · a platform.events row exists after the rejected cross-tenant correlation attempt';
    end if;
  end;
  raise notice '2 · correlating a new request to another workspace''s real legacy row is now rejected (sqlstate 42501, non-enumerating), with no request or event row created';

  -- =========================================================================
  -- 3 · An unknown (wholly fabricated) service_request_id fails identically

  declare
    v_unknown_request uuid := gen_random_uuid();
    v_unknown_legacy  uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_attacker_auth)::text, true);
    v_expected_failure := false;
    begin
      perform api.create_request(
        v_unknown_request, v_attacker_ws, null, null, null,
        null, null, 'Unknown legacy id', 'flexible', null,
        null, null, null, v_unknown_legacy, null, null,
        gen_random_uuid(), gen_random_uuid(), 'person', v_attacker_auth::text
      );
    exception when sqlstate '42501' then
      v_expected_failure := true;
    end;
    reset role;
    if not v_expected_failure then
      raise exception '3 · a wholly unknown service_request_id was accepted';
    end if;
  end;
  raise notice '3 · a wholly unknown service_request_id is rejected with the identical sqlstate as a real foreign one';

  -- =========================================================================
  -- 4 · The victim's own real lead is unaffected throughout -- the status bridge
  -- (work.requests.service_request_id = any(...)) returns NO row for it at all under
  -- the fix, since no work.requests row was ever actually correlated to it (unlike
  -- check 0b, where the vulnerable body let the attacker's own withdrawn request
  -- correlate and so the bridge reported that request's own new status instead).

  select status into v_victim_status from api.request_lifecycle_statuses(array[v_victim_legacy]);
  if v_victim_status is not null then
    raise exception '4 · the status bridge reports a status ("%") for the victim''s legacy id -- something correlated to it despite the fix', v_victim_status;
  end if;
  raise notice '4 · the status bridge reports nothing at all for the victim''s legacy id throughout -- never actually correlated to under the fix, and the victim''s own real legacy service_requests row itself is untouched, still status=collecting';

  if (select status from public.service_requests where id = v_victim_legacy) <> 'collecting' then
    raise exception '4b · the victim''s own real legacy service_requests row itself was modified';
  end if;

  -- =========================================================================
  -- 5 · A subject-less request with no service_request_id at all is unaffected

  declare
    v_no_correlation uuid := gen_random_uuid();
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', v_attacker_auth)::text, true);
    perform api.create_request(
      v_no_correlation, v_attacker_ws, null, null, null,
      null, null, 'No legacy correlation at all', 'flexible', null,
      null, null, null, null, null, null,
      gen_random_uuid(), gen_random_uuid(), 'person', v_attacker_auth::text
    );
    reset role;
    if not exists (select 1 from work.requests where id = v_no_correlation and service_request_id is null) then
      raise exception '5 · a request with no service_request_id at all regressed';
    end if;
  end;
  raise notice '5 · a request with no service_request_id at all still succeeds, unchanged';

  raise notice 'VERIFY_SERVICE_REQUEST_OWNERSHIP: all checks passed';
end;
$$;

rollback;

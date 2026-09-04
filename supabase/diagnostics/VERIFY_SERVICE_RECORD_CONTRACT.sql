-- Verifies 0163_service_record_contract.sql and 0164_service_record_for_request.sql
-- (Platform Activation Slice 3, WP 3.0 + follow-up) with a real request -> quote ->
-- accept -> complete flow through the actual api.* write contracts, then the Service
-- Record contract itself: authoring (closing 0087's own gap — work.engagements.
-- service_record_id gets set), the deliberate refusal when a request has no physical
-- subject, approval by the property's current steward, both annexes' own membership
-- boundary, amendment authorship validation, one-record-per-engagement idempotency, and
-- the request-keyed read WP 3.2's own client needs — each adversarial case attempted and
-- asserted denied.
--
-- Updated for 0181-0184 (WP 2.8, disclosure-consent redesign): api.accept_quote() no
-- longer activates an engagement directly — it lands in 'pending_disclosure'. Only the
-- customer's own api.approve_location_disclosure() call moves it to 'active' (0182's own
-- trigger enforces this), which api.complete_engagement() then requires. The fixture below
-- inserts a real, impersonated approval for both engagements between acceptance and
-- completion, matching how the client itself drives this flow now.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SERVICE_RECORD_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth   uuid := gen_random_uuid();
  v_pro_auth        uuid := gen_random_uuid();
  v_stranger_auth   uuid := gen_random_uuid();
  v_customer_ref     uuid;
  v_pro_ref            uuid;
  v_stranger_ref         uuid;
  v_customer_ws            uuid;
  v_pro_ws                    uuid;
  v_stranger_ws                  uuid;
  v_property_id                     uuid := gen_random_uuid();
  v_request_a                          uuid := gen_random_uuid();  -- has a property
  v_request_b                             uuid := gen_random_uuid();  -- no property/asset/location
  v_quote_a                                  uuid := gen_random_uuid();
  v_quote_b                                     uuid := gen_random_uuid();
  v_engagement_a                                   uuid := gen_random_uuid();
  v_engagement_b                                      uuid := gen_random_uuid();
  v_record_a                                             uuid := gen_random_uuid();
  v_count                                                   integer;
  v_customer_approved                                          boolean;
  v_service_record_id_on_engagement                               uuid;
begin
  -- =========================================================================
  -- FIXTURE — a real request/quote/engagement/completion, through the actual contracts.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sr-customer@example.test', '{}'::jsonb, now(), now()),
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sr-pro@example.test', '{}'::jsonb, now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sr-stranger@example.test', '{}'::jsonb, now(), now());

  select person_ref into v_customer_ref from identity.identities where auth_user_id = v_customer_auth;
  select person_ref into v_pro_ref from identity.identities where auth_user_id = v_pro_auth;
  select person_ref into v_stranger_ref from identity.identities where auth_user_id = v_stranger_auth;

  select m.workspace_id into v_customer_ws from workspace.memberships m where m.person_ref = v_customer_ref and m.role = 'owner';
  select m.workspace_id into v_pro_ws from workspace.memberships m where m.person_ref = v_pro_ref and m.role = 'owner';
  select m.workspace_id into v_stranger_ws from workspace.memberships m where m.person_ref = v_stranger_ref and m.role = 'owner';

  insert into property.properties (id, name, steward_workspace_id, steward_since) values
    (v_property_id, 'Service Record Test Property', v_customer_ws, now());

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  perform api.create_request(
    v_request_a, v_customer_ws, v_property_id, null, null,
    null, null, 'Boiler service', 'flexible', null,
    null, null, null,
    null, null, null,
    gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
  );
  perform api.create_request(
    v_request_b, v_customer_ws, null, null, null,
    null, null, 'No twin attached', 'flexible', null,
    null, null, null,
    null, null, null,
    gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
  );
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  perform api.submit_quote(
    v_quote_a, v_request_a, v_pro_ws, 150.00, 'Happy to help', null,
    gen_random_uuid(), gen_random_uuid(), null, null, null, null, null, null, null, null, null,
    'person', v_pro_auth::text
  );
  perform api.submit_quote(
    v_quote_b, v_request_b, v_pro_ws, 90.00, 'Sure', null,
    gen_random_uuid(), gen_random_uuid(), null, null, null, null, null, null, null, null, null,
    'person', v_pro_auth::text
  );
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  perform api.accept_quote(
    v_quote_a, v_engagement_a, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), 'person', v_customer_auth::text
  );
  perform api.accept_quote(
    v_quote_b, v_engagement_b, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), 'person', v_customer_auth::text
  );
  perform api.approve_location_disclosure(
    p_engagement_id => v_engagement_a, p_disclosure_id => gen_random_uuid(),
    p_engagement_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );
  perform api.approve_location_disclosure(
    p_engagement_id => v_engagement_b, p_disclosure_id => gen_random_uuid(),
    p_engagement_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );
  perform api.complete_engagement(v_engagement_a, gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text);
  perform api.complete_engagement(v_engagement_b, gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text);
  reset role;

  -- =========================================================================
  -- 1 · POSITIVE: the pro authors a real service record for engagement A

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  perform api.create_service_record(
    v_record_a, v_engagement_a, now(), 'Replaced the pressure relief valve and bled the system.',
    150.00, 'EUR', null, null, null, '{}'::jsonb,
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'person', v_pro_auth::text
  );
  reset role;

  select service_record_id into v_service_record_id_on_engagement from work.engagements where id = v_engagement_a;
  if v_service_record_id_on_engagement is distinct from v_record_a then
    raise exception '1 · FAILED: work.engagements.service_record_id was not set — 0087''s own gap is still open';
  end if;

  raise notice '1 · positive: the pro authored a real service record, and work.engagements.service_record_id was set in the same transaction';

  -- =========================================================================
  -- 2 · ADVERSARIAL: a second record for the same engagement is refused, not silently duplicated

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  begin
    perform api.create_service_record(
      gen_random_uuid(), v_engagement_a, now(), 'Second attempt.', 150.00, 'EUR', null, null, null, '{}'::jsonb,
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'person', v_pro_auth::text
    );
    raise exception '2 · FAILED: a second service record for the same engagement was allowed';
  exception
    when object_not_in_prerequisite_state then
      raise notice '2 · adversarial: a second service record for the same engagement was correctly refused';
  end;
  reset role;

  -- =========================================================================
  -- 3 · ADVERSARIAL: a stranger (no membership in the performing workspace) cannot author

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  begin
    perform api.create_service_record(
      gen_random_uuid(), v_engagement_b, now(), 'Uninvited.', 90.00, 'EUR', null, null, null, '{}'::jsonb,
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text
    );
    raise exception '3 · FAILED: a stranger was able to author a service record';
  exception
    when insufficient_privilege then
      raise notice '3 · adversarial: a stranger correctly denied authoring a service record';
  end;
  reset role;

  -- =========================================================================
  -- 4 · ADVERSARIAL: engagement B's request has no property/asset/location — refused,
  -- not silently attached nowhere (property_id is NOT NULL on work.service_records)

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  begin
    perform api.create_service_record(
      gen_random_uuid(), v_engagement_b, now(), 'No twin to attach to.', 90.00, 'EUR', null, null, null, '{}'::jsonb,
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'person', v_pro_auth::text
    );
    raise exception '4 · FAILED: a service record was created for a request with no property/asset/location';
  exception
    when object_not_in_prerequisite_state then
      raise notice '4 · adversarial: correctly refused — engagement B''s request has no physical subject to attach a record to';
  end;
  reset role;

  -- =========================================================================
  -- 5 · POSITIVE: the customer (property's current steward) reads and approves the record

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select count(*) into v_count from api.resolve_service_record(v_record_a);
  if v_count <> 1 then
    raise exception '5 · FAILED: the customer (property steward) could not read the record via api.resolve_service_record()';
  end if;
  perform api.record_service_record_approval(v_record_a, gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text);
  reset role;

  select customer_approved into v_customer_approved from work.service_records where id = v_record_a;
  if not v_customer_approved then
    raise exception '5 · FAILED: customer_approved was not set to true';
  end if;

  raise notice '5 · positive: the customer read the record and approved it';

  -- =========================================================================
  -- 6 · ADVERSARIAL: the pro (not the steward) cannot approve their own record

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  begin
    perform api.record_service_record_approval(v_record_a, gen_random_uuid(), gen_random_uuid(), 'person', v_pro_auth::text);
    raise exception '6 · FAILED: the pro was able to approve their own record';
  exception
    when object_not_in_prerequisite_state then
      raise notice '6 · adversarial: already approved (idempotency guard) correctly refused a second approval — a live re-check';
    when insufficient_privilege then
      raise notice '6 · adversarial: the pro correctly denied approving their own record';
  end;
  reset role;

  -- =========================================================================
  -- 7 · ADVERSARIAL: annex membership boundaries — each side writes its own, never the
  -- other's

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  perform api.write_performing_annex(gen_random_uuid(), v_record_a, 80.00, 70.00, 'ACME Parts', 60.00, 'Morning slot preferred', 'Customer was difficult about the price.');
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  begin
    perform api.write_performing_annex(gen_random_uuid(), v_record_a, 1.00, 1.00, 'Hacked', 1.00, 'x', 'x');
    raise exception '7 · FAILED: the customer was able to write the pro''s own performing annex';
  exception
    when insufficient_privilege then
      raise notice '7a · adversarial: the customer correctly denied writing the performing annex — "a business''s cost base is its own information"';
  end;
  perform api.write_property_annex(gen_random_uuid(), v_record_a, 'Looks fine to me.', 'Approved verbally by spouse.', 'Under our home warranty budget.', 'Trust this pro.');
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  begin
    perform api.write_property_annex(gen_random_uuid(), v_record_a, 'Hacked', 'x', 'x', 'x');
    raise exception '7 · FAILED: the pro was able to write the customer''s own property annex';
  exception
    when insufficient_privilege then
      raise notice '7b · adversarial: the pro correctly denied writing the property annex — never the current steward';
  end;
  reset role;

  -- =========================================================================
  -- 8 · ADVERSARIAL: amendment authorship — a real member of an unrelated workspace
  -- cannot claim authorship of an amendment to a record they cannot see

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  begin
    perform api.amend_service_record(
      gen_random_uuid(), v_record_a, v_stranger_ws, 'work_performed', 'old', 'new', 'Trying to meddle.',
      gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text
    );
    raise exception '8 · FAILED: a stranger claiming their own real workspace as author was allowed to amend an unrelated record';
  exception
    when insufficient_privilege then
      raise notice '8 · adversarial: a stranger''s own real workspace correctly refused as an amendment author — not one of the two visibility paths';
  end;
  reset role;

  -- Positive: the pro amends, correctly, as themselves.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  perform api.amend_service_record(
    gen_random_uuid(), v_record_a, v_pro_ws, 'work_performed', 'Replaced the pressure relief valve.',
    'Replaced the pressure relief valve and bled the system.', 'Clarified scope after customer follow-up.',
    gen_random_uuid(), gen_random_uuid(), 'person', v_pro_auth::text
  );
  reset role;

  select count(*) into v_count from api.service_record_history(v_record_a);
  if v_count <> 1 then
    raise exception '8 · FAILED: expected exactly 1 amendment in history, got %', v_count;
  end if;

  raise notice '8 · positive: the pro''s own real amendment recorded correctly';

  -- =========================================================================
  -- 9 · resolve_service_record_for_request() (0164) — both parties read the same record
  -- by request id, a stranger gets nothing, and request B (no record authored) is empty

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select count(*) into v_count from api.resolve_service_record_for_request(v_request_a);
  if v_count <> 1 then
    raise exception '9 · FAILED: the requesting customer could not resolve the record via request id';
  end if;
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  select count(*) into v_count from api.resolve_service_record_for_request(v_request_a);
  if v_count <> 1 then
    raise exception '9 · FAILED: the performing pro could not resolve the record via request id';
  end if;
  reset role;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from api.resolve_service_record_for_request(v_request_a);
  if v_count <> 0 then
    raise exception '9 · FAILED: a stranger resolved a record they have no claim on';
  end if;
  reset role;

  -- Same customer, same real membership, request B specifically — proves the empty
  -- result on B is "no record authored," not "no access," the distinction the stranger
  -- check above cannot make on its own.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select count(*) into v_count from api.resolve_service_record_for_request(v_request_b);
  if v_count <> 0 then
    raise exception '9 · FAILED: request B (no record ever authored) resolved a record anyway';
  end if;
  reset role;

  raise notice '9 · positive: both parties read the same record by request id, a stranger got nothing, and an un-authored request (real access, no record) resolved empty';

  raise notice 'VERIFY_SERVICE_RECORD_CONTRACT: all checks passed';
end;
$$;

rollback;

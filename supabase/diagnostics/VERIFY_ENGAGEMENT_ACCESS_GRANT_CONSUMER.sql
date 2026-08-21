-- Verifies 0162_engagement_access_grant_consumer.sql (Platform Activation Slice 2, WP 2.4)
-- with a real request -> quote -> accept flow driven through the actual api.* write
-- contracts (impersonated sessions, exactly the path a real customer and pro take), then
-- the consumer itself invoked exactly as pg_cron invokes it (`set role
-- klussie_consumer_workspace`), then adversarial: privilege boundary, idempotent replay,
-- the deliberate no-property skip, and a genuinely poisoned event reaching quarantine.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ENGAGEMENT_ACCESS_GRANT_CONSUMER.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth       uuid := gen_random_uuid();
  v_pro_auth            uuid := gen_random_uuid();
  v_customer_ref         uuid;
  v_pro_ref                uuid;
  v_customer_ws              uuid;
  v_pro_ws                     uuid;
  v_property_id                  uuid := gen_random_uuid();
  v_location_id                    uuid := gen_random_uuid();
  v_asset_id                         uuid := gen_random_uuid();
  v_request_a                          uuid := gen_random_uuid();  -- has a property
  v_request_b                            uuid := gen_random_uuid();  -- no property/asset/location
  v_quote_a                                uuid := gen_random_uuid();
  v_quote_b                                  uuid := gen_random_uuid();
  v_engagement_a                               uuid := gen_random_uuid();
  v_engagement_b                                 uuid := gen_random_uuid();
  v_membership_a                                   uuid;
  v_expires_at                                       timestamptz;
  v_created_at                                         timestamptz;
  v_occurred_at                                          timestamptz;
  v_count                                                  integer;
  v_bad_event_id                                             uuid := platform.uuid_v7_at(clock_timestamp());
  v_bad_workspace_id                                           uuid;
  v_failure_reason                                               text;
begin
  -- =========================================================================
  -- FIXTURE — a real request/quote/engagement pair, created through the actual client
  -- write contracts, not inserted directly. Request B deliberately carries no property,
  -- asset or location — the skip case.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'consumer-customer@example.test', '{}'::jsonb, now(), now()),
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'consumer-pro@example.test', '{}'::jsonb, now(), now());

  select person_ref into v_customer_ref from identity.identities where auth_user_id = v_customer_auth;
  select person_ref into v_pro_ref from identity.identities where auth_user_id = v_pro_auth;

  -- handle_new_user() already gave each a personal workspace + unscoped owner membership —
  -- reused directly rather than inserting a second, unrelated workspace.
  select m.workspace_id into v_customer_ws
  from workspace.memberships m where m.person_ref = v_customer_ref and m.role = 'owner';
  select m.workspace_id into v_pro_ws
  from workspace.memberships m where m.person_ref = v_pro_ref and m.role = 'owner';

  insert into property.properties (id, name, steward_workspace_id, steward_since) values
    (v_property_id, 'Consumer Test Property', v_customer_ws, now());
  insert into property.locations (id, property_id, name) values
    (v_location_id, v_property_id, 'Kitchen');
  insert into property.assets (id, property_id, location_id, name, lifecycle_state, source) values
    (v_asset_id, v_property_id, v_location_id, 'Boiler', 'active', 'manual');

  -- =========================================================================
  -- REQUEST A -> QUOTE A -> ENGAGEMENT A, as the real customer and pro personas

  -- Parameter counts verified directly against this project's CURRENTLY LIVE signatures
  -- (each of these three has been redefined by a later migration since 0146 first shipped
  -- it — 0154 for create_request, 0150 for submit_quote, 0148 for accept_quote — grepped
  -- and counted fresh rather than trusted from memory).
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
    v_quote_a, v_request_a, v_pro_ws, 150.00, 'Happy to help',
    null,
    gen_random_uuid(), gen_random_uuid(),
    null, null, null,
    null, null, null,
    null, null, null,
    'person', v_pro_auth::text
  );
  perform api.submit_quote(
    v_quote_b, v_request_b, v_pro_ws, 90.00, 'Sure',
    null,
    gen_random_uuid(), gen_random_uuid(),
    null, null, null,
    null, null, null,
    null, null, null,
    'person', v_pro_auth::text
  );
  reset role;

  -- Every conversation-cascade id is unconditionally used inside accept_quote_for_caller
  -- (work.open_conversation_for_engagement is called unconditionally, not only on
  -- auto-accept — 0148's own body, checked directly) — real ids required, not null.
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
  reset role;

  -- =========================================================================
  -- 1 · RUN THE CONSUMER — exactly as pg_cron invokes it

  execute 'set local role klussie_consumer_workspace';
  perform workspace.consume_engagement_access_grants();
  reset role;

  -- =========================================================================
  -- 2 · POSITIVE: engagement A produced a real, correctly-shaped scoped grant

  select id, expires_at, created_at into v_membership_a, v_expires_at, v_created_at
  from workspace.memberships
  where granting_engagement_id = v_engagement_a;

  if v_membership_a is null then
    raise exception '1 · FAILED: engagement A produced no membership at all';
  end if;

  if not exists (
    select 1 from workspace.memberships
    where id = v_membership_a
      and workspace_id = v_customer_ws
      and person_ref = v_pro_ref
      and role = 'contractor'
      and state = 'active'
      and scope = jsonb_build_object('propertyId', v_property_id)
  ) then
    raise exception '1 · FAILED: engagement A''s membership is not shaped as expected (workspace/person/role/state/scope)';
  end if;

  select occurred_at into v_occurred_at from platform.events
  where event_type = 'marketplace.engagement.created' and subject_id = v_engagement_a;

  if abs(extract(epoch from (v_expires_at - v_occurred_at - interval '90 days'))) > 5 then
    raise exception '1 · FAILED: expires_at is not occurred_at + 90 days (got % vs occurred_at %)', v_expires_at, v_occurred_at;
  end if;

  if not exists (
    select 1 from platform.events
    where event_type = 'workspace.membership.joined' and subject_id = v_membership_a
  ) then
    raise exception '1 · FAILED: no workspace.membership.joined event emitted for the new grant';
  end if;

  raise notice '1 · positive: engagement A produced a correctly-shaped scoped grant (role=contractor, scope=propertyId, 90-day expiry from occurred_at, event emitted)';

  -- =========================================================================
  -- 3 · THE DELIBERATE SKIP: engagement B (no property/asset/location) produced nothing

  if exists (select 1 from workspace.memberships where granting_engagement_id = v_engagement_b) then
    raise exception '3 · FAILED: engagement B (no physical subject) produced a membership — should have skipped';
  end if;

  raise notice '3 · adversarial: engagement B (no property/asset/location on its request) correctly produced no grant';

  -- =========================================================================
  -- 4 · IDEMPOTENCY: calling the delegate again for the same engagement is a no-op

  perform workspace.grant_engagement_access(
    v_engagement_a, gen_random_uuid(), gen_random_uuid(), now()
  );

  select count(*) into v_count from workspace.memberships where granting_engagement_id = v_engagement_a;
  if v_count <> 1 then
    raise exception '4 · FAILED: replaying engagement A''s grant produced % rows, expected exactly 1', v_count;
  end if;

  raise notice '4 · adversarial: replaying an already-granted engagement is a correct no-op (still exactly one membership)';

  -- =========================================================================
  -- 5 · PRIVILEGE BOUNDARY: klussie_consumer_workspace can read platform.events, cannot
  -- write workspace.memberships directly — only through the SECURITY DEFINER delegate

  execute 'set local role klussie_consumer_workspace';

  select count(*) into v_count from platform.events where event_type = 'marketplace.engagement.created';
  if v_count < 2 then
    raise exception '5 · FAILED: klussie_consumer_workspace could not read its own events back (got %)', v_count;
  end if;

  begin
    insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
    values (gen_random_uuid(), v_customer_ws, v_pro_ref, 'contractor', 'active', now(), now());
    raise exception '5 · FAILED: klussie_consumer_workspace was able to INSERT into workspace.memberships directly';
  exception
    when insufficient_privilege then
      raise notice '5 · adversarial: klussie_consumer_workspace correctly denied direct INSERT on workspace.memberships (privilege error, as designed)';
  end;

  reset role;

  -- =========================================================================
  -- 6 · CURSOR PERSISTENCE: the run left real, non-null cursor rows behind

  select count(*) into v_count
  from platform.consumer_cursors
  where consumer_name = 'workspace_engagement_access'
    and last_occurred_at is not null and last_event_id is not null;

  if v_count = 0 then
    raise exception '6 · FAILED: no cursor rows advanced for workspace_engagement_access';
  end if;

  raise notice '6 · mechanism: % partition cursor(s) advanced for workspace_engagement_access', v_count;

  -- =========================================================================
  -- 7 · QUARANTINE: a genuinely poisoned event is quarantined, not silently dropped, and
  -- the cursor still advances past it

  v_bad_workspace_id := v_customer_ws;

  -- clock_timestamp() and platform.uuid_v7_at(), not now()/gen_random_uuid(): now() is
  -- frozen for this whole transaction, so every real event above already shares one
  -- identical occurred_at, ordered only by event_id — a plain gen_random_uuid() event_id
  -- has no chronological relationship to the real uuid_v7 ids the cursor already advanced
  -- past and can sort BEFORE them by pure chance, making this fixture flaky rather than a
  -- reliable poisoned-event repro. Callable here only because this diagnostic itself still
  -- runs as postgres at this point (platform.uuid_v7_at is otherwise revoked from every
  -- application role — 0026/0144 — the same posture workspace.grant_engagement_access()
  -- relies on).
  insert into platform.events (
    event_id, event_type, event_version, workspace_id, actor_type, actor_ref,
    subject_type, subject_id, subject_sequence, occurred_at, correlation_id
  ) values (
    v_bad_event_id, 'marketplace.engagement.created', 1, v_bad_workspace_id, 'system', 'diagnostic_fixture',
    'engagement', gen_random_uuid(), 999999, clock_timestamp(), gen_random_uuid()
  );

  execute 'set local role klussie_consumer_workspace';
  perform workspace.consume_engagement_access_grants();
  reset role;

  select failure_reason into v_failure_reason
  from platform.consumer_quarantine
  where consumer_name = 'workspace_engagement_access' and event_id = v_bad_event_id;

  if v_failure_reason is null then
    raise exception '7 · FAILED: the poisoned event (nonexistent engagement) was not quarantined';
  end if;

  raise notice '7 · adversarial: poisoned event correctly quarantined (reason: %)', v_failure_reason;

  -- A second run must not re-quarantine the same event a second time (the cursor moved
  -- past it — attempts stays at 1, not incremented).
  execute 'set local role klussie_consumer_workspace';
  perform workspace.consume_engagement_access_grants();
  reset role;

  select attempts into v_count from platform.consumer_quarantine
  where consumer_name = 'workspace_engagement_access' and event_id = v_bad_event_id;
  if v_count <> 1 then
    raise exception '7 · FAILED: the poisoned event was reprocessed after the cursor already passed it (attempts = %)', v_count;
  end if;

  raise notice '7 · mechanism: the cursor advanced past the poisoned event — it is not re-read or re-quarantined on the next run';

  raise notice 'VERIFY_ENGAGEMENT_ACCESS_GRANT_CONSUMER: all checks passed';
end;
$$;

rollback;

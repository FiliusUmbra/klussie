-- Verifies 0156_submit_review_for_request.sql (Platform Activation Slice 2, WP 2.6) with
-- real data and a real impersonated session: a real customer submits a review on their
-- own completed, dual-written, booked request — a real legacy review row lands, with
-- the real customer and pro auth ids resolved correctly (never caller-supplied), and
-- work.requests.status advances to 'reviewed' in the same call. A stranger cannot.
--
-- Updated for 0181-0184 (WP 2.8, disclosure-consent redesign): work.accept_quote() no
-- longer activates the engagement directly — it lands in 'pending_disclosure', and only
-- the customer's own api.approve_location_disclosure() call moves it to 'active' (and is
-- what now emits marketplace.engagement.created). work.complete_engagement() genuinely
-- refuses a non-active engagement, so that approval call belongs here in setup, run as
-- the real customer, before completion — not as a review-submission check of its own.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SUBMIT_REVIEW_FOR_REQUEST.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth   uuid := gen_random_uuid();
  v_pro_auth        uuid := gen_random_uuid();
  v_stranger_auth   uuid := gen_random_uuid();
  v_customer_ws     uuid := gen_random_uuid();
  v_pro_ws          uuid := gen_random_uuid();
  v_customer_ref    uuid;
  v_pro_ref         uuid;
  v_stranger_ref    uuid;
  v_stranger_ws     uuid := gen_random_uuid();
  v_legacy_request  uuid := gen_random_uuid();
  v_request         uuid := gen_random_uuid();
  v_quote           uuid := gen_random_uuid();
  v_engagement      uuid := gen_random_uuid();
  v_review_row      record;
  v_status          text;
  v_expected_failure boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'submit-review-customer@example.test', jsonb_build_object('full_name', 'Submit Review Customer'), now(), now()),
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'submit-review-pro@example.test', jsonb_build_object('full_name', 'Submit Review Pro'), now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'submit-review-stranger@example.test', jsonb_build_object('full_name', 'Submit Review Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;
  select i.person_ref into v_pro_ref from identity.identities i where i.auth_user_id = v_pro_auth;
  select i.person_ref into v_stranger_ref from identity.identities i where i.auth_user_id = v_stranger_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Submit Review Customer WS'),
    (v_pro_ws, 'professional', 'Submit Review Pro WS'),
    (v_stranger_ws, 'personal', 'Submit Review Stranger WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_pro_ws, v_pro_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_stranger_ws, v_stranger_ref, 'owner', 'active', now(), now());

  insert into public.service_requests (id, customer_id, service_id, category_id, details, status, when_pref, directed_until)
  values (v_legacy_request, v_customer_auth, '00000000-0000-0000-0000-000000000003', 'cleaning', 'Leaking tap', 'completed', 'flexible', null);

  -- public.reviews.pro_id references public.pro_profiles(profile_id) — a real row is
  -- required, not merely a real auth.users row.
  insert into public.pro_profiles (profile_id, pro_type, bio)
  values (v_pro_auth, 'flexi', 'Diagnostic pro for the review submission check');

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Leaking tap', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );
  update work.requests set service_request_id = v_legacy_request where id = v_request;

  perform work.submit_quote(
    p_quote_id => v_quote, p_request_id => v_request, p_offering_workspace_id => v_pro_ws,
    p_price => 80.00, p_message => 'Can do Tuesday',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_pro_auth::text
  );
  perform work.accept_quote(
    p_quote_id => v_quote, p_engagement_id => v_engagement,
    p_event_id => gen_random_uuid(), p_engagement_event_id => gen_random_uuid(), p_declined_event_id => null,
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  -- 0182's own trigger refuses to let engagements.status reach 'active' without a matching
  -- work.location_disclosures row, and that row can only be inserted by the real customer's
  -- own call (it checks workspace.current_memberships() against the requesting workspace) —
  -- api.approve_location_disclosure() is the client-facing delegate; work.* itself is
  -- granted to nobody.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  perform api.approve_location_disclosure(
    p_engagement_id => v_engagement, p_disclosure_id => gen_random_uuid(),
    p_engagement_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );
  reset role;

  perform work.complete_engagement(
    p_engagement_id => v_engagement,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'person', p_actor_ref => v_customer_auth::text
  );

  -- =========================================================================
  -- 1 · The real customer submits a review — a real legacy review lands with the right
  -- customer/pro ids, and the request advances to 'reviewed', atomically

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  perform api.submit_review_for_request(
    v_request, 5, 'Excellent, on time',
    gen_random_uuid(), gen_random_uuid(), 'person', v_customer_auth::text
  );
  reset role;

  select * into v_review_row from public.reviews where request_id = v_legacy_request;
  if v_review_row.customer_id <> v_customer_auth or v_review_row.pro_id <> v_pro_auth or v_review_row.stars <> 5 then
    raise exception '1a · the legacy review has the wrong customer_id/pro_id/stars: %, %, %', v_review_row.customer_id, v_review_row.pro_id, v_review_row.stars;
  end if;

  select status into v_status from work.requests where id = v_request;
  if v_status <> 'reviewed' then
    raise exception '1b · expected the request to advance to reviewed, got %', v_status;
  end if;
  raise notice '1 · a real customer submits a review — the legacy row lands with the right resolved ids, and the request advances to reviewed, atomically';

  -- =========================================================================
  -- 2 · A stranger cannot submit a review on someone else's request

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  v_expected_failure := false;
  begin
    perform api.submit_review_for_request(
      v_request, 1, 'Should never land',
      gen_random_uuid(), gen_random_uuid(), 'person', v_stranger_auth::text
    );
  exception when sqlstate '42501' then
    v_expected_failure := true;
  end;
  reset role;
  if not v_expected_failure then
    raise exception '2 · a stranger submitted a review on someone else''s request';
  end if;

  if exists (select 1 from public.reviews where body = 'Should never land') then
    raise exception '2b · the stranger''s attempted review exists despite the exception';
  end if;
  raise notice '2 · a stranger cannot submit a review on someone else''s request, and no partial write lands';

  raise notice 'VERIFY_SUBMIT_REVIEW_FOR_REQUEST: all checks passed';
end;
$$;

rollback;

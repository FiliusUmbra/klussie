-- Verifies 0152_request_action_helpers.sql (Platform Activation Slice 2, WP 2.6) with
-- real data and real impersonated sessions: both real parties to an engagement resolve
-- it from their own request id; a stranger resolves nothing; the review bridge finds a
-- real legacy review for a dual-written request, and finds nothing for one that has
-- none.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_REQUEST_ACTION_HELPERS.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_auth   uuid := gen_random_uuid();
  v_pro_auth        uuid := gen_random_uuid();
  v_stranger_auth   uuid := gen_random_uuid();
  v_customer_ws     uuid := gen_random_uuid();
  v_pro_ws          uuid := gen_random_uuid();
  v_stranger_ws     uuid := gen_random_uuid();
  v_customer_ref    uuid;
  v_pro_ref         uuid;
  v_stranger_ref    uuid;
  v_legacy_request  uuid := gen_random_uuid();
  v_request         uuid := gen_random_uuid();
  v_quote           uuid := gen_random_uuid();
  v_engagement      uuid := gen_random_uuid();
  v_resolved        uuid;
  v_stars           integer;
  v_row_count       integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'request-action-helpers-customer@example.test', jsonb_build_object('full_name', 'Request Action Helpers Customer'), now(), now()),
    (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'request-action-helpers-pro@example.test', jsonb_build_object('full_name', 'Request Action Helpers Pro'), now(), now()),
    (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'request-action-helpers-stranger@example.test', jsonb_build_object('full_name', 'Request Action Helpers Stranger'), now(), now());

  select i.person_ref into v_customer_ref from identity.identities i where i.auth_user_id = v_customer_auth;
  select i.person_ref into v_pro_ref from identity.identities i where i.auth_user_id = v_pro_auth;
  select i.person_ref into v_stranger_ref from identity.identities i where i.auth_user_id = v_stranger_auth;

  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Request Action Helpers Customer WS'),
    (v_pro_ws, 'professional', 'Request Action Helpers Pro WS'),
    (v_stranger_ws, 'professional', 'Request Action Helpers Stranger WS');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at) values
    (gen_random_uuid(), v_customer_ws, v_customer_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_pro_ws, v_pro_ref, 'owner', 'active', now(), now()),
    (gen_random_uuid(), v_stranger_ws, v_stranger_ref, 'owner', 'active', now(), now());

  -- A dual-written, booked, reviewed request/engagement, with a real legacy review.
  insert into public.service_requests (id, customer_id, service_id, category_id, details, status, when_pref, directed_until)
  values (v_legacy_request, v_customer_auth, '00000000-0000-0000-0000-000000000003', 'cleaning', 'Leaking tap', 'reviewed', 'flexible', null);

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

  -- public.reviews.pro_id references public.pro_profiles(profile_id) — a real row is
  -- required, not merely a real auth.users row.
  insert into public.pro_profiles (profile_id, pro_type, bio)
  values (v_pro_auth, 'flexi', 'Diagnostic pro for the review bridge check');

  insert into public.reviews (request_id, customer_id, pro_id, stars, body)
  values (v_legacy_request, v_customer_auth, v_pro_auth, 5, 'Excellent work, on time');

  -- =========================================================================
  -- 1 · Both real parties resolve the real engagement id from the request id

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_customer_auth)::text, true);
  select api.resolve_engagement_for_request(v_request) into v_resolved;
  reset role;
  if v_resolved <> v_engagement then
    raise exception '1a · the customer resolved %, expected the real engagement %', v_resolved, v_engagement;
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro_auth)::text, true);
  select api.resolve_engagement_for_request(v_request) into v_resolved;
  reset role;
  if v_resolved <> v_engagement then
    raise exception '1b · the pro resolved %, expected the real engagement %', v_resolved, v_engagement;
  end if;
  raise notice '1 · both real parties resolve the real engagement id from the request id';

  -- =========================================================================
  -- 2 · A stranger resolves nothing

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select api.resolve_engagement_for_request(v_request) into v_resolved;
  reset role;
  if v_resolved is not null then
    raise exception '2 · a stranger resolved a real engagement id, expected null';
  end if;
  raise notice '2 · a stranger with no real claim resolves nothing';

  -- =========================================================================
  -- 3 · The review bridge finds the real legacy review for the dual-written request

  select stars into v_stars from api.review_for_request(v_request);
  if v_stars <> 5 then
    raise exception '3 · expected the real review''s 5 stars, got %', v_stars;
  end if;
  raise notice '3 · the review bridge finds the real legacy review, correlated via service_request_id';

  -- =========================================================================
  -- 4 · The review bridge finds nothing for a request with no review

  declare
    v_unreviewed uuid := gen_random_uuid();
  begin
    perform work.create_request(
      p_request_id => v_unreviewed, p_requesting_workspace_id => v_customer_ws,
      p_property_id => null, p_asset_id => null, p_location_id => null,
      p_category_id => null, p_service_id => null, p_details => 'No review yet', p_when_pref => 'flexible', p_budget => 100.00,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_customer_auth::text
    );
    select count(*) into v_row_count from api.review_for_request(v_unreviewed);
    if v_row_count <> 0 then
      raise exception '4 · expected no review for an unreviewed request, found %', v_row_count;
    end if;
  end;
  raise notice '4 · the review bridge finds nothing for a request with no legacy correlation or no review';

  raise notice 'VERIFY_REQUEST_ACTION_HELPERS: all checks passed';
end;
$$;

rollback;

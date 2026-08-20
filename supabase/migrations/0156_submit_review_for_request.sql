-- Platform Activation Slice 2, WP 2.6 — submits a review atomically: the legacy review
-- row (reviews stay legacy, §1.9) and work.mark_request_reviewed()'s own state-machine
-- completion, together, in one call.
--
-- WHY THIS CANNOT BE TWO CLIENT-SIDE CALLS
--
-- public.reviews.request_id needs the legacy request id — work.requests.
-- service_request_id, deliberately kept server-side everywhere else in this cutover
-- (0152's own header: "bookkeeping only... the legacy id itself is never returned to the
-- client"). The client only ever holds the work.requests.id. Two separate calls would
-- also mean two separate places for the id to travel through the client at all, exactly
-- the exposure this slice has avoided everywhere else — one atomic function is the
-- narrower change, not a workaround.
--
-- customer_id/pro_id ARE RESOLVED, NEVER CALLER-SUPPLIED
--
-- auth.uid() is the real, current session's own identity — reliable inside a function
-- reached through a SECURITY DEFINER delegate, since auth.uid() reads session
-- configuration that survives the ownership change, not the calling role. pro_id is
-- resolved from the engagement's own performing_workspace_id via workspace.
-- resolve_owner_auth_user_ids() (0151), restricted to professional workspaces by that
-- function's own design — exactly the shape this call needs and nothing more.

create or replace function work.submit_review_for_request(
  p_request_id      uuid,
  p_stars           integer,
  p_body            text,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_requesting_ws       uuid;
  v_legacy_request_id   uuid;
  v_engagement_id       uuid;
  v_performing_ws       uuid;
  v_pro_auth            uuid;
begin
  select r.requesting_workspace_id, r.service_request_id
    into v_requesting_ws, v_legacy_request_id
  from work.requests r where r.id = p_request_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if v_legacy_request_id is null then
    raise exception
      'work.submit_review_for_request: request % has no correlated legacy row to review', p_request_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select e.id, e.performing_workspace_id into v_engagement_id, v_performing_ws
  from work.engagements e where e.request_id = p_request_id;

  if v_engagement_id is null then
    raise exception
      'work.submit_review_for_request: request % has no engagement to review', p_request_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select auth_user_id into v_pro_auth
  from workspace.resolve_owner_auth_user_ids(array[v_performing_ws]);

  insert into public.reviews (request_id, customer_id, pro_id, stars, body)
  values (v_legacy_request_id, auth.uid(), v_pro_auth, p_stars, p_body);

  perform work.mark_request_reviewed(
    p_request_id => p_request_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.submit_review_for_request(uuid, integer, text, uuid, uuid, platform.actor_type, text) is
  'Submits a review for a caller with a real, active membership in the request''s own requesting workspace. Writes the legacy public.reviews row (reviews stay legacy, §1.9) and completes work.requests'' own state machine (work.mark_request_reviewed()) atomically, in one transaction. customer_id is auth.uid(), never caller-supplied; pro_id is resolved from the engagement''s own performing workspace. Not SECURITY DEFINER itself, granted to nobody, reachable only from api.submit_review_for_request() — but auth.uid() still resolves correctly through that delegate, since it reads session configuration, not the calling role.';

create or replace function api.submit_review_for_request(
  p_request_id uuid, p_stars integer, p_body text,
  p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.submit_review_for_request(p_request_id, p_stars, p_body, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.submit_review_for_request(uuid, integer, text, uuid, uuid, platform.actor_type, text) is
  'Delegate for work.submit_review_for_request() (WP 2.6). The client cutover''s own review submission — replaces two separate legacy calls (insert reviews, then nothing else) with one atomic action that also completes the request''s state machine.';

revoke all on function work.submit_review_for_request(uuid, integer, text, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function api.submit_review_for_request(uuid, integer, text, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.submit_review_for_request(uuid, integer, text, uuid, uuid, platform.actor_type, text) to authenticated;

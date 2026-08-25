-- Fix: continuing the write-path role audit begun in 0173 (marketplace: accept/submit
-- quote) and 0174 (property engine). The remaining Request-engine write functions in
-- 0146/0150/0154/0156 all authorized on "does the caller hold ANY live membership in
-- this workspace" — no role check. A support-access grant (0172) is unscoped within the
-- one workspace it names, so without this fix it would have been sufficient to create a
-- request, withdraw one, decline a quote, complete or cancel an engagement, mark a
-- request reviewed, or submit a review — real customer/professional decisions, not
-- merely reads.
--
-- Fixes seven functions, each redefined with its own body otherwise byte-for-byte
-- identical to its last shipped version — only the membership check gains one
-- additional guard clause:
--
--   work.create_request_for_caller()        (0154 — latest definition; 0146/0150 unchanged before it)
--   work.withdraw_request_for_caller()       (0146)
--   work.decline_quote_for_caller()          (0146)
--   work.complete_engagement_for_caller()    (0146)
--   work.cancel_engagement_for_caller()      (0146 — two-sided: excludes support from BOTH
--                                              the requesting and performing workspace check)
--   work.mark_request_reviewed_for_caller()  (0146)
--   work.submit_review_for_request()         (0156)
--
-- work.accept_quote_for_caller() and work.submit_quote_for_caller() were already fixed
-- in 0173 and are untouched here. Service records and workflow remain unaudited — a
-- real, separate, still-open piece of work (see 0173's and 0174's own headers).

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
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_requesting_workspace_id and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
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

  update work.requests
  set details_json = p_details_json,
      ai_analysis = p_ai_analysis,
      city = p_city
  where id = p_request_id;

  if p_directed_workspace_id is not null then
    update work.requests
    set directed_workspace_id = p_directed_workspace_id,
        directed_until = now() + interval '24 hours',
        auto_accept_max = p_auto_accept_max
    where id = p_request_id;
  end if;

  if p_service_request_id is not null then
    update work.requests
    set service_request_id = p_service_request_id
    where id = p_request_id;
  end if;
end;
$$;

comment on function work.create_request_for_caller(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, jsonb, jsonb, text, uuid, uuid, numeric, uuid, uuid, platform.actor_type, text) is
  'Creates a request for a caller with a real, active, non-support membership in the requesting workspace (0175 — a support-access grant, migration 0172, must never be sufficient to file a request on someone else''s behalf). p_details_json/p_ai_analysis/p_city, p_service_request_id and the directed-booking columns are all patched in via follow-up UPDATEs, the same shape — work.create_request() itself is never asked to carry any of them.';

create or replace function work.withdraw_request_for_caller(
  p_request_id      uuid,
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
  v_requesting_ws uuid;
begin
  select r.requesting_workspace_id into v_requesting_ws from work.requests r where r.id = p_request_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.withdraw_request(
    p_request_id => p_request_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.withdraw_request_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Withdraws a request for a caller with a real, active, non-support membership in its requesting workspace (0175), resolved from the row before checking — never trusting a co-supplied id. Delegates entirely to the unmodified work.withdraw_request().';

create or replace function work.decline_quote_for_caller(
  p_quote_id        uuid,
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
  v_offering_ws uuid;
begin
  select q.offering_workspace_id into v_offering_ws from work.quotes q where q.id = p_quote_id;

  if v_offering_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_offering_ws and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.decline_quote(
    p_quote_id => p_quote_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.decline_quote_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Declines a quote for a caller with a real, active, non-support membership in the offering workspace that sent it (0175), resolved from the row before checking. Delegates entirely to the unmodified work.decline_quote().';

create or replace function work.complete_engagement_for_caller(
  p_engagement_id   uuid,
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
  v_requesting_ws uuid;
begin
  select e.requesting_workspace_id into v_requesting_ws from work.engagements e where e.id = p_engagement_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.complete_engagement(
    p_engagement_id => p_engagement_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.complete_engagement_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Completes an engagement for a caller with a real, active, non-support membership in its requesting workspace (0175), resolved before checking — confirming completion is the customer''s own decision, matching markComplete()''s own shape (src/lib/requests.js). Delegates entirely to the unmodified work.complete_engagement().';

create or replace function work.cancel_engagement_for_caller(
  p_engagement_id   uuid,
  p_reason          text,
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
  v_requesting_ws uuid;
  v_performing_ws uuid;
begin
  select e.requesting_workspace_id, e.performing_workspace_id into v_requesting_ws, v_performing_ws
  from work.engagements e where e.id = p_engagement_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m
    where m.workspace_id in (v_requesting_ws, v_performing_ws) and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.cancel_engagement(
    p_engagement_id => p_engagement_id, p_reason => p_reason,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.cancel_engagement_for_caller(uuid, text, uuid, uuid, platform.actor_type, text) is
  'Cancels an engagement for a caller with a real, active, non-support membership in EITHER its requesting or performing workspace (0175), resolved before checking — deliberately two-sided, 0146''s own header explains why (either party has a real reason to cancel). Delegates entirely to the unmodified work.cancel_engagement().';

create or replace function work.mark_request_reviewed_for_caller(
  p_request_id      uuid,
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
  v_requesting_ws uuid;
begin
  select r.requesting_workspace_id into v_requesting_ws from work.requests r where r.id = p_request_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.mark_request_reviewed(
    p_request_id => p_request_id, p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.mark_request_reviewed_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Marks a request reviewed for a caller with a real, active, non-support membership in its requesting workspace (0175), resolved before checking — reviewing is the customer''s own decision. Delegates entirely to the unmodified work.mark_request_reviewed().';

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
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws and m.role <> 'support'
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
  'Submits a review atomically for a caller with a real, active, non-support membership in the requesting workspace (0175 — a support-access grant, migration 0172, must never be sufficient to leave a review as someone else). Unchanged otherwise from 0156: writes the legacy public.reviews row and completes work.mark_request_reviewed() in one call.';

-- No grant/revoke changes — every function's own access posture (reachable only through
-- its existing api.* delegate) is untouched.

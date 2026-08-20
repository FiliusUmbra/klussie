-- Platform Activation Slice 2, WP 2.6 — two small, dedicated reads the client cutover
-- needs at action time, not display time: resolving a request's own engagement (to
-- complete or cancel it) and bridging to the legacy review a completed request may have
-- (reviews stay legacy, §1.9).
--
-- WHY THESE ARE NEW FUNCTIONS, NOT EXTENSIONS TO EXISTING READ SHAPES
--
-- The obvious alternative — adding engagement_id/service_request_id to
-- resolve_request()'s/my_requests()'s own return shape — was considered and rejected.
-- Both would force every caller of those already-shipped, already-verified functions
-- (WP 2.1) to carry two more columns on every read, for data only ever needed at the
-- moment a customer completes or cancels a booking, or views a review — not on every
-- page load. A dedicated, on-demand read for a dedicated, occasional need is the
-- narrower change, matching this session's own repeated restraint against adding
-- columns "for a caller that only needs them sometimes."
--
-- resolve_engagement_for_request() — TWO-SIDED, THE SAME PREDICATE resolve_request()
-- ALREADY PORTS FROM 0088
--
-- Either party to the engagement may need to resolve it — the requesting workspace to
-- complete or cancel, the performing workspace to cancel (work.cancel_engagement_for_
-- caller(), 0146, is itself already two-sided). Checking only the requesting side here
-- would refuse a pro's own cancel action the moment it tried to resolve which
-- engagement to cancel.
--
-- review_for_request() NEEDS NO MEMBERSHIP CHECK AT ALL — REVIEWS ARE ALREADY PUBLIC
--
-- public.reviews carries its own "reviews are publicly viewable" policy (migration
-- 0001) — this function does not narrow that, it only bridges to it through the one
-- correlation column (work.requests.service_request_id) the client itself is never
-- given directly (kept server-side, the same restraint work.requests.service_request_id
-- has always had — "bookkeeping only," 0085's own words, still true; a caller learns a
-- review's content, never the legacy id itself).

create or replace function work.resolve_engagement_for_request(p_request_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_engagement_id uuid;
begin
  select e.id into v_engagement_id
  from work.engagements e
  where e.request_id = p_request_id
    and (
      e.requesting_workspace_id in (select workspace_id from workspace.current_memberships())
      or e.performing_workspace_id in (select workspace_id from workspace.current_memberships())
    );

  return v_engagement_id;
end;
$$;

comment on function work.resolve_engagement_for_request(uuid) is
  'A request''s own engagement id, for a caller who is a real, active member of either party to it — the two-sided check work.cancel_engagement_for_caller() (0146) already assumes its own caller has satisfied. Returns null, not an error, when no engagement exists yet or the caller has no real claim on one that does — the same "fail toward nothing" read idiom this schema already uses. Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_engagement_for_request().';

create or replace function api.resolve_engagement_for_request(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select work.resolve_engagement_for_request(p_request_id);
$$;

comment on function api.resolve_engagement_for_request(uuid) is
  'Delegate for work.resolve_engagement_for_request() (WP 2.6). The client''s own complete/cancel actions resolve the engagement id here at action time, never carrying it on every read.';

create or replace function work.review_for_request(p_request_id uuid)
returns table (stars integer, body text)
language sql
stable
set search_path = ''
as $$
  select r.stars, r.body
  from work.requests wr
  join public.reviews r on r.request_id = wr.service_request_id
  where wr.id = p_request_id;
$$;

comment on function work.review_for_request(uuid) is
  'Bridges a work.requests row to the legacy review it may have, via service_request_id — reviews stay legacy (§1.9), so this is the correlation, not a new review store. public.reviews'' own "reviews are publicly viewable" policy (0001) already covers who may see the content; this adds no narrower check. Not SECURITY DEFINER, granted to nobody, reachable only from api.review_for_request().';

create or replace function api.review_for_request(p_request_id uuid)
returns table (stars integer, body text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.review_for_request(p_request_id);
$$;

comment on function api.review_for_request(uuid) is
  'Delegate for work.review_for_request() (WP 2.6). The client cutover''s own bridge to a completed request''s legacy review.';

revoke all on function work.resolve_engagement_for_request(uuid) from public, anon, authenticated, service_role;
revoke all on function api.resolve_engagement_for_request(uuid) from public, anon, service_role;
grant execute on function api.resolve_engagement_for_request(uuid) to authenticated;

revoke all on function work.review_for_request(uuid) from public, anon, authenticated, service_role;
revoke all on function api.review_for_request(uuid) from public, service_role;
grant execute on function api.review_for_request(uuid) to anon, authenticated;

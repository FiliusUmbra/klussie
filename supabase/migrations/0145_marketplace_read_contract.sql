-- Platform Activation Slice 2, WP 2.1 — the request/quote/engagement read contracts.
--
-- COMPLETES A CONTRACT DELIBERATELY LEFT UNCHECKED, RATHER THAN REDEFINING ONE WITH A
-- TRUSTED CALLER
--
-- work.my_requests()/resolve_request()/quotes_for_request()/my_quotes()/my_engagements()
-- (0090) trust their p_workspace_id/p_request_id parameters outright — correct at the
-- time, per 0090's own header: "No client caller exists yet... all thirteen functions
-- below are granted to klussie_engine_work only." Checked directly before touching them:
-- zero other call sites exist anywhere in this codebase for any of the five (confirmed by
-- grep — only their own definitions and grant statements in 0090). Unlike WP 1.7/WP
-- 1.10's own write delegates, where an existing trusted internal caller made redefining
-- the shared function in place a real hazard, these five have no such caller to protect.
-- Redefining them in place, to add the check they were always missing a caller to need,
-- is completing 0090's own stated scope boundary — not the forbidden case.
--
-- TWO CALLER-CHECK SHAPES, NOT ONE — WHY resolve_request()/quotes_for_request() DIFFER
-- FROM THE OTHER THREE
--
-- my_requests(p_workspace_id)/my_quotes(p_workspace_id)/my_engagements(p_workspace_id)
-- each take the workspace whose perspective the caller wants as a direct parameter — the
-- check is the same single membership join every Slice 1 read contract already uses
-- (0136's own precedent: `join workspace.current_memberships() m on m.workspace_id =
-- p_workspace_id`). resolve_request(p_request_id)/quotes_for_request(p_request_id) take
-- no workspace parameter at all — a request has a requesting party and, once quoted, one
-- or more offering parties, and the caller's own legitimate claim could be either. This is
-- SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md §1.2's own two-sided shape, ported
-- directly from 0088's already-correct RLS predicate rather than re-derived:
--
--   offering_workspace_id in (select workspace_id from api.current_workspace_memberships())
--   or request_id in (
--     select r.id from work.requests r
--     where r.requesting_workspace_id in (select workspace_id from api.current_workspace_memberships())
--   )
--
-- — adapted here to workspace.current_memberships() (the same helper 0088's own policies
-- and every engine-schema function in this session already call directly; api.
-- current_workspace_memberships() is 0088's client-facing name for the identical
-- resolver, used from RLS policies which run as `authenticated` and cannot reach
-- `workspace` directly — this function already runs inside `work`, which can).
--
-- my_engagements() STAYS SINGLE-SIDED AT THE CALLER-CHECK LEVEL, DESPITE THE ROW FILTER
-- BEING TWO-SIDED
--
-- work.engagements carries both requesting_workspace_id and performing_workspace_id
-- directly (0087) — no join needed, "the simpler both-sides-direct form" §1.2 names for
-- its RLS policy. But my_engagements(p_workspace_id) already asks the caller which
-- workspace's perspective they want, exactly like my_requests()/my_quotes() — the
-- function's own `where e.requesting_workspace_id = p_workspace_id or
-- e.performing_workspace_id = p_workspace_id` (0090, unchanged here) already returns the
-- right rows for that one workspace; the caller-check only needs to confirm the caller
-- really belongs to p_workspace_id, not re-derive which side they're on. A two-sided
-- caller check would be answering a question this function's own parameter already
-- answered.
--
-- NO REGRESSION-BASELINE ROW ADDED — BACKEND ONLY, PER WP 2.1's OWN SCOPE
--
-- docs/engineering/TESTING.md §5/§7 track user-facing components; nothing under
-- src/customer, src/pro or src/home changes in this migration. The client cutover is WP
-- 2.5/2.6, tracked there.

-- =========================================================================
-- 1 · my_requests(p_workspace_id) — single-sided: real membership in p_workspace_id

create or replace function work.my_requests(p_workspace_id uuid)
returns table (id uuid, category_id text, service_id uuid, status text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select r.id, r.category_id, r.service_id, r.status, r.created_at
  from work.requests r
  join workspace.current_memberships() m on m.workspace_id = p_workspace_id
  where r.requesting_workspace_id = p_workspace_id;
$$;

comment on function work.my_requests(uuid) is
  'Every request the given workspace has made, for a caller with a real, active membership in it. Redefined in WP 2.1 to add that check — 0090''s own version trusted the parameter outright, correct at the time (no caller existed).';

-- =========================================================================
-- 2 · resolve_request(p_request_id) — two-sided: requesting workspace, or any workspace
-- that has quoted on it

create or replace function work.resolve_request(p_request_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select r.id, r.requesting_workspace_id, r.property_id, r.asset_id, r.location_id,
         r.category_id, r.service_id, r.details, r.when_pref, r.budget,
         r.status, r.workflow_instance_id, r.created_at, r.updated_at
  from work.requests r
  where r.id = p_request_id
    and (
      r.requesting_workspace_id in (select workspace_id from workspace.current_memberships())
      or r.id in (
        select q.request_id from work.quotes q
        where q.offering_workspace_id in (select workspace_id from workspace.current_memberships())
      )
    );
$$;

comment on function work.resolve_request(uuid) is
  'One request, for a caller whose real membership is either the requesting workspace or a workspace that has quoted on it — SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md §1.2''s two-sided shape, ported from 0088''s own RLS predicate. Redefined in WP 2.1 to add this check; 0090''s own version trusted p_request_id outright.';

-- =========================================================================
-- 3 · quotes_for_request(p_request_id) — two-sided, the exact §1.2 predicate

create or replace function work.quotes_for_request(p_request_id uuid)
returns table (id uuid, offering_workspace_id uuid, price numeric, message text, status text, sent_at timestamptz, responded_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select q.id, q.offering_workspace_id, q.price, q.message, q.status, q.sent_at, q.responded_at
  from work.quotes q
  where q.request_id = p_request_id
    and (
      q.offering_workspace_id in (select workspace_id from workspace.current_memberships())
      or q.request_id in (
        select r.id from work.requests r
        where r.requesting_workspace_id in (select workspace_id from workspace.current_memberships())
      )
    )
  order by q.sent_at;
$$;

comment on function work.quotes_for_request(uuid) is
  'Every quote on a request, for a caller whose real membership is either an offering workspace on one of them or the requesting workspace — 0088''s own RLS predicate, ported rather than re-derived. Redefined in WP 2.1 to add this check; 0090''s own version trusted p_request_id outright.';

-- =========================================================================
-- 4 · my_quotes(p_workspace_id) — single-sided: real membership in p_workspace_id

create or replace function work.my_quotes(p_workspace_id uuid)
returns table (id uuid, request_id uuid, price numeric, status text, sent_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select q.id, q.request_id, q.price, q.status, q.sent_at
  from work.quotes q
  join workspace.current_memberships() m on m.workspace_id = p_workspace_id
  where q.offering_workspace_id = p_workspace_id;
$$;

comment on function work.my_quotes(uuid) is
  'Every quote the given workspace has sent, for a caller with a real, active membership in it. Redefined in WP 2.1 to add that check; 0090''s own version trusted the parameter outright.';

-- =========================================================================
-- 5 · my_engagements(p_workspace_id) — single-sided at the caller-check level; see this
-- migration's own header for why the row filter's own two-sidedness does not change that

create or replace function work.my_engagements(p_workspace_id uuid)
returns table (id uuid, request_id uuid, requesting_workspace_id uuid, performing_workspace_id uuid, agreed_price numeric, status text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select e.id, e.request_id, e.requesting_workspace_id, e.performing_workspace_id, e.agreed_price, e.status, e.created_at
  from work.engagements e
  join workspace.current_memberships() m on m.workspace_id = p_workspace_id
  where e.requesting_workspace_id = p_workspace_id or e.performing_workspace_id = p_workspace_id;
$$;

comment on function work.my_engagements(uuid) is
  'Every engagement the given workspace holds, on either side, for a caller with a real, active membership in it. Redefined in WP 2.1 to add that check; 0090''s own version trusted the parameter outright.';

-- =========================================================================
-- API DELEGATES — thin SECURITY DEFINER pass-throughs, the same shape as
-- api.locations_for_property() (0136) and every read switch since Epic 07. None carry
-- any logic of their own.

create or replace function api.my_requests(p_workspace_id uuid)
returns table (id uuid, category_id text, service_id uuid, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_requests(p_workspace_id);
$$;

create or replace function api.resolve_request(p_request_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.resolve_request(p_request_id);
$$;

create or replace function api.quotes_for_request(p_request_id uuid)
returns table (id uuid, offering_workspace_id uuid, price numeric, message text, status text, sent_at timestamptz, responded_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.quotes_for_request(p_request_id);
$$;

create or replace function api.my_quotes(p_workspace_id uuid)
returns table (id uuid, request_id uuid, price numeric, status text, sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_quotes(p_workspace_id);
$$;

create or replace function api.my_engagements(p_workspace_id uuid)
returns table (id uuid, request_id uuid, requesting_workspace_id uuid, performing_workspace_id uuid, agreed_price numeric, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_engagements(p_workspace_id);
$$;

comment on function api.my_requests(uuid) is
  'The Marketplace engine''s client-facing delegate for a workspace''s own requests (WP 2.1). Delegates entirely to work.my_requests(), which holds all the logic.';
comment on function api.resolve_request(uuid) is
  'The Marketplace engine''s client-facing delegate for one request, two-sided (WP 2.1). Delegates entirely to work.resolve_request(), which holds all the logic.';
comment on function api.quotes_for_request(uuid) is
  'The Marketplace engine''s client-facing delegate for a request''s quotes, two-sided (WP 2.1). Delegates entirely to work.quotes_for_request(), which holds all the logic.';
comment on function api.my_quotes(uuid) is
  'The Marketplace engine''s client-facing delegate for a workspace''s own quotes (WP 2.1). Delegates entirely to work.my_quotes(), which holds all the logic.';
comment on function api.my_engagements(uuid) is
  'The Marketplace engine''s client-facing delegate for a workspace''s own engagements, either side (WP 2.1). Delegates entirely to work.my_engagements(), which holds all the logic.';

-- =========================================================================
-- ACCESS — `authenticated` already holds USAGE on schema api (0031); not re-granted here.
-- The five work.* functions keep 0090's own revoke-from-everyone posture: create or
-- replace does not reset existing grants, and none is added here.

revoke all on function api.my_requests(uuid) from public, anon, service_role;
revoke all on function api.resolve_request(uuid) from public, anon, service_role;
revoke all on function api.quotes_for_request(uuid) from public, anon, service_role;
revoke all on function api.my_quotes(uuid) from public, anon, service_role;
revoke all on function api.my_engagements(uuid) from public, anon, service_role;

grant execute on function api.my_requests(uuid) to authenticated;
grant execute on function api.resolve_request(uuid) to authenticated;
grant execute on function api.quotes_for_request(uuid) to authenticated;
grant execute on function api.my_quotes(uuid) to authenticated;
grant execute on function api.my_engagements(uuid) to authenticated;

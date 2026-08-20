-- Platform Activation Slice 2, WP 2.6 — the reverse of work.requests.service_request_id:
-- given a legacy request id, find its correlated work.requests row, if one exists.
--
-- WHY THIS EXISTS — fetchProLeads() STAYS LEGACY, SO A PRO QUOTING ONLY HAS A LEGACY ID
--
-- Provider Intelligence stays legacy (§1.7) — fetchProLeads() reads
-- public.service_requests directly, so a lead's own id, everywhere it reaches the
-- client, is a legacy id, never a work.requests.id. Submitting a quote must dual-write
-- (0150's own finding: pro_matches_request() must keep seeing new activity) into BOTH
-- public.quotes (keyed by the legacy request id, already on hand) AND work.quotes
-- (keyed by work.requests.id) — the second insert needs the correlated work.requests
-- row's own id, which the client does not have without asking for it.
--
-- A REAL, HONEST GAP THIS FUNCTION CAN RETURN NULL FOR, ON PURPOSE
--
-- A legacy request created before this slice's own dual-write went live (or, going
-- forward, any legacy row created outside api.create_request()'s own dual-write path)
-- has no correlated work.requests row at all. This function returns null for exactly
-- that case rather than erroring — src/lib/requests.js's own sendQuote() (WP 2.6) reads
-- a null result as "write to legacy only, work.* has nothing to dual-write into for this
-- one," a graceful degradation rather than a broken quote submission.
--
-- NO MEMBERSHIP CHECK — THE SAME REASONING resolve_public_professional_workspace() (0065)
-- ALREADY HOLDS
--
-- The result reveals only whether a correlated internal id exists, never any request
-- content — the caller is about to call api.submit_quote_for_caller() next, which has
-- its own real check. Granted to authenticated only (not anon): only a signed-in pro
-- ever reaches this call site.

create or replace function work.resolve_work_request_for_legacy(p_service_request_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select r.id from work.requests r where r.service_request_id = p_service_request_id;
$$;

comment on function work.resolve_work_request_for_legacy(uuid) is
  'The work.requests row correlated to a legacy service_requests id, if the dual-write (0150) ever created one — null otherwise, a real and honest possibility for any legacy row that predates it. Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_work_request_for_legacy().';

create or replace function api.resolve_work_request_for_legacy(p_service_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select work.resolve_work_request_for_legacy(p_service_request_id);
$$;

comment on function api.resolve_work_request_for_legacy(uuid) is
  'Delegate for work.resolve_work_request_for_legacy() (WP 2.6). sendQuote()''s own dual-write uses this to find where to also write in work.quotes, before calling api.submit_quote().';

revoke all on function work.resolve_work_request_for_legacy(uuid) from public, anon, authenticated, service_role;
revoke all on function api.resolve_work_request_for_legacy(uuid) from public, anon, service_role;
grant execute on function api.resolve_work_request_for_legacy(uuid) to authenticated;

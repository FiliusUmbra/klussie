-- Epic 12 WP05 — backfill: every real request, quote and booked engagement into the new
-- schema.
--
-- Step 2 of the migration pattern (roadmap §3): the new structure is populated and
-- still unused. public.service_requests/quotes remain fully authoritative — nothing
-- here writes back to them, and nothing yet reads work.requests/quotes/engagements.
--
-- REUSES EPIC 03's OWN ALREADY-RESOLVED workspace_id COLUMNS, RATHER THAN RE-DERIVING
-- THE IDENTITY -> MEMBERSHIP -> WORKSPACE CHAIN A THIRD TIME
--
-- migration 0032 added workspace_id to both public.service_requests and public.quotes;
-- migration 0035 backfilled it via the identity -> membership -> workspace chain,
-- documented there as "the requesting workspace is always the customer's Personal
-- Workspace... PLATFORM_DOMAIN_MODEL.md §14.3's own stated trade-off." Re-deriving that
-- chain here would risk a second, silently different answer to a question Epic 03
-- already answered and this codebase already reads from in two live switches
-- (fetchCustomerRequests, fetchHouseholdItems). This backfill simply reads the columns
-- Epic 03 already resolved.
--
-- NO PROPERTY, ASSET OR LOCATION LINK — A REAL, NAMED GAP, NOT AN OVERSIGHT
--
-- public.service_requests predates Epics 05-07 entirely; nothing in the legacy schema
-- ties a request to a real property, asset or location row. work.requests.property_id/
-- asset_id/location_id (0085) are left null for every backfilled row — "the platform's
-- structural advantage" of a request carrying real physical context (§14.3) does not
-- retroactively apply to requests made before that context existed. A new request,
-- created after this epic's future write contract has a real caller, can carry it; an
-- old one cannot be given context it was never asked for.
--
-- ENGAGEMENTS ARE BACKFILLED ONLY FOR REQUESTS WITH A REAL ACCEPTED QUOTE
--
-- status = 'cancelled' rows are excluded from the engagement backfill entirely — nothing
-- in the current product ever sets that status (checked: no writer in src/lib/requests.js),
-- so no real row exercises it, and a cancelled request never reached commitment in the
-- sense an engagement represents. completed_at is approximated from the request's own
-- updated_at, the best available timestamp for "when this last changed status" — legacy
-- has no dedicated completion timestamp.

-- =========================================================================
-- 1 · REQUESTS

insert into work.requests (
  id, requesting_workspace_id, property_id, asset_id, location_id,
  category_id, service_id, details, when_pref, budget, status,
  service_request_id, created_at, updated_at
)
select
  platform.uuid_v7_at(sr.created_at), sr.workspace_id, null, null, null,
  sr.category_id, sr.service_id, sr.details, sr.when_pref, sr.budget, sr.status,
  sr.id, sr.created_at, sr.updated_at
from public.service_requests sr
where sr.workspace_id is not null
  and not exists (
    select 1 from work.requests wr where wr.service_request_id = sr.id
  );

-- =========================================================================
-- 2 · QUOTES

insert into work.quotes (
  id, request_id, offering_workspace_id, price, message, status,
  sent_at, responded_at, legacy_quote_id
)
select
  platform.uuid_v7_at(q.sent_at), wr.id, q.workspace_id, q.price, q.message, q.status,
  q.sent_at, q.responded_at, q.id
from public.quotes q
join work.requests wr on wr.service_request_id = q.request_id
where q.workspace_id is not null
  and not exists (
    select 1 from work.quotes wq where wq.legacy_quote_id = q.id
  );

-- =========================================================================
-- 3 · ENGAGEMENTS — only requests with a real accepted quote, status in
-- ('booked', 'completed', 'reviewed'); see this migration's own header for why
-- 'cancelled' is excluded.

insert into work.engagements (
  id, request_id, quote_id, requesting_workspace_id, performing_workspace_id,
  agreed_price, status, completed_at, created_at
)
select
  platform.uuid_v7_at(coalesce(q_accepted.responded_at, sr.updated_at)),
  wr.id, wq.id, wr.requesting_workspace_id, wq.offering_workspace_id,
  wq.price,
  case when sr.status in ('completed', 'reviewed') then 'completed' else 'active' end,
  case when sr.status in ('completed', 'reviewed') then sr.updated_at else null end,
  coalesce(q_accepted.responded_at, sr.updated_at)
from public.service_requests sr
join work.requests wr on wr.service_request_id = sr.id
join public.quotes q_accepted on q_accepted.request_id = sr.id and q_accepted.status = 'accepted'
join work.quotes wq on wq.legacy_quote_id = q_accepted.id
where sr.status in ('booked', 'completed', 'reviewed')
  and sr.booked_pro_id is not null
  and not exists (
    select 1 from work.engagements we where we.request_id = wr.id
  );

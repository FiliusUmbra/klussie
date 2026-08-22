-- Platform Activation Slice 3, WP 3.0 follow-up — the one read WP 3.0 (0163) left the
-- client no way to reach: "does this request's engagement have a Service Record yet,
-- and if so what does it say."
--
-- THE GAP, FOUND WHILE WIRING WP 3.2 (the customer's own read view)
--
-- 0163 shipped ten api.* functions, but every one of them needs a service_record_id (or
-- a workspace_id, for my_service_records — itself missing request_id on its own return
-- shape, so still no way back to "this specific request") the client does not yet have.
-- work.engagements.service_record_id — the one column that answers "does a record exist
-- for this job" — is not exposed by any existing read: work.my_engagements() (0145)
-- returns id/request_id/requesting_workspace_id/performing_workspace_id/agreed_price/
-- status/created_at, no service_record_id.
--
-- NOT A FIX TO 0145 — A NEW, DEDICATED READ, MATCHING 0152's OWN ESTABLISHED IDIOM
--
-- 0152's own header (work.resolve_engagement_for_request()) already rejected widening an
-- existing, shipped read's shape for an occasional need: "adding engagement_id/
-- service_request_id to resolve_request()'s/my_requests()'s own return shape... forces
-- every caller... to carry two more columns... for data only ever needed" sometimes.
-- The identical reasoning applies here, more strongly — my_engagements() is a list read;
-- growing it by a nullable uuid most rows will never populate is the same shape of
-- change 0152 already turned down once. A new, single-purpose function, two-sided the
-- same way resolve_engagement_for_request() is, is the narrower change.
--
-- RETURNS THE FULL SHARED CORE, NOT JUST AN ID — this one IS needed at display time
-- (RequestDetailSheet.jsx's own completed/reviewed segment, rendered on open, not on an
-- occasional action), unlike resolve_engagement_for_request()'s "at action time" case.
-- Returning the full row in one round trip, rather than an id the client immediately
-- turns around and passes to api.resolve_service_record(), avoids a second network call
-- for the one screen that always needs the whole thing.

create or replace function work.resolve_service_record_for_request(p_request_id uuid)
returns table (
  id                      uuid,
  property_id             uuid,
  asset_id                uuid,
  location_id             uuid,
  performing_workspace_id uuid,
  performed_at            timestamptz,
  work_performed          text,
  agreed_price            numeric,
  price_currency          text,
  warranty_until          date,
  customer_approved       boolean,
  customer_approved_at    timestamptz,
  ai_summary              text,
  recommendations         text,
  content                 jsonb,
  created_at              timestamptz
)
language sql
stable
set search_path = ''
as $$
  select sr.id, sr.property_id, sr.asset_id, sr.location_id, sr.performing_workspace_id,
         sr.performed_at, sr.work_performed, sr.agreed_price, sr.price_currency, sr.warranty_until,
         sr.customer_approved, sr.customer_approved_at, sr.ai_summary, sr.recommendations,
         sr.content, sr.created_at
  from work.engagements e
  join work.service_records sr on sr.id = e.service_record_id
  where e.request_id = p_request_id
    and (
      e.requesting_workspace_id in (select workspace_id from workspace.current_memberships())
      or e.performing_workspace_id in (select workspace_id from workspace.current_memberships())
    );
$$;

comment on function work.resolve_service_record_for_request(uuid) is
  'Bridges a request to its Service Record''s shared core, two-sided (same predicate as work.resolve_engagement_for_request(), 0152), for a caller with a real, active membership on either side of the engagement. Zero rows, not an error, when no engagement exists, no record has been authored yet, or the caller has no real claim on one that does — the same "fail toward nothing shown" idiom this schema already uses everywhere. Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_service_record_for_request().';

create or replace function api.resolve_service_record_for_request(p_request_id uuid)
returns table (
  id uuid, property_id uuid, asset_id uuid, location_id uuid, performing_workspace_id uuid,
  performed_at timestamptz, work_performed text, agreed_price numeric, price_currency text,
  warranty_until date, customer_approved boolean, customer_approved_at timestamptz,
  ai_summary text, recommendations text, content jsonb, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.resolve_service_record_for_request(p_request_id);
$$;

comment on function api.resolve_service_record_for_request(uuid) is
  'Delegate for work.resolve_service_record_for_request() (WP 3.0 follow-up). RequestDetailSheet.jsx''s own completed/reviewed segment reads this on open to show a real record, or an educating empty state when none exists yet.';

revoke all on function work.resolve_service_record_for_request(uuid) from public, anon, authenticated, service_role;
revoke all on function api.resolve_service_record_for_request(uuid) from public, anon, service_role;
grant execute on function api.resolve_service_record_for_request(uuid) to authenticated;

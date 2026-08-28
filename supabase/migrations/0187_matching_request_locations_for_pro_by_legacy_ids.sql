-- Beta priority: "the professional sees only approximate location information during
-- quotation" (founder mandate, professional capability #3) -- named, deliberately
-- deferred in WP 2.8 (PLATFORM_ACTIVATION_PROGRAMME.md, migration 0185/0186's own PR):
-- api.matching_requests_for_pro() (0183) has existed since the disclosure-consent slice
-- shipped, but fetchProLeads() (src/lib/requests.js) stays on legacy service_requests by
-- design (this file's own header, WP 2.6) and carries no bridge back to it -- so a pro's
-- lead list has shown zero location signal at all, ever, not even the free-text city
-- legacy already carries alongside the request.
--
-- THE BRIDGE, MIRRORING request_lifecycle_statuses()'s OWN ESTABLISHED SHAPE
--
-- request_lifecycle_statuses() (0150) already solved the identical problem for status:
-- take a batch of legacy ids fetchProLeads() already has on hand, return whatever each
-- one's correlated work.requests row can tell the caller, keyed back by the legacy id
-- the client already uses everywhere else. This does the same for location, reusing
-- api.matching_requests_for_pro()'s own select list and pro_services authorization join
-- verbatim -- the only structural change is filtering by r.service_request_id = any(...)
-- instead of by status, since fetchProLeads()'s own legacy query already applied the
-- status filter before this function is ever called.
--
-- Same enforcement as 0183's own comment: this function's select list IS the privacy
-- boundary -- street, house number, postcode, coordinates and access instructions are
-- never selected here, the same restraint api.matching_requests_for_pro() already applies.
-- The pro_services join is what stops a pro who doesn't offer this service, or isn't a
-- real workspace member, from resolving a legacy id into anything at all -- a lead not
-- matching returns simply no row, not an error.

create or replace function api.matching_request_locations_for_pro(p_service_request_ids uuid[])
returns table (
  service_request_id uuid,
  municipality text,
  country text,
  distance_band text,
  property_type text,
  quote_prep_notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.service_request_id, p.municipality, p.country,
    case
      when p.latitude is null or p.longitude is null then null
      else 'unknown'
    end as distance_band,
    p.property_type,
    p.quote_prep_notes
  from work.requests r
  join public.pro_services ps
    on ps.service_id = r.service_id
   and ps.workspace_id in (select workspace_id from workspace.current_memberships())
  left join property.properties p
    on p.id = coalesce(
      r.property_id,
      (select a.property_id from property.assets a where a.id = r.asset_id),
      (select l.property_id from property.locations l where l.id = r.location_id)
    )
  where r.service_request_id = any(p_service_request_ids);
$$;

comment on function api.matching_request_locations_for_pro(uuid[]) is
  'Beta priority: approximate location during quoting, for the pro leads list (WP 2.6''s legacy-keyed fetchProLeads()). Same select list and pro_services authorization join as api.matching_requests_for_pro() (0183) -- never street/house number/postcode/coordinates/access instructions -- keyed back by the legacy service_request_id the client already has, the same bridge shape request_lifecycle_statuses() (0150) already established for status. Single-layer, directly in api, matching api.matching_requests_for_pro()''s own shape exactly (0183) -- no separate work.* function this delegates to.';

revoke all on function api.matching_request_locations_for_pro(uuid[]) from public, anon, service_role;
grant execute on function api.matching_request_locations_for_pro(uuid[]) to authenticated;

-- Corrective migration — closes a real authorization gap found live, 2026-08-31, during a
-- systematic read-only authorization audit of staging.
--
-- THE BUG, PROVEN LIVE
--
-- property.my_properties() (0041, grown by 0185) and property.set_property_address_for_caller()
-- (0185) both authorize on "the caller holds any live membership in the property's steward
-- workspace" — workspace.current_memberships() filtered only by state = 'active' and
-- expiry, with no further predicate. 0162 (WP 2.4) later gave workspace.grant_engagement_access()
-- a real, legitimate reason to mint a membership into a *customer's* own workspace for a
-- *professional* who completed a job there — a genuinely different relationship from
-- "steward of this home," scoped for up to 90 days, and never meant to carry the same
-- rights as living there.
--
-- Both functions' own read path never anticipated that second membership shape. Proven
-- live against staging with a real professional's own session token: api.my_properties()
-- returned a real customer's property twice, full exact address included (street, house
-- number, postcode, municipality) — through a function whose own comment says "every
-- property the caller currently *stewards*." property.set_property_address_for_caller()'s
-- own comment claims "no contractor, scoped or not, ever reaches this" while its actual
-- check is the identical unfiltered predicate — the same gap on the write side, undetected
-- because nothing had exercised it yet.
--
-- THE PREDICATE — PROVENANCE, NOT ROLE
--
-- workspace.memberships.role is a deliberately open vocabulary (0030's own header: "the
-- vocabulary is not closed," no check constraint) that already holds at least 'owner',
-- 'contractor' and 'support' (0172/0179) — hardcoding a role-name allowlist or denylist
-- here would both under- and over-match as that vocabulary grows. workspace.memberships.
-- granting_engagement_id (0162) is the one column built for exactly this distinction: "Set
-- only for a scoped grant created by workspace.grant_engagement_access() (WP 2.4) from a
-- real marketplace.engagement.created event. Null for every other membership" (0162's own
-- column comment) — an exhaustive, self-documenting provenance marker, not an inference.
-- Excluding rows where it is not null is the narrowest predicate that removes exactly the
-- engagement-derived grant and nothing else: every native membership (owner, or any future
-- role workspace.memberships ever holds that is not engagement-derived) keeps working
-- unchanged, and support-role grants (also granting_engagement_id is null — a genuinely
-- separate, already-audited, deliberately time-boxed access mechanism this migration does
-- not touch, in or out of scope) are untouched either way.
--
-- Both functions still call workspace.current_memberships() (0031) for the active/expiry/
-- erasure resolution — unedited, per this session's own standing rule against touching a
-- previously shipped migration — and add one join back to workspace.memberships by the
-- membership_id it already returns, to read the one column current_memberships() does not
-- expose. No new isolation predicate is introduced; the existing one is joined against once
-- more for a fact it was never asked to carry.
--
-- DEDUPLICATION
--
-- The same live probe also surfaced staging's real property row returned *twice* for the
-- one engagement-derived case above — the identical "more than one live membership into the
-- same workspace" shape 0188 already fixed for workspace.list_my_workspaces(). Fixed here
-- the same way: distinct on (p.id), freshest membership_id wins, for the same uuidv7-
-- ordering reason 0188's own comment gives. This migration does not touch 0188 or its own
-- function.

create or replace function property.my_properties()
returns table (
  id                 uuid,
  name               text,
  jurisdiction       text,
  steward_workspace_id uuid,
  steward_since      timestamptz,
  street             text,
  house_number       text,
  postcode           text,
  municipality       text,
  country            text,
  property_type      text,
  quote_prep_notes   text
)
language sql
stable
set search_path = ''
as $$
  select distinct on (p.id)
    p.id, p.name, p.jurisdiction, p.steward_workspace_id, p.steward_since,
    p.street, p.house_number, p.postcode, p.municipality, p.country, p.property_type, p.quote_prep_notes
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  join workspace.memberships wm on wm.id = m.membership_id and wm.granting_engagement_id is null
  order by p.id, wm.id desc;
$$;

comment on function property.my_properties() is
  'Every property the caller holds a genuine, native membership in the steward workspace of (roadmap WP 05.04, grew the address/quote-prep columns 0182 added, WP 1.10/0185). One row per property (0189): deduplicated by property id, freshest membership_id wins. Deliberately excludes a membership minted by workspace.grant_engagement_access() (0162, granting_engagement_id is not null) -- an engagement-derived contractor grant is real and scoped for its own purpose (service-record, document and conversation access, all untouched by this migration), but it is not stewardship and must never surface this property or its exact address through the caller''s own "my properties" list. Latitude/longitude deliberately excluded from this list, same restraint as api.matching_requests_for_pro(): never selected outside a server-side distance calculation. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_properties().';

create or replace function property.set_property_address_for_caller(
  p_property_id      uuid,
  p_street           text,
  p_house_number     text,
  p_postcode         text,
  p_municipality     text,
  p_country          text,
  p_property_type    text,
  p_quote_prep_notes text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward_workspace_id uuid;
begin
  select steward_workspace_id into v_steward_workspace_id
  from property.properties where id = p_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.set_property_address_for_caller: property % does not exist', p_property_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not exists (
    select 1
    from workspace.current_memberships() m
    join workspace.memberships wm on wm.id = m.membership_id and wm.granting_engagement_id is null
    where m.workspace_id = v_steward_workspace_id
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  update property.properties
  set street = p_street,
      house_number = p_house_number,
      postcode = p_postcode,
      municipality = p_municipality,
      country = coalesce(p_country, 'BE'),
      property_type = p_property_type,
      quote_prep_notes = p_quote_prep_notes,
      updated_at = now()
  where id = p_property_id;
end;
$$;

comment on function property.set_property_address_for_caller(uuid, text, text, text, text, text, text, text) is
  'Beta-completion slice: the write path 0182 added the columns for but never a function to reach (WP 1.10/0185). Native-steward-only, checked against a genuine (granting_engagement_id is null) row in workspace.current_memberships() -- an engagement-derived contractor, scoped or not, never reaches this (0189: the previous version of this comment claimed this already; the check underneath it did not yet enforce it -- fixed here, not merely re-asserted). Latitude/longitude are deliberately not parameters here -- no geocoding provider is wired yet (plan §15.9); they stay null until one is, and api.matching_requests_for_pro()''s own distance_band already degrades correctly when they are.';

-- Ownership, revokes and grants are unchanged from 0185 -- neither function's signature,
-- owner, or client-facing surface moved, only the logic inside each. Restated here,
-- idempotently, so this migration is a complete, self-contained record of the resulting
-- grant state rather than one that depends on 0185 having run first in the same session.

revoke all on function property.my_properties() from public, anon, authenticated, service_role;
revoke all on function property.set_property_address_for_caller(uuid, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;

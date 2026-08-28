-- Founder mandate, beta-completion slice: 0182-0184 built the disclosure-consent schema
-- and behavior but left the address itself with no write path at all -- checked directly,
-- no migration through 0184 ever adds an UPDATE-shaped function touching
-- property.properties' own street/house_number/postcode/municipality/country/
-- property_type/quote_prep_notes/latitude/longitude columns, and api.my_properties()
-- (0041) still returns the pre-0182 column list, so the client cannot even read them back.
-- Without this, "select My Home... receive quotes without prematurely exposing the exact
-- address... explicitly approve exact-location disclosure" has no address for the
-- customer to ever supply. Corrective, additive-only -- 0041/0143 are not edited.
--
-- Scope: the steward alone may set a property's own address (property.properties' RLS
-- already restricts *reads* to the steward workspace or a scoped contractor via
-- api.current_property_scope() -- 0182's own header; this migration only adds a write,
-- checked the same way every other *_for_caller() write in this codebase checks its own
-- caller, not by a new RLS policy). No contractor, scoped or not, ever gets a write path
-- to a customer's own property through this function.

-- =========================================================================
-- 1 · api.my_properties() GROWS THE ADDRESS/QUOTE-PREP COLUMNS 0182 ADDED
--
-- Purely additive to the returned row shape -- every existing caller that destructures
-- {id, name} off this (src/lib/homeInventory.js's own loadProperty()) is unaffected.
--
-- `create or replace function` cannot change a function's OUT-parameter row type
-- (Postgres: "cannot change return type of existing function") -- checked directly
-- against staging, which rejected this migration on first application. Both functions are
-- dropped and recreated instead; the body is otherwise the same additive change 0173-0179's
-- own `create or replace function` idiom would have used had the signature not grown.

drop function if exists api.my_properties();
drop function if exists property.my_properties();

create or replace function property.my_properties()
returns table (
  id                    uuid,
  name                  text,
  jurisdiction          text,
  steward_workspace_id  uuid,
  steward_since         timestamptz,
  street                text,
  house_number          text,
  postcode              text,
  municipality          text,
  country               text,
  property_type         text,
  quote_prep_notes      text
)
language sql
stable
set search_path = ''
as $$
  select
    p.id, p.name, p.jurisdiction, p.steward_workspace_id, p.steward_since,
    p.street, p.house_number, p.postcode, p.municipality, p.country, p.property_type, p.quote_prep_notes
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id;
$$;

comment on function property.my_properties() is
  'Every property the caller currently stewards (roadmap WP 05.04). Grew the address/quote-prep columns 0182 added to property.properties -- latitude/longitude deliberately excluded from this list, same restraint as api.matching_requests_for_pro(): never selected outside a server-side distance calculation. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_properties().';

create or replace function api.my_properties()
returns table (
  id                    uuid,
  name                  text,
  jurisdiction          text,
  steward_workspace_id  uuid,
  steward_since         timestamptz,
  street                text,
  house_number          text,
  postcode              text,
  municipality          text,
  country               text,
  property_type         text,
  quote_prep_notes      text
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from property.my_properties();
$$;

comment on function api.my_properties() is
  'Delegate for property.my_properties() (ADR-0026''s split). Grew the address/quote-prep columns 0182 added -- see that function''s own comment.';

revoke all on function property.my_properties() from public, anon, authenticated, service_role;
revoke all on function api.my_properties() from public, anon, service_role;
grant execute on function api.my_properties() to authenticated;

-- =========================================================================
-- 2 · THE WRITE PATH — property.set_property_address_for_caller()
--
-- Same caller-check idiom as property.create_property_for_caller() (0143) and
-- work.confirm_legacy_request_location() (0184): a real membership in the steward
-- workspace, checked here, not left to an RLS policy this function (as SECURITY DEFINER,
-- via its api.* delegate) would bypass anyway. Every field optional and independently
-- updatable -- a customer confirming "My Home"'s address for the first time supplies all
-- of them at once; a later correction (e.g. quote_prep_notes alone) does not require
-- re-supplying the rest. coalesce(p_x, column) is deliberately NOT used -- an omitted
-- parameter defaulting to null would silently blank a previously-set field, so every
-- parameter is required and the client always sends the full current set (matching this
-- codebase's own set_engagement_access_notes() upsert shape: whole-value replace, not a
-- sparse patch).

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
    select 1 from workspace.current_memberships() m where m.workspace_id = v_steward_workspace_id
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
  'Beta-completion slice: the write path 0182 added the columns for but never a function to reach. Steward-only, checked directly against workspace.current_memberships() -- no contractor, scoped or not, ever reaches this. Latitude/longitude are deliberately not parameters here -- no geocoding provider is wired yet (plan §15.9); they stay null until one is, and api.matching_requests_for_pro()''s own distance_band already degrades correctly when they are.';

create or replace function api.set_property_address(
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
language sql
security definer
set search_path = ''
as $$
  select property.set_property_address_for_caller(
    p_property_id, p_street, p_house_number, p_postcode, p_municipality, p_country, p_property_type, p_quote_prep_notes
  );
$$;

comment on function api.set_property_address(uuid, text, text, text, text, text, text, text) is
  'Delegate for property.set_property_address_for_caller(). The one write path a customer has onto their own property''s address -- required before work.create_request_for_caller() is called with that property (client-side gate, WP location-selection); the request-level requirement itself is not re-enforced in SQL here, matching work.create_request_for_caller()''s own existing shape, where p_property_id has always been an optional parameter.';

revoke all on function property.set_property_address_for_caller(uuid, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function api.set_property_address(uuid, text, text, text, text, text, text, text) from public, anon, service_role;
grant execute on function api.set_property_address(uuid, text, text, text, text, text, text, text) to authenticated;

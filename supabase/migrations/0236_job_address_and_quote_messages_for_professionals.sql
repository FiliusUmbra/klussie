-- Live review 2026-10-04, items 5 and 6 — two reads a professional's own job screen needed
-- and never had.
--
-- 1 · THE ADDRESS THE CUSTOMER EXPLICITLY SHARED (item 6)
--
-- After a customer approves location disclosure (work.approve_location_disclosure(), 0183 —
-- the "Adres delen en boeking bevestigen" consent), the engagement is active and a
-- work.location_disclosures row exists. The professional's job detail nevertheless showed
-- no street, number or postcode: the only property read a professional has,
-- api.resolve_property(), returns name/jurisdiction/steward and no address columns at all,
-- and api.matching_request_locations_for_pro() (0187) deliberately returns the APPROXIMATE
-- location only (municipality, band) for quoting. Nothing returned the exact address even
-- after consent.
--
-- api.disclosed_location_for_job() is that missing read, and is as narrow as the consent
-- it implements. It returns a row ONLY when ALL of these hold:
--   * the request has an unrevoked work.location_disclosures row (the customer's consent),
--   * that disclosure was made to a workspace the CALLER is a live member of
--     (receiving_workspace_id) — an unrelated provider, or a provider that merely quoted,
--     gets nothing,
--   * the engagement for that same quote is performed by that same workspace and is
--     'active' or 'completed' (never 'pending_disclosure' or 'cancelled').
-- Before acceptance and for any other caller it returns zero rows — privacy is the default.
-- It selects only the fields needed to find and enter the job (street, house number,
-- postcode, municipality, country, property type, quote-prep notes); never access
-- instructions, coordinates or any other property column.
--
-- 2 · A PROFESSIONAL'S OWN QUOTE MESSAGE (item 5)
--
-- api.my_quotes() returns (id, request_id, price, status, sent_at) — no message — so a
-- professional could see a submitted quote's price and status but never re-read what they
-- told the customer. Its return type cannot be widened with create-or-replace, and callers
-- depend on its current shape, so the message gets its own narrow read:
-- api.my_quote_messages(workspace) returns (quote id, message) for quotes OWNED by that
-- workspace, and only for a caller who is a live member of it.

create or replace function api.disclosed_location_for_job(p_request_id uuid)
returns table (
  street text,
  house_number text,
  postcode text,
  municipality text,
  country text,
  property_type text,
  quote_prep_notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.street, p.house_number, p.postcode, p.municipality, p.country, p.property_type, p.quote_prep_notes
  from work.requests r
  join work.location_disclosures d
    on d.request_id = r.id
   and d.revoked_at is null
  join work.engagements e
    on e.request_id = r.id
   and e.quote_id = d.quote_id
   and e.performing_workspace_id = d.receiving_workspace_id
   and e.status in ('active', 'completed')
  join property.properties p
    on p.id = coalesce(
      r.property_id,
      (select a.property_id from property.assets a where a.id = r.asset_id),
      (select l.property_id from property.locations l where l.id = r.location_id)
    )
  where r.id = p_request_id
    and d.receiving_workspace_id in (select m.workspace_id from workspace.current_memberships() m);
$$;

comment on function api.disclosed_location_for_job(uuid) is
  'The exact address a customer explicitly shared (work.location_disclosures) with the performing workspace, for that workspace''s own members only, once the engagement is active or completed. Zero rows before consent, for an unrelated provider, or for a quote that was not the accepted one. Never returns access instructions or coordinates. Live review 2026-10-04, item 6.';

create or replace function api.my_quote_messages(p_workspace_id uuid)
returns table (id uuid, message text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.message
  from work.quotes q
  where q.offering_workspace_id = p_workspace_id
    and exists (
      select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id
    );
$$;

comment on function api.my_quote_messages(uuid) is
  'The message text of the quotes owned by a workspace, for a live member of that workspace only. api.my_quotes() (0145) does not return it and its shape is depended on. Live review 2026-10-04, item 5.';

revoke all on function api.disclosed_location_for_job(uuid) from public, anon, service_role;
revoke all on function api.my_quote_messages(uuid) from public, anon, service_role;
grant execute on function api.disclosed_location_for_job(uuid) to authenticated;
grant execute on function api.my_quote_messages(uuid) to authenticated;

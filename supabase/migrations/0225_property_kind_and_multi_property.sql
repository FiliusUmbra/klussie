-- Home foundation, reopening WP 05.02 — property.properties grows a `kind` column so a
-- customer can genuinely steward more than one HOME property, and so the one-time service
-- address created by resolveRequestLocation() (src/lib/requests.js) for a
-- 'one_time_address' request never masquerades as a reusable "saved property" again.
--
-- THE BUG THIS CLOSES, FOUND WHILE SCOPING THIS SLICE
--
-- Every 'one_time_address' request creates a REAL property.properties row via
-- property.create_property() (0135), named literally "Eenmalig serviceadres" (requests.js's
-- own hardcoded marker). api.my_properties() (0185) has always returned every property a
-- workspace stewards, with no way to tell a genuine saved home from a one-off address —
-- ServiceLocationField.jsx renders that unfiltered list as "another saved property" chips,
-- so a customer who ever used a one-time address sees it resurface, indistinguishable from
-- a real second home, in every request after. `kind` is that missing distinction.
--
-- WHY A KIND COLUMN, NOT A SEPARATE TABLE
--
-- One-time addresses are still real property.properties rows — matching_requests_for_pro()
-- and approve_location_disclosure() both key off property_id exactly the same way for
-- either kind (0182/0183's own design), and §9.1 already models "a place in the world
-- someone is responsible for" broadly enough to cover a single job's address. Only the
-- read-side "which of my properties are real, reusable homes" question is new here.

alter table property.properties
  add column if not exists kind text not null default 'home';

alter table property.properties
  add constraint properties_kind_check check (kind in ('home', 'one_time'));

comment on column property.properties.kind is
  'home: a genuine, reusable saved property (§9.1''s "landlord''s second and third property" case). one_time: a single request''s own service address (requests.js''s resolveRequestLocation(), ''one_time_address''), real for matching/disclosure purposes but never offered again as a saved-property choice. Corrective, Home foundation slice — see this migration''s own header.';

-- Corrective backfill: every existing row created by the pre-existing hardcoded
-- 'one_time_address' marker gets reclassified. Matched by name, the only signal that ever
-- existed before this column — a real, if narrow, distinguishing fact for existing rows,
-- not a guess (requests.js has used this exact literal since 0182/0185).
update property.properties
  set kind = 'one_time'
  where name = 'Eenmalig serviceadres' and kind = 'home';

-- =========================================================================
-- 1 · property.create_property() (0135) GROWS AN OPTIONAL p_kind
--
-- Adding a trailing parameter with a default is a genuine CREATE OR REPLACE — the function
-- keeps its identity, and handle_new_user()'s own existing named-argument call (0135, no
-- p_kind) is unaffected, exactly the same additive shape 0182-0185 already used repeatedly
-- for this codebase's own write contracts.

create or replace function property.create_property(
  p_property_id           uuid,
  p_steward_workspace_id  uuid,
  p_name                  text,
  p_event_id              uuid,
  p_correlation_id        uuid,
  p_actor_type            platform.actor_type,
  p_actor_ref             text,
  p_kind                  text default 'home'
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into property.properties (id, name, kind, steward_workspace_id, steward_since, created_at, updated_at)
  values (p_property_id, p_name, p_kind, p_steward_workspace_id, now(), now(), now());

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.property.created',
    p_workspace_id   => p_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'property',
    p_subject_id     => p_property_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('name', p_name, 'kind', p_kind)
  );
end;
$$;

comment on function property.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text, text) is
  'Creates a property stewarded by the given workspace (WP 1.0, kind added Home foundation slice). No "already has one" guard — §9.1 permits many properties per workspace. p_kind defaults to ''home''; requests.js''s one-time-address path is the one caller that passes ''one_time''. Emits property.property.created.';

-- =========================================================================
-- 2 · property.create_property_for_caller() / api.create_property() (0143) THREAD p_kind
-- THROUGH, SAME DEFAULT

create or replace function property.create_property_for_caller(
  p_property_id           uuid,
  p_steward_workspace_id  uuid,
  p_name                  text,
  p_event_id              uuid,
  p_correlation_id        uuid,
  p_actor_type            platform.actor_type,
  p_actor_ref             text,
  p_kind                  text default 'home'
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_steward_workspace_id
  ) then
    raise exception
      'property.create_property_for_caller: caller may not create a property for workspace %', p_steward_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  perform property.create_property(
    p_property_id, p_steward_workspace_id, p_name, p_event_id, p_correlation_id, p_actor_type, p_actor_ref, p_kind
  );
end;
$$;

comment on function property.create_property_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text, text) is
  'The live-caller entry point to property.create_property() (WP 1.10 Option B; p_kind added Home foundation slice — a customer adding a second real home from Profile, or requests.js''s one-time-address path, both go through here). Checks the caller''s own membership in p_steward_workspace_id, then delegates unchanged. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_property().';

create or replace function api.create_property(
  p_property_id           uuid,
  p_steward_workspace_id  uuid,
  p_name                  text,
  p_event_id              uuid,
  p_correlation_id        uuid,
  p_actor_type            platform.actor_type,
  p_actor_ref             text,
  p_kind                  text default 'home'
)
returns void
language sql
security definer
set search_path = ''
as $$
  select property.create_property_for_caller(
    p_property_id, p_steward_workspace_id, p_name, p_event_id, p_correlation_id, p_actor_type, p_actor_ref, p_kind
  );
$$;

comment on function api.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text, text) is
  'Delegate for property.create_property_for_caller(). p_kind added Home foundation slice, default ''home''.';

-- Explicit, verified rather than assumed — same discipline 0143/0185 already hold
-- themselves to for every redefined write contract in this codebase.
revoke all on function property.create_property_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text, text)
  from public, anon, authenticated, service_role;

revoke all on function api.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text, text)
  from public, anon, service_role;
grant execute on function api.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text, text)
  to authenticated;

-- =========================================================================
-- 3 · property.my_properties() / api.my_properties() (0185) FILTER TO kind = 'home'
--
-- Body-only change (the WHERE clause) — the returned row shape is untouched, so a plain
-- CREATE OR REPLACE applies (unlike 0185's own drop+recreate, which was needed there only
-- because the row TYPE itself grew new columns). Every existing caller — homeInventory.js's
-- loadProperty()/fetchMyProperties(), ServiceLocationField.jsx, ItemAssociationField.jsx —
-- gets the fix for free: none of them ever wanted a one-time address in this list.

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
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.kind = 'home';
$$;

comment on function property.my_properties() is
  'Every genuine, reusable property (kind = ''home'') the caller currently stewards (roadmap WP 05.04; kind filter added Home foundation slice). A one-time service address never appears here — see this migration''s own header. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_properties().';

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
  'Delegate for property.my_properties(). Kind filter added Home foundation slice — see that function''s own comment.';

-- No grant/revoke here: both functions keep their exact 0185 signature (0 arguments,
-- unchanged return row), so this is the same function object under CREATE OR REPLACE and
-- 0185's own grants (api.my_properties() to authenticated; property.my_properties()
-- reachable only from it) stand untouched.

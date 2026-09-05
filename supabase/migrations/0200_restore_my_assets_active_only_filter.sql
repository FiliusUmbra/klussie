-- Real, live-confirmed regression: retiring an asset (api.retire_asset(), e.g. through
-- ItemFormSheet.jsx's "Delete item" button) never made it disappear from "Mijn spullen" —
-- confirmed directly on staging by retiring a real diagnostic asset and observing it still
-- returned by api.my_assets(), and by pg_get_functiondef() showing the live
-- property.my_assets() body carries no lifecycle_state filter at all.
--
-- ROOT CAUSE — NOT A "RESTORE DRILL" CASUALTY, A REGRESSION IN 0161 ITSELF
--
-- 0054_assets_active_only_contract.sql (Epic 07 WP08) added
-- "and a.lifecycle_state = 'active'" to property.my_assets() once fetchHouseholdItems()
-- became a real caller — its own header is explicit that an unfiltered read was fine only
-- because nothing read it yet. 0161_scoped_membership_authorization.sql (Platform
-- Activation Slice 2, WP 2.4) then did `create or replace function property.my_assets`
-- again to add the scoped-access OR-branch (`or a.property_id in (select property_id from
-- workspace.current_property_scope())`) — and rebuilt the WHERE clause from 0051's
-- original unfiltered shape, silently dropping 0054's filter in the process. Confirmed by
-- reading 0161's own diff: it never mentions lifecycle_state or 0054 anywhere, so this
-- reads as an oversight (rewriting the join-based WHERE into an IN-based one, from the
-- wrong starting point) rather than a deliberate widening. This has been live and wrong on
-- staging since 0161 shipped (2026-08-20, per this repo's own migration history) — nobody
-- had reason to notice until Home Builder gave "Mijn spullen" its first real delete-and-
-- reverify pass.
--
-- WHY A NEW MIGRATION, NOT AN EDIT TO 0051/0054/0161
--
-- All three are already merged and applied. This codebase's own discipline (0054's header,
-- ENVIRONMENTS.md §12) treats a shipped migration as history: `create or replace function`
-- in a new file, never an edit to an old one — the exact move 0054 itself made against
-- 0051, applied here a second time against 0161's regression.
--
-- SAFE TO REPLACE IN PLACE: SAME SIGNATURE, NO DROP NEEDED
--
-- property.my_assets(uuid) and api.my_assets(uuid) have carried this exact one-argument
-- signature since 0051 and are unchanged here — `create or replace function` on an
-- unchanged signature carries grants forward automatically (unlike 0197/0199's
-- drop-and-recreate, needed there only because those functions' parameter lists changed).
--
-- THE FIX
--
-- Re-add "and a.lifecycle_state = 'active'" to 0161's WHERE clause, changing nothing else
-- about the scoped-access branch it introduced. property.assets.lifecycle_state's own
-- check constraint (0048_assets.sql) allows exactly 'active' | 'retired' | 'disposed' —
-- 'active' is the correct value to filter to here, matching 0054's own choice and its own
-- reasoning (retired and disposed are both "no longer current," not merely "not disposed").
-- api.my_assets() is untouched below (as it was in 0054) — it stays a bare pass-through to
-- property.my_assets() and needs no change of its own to inherit the fix.

create or replace function property.my_assets(p_property_id uuid)
returns table (
  id                            uuid,
  name                          text,
  type                          text,
  make                          text,
  model                         text,
  serial_number                 text,
  location_id                   uuid,
  placed_since                   timestamptz,
  room_label                    text,
  acquired_on                    date,
  installed_on                    date,
  expected_service_life_months  integer,
  warranty_expires_on             date,
  condition                     text,
  lifecycle_state               text,
  photo_path                    text,
  notes                         text,
  source                        text,
  ai_suggestion                 jsonb,
  parent_asset_id                uuid,
  created_at                    timestamptz,
  updated_at                    timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    a.id, a.name, a.type, a.make, a.model, a.serial_number,
    a.location_id, a.placed_since, a.room_label,
    a.acquired_on, a.installed_on, a.expected_service_life_months,
    a.warranty_expires_on, a.condition, a.lifecycle_state,
    a.photo_path, a.notes, a.source, a.ai_suggestion,
    a.parent_asset_id, a.created_at, a.updated_at
  from property.assets a
  where a.property_id = p_property_id
    and a.lifecycle_state = 'active'
    and (
      a.property_id in (
        select p.id from property.properties p
        where p.steward_workspace_id in (select workspace_id from workspace.current_memberships())
      )
      or a.property_id in (select property_id from workspace.current_property_scope())
    );
$$;

comment on function property.my_assets(uuid) is
  'Every asset a property CURRENTLY holds, active only (0054), for either an unscoped steward-workspace membership or a scoped grant (0161) -- excludes both disposed and retired. Restored (0200) after 0161''s own rewrite of this function''s WHERE clause silently dropped 0054''s lifecycle_state filter -- confirmed live: a retired asset kept appearing in "Mijn spullen" until this fix. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_assets().';

-- api.my_assets() needs no change: it has always been a bare pass-through to
-- property.my_assets() (0054), so it inherits this fix automatically. Grants are
-- unaffected by a same-signature create-or-replace and are not re-issued here.

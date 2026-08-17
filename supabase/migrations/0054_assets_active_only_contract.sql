-- Epic 07 WP08 — narrows property.my_assets()/api.my_assets() to active assets only, ahead
-- of giving them their first real caller.
--
-- WHY THIS IS ITS OWN MIGRATION, NOT AN EDIT TO 0051
--
-- 0051 is already committed and pushed (PR #6). This codebase's own discipline treats a
-- committed migration as history, not a draft — every correction in this roadmap so far
-- (the ltree fix, the household_items_id FK fix in 0053) has been a *new* migration
-- extending or `create or replace`-ing a prior one, never an edit to the file that already
-- shipped. This is the same move: `create or replace function`, in a new file.
--
-- WHY IT WAS FINE UNFILTERED IN 0051 AND IS NOT FINE NOW
--
-- 0051's own header: "no client caller to prove [a refinement] against yet." At the time,
-- nothing read my_assets() at all, so returning every lifecycle_state was inert — there was
-- no wrong answer because there was no question being asked. WP 07.08 is the first real
-- caller (src/lib/householdItems.js's fetchHouseholdItems), and it asks a specific
-- question — "what does this household currently own?" — that a disposed asset (0053: set
-- the moment its household_items row is deleted) is not an answer to. Showing a deleted
-- item back to the person who deleted it is not a lifecycle nuance; it is a visible bug the
-- moment the first person deletes something from "Mijn spullen" after this read switch
-- ships.
--
-- retired IS EXCLUDED TOO, DELIBERATELY, EVEN THOUGH NOTHING SETS IT YET
--
-- 0048's own distinction: retired means "no longer active but not deleted" (its example:
-- decommissioned but kept for maintenance history) — a real state, just one nothing in this
-- product produces yet. "Mijn spullen" is a list of what someone currently owns and might
-- photograph or reference, not an equipment history — the same reasoning that excludes
-- disposed applies to retired for an identical reason, not a different one. When a later
-- epic gives retirement a real caller of its own (a maintenance-history view, most likely),
-- that caller is a different question with a different filter — not a reason to widen this
-- one now.

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
  join property.properties p on p.id = a.property_id
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where a.property_id = p_property_id
    and a.lifecycle_state = 'active';
$$;

comment on function property.my_assets(uuid) is
  'Every asset a property CURRENTLY holds (Epic 07 WP08, 0054) — active only, excluding both disposed and retired. Widened from 0051''s unfiltered shape once a real caller (fetchHouseholdItems) existed to ask the question. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_assets().';

create or replace function api.my_assets(p_property_id uuid)
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
security definer
set search_path = ''
as $$
  select * from property.my_assets(p_property_id);
$$;

comment on function api.my_assets(uuid) is
  'Delegate for property.my_assets() (ADR-0026''s split). Every asset a property currently holds — active only (0054).';

revoke all on function property.my_assets(uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_assets(uuid) from public, anon, service_role;
grant execute on function api.my_assets(uuid) to authenticated;

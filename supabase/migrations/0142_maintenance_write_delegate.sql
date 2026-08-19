-- Platform Activation Slice 1, WP 1.7 — the maintenance write delegate:
-- api.create_maintenance_obligation(). The Programme's own WP 1.7 line calls this "a
-- thin delegate; the real function (work.create_maintenance_obligation()) already
-- exists (Epic 10's own contract work package), same shape as WP 1.2."
--
-- "SAME SHAPE AS WP 1.2" TURNED OUT TO MEAN MORE THAN A THIN DELEGATE ALONE COULD BE —
-- THE SAME REAL GAP WP 1.2 FOUND AND FIXED, FOUND AGAIN HERE
--
-- WP 1.2's own header (0137): work.my_maintenance_schedules()/obligations() had no
-- caller-membership check at all — `where o.workspace_id = p_workspace_id`, no join to
-- workspace.current_memberships() — "exposing them directly would let any authenticated
-- caller read any workspace's maintenance by guessing an id." WP 1.2's fix redefined
-- those two functions in place to add the missing check before building their api.*
-- delegates. work.create_maintenance_obligation() (0074) has the identical gap on the
-- write side: no membership check, callable only because it is granted directly to
-- klussie_engine_work, a trusted internal role, not authenticated. A thin delegate
-- wrapping it unchanged would let any authenticated caller create an obligation for any
-- workspace by guessing an id — the write-side twin of the exact hole WP 1.2 closed.
--
-- UNLIKE WP 1.2's READ FUNCTIONS, work.create_maintenance_obligation() CANNOT SIMPLY BE
-- REDEFINED IN PLACE WITH THE CHECK ADDED
--
-- 0074's own comment on that function: "the one write path for a new obligation,
-- regardless of source — 'manual', 'compliance' and 'prediction' call this directly;
-- 'schedule' reaches it through work.generate_due_obligation()." Three of those four
-- sources are trusted INTERNAL system processes with no live authenticated caller and no
-- real request.jwt.claims to check membership against at all — a schedule-generated
-- obligation, a compliance-triggered one, a prediction-triggered one. Adding a
-- workspace.current_memberships() check unconditionally to the SHARED function would
-- break every one of those legitimate internal callers, not just close the hole for the
-- one that needed closing.
--
-- THE FIX: A NEW FUNCTION FOR THE ONE SOURCE THAT NEEDS A LIVE-CALLER CHECK, NOT A
-- CHANGE TO THE SHARED ONE — THE SAME RESTRAINT property.reparent_location() (0047)
-- ALREADY DEMONSTRATED
--
-- 0047's own header: "no permission check inside this function, deliberately...
-- whichever future work package builds this function's first real caller must decide
-- the caller checks permission... before calling this." This work package is exactly
-- that situation for 'manual' obligations: work.create_manual_maintenance_obligation()
-- below is the first real, live-caller entry point work.create_maintenance_obligation()
-- has ever had. It checks the caller's own membership, hardcodes source => 'manual' and
-- schedule_id => null (the only combination a live customer action can ever mean — the
-- other three sources are system-triggered, never a person clicking a button), and only
-- then calls the existing, unmodified, still-internally-trusted function. Nothing about
-- 'schedule'/'compliance'/'prediction''s own call sites changes.
--
-- A LIGHTWEIGHT CROSS-CHECK BEYOND THE MINIMUM — ASSET/LOCATION MUST ACTUALLY BELONG TO
-- THE CALLER'S OWN WORKSPACE
--
-- work.maintenance_obligations' own one-subject constraint (0072) only requires exactly
-- one of asset_id/location_id, never that either belongs to the workspace named in the
-- same row. Without an extra check, a caller with a legitimate membership in Workspace A
-- could pass p_workspace_id => WorkspaceA (passes the membership check) alongside
-- p_asset_id => <an asset under Workspace B's own property> — the created row's own
-- workspace_id would stay correctly A, so no cross-tenant read is possible (resolve_
-- asset() re-checks membership independently, per 0051's own restraint), but the
-- obligation itself would reference an asset the caller has no real relationship to — a
-- genuinely confusing, avoidable data state. Verified below the same way
-- create_location() (0140) verifies its own parent: resolved and checked, not trusted.
--
-- SAME ONE-EXCEPTION SHAPE AS create_asset()/create_location()/create_document()
--
-- 'insufficient_privilege' for every one of the three checks below — never a
-- distinguishing message for "no such workspace" vs "not yours" vs "not your asset."

-- =========================================================================
-- THE LOGIC — work.create_manual_maintenance_obligation()

create or replace function work.create_manual_maintenance_obligation(
  p_obligation_id   uuid,
  p_workspace_id    uuid,
  p_asset_id        uuid,
  p_location_id     uuid,
  p_title           text,
  p_description     text,
  p_due_on          date,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id
  ) then
    raise exception
      'work.create_manual_maintenance_obligation: caller may not create an obligation for workspace %', p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_asset_id is not null and not exists (
    select 1 from property.assets a
    join property.properties p on p.id = a.property_id
    where a.id = p_asset_id and p.steward_workspace_id = p_workspace_id
  ) then
    raise exception
      'work.create_manual_maintenance_obligation: asset % is not stewarded by workspace %', p_asset_id, p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_location_id is not null and not exists (
    select 1 from property.locations l
    join property.properties p on p.id = l.property_id
    where l.id = p_location_id and p.steward_workspace_id = p_workspace_id
  ) then
    raise exception
      'work.create_manual_maintenance_obligation: location % is not stewarded by workspace %', p_location_id, p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  perform work.create_maintenance_obligation(
    p_obligation_id, p_workspace_id, p_asset_id, p_location_id, null,
    p_title, p_description, 'manual', p_due_on,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
end;
$$;

comment on function work.create_manual_maintenance_obligation(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform.actor_type, text) is
  'The first real live-caller entry point to work.create_maintenance_obligation() (WP 1.7) — checks the caller''s own workspace membership and that any given asset/location is actually stewarded by that same workspace, then delegates to the existing function with source hardcoded to ''manual'' and schedule_id to null (the only combination a live customer action can mean). Does not touch work.create_maintenance_obligation() itself — ''schedule''/''compliance''/''prediction'' keep calling it directly, unauthenticated-context, unchanged. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_maintenance_obligation().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.create_maintenance_obligation(
  p_obligation_id   uuid,
  p_workspace_id    uuid,
  p_asset_id        uuid,
  p_location_id     uuid,
  p_title           text,
  p_description     text,
  p_due_on          date,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.create_manual_maintenance_obligation(
    p_obligation_id, p_workspace_id, p_asset_id, p_location_id,
    p_title, p_description, p_due_on, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_maintenance_obligation(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform.actor_type, text) is
  'Delegate for work.create_manual_maintenance_obligation() (ADR-0026''s split). Creates a manual maintenance obligation for a workspace the caller has a live membership in.';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed (ADR-0026 property 4), the
-- same discipline every prior api.* delegate in this codebase follows.
--
-- work.create_maintenance_obligation() itself is untouched by this migration — its own
-- grant to klussie_engine_work (0074) stands, not re-declared or revoked here, the same
-- restraint WP 1.2's own migration held for the identical reason (see 0137's own
-- comment).

revoke all on function work.create_manual_maintenance_obligation(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

revoke all on function api.create_maintenance_obligation(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.create_maintenance_obligation(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform.actor_type, text)
  to authenticated;

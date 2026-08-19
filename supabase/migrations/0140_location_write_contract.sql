-- Platform Activation Slice 1, WP 1.5 — the location write contract:
-- property.create_location() / api.create_location(). Scoped narrower than WP 1.4's own
-- entry, deliberately — the Programme's own WP 1.5 line names only create_location(),
-- not "plus update and lifecycle-state functions" the way WP 1.4's did. Lowest-risk of
-- the four Tier 2 write contracts (SLICE_1_PROPERTY_ASSET_ACTIVATION.md §1.4): nothing
-- depends on a location existing yet, and a mistake here has no legacy data to corrupt
-- (§1.4 — Location has no household_items-era backfill at all).
--
-- SAME AUTHORIZATION SHAPE AS WP 1.4 — ONE CHECK, ONE GENERIC EXCEPTION
--
-- property.create_asset()'s own header (0139) explains the full reasoning: a real,
-- self-contained caller-membership check (this is the first end-user-facing write
-- contract for Location, the same posture create_asset() holds for Asset), one generic
-- 'insufficient_privilege' exception covering both "no such target" and "exists, but not
-- yours" so neither case leaks which is true.
--
-- THE PATH IS THE TRIGGER'S JOB, NOT THIS FUNCTION'S — property.locations_maintain_path()
-- (0044) ALREADY DOES IT
--
-- A BEFORE INSERT trigger computes path from parent_id (or the property's own root label,
-- when parent_id is null) on every insert into property.locations. create_location()
-- below inserts (id, property_id, parent_id, name, type) and nothing else — no ltree
-- concatenation duplicated here, reusing the exact logic property.reparent_location()
-- (0047) and 0044's own trigger already established and (per 0047's own header) already
-- found and fixed a real bug in once.
--
-- A REAL AUTHORIZATION HAZARD THE TRIGGER'S OWN BEHAVIOUR CREATES, AND HOW THIS FUNCTION
-- AVOIDS IT
--
-- 0044's trigger comment states plainly: "A child inherits its parent's property,
-- regardless of what the caller supplied" — new.property_id is silently OVERRIDDEN from
-- the parent's own property_id whenever parent_id is non-null. If this function checked
-- the caller's membership against the p_property_id PARAMETER instead of the property the
-- row will actually end up in, a caller with a legitimate membership in Property A could
-- pass p_property_id => PropertyA.id and p_parent_id => <a location under Property B> —
-- the trigger would silently re-home the new row under Property B regardless, and the
-- authorization check would have approved a write into a property the caller has no
-- membership in at all. This function therefore resolves the REAL target property FIRST
-- (from p_parent_id's own property_id when a parent is given, from p_property_id only
-- when it is not) and checks membership against that resolved value, never against the
-- raw parameter alone.
--
-- WHAT THIS WORK PACKAGE DELIBERATELY DOES NOT BUILD, NAMED RATHER THAN SILENTLY OMITTED
--
--   1. update_location() (rename, retype) — not named in this work package's own scope
--      (contrast WP 1.4's explicit "plus update and lifecycle-state functions"). A
--      customer cannot yet correct a typo'd room name through this contract.
--   2. A permission-checked path to property.reparent_location() (0047) — that function
--      already exists, already works (verified against staging per its own header), and
--      already states its own condition plainly: "no permission check inside this
--      function, deliberately... whichever future work package builds this function's
--      first real caller must decide the caller checks permission... before calling
--      this." This work package is not that caller — WP 1.5's own scope names only
--      create_location(), and building a permission wrapper nobody asked for here would
--      be exactly the speculative-structure risk ADR-0010 already rules out elsewhere in
--      this codebase.
--   3. retire_location() (retired_at) — property.locations_for_property() (0136) already
--      excludes retired_at is not null rows from what a customer sees, but nothing yet
--      sets it. A customer cannot yet remove a location they added by mistake.
-- All three are real gaps a future work package should close, not oversights this one
-- failed to notice.

-- =========================================================================
-- THE LOGIC

create or replace function property.create_location(
  p_location_id     uuid,
  p_property_id     uuid,
  p_parent_id       uuid,
  p_name            text,
  p_type            text,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_target_property_id   uuid;
  v_steward_workspace_id uuid;
begin
  -- Resolve the REAL target property before checking anything — see this migration's
  -- own header for why trusting p_property_id alone, when a parent is given, would be a
  -- real authorization bypass.
  if p_parent_id is not null then
    select l.property_id into v_target_property_id
    from property.locations l
    where l.id = p_parent_id;
  else
    v_target_property_id := p_property_id;
  end if;

  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = v_target_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.create_location: caller may not create a location here'
      using errcode = 'insufficient_privilege';
  end if;

  -- property_id is v_target_property_id, the resolved value, not the raw parameter —
  -- consistent with what 0044's trigger will compute for itself when parent_id is set,
  -- never a stale value the trigger then silently corrects.
  insert into property.locations (id, property_id, parent_id, name, type, created_at, updated_at)
  values (p_location_id, v_target_property_id, p_parent_id, p_name, p_type, now(), now());

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.location.created',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'location',
    p_subject_id     => p_location_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('name', p_name, 'propertyId', v_target_property_id, 'parentId', p_parent_id)
  );
end;
$$;

comment on function property.create_location(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'Creates a location under a property the caller has a live membership in (WP 1.5) — resolved from p_parent_id''s own property when a parent is given, never trusted from p_property_id alone (see this migration''s own header for the authorization hazard that would otherwise create). path is computed by property.locations_maintain_path() (0044)''s own trigger, not here. One generic exception for both "no such target" and "not yours," matching property.create_asset()''s own restraint. Emits property.location.created. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_location().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.create_location(
  p_location_id     uuid,
  p_property_id     uuid,
  p_parent_id       uuid,
  p_name            text,
  p_type            text,
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
  select property.create_location(
    p_location_id, p_property_id, p_parent_id, p_name, p_type,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_location(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.create_location() (ADR-0026''s split). Creates a location under a property the caller has a live membership in.';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed (ADR-0026 property 4), the
-- same discipline every prior api.* delegate in this codebase follows.

revoke all on function property.create_location(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

revoke all on function api.create_location(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.create_location(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  to authenticated;

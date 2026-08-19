-- Platform Activation Slice 1, WP 1.10 — My Business, Professional reuse of Tier 1/Tier
-- 2. The Programme's own WP 1.10 line: "wiring [the same engines, the same components]
-- into a new ProApp.jsx tab against the Professional workspace's own property is close
-- to free — the same components, a different workspaceId. The one genuinely new piece:
-- WP 1.0's Option B (lazy property creation) is this tab's own first-use trigger."
--
-- THE SAME GAP WP 1.7 FOUND, FOUND AGAIN — property.create_property() (0135) HAS NO
-- AUTHORIZATION CHECK EITHER
--
-- property.create_property() (0135, WP 1.0's own Option A) is called only from inside
-- handle_new_user()'s trigger — an already-trusted, privileged context, so it carries no
-- caller-membership check of its own, the exact posture work.create_maintenance_
-- obligation() (0074) held before WP 1.7. Option B needs a real, live caller: a
-- professional opening "My Business" for the first time, with no property yet. A thin
-- api.create_property() wrapping property.create_property() unchanged would let any
-- authenticated caller create a property claiming any p_steward_workspace_id — the
-- identical hole WP 1.7's own header describes, on a different aggregate.
--
-- THE SAME FIX SHAPE: A NEW FUNCTION FOR THE LIVE-CALLER PATH, THE INTERNAL ONE
-- COMPLETELY UNCHANGED
--
-- property.create_property_for_caller() below checks the caller's own membership in
-- p_steward_workspace_id, then calls the existing, unmodified property.create_property()
-- — handle_new_user()'s own call site is untouched, still trusted, still carrying no
-- check of its own, exactly as WP 1.7's work.create_manual_maintenance_obligation() left
-- work.create_maintenance_obligation() untouched for its own internal callers.
--
-- STILL NO "ALREADY HAS ONE" GUARD — §9.1 PERMITS MANY PROPERTIES, THE SAME REASONING
-- 0135 ITSELF ALREADY STATED
--
-- 0135's own header: "deliberately [no] 'workspace already has a property' guard...
-- correct for this one call site and wrong for the contract itself, which must remain
-- callable for a landlord's second and third property." That reasoning applies unchanged
-- here. What stops a professional's "My Business" tab from creating a second property
-- every time it opens is the CLIENT's own lazy-trigger logic (check api.my_properties()
-- first, create only when it resolves to nothing) — not a database constraint, matching
-- how workspace.create_personal_workspace()'s own real one-per-person invariant and
-- property.create_property()'s own deliberate absence of one were already two different
-- answers to two different questions (0135's own WP 1.0 decision).

-- =========================================================================
-- THE LOGIC

create or replace function property.create_property_for_caller(
  p_property_id           uuid,
  p_steward_workspace_id  uuid,
  p_name                  text,
  p_event_id              uuid,
  p_correlation_id        uuid,
  p_actor_type            platform.actor_type,
  p_actor_ref             text
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
    p_property_id, p_steward_workspace_id, p_name, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
end;
$$;

comment on function property.create_property_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'The first real live-caller entry point to property.create_property() (WP 1.10, Option B''s own trigger — a professional workspace''s first "My Business" open). Checks the caller''s own membership in p_steward_workspace_id, then delegates unchanged. Does not touch property.create_property() itself — handle_new_user()''s own Option A call site keeps its own trusted, unchecked posture. No "already has one" guard, matching 0135''s own stated reasoning for the function it wraps. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_property().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.create_property(
  p_property_id           uuid,
  p_steward_workspace_id  uuid,
  p_name                  text,
  p_event_id              uuid,
  p_correlation_id        uuid,
  p_actor_type            platform.actor_type,
  p_actor_ref             text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select property.create_property_for_caller(
    p_property_id, p_steward_workspace_id, p_name, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.create_property_for_caller() (ADR-0026''s split). Creates a property stewarded by a workspace the caller has a live membership in — WP 1.10''s Option B lazy-creation trigger for a Professional workspace''s first property.';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed (ADR-0026 property 4), the
-- same discipline every prior api.* delegate in this codebase follows.
--
-- property.create_property() itself is untouched by this migration — its own posture
-- (granted to nobody, reachable only from handle_new_user()'s SECURITY DEFINER trigger
-- context) stands, not re-declared or revoked here, the same restraint WP 1.7's own
-- migration held for work.create_maintenance_obligation().

revoke all on function property.create_property_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

revoke all on function api.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.create_property(uuid, uuid, text, uuid, uuid, platform.actor_type, text)
  to authenticated;

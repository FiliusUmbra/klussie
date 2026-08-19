-- Platform Activation Slice 0, WP 0.4 — the audited read path: platform.list_audit_records()
-- and its api.list_audit_records() delegate, per ADR-0030.
--
-- THE FIRST NON-postgres CONSUMER OF platform.audit_records SINCE EPIC 01
--
-- 0022_audit.sql granted `klussie_operator` SELECT on this table the moment it was
-- created — and nothing has ever exercised that grant, because klussie_operator is a
-- NOLOGIN group role nothing connects as (ROLES.md §2). This migration does not touch
-- that grant; it builds the actual path a real, logged-in operator reaches the table
-- through, exactly the same shape platform.write_audit_record() (0105) built for the
-- write side — a privileged function, not a widened grant.
--
-- SAME TWO-LAYER SHAPE AS EVERY OTHER READ SWITCH IN THIS ROADMAP
--
-- property.my_assets() (0054) / api.my_assets() is the precedent, followed exactly:
-- the real logic lives in the owning engine's schema (platform, owned by
-- klussie_engine_platform per ROLES.md §2.1 — Audit and Administration are both named
-- under this role), plain SECURITY INVOKER; a thin SECURITY DEFINER delegate in `api`
-- is what `authenticated` actually calls. platform.list_audit_records() needs no
-- SECURITY DEFINER of its own and no extra cross-schema grants to reach
-- workspace.current_memberships()/workspace.workspace_has_capability() — once inside
-- api.list_audit_records()'s definer context (owned by the migration runner, exactly
-- like every other api.* delegate in this codebase), a nested plain-SQL call already
-- executes with that same privilege, the identical mechanism property.my_assets()
-- already relies on to reach workspace.current_memberships() without its own grant.
--
-- AUTHORIZATION IS A COMPOSED CHECK, NOT NEW LOGIC — workspace.workspace_has_capability()
--
-- "An operator" is defined nowhere new here: a caller with a real, active membership
-- (workspace.current_memberships(), 0031) in a workspace holding platform_operations
-- (workspace.workspace_has_capability(), 0079 — checked against the workspace 0132
-- created). This is the check ADR-0030's own Decision section names directly, and it is
-- an EXISTS predicate joined into the WHERE clause, not a separate branch or a raised
-- exception — the same shape property.my_assets() already uses (`join
-- workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id`) to
-- restrict a read to whoever holds the right membership. A caller with no qualifying
-- membership gets zero rows, the ordinary and only behaviour this pattern produces —
-- never a partial result, and no exception message that could hint at what exists.
--
-- `authenticated` ALREADY HOLDS USAGE ON SCHEMA api (0031) — NOT RE-GRANTED HERE
--
-- This migration grants EXECUTE on the one new function it adds; the schema-level USAGE
-- grant that makes api.* reachable at all was already established and is not repeated.
--
-- FILTERS ARE DELIBERATELY MINIMAL — SUFFICIENT FOR WP 0.6's SCREEN, NOTHING MORE
--
-- workspace, actor, an action prefix (so 'workspace.' finds every Workspace-engine
-- action without the caller needing to know every literal action string), and a time
-- range. Pagination via limit/offset, guarded against negative input. Export (§23's own
-- named future) is explicitly out of this work package's scope, per
-- SLICE_0_ACTIVATION_INFRASTRUCTURE.md WP 0.4.

-- =========================================================================
-- THE LOGIC

create or replace function platform.list_audit_records(
  p_workspace_id   uuid        default null,
  p_actor_ref      text        default null,
  p_action_prefix  text        default null,
  p_occurred_from  timestamptz default null,
  p_occurred_to    timestamptz default null,
  p_limit          integer     default 50,
  p_offset         integer     default 0
)
returns table (
  audit_id        uuid,
  occurred_at     timestamptz,
  workspace_id    uuid,
  actor_type      platform.actor_type,
  actor_ref       text,
  action          text,
  subject_type    text,
  subject_id      uuid,
  outcome         platform.audit_outcome,
  authority       text,
  correlation_id  uuid,
  detail          jsonb
)
language sql
stable
set search_path = ''
as $$
  select
    r.audit_id, r.occurred_at, r.workspace_id, r.actor_type, r.actor_ref, r.action,
    r.subject_type, r.subject_id, r.outcome, r.authority, r.correlation_id, r.detail
  from platform.audit_records r
  where exists (
    select 1
    from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
  )
  and (p_workspace_id  is null or r.workspace_id = p_workspace_id)
  and (p_actor_ref     is null or r.actor_ref = p_actor_ref)
  and (p_action_prefix is null or r.action like p_action_prefix || '%')
  and (p_occurred_from is null or r.occurred_at >= p_occurred_from)
  and (p_occurred_to   is null or r.occurred_at <= p_occurred_to)
  order by r.occurred_at desc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function platform.list_audit_records(
  uuid, text, text, timestamptz, timestamptz, integer, integer
) is
  'The first read path onto platform.audit_records since Epic 01 (WP 0.4, ADR-0030). Restricted to callers with a real, active membership in a workspace holding platform_operations — an EXISTS predicate, not a raised exception, so a non-operator caller gets zero rows, matching every other engine''s read-switch pattern (see property.my_assets()). No SECURITY DEFINER of its own; reached only through api.list_audit_records().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.list_audit_records(
  p_workspace_id   uuid        default null,
  p_actor_ref      text        default null,
  p_action_prefix  text        default null,
  p_occurred_from  timestamptz default null,
  p_occurred_to    timestamptz default null,
  p_limit          integer     default 50,
  p_offset         integer     default 0
)
returns table (
  audit_id        uuid,
  occurred_at     timestamptz,
  workspace_id    uuid,
  actor_type      platform.actor_type,
  actor_ref       text,
  action          text,
  subject_type    text,
  subject_id      uuid,
  outcome         platform.audit_outcome,
  authority       text,
  correlation_id  uuid,
  detail          jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from platform.list_audit_records(
    p_workspace_id, p_actor_ref, p_action_prefix, p_occurred_from, p_occurred_to, p_limit, p_offset
  );
$$;

comment on function api.list_audit_records(
  uuid, text, text, timestamptz, timestamptz, integer, integer
) is
  'The Administration engine''s isolation contract for reading platform.audit_records (WP 0.4, ADR-0030). Delegates to platform.list_audit_records(), which holds all the logic; this function holds none.';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed (ADR-0026 property 4), the
-- same discipline every prior api.* delegate in this codebase follows.

revoke all on function api.list_audit_records(
  uuid, text, text, timestamptz, timestamptz, integer, integer
) from public, anon, service_role;

grant execute on function api.list_audit_records(
  uuid, text, text, timestamptz, timestamptz, integer, integer
) to authenticated;

-- platform.list_audit_records() is granted to nobody at all — not authenticated, not
-- anon, not even klussie_engine_platform beyond what default privileges already imply
-- for the schema owner. Reachable only as a nested call inside the SECURITY DEFINER
-- delegate above — the exact posture workspace.current_memberships() (0031) already
-- holds, applied here a second time to a different function for the identical reason.
revoke all on function platform.list_audit_records(
  uuid, text, text, timestamptz, timestamptz, integer, integer
) from public, anon, authenticated, service_role;

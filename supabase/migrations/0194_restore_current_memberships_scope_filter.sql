-- Restores workspace.current_memberships()'s own scope-null filter -- 0161's own §1
-- change (WP 2.4), missing live on staging despite being the single most-reused
-- authorization primitive on the platform.
--
-- SEVERITY -- LIVE, EXPLOITABLE, NOT THEORETICAL
--
-- Confirmed live before writing this fix: staging currently has 2 real, currently-active
-- scoped memberships (workspace.memberships rows with a non-null scope, created by
-- workspace.grant_engagement_access(), 0162's own consumer, after a real completed
-- engagement). Per 0161's own header, workspace.current_memberships() backs 23 RLS
-- policies across property, work, workspace, knowledge, commerce, capability, analytics,
-- and search. Without the `and m.scope is null` filter, a scoped membership -- meant to
-- grant a contractor temporary, property-narrowed access -- is indistinguishable from an
-- ordinary, unscoped membership to every one of those 23 policies. A professional with a
-- real, active scoped grant over ONE property today has full read access to the
-- customer's ENTIRE workspace: every other property, every marketplace request, billing,
-- everything current_memberships() gates anywhere in the platform.
--
-- Reproduced directly: a contractor scoped to property A, queried as themselves,
-- currently reads property B (a different property in the same customer workspace) --
-- exactly the disclosure 0161's own VERIFY_SCOPED_MEMBERSHIP_AUTHORIZATION.sql check 4a
-- exists to catch, and does catch, once its own sibling staleness (fixed this same
-- checkpoint) stopped masking it.
--
-- WHY THIS WENT UNNOTICED
--
-- The bug is over-permission, not under-permission -- every positive-case check ("can the
-- right party see their own thing?") passes regardless, because a scoped grant's own
-- correct target is always also reachable through the (incorrectly) still-open unscoped
-- branch. Only an adversarial, cross-boundary check ("can this same scoped party see
-- something they were NOT granted?") exposes it -- exactly VERIFY_SCOPED_MEMBERSHIP_
-- AUTHORIZATION.sql's own §4, the first time this session asked that specific question of
-- this specific function.
--
-- No migration after 0161 ever redefines this function (checked: only 0031's original and
-- 0161's fix touch it) -- this is 0161 §1 never having taken effect live, the same class
-- of gap as every other restoration this checkpoint, just with a materially larger blast
-- radius than any of them.
--
-- Byte-identical to 0161 §1 -- same signature, same return type, a body change only.

create or replace function workspace.current_memberships()
returns table (membership_id uuid, workspace_id uuid, role text, scope jsonb)
language sql
stable
set search_path = ''
as $$
  select m.id, m.workspace_id, m.role, m.scope
  from workspace.memberships m
  join identity.identities i on i.person_ref = m.person_ref
  where i.auth_user_id = auth.uid()
    and i.erased_at is null
    and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
    and m.scope is null;
$$;

comment on function workspace.current_memberships() is
  'The caller''s own live, UNSCOPED memberships only (WP 2.4) -- every membership with a real scope (a temporary, property-narrowed grant) is deliberately excluded here, so every one of this function''s ~20 existing callers across the platform keeps behaving exactly as it always has, by construction. A scoped membership is resolved separately, only where scope-aware visibility is actually wanted -- see workspace.current_property_scope().';

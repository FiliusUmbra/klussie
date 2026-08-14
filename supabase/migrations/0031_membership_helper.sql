-- Epic 03 WP02 — the membership helper: the isolation predicate nearly every RLS policy
-- in the platform will depend on.
--
-- SUPABASE_ARCHITECTURE.md §6: "Nearly every policy reduces to one question: is the
-- current principal a live member of the workspace this row belongs to? This is answered
-- by a single security-definer, STABLE helper that resolves the caller's live workspace
-- memberships once per statement rather than once per row." §20 names it the platform's
-- first performance concern; the roadmap's risk register makes it risk 5.
--
-- WHERE IT LIVES, AND WHY THAT IS NOT A FREE CHOICE
--
-- An RLS policy's expression runs with the INVOKING role's privileges. `authenticated` has
-- no USAGE on schema `workspace` (0019_grants.sql) and a migration cannot grant it without
-- reopening the posture ROLES.md §2.4 states as permanent for every engine schema.
-- SECURITY DEFINER changes what a function's BODY runs as, not what is needed to CALL it —
-- so the predicate needs a home `authenticated` can already reach.
--
-- ADR-0026 (accepted, revised from an originally proposed placement in `public`) decides
-- this with a split: the logic stays in `workspace`, reachable by nothing client-facing; a
-- thin SECURITY DEFINER delegate in a new `api` schema is what RLS and client callers
-- actually reference. `api` is the platform's permanent contract layer from this package
-- forward — ADR-0026's "As revised" section has the full reasoning; migration 0028's
-- `current_identity()` and `resolve_identity_display()` are NOT relocated here.
--
-- THE FUNCTION SHAPE, AND WHY IT CHANGED DURING THIS PACKAGE
--
-- ADR-0026 originally named the delegate `api.is_workspace_member(uuid)` — a scalar
-- function taking a workspace id. Building it against ADR-0024's acceptance requirement —
-- "evidence of once-per-statement, not the marking alone" — found that shape cannot meet
-- it: STABLE only permits once-per-statement evaluation when a function's argument does
-- NOT vary per row, and `is_workspace_member(workspace_id)` used the natural way in a
-- policy takes the SCANNED ROW'S OWN COLUMN as its argument, re-invoking the underlying
-- join once per row regardless of the STABLE marking — exactly the "correlated subquery
-- per row" failure §20 names as the platform's most likely catastrophic degradation.
--
-- ADR-0026's "As implemented" section has the full finding and citation. The fix: a
-- PARAMETERLESS delegate, depending on nothing but auth.uid() — constant for the whole
-- statement — used as an uncorrelated subquery:
--
--   using (workspace_id in (select m.workspace_id from api.current_workspace_memberships() m))
--
-- which the planner can recognise as independent of the outer row and evaluate once. Every
-- RLS policy from WP 03.10 onward is written this way. `api.is_workspace_member(uuid)` is
-- NOT built — a second function inviting the exact call pattern just ruled out would be a
-- hazard sitting next to its own fix.
--
-- THIS PACKAGE DOES NOT WRITE A SINGLE RLS POLICY
--
-- workspace.workspaces, workspace.memberships and workspace.membership_history (migration
-- 0030) stay RLS-enabled with no policy — the absent policy is still the deny. Writing
-- policies is WP 03.10, gated by ADR-0025. This package only makes the predicate a policy
-- could call, once one exists.

-- =========================================================================
-- THE `api` SCHEMA
--
-- Created here rather than in its own migration: it is not a separate work package, it is
-- part of delivering this one (ADR-0026). Holds contracts, never engine logic or data —
-- stated as the schema's own purpose from its first line, unlike `public`, which acquired
-- that role by accretion rather than by decision.

create schema if not exists api;
comment on schema api is
  'The platform''s permanent client-facing contract layer (ADR-0026). Holds thin SECURITY DEFINER delegates only — engine logic and data stay in the owning engine''s schema. Exposed to PostgREST by dashboard configuration (Project Settings > Data API > Exposed schemas), which a migration cannot set — the same constraint already documented for why `identity` cannot be exposed (migration 0028).';

-- No grant to PUBLIC or anon here. ROLES.md rule 1: grant to a role's own need, nothing in
-- advance of a real query. Only `authenticated` has a function to call as of this package.
grant usage on schema api to authenticated;

-- =========================================================================
-- THE LOGIC — workspace.current_memberships()
--
-- The caller's live memberships: not SECURITY DEFINER, and granted to nobody. Its only
-- caller is the delegate below, which reaches it under the migration runner's privileges —
-- inside a SECURITY DEFINER function's execution, a nested plain-SQL call runs as the
-- definer's current_user, not the original caller, so no grant on this function is needed
-- or given. This is the Workspace engine's own logic, staying in the Workspace engine's own
-- schema, which is what a narrow grant on `workspace` (ADR-0026's rejected Option A) could
-- not deliver without opening the schema itself to `authenticated`.
--
-- auth.uid() resolves the calling identity exactly as migration 0028's current_identity()
-- does: it is a session-level value PostgREST sets per request, unrelated to which database
-- role is currently executing, so it resolves correctly even from inside this nested,
-- effectively-superuser execution context.
--
-- Expiry evaluated here, at read time — never by a cleanup job (SUPABASE_ARCHITECTURE.md
-- §8): "a lapsed grant stops working the moment it lapses rather than the next time
-- something runs." An erased identity is excluded for the same reason migration 0028's
-- resolvers exclude one: §11.4's reference "resolves to nothing" once erased.

create or replace function workspace.current_memberships()
returns table (
  membership_id  uuid,
  workspace_id   uuid,
  role           text,
  scope          jsonb
)
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
    and (m.expires_at is null or m.expires_at > now());
$$;

comment on function workspace.current_memberships() is
  'The Workspace engine''s own logic: the caller''s live memberships, expiry and state evaluated at read time. Not SECURITY DEFINER and granted to nobody — reachable only as a nested call from api.current_workspace_memberships(), which runs it under the migration runner''s privileges. Never call directly from a policy; see ADR-0026''s "As implemented" section for why the row-independent shape matters.';

-- =========================================================================
-- THE DELEGATE — api.current_workspace_memberships()
--
-- Parameterless, and that is the entire point (ADR-0026 "As implemented"): depending on
-- nothing but auth.uid(), which is constant for one statement, lets a caller use this as an
-- uncorrelated subquery and get genuine once-per-statement cost for the expensive join,
-- with an O(1) lookup per row after. A version taking a workspace id as an argument would
-- take the scanned row's own column and be re-invoked per row regardless of STABLE — the
-- shape this package rejected.
--
-- SECURITY DEFINER so `authenticated` — which has no USAGE on `workspace` or `identity` —
-- can call it at all; the privileges required to call THIS function are just EXECUTE here
-- in `api`, granted below.

create or replace function api.current_workspace_memberships()
returns table (
  membership_id  uuid,
  workspace_id   uuid,
  role           text,
  scope          jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from workspace.current_memberships();
$$;

comment on function api.current_workspace_memberships() is
  'The Workspace engine''s isolation contract (ADR-0026): the caller''s live memberships. Use in RLS as an uncorrelated subquery — using (workspace_id in (select workspace_id from api.current_workspace_memberships())) — never as a per-row scalar check. Delegates to workspace.current_memberships(); holds no logic of its own.';

-- =========================================================================
-- ACCESS
--
-- Explicit revokes, verified rather than assumed (ADR-0026 property 4). Supabase's
-- `alter default privileges in schema public grant all on functions to anon, authenticated,
-- service_role` is documented as scoped to `public`; a newly created schema such as `api`
-- does not inherit it (Supabase's own guidance for a custom schema is to grant these
-- privileges by hand). This ADR does not trust that difference unverified — the explicit
-- revoke is written regardless, and VERIFY_MEMBERSHIP_HELPER.sql probes that anon cannot
-- call this function, the same discipline that found two anonymously callable resolvers in
-- Epic 02.

revoke all on function api.current_workspace_memberships() from public, anon, service_role;
grant execute on function api.current_workspace_memberships() to authenticated;

-- workspace.current_memberships() is granted to nobody at all — not authenticated, not
-- anon, not even klussie_engine_workspace beyond what 0019's default privileges already
-- imply for the schema owner. It is reachable only as a nested call inside the SECURITY
-- DEFINER delegate above.
revoke all on function workspace.current_memberships() from public, anon, authenticated, service_role;

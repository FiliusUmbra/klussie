-- Platform Activation Slice 0, WP 0.5 — the one small backend addition the client shell
-- needs: a caller-scoped capability check, so AppShell can ask "does my own active
-- workspace hold platform_operations" without a name lookup or a hardcoded id.
--
-- THE FIRST REAL CALLER OF workspace.workspace_has_capability() SINCE EPIC 04
--
-- 0079's own comment on that function: "No caller yet checks it — every feature in the
-- current product predates this engine." This migration is that first caller, exactly
-- the way 0133's list_audit_records() was the first real caller of
-- platform.audit_records's read grant.
--
-- SCOPED TO THE CALLER'S OWN MEMBERSHIP — NOT A GENERAL "DOES WORKSPACE X HOLD
-- CAPABILITY Y" ORACLE
--
-- workspace.workspace_has_capability() itself is granted to klussie_engine_workspace
-- only and answers the question for ANY workspace id, no caller context at all — correct
-- for an engine-internal check, wrong to expose directly to a client. Which capabilities
-- a workspace holds (Compliance, Advanced Compliance, Team Collaboration, ...) is real
-- information about that workspace's own commercial posture, and a client-facing version
-- of this check must never let one caller probe an arbitrary workspace id to learn
-- anything about it. workspace.my_workspace_has_capability() therefore checks the
-- caller's own real, active membership in p_workspace_id first
-- (workspace.current_memberships(), 0031) — false for both "no membership here" and
-- "membership, but capability absent," indistinguishable from the caller's own
-- perspective, which is the correct behaviour: revealing which of the two is true would
-- itself leak whether the workspace exists.
--
-- NAMED my_workspace_has_capability(), MATCHING THE ESTABLISHED my_* CONVENTION
--
-- my_assets(), my_properties(), list_my_workspaces() — every other client-facing,
-- caller-scoped read in this codebase already carries this prefix. This is the general
-- primitive Slice 1 onward reaches for whenever a screen needs "does my active
-- workspace hold capability X" (Premium Home capabilities, Compliance, ...) — Slice 0's
-- own need (is my active workspace the Operations Workspace) is its first caller, not
-- its only intended one.
--
-- SAME TWO-LAYER SHAPE, SAME REASON NOT TO REPEAT IT AGAIN HERE — see 0133's own header.

-- =========================================================================
-- THE LOGIC

create or replace function workspace.my_workspace_has_capability(p_workspace_id uuid, p_capability_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id
  ) and workspace.workspace_has_capability(p_workspace_id, p_capability_key);
$$;

comment on function workspace.my_workspace_has_capability(uuid, text) is
  'Caller-scoped capability check (WP 0.5, ADR-0030): true only if the caller holds a real, active membership in p_workspace_id AND that workspace holds p_capability_key. False for both "no membership" and "membership, capability absent" — indistinguishable on purpose, so a caller can never use this to probe an arbitrary workspace id. Reached only through api.my_workspace_has_capability().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.my_workspace_has_capability(p_workspace_id uuid, p_capability_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select workspace.my_workspace_has_capability(p_workspace_id, p_capability_key);
$$;

comment on function api.my_workspace_has_capability(uuid, text) is
  'The client-facing delegate for workspace.my_workspace_has_capability() (WP 0.5). Used first by AppShell to decide whether the active workspace is the Operations Workspace (ADR-0030); a general primitive for any later screen that needs "does my active workspace hold capability X".';

-- =========================================================================
-- ACCESS

revoke all on function api.my_workspace_has_capability(uuid, text) from public, anon, service_role;
grant execute on function api.my_workspace_has_capability(uuid, text) to authenticated;

-- workspace.my_workspace_has_capability() is granted to nobody at all, the same posture
-- as workspace.current_memberships() (0031) and platform.list_audit_records() (0133) —
-- reachable only as a nested call inside the SECURITY DEFINER delegate above.
revoke all on function workspace.my_workspace_has_capability(uuid, text) from public, anon, authenticated, service_role;

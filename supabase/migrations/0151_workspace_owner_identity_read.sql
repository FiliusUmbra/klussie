-- Platform Activation Slice 2, WP 2.6 — resolves a batch of workspaces to their real
-- owners' auth ids, the one missing piece the client cutover needs to show a pro's real
-- name/avatar/rating next to a work.quotes row.
--
-- WHY THIS EXISTS — REPUTATION STAYS LEGACY (§1.9), SO THE CLIENT NEEDS A BRIDGE TO IT
--
-- work.quotes.offering_workspace_id (0086) is a workspace id, not a displayable pro
-- identity — legacy's own shapePro() (src/lib/requests.js) reads
-- pro_profiles/profiles/pro_stats, all keyed by auth id, and none of that migrates in
-- this slice (SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md §1.9: reputation and reviews
-- stay legacy). src/lib/pros.js's own fetchPublicProInfo(proIds) already does everything
-- needed to turn a batch of auth ids into real display info, erasure-safe, reusing
-- resolve_identity_display() — the only missing step is workspace_id -> auth_user_id,
-- which this migration adds as a small, dedicated, batch read.
--
-- workspace.resolve_owner_person_ref() (0148) STOPS ONE HOP SHORT
--
-- 0148 built the workspace -> person_ref direction (needed there to add conversation
-- participants, which key on person_ref). This client-cutover need is one hop further:
-- person_ref -> identity.identities.auth_user_id, the actual key
-- pro_profiles/profiles/pro_stats join against. A new function, not an extension of
-- resolve_owner_person_ref() itself — that function's own single-workspace, single-value
-- shape serves a different real caller (the engagement cascade) and stays exactly as is.

create or replace function workspace.resolve_owner_auth_user_ids(p_workspace_ids uuid[])
returns table (workspace_id uuid, auth_user_id uuid)
language sql
stable
set search_path = ''
as $$
  select m.workspace_id, i.auth_user_id
  from workspace.memberships m
  join workspace.workspaces w on w.id = m.workspace_id
  join identity.identities i on i.person_ref = m.person_ref
  where m.workspace_id = any(p_workspace_ids)
    and w.type = 'professional'
    and m.role = 'owner'
    and m.state = 'active'
    and i.auth_user_id is not null
    and i.erased_at is null;
$$;

comment on function workspace.resolve_owner_auth_user_ids(uuid[]) is
  'For a batch of workspaces, each real owner membership''s underlying auth id — the bridge from a work.* workspace reference to legacy''s own pro_profiles/profiles/pro_stats identity, since reputation stays legacy (§1.9). Restricted to type = ''professional'' workspaces on purpose: the real caller (a quote''s offering workspace) is always one, and a customer''s own personal workspace owner must never be resolvable this way — a professional''s identity is already meant to be public (fetchPublicProInfo() already serves it to anon callers), a customer''s is not. Excludes an erased identity, matching every other real-name resolver in this codebase. Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_workspace_owner_auth_ids().';

create or replace function api.resolve_workspace_owner_auth_ids(p_workspace_ids uuid[])
returns table (workspace_id uuid, auth_user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select * from workspace.resolve_owner_auth_user_ids(p_workspace_ids);
$$;

comment on function api.resolve_workspace_owner_auth_ids(uuid[]) is
  'Delegate for workspace.resolve_owner_auth_user_ids() (WP 2.6). Public, matching api.resolve_public_professional_workspace()''s own posture (0065) — a workspace id and an auth id are not, on their own, sensitive; visibility of what they resolve to is enforced separately (fetchPublicProInfo() already reads public.pro_profiles under its own existing RLS).';

revoke all on function workspace.resolve_owner_auth_user_ids(uuid[]) from public, anon, authenticated, service_role;
revoke all on function api.resolve_workspace_owner_auth_ids(uuid[]) from public, service_role;
grant execute on function api.resolve_workspace_owner_auth_ids(uuid[]) to anon, authenticated;

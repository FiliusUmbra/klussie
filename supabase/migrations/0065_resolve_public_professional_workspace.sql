-- Epic 08 WP09 (part 4) — the last piece the portfolio read switch needs: given a pro's
-- own auth id (what src/lib/portfolio.js's callers already have — ProProfile.jsx passes
-- its own user.id, ProPublicProfileSheet.jsx and useConversation.js pass another pro's
-- profile id), resolve their Professional Workspace's id, so api.my_documents({
-- p_workspace_id }) has a real subject to query.
--
-- WHY THIS IS PUBLIC — ANON, NOT JUST AUTHENTICATED
--
-- ProPublicProfileSheet.jsx is exactly that — public, viewable while signed out, matching
-- public.portfolio_items' own real RLS (migration 0006: "to anon, authenticated"). A
-- workspace id is not sensitive by itself; nothing this function returns grants access to
-- anything — api.my_documents()'s own isolation logic (0058/0062) is what actually gates
-- visibility once the id is used. Resolving "which workspace represents this already-
-- public pro profile" is a fact about a public profile, not a private one.
--
-- WHY workspace, NOT property, OWNS THIS FUNCTION
--
-- Resolving a person's workspace membership is squarely the Workspace engine's own
-- concern (identity.identities -> workspace.memberships -> workspace.workspaces), the
-- same chain WP 08.06's backfill and WP 08.07's dual-write both already inline for this
-- exact join — factored here into one callable, the workspace engine's own schema, not
-- property's, since property.resolve_property_for_owner() (0053) is the nearest
-- precedent for "factor a repeated ownership-chain join into one function" but that one
-- resolves a *property*, not a *workspace* — this resolves the workspace itself, which is
-- workspace's own aggregate.

create or replace function workspace.resolve_public_professional_workspace(p_pro_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select w.id
  from identity.identities i
  join workspace.memberships m
    on m.person_ref = i.person_ref
    and m.role = 'owner'
    and m.state = 'active'
    and (m.expires_at is null or m.expires_at > now())
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
  where i.auth_user_id = p_pro_id;
$$;

comment on function workspace.resolve_public_professional_workspace(uuid) is
  'Given a pro''s auth id, resolves their Professional Workspace id — a fact about an already-public profile (public.pro_profiles/profiles), not a private one. Not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_public_professional_workspace().';

create or replace function api.resolve_public_professional_workspace(p_pro_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace.resolve_public_professional_workspace(p_pro_id);
$$;

comment on function api.resolve_public_professional_workspace(uuid) is
  'Delegate for workspace.resolve_public_professional_workspace() (ADR-0026''s split). Public, matching public.portfolio_items'' own real grant (migration 0006) — a workspace id is not sensitive; visibility is enforced separately by api.my_documents().';

revoke all on function workspace.resolve_public_professional_workspace(uuid) from public, anon, authenticated, service_role;
revoke all on function api.resolve_public_professional_workspace(uuid) from public, service_role;
grant execute on function api.resolve_public_professional_workspace(uuid) to anon, authenticated;

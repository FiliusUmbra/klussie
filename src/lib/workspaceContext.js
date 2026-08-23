// Epic 03 WP09 — resolves the signed-in person's workspace memberships once per session
// bootstrap, the first real caller of the Workspace engine's client-facing contract
// (`api.list_my_workspaces()`, migration 0038, extended from `api.current_workspace_
// memberships()` in WP 03.12 to carry type and name — the switcher's data source; the
// engine also exposes `api.resolve_workspace_context()` and `api.decide_permission()`,
// migration 0036, which this module still has no need for).
//
// THERE IS NO GATEWAY (ADR-0024). Roadmap §14 wrote WP 03.09 as "resolve request context
// once at the gateway", and ADR-0024 found there is no gateway to put it in and none built
// in this epic — the browser is the caller, exactly as it already is for
// `current_identity()` (Epic 02 WP06). "Once per request" becomes "once per statement"
// (ADR-0024 decision part 2); this module is the one place the SPA makes that statement for
// workspace membership, the same role `loadProfile` already plays for identity.
//
// THE FALLBACK IS DELIBERATE, following the exact idiom `mergeIdentityIntoProfile`
// established in auth.jsx. `api` is a schema PostgREST does not expose by default
// (ADR-0026): Project Settings > Data API > Exposed schemas must include it, a manual,
// per-environment step, and production has none of Epic 03's migrations at all
// (`docs/operations/PRODUCTION_MIGRATION_0018_0029.md`). Both are today's reality for some
// environment reachable by this code, so a missing function or an unexposed schema must not
// break sign-in — it is logged and treated as "no workspace memberships yet", never thrown.
import { supabase } from "./supabaseClient";

/**
 * The signed-in person's live workspace memberships — membership_id, workspace_id, role,
 * scope, workspace_type, workspace_name, one row per active, unexpired, unarchived
 * membership (`workspace.list_my_workspaces()`, migration 0038). Empty array on any
 * failure, logged rather than thrown; see this module's header for why a missing resolver
 * must never be fatal.
 */
export async function loadWorkspaceMemberships() {
  try {
    const { data, error } = await supabase.schema("api").rpc("list_my_workspaces");
    if (error) {
      console.warn("workspace context unavailable, continuing without it:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    // Belt-and-braces alongside the `error` branch above: a client without `.schema()` —
    // every real supabase-js client has it, but this keeps a testing double or a future
    // client swap from turning a missing method into a broken sign-in.
    console.warn("workspace context unavailable, continuing without it:", err.message);
    return [];
  }
}

/**
 * The workspace a person acts in.
 *
 * Zero memberships: null — nothing backfilled yet, or the resolver fell back.
 *
 * Exactly one: that one, unconditionally. PLATFORM_DOMAIN_MODEL.md §27 requires a
 * single-workspace person to see no workspace concept anywhere, so there is nothing to ask
 * and nothing a stored preference could usefully override.
 *
 * More than one: `preferredWorkspaceId` — the switcher's own choice (WP 03.12,
 * `src/lib/workspacePreference.js`) — when it names a workspace the person still holds a
 * live membership in. A preference for a workspace that has since lapsed (membership
 * revoked, workspace archived) is exactly as stale as no preference at all, so it is not
 * trusted blindly — it is checked against `memberships`, not assumed.
 *
 * With more than one and no valid preference, the personal workspace — or, failing that,
 * the first membership — is the default. This is what changed in WP 03.12: WP 03.09 left
 * this case returning null deliberately ("picking one automatically would be a permission
 * decision made in the client, which ADR-0024 rules out"). That reasoning was about
 * *reading data* under an assumption nobody chose. Defaulting the *view* a person lands on
 * is a different thing — it is what AppShell's `role` state already did for every dual-role
 * account before this epic existed, and matches it exactly: a person becomes a pro without
 * losing their customer view as the one they land on. The switcher is what lets them change
 * it, not what forces a choice before they can do anything.
 */
export function resolveActiveWorkspace(memberships, preferredWorkspaceId) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null;
  if (memberships.length === 1) return memberships[0];

  if (preferredWorkspaceId) {
    const preferred = memberships.find((m) => m.workspace_id === preferredWorkspaceId);
    if (preferred) return preferred;
  }

  return memberships.find((m) => m.workspace_type === "personal") || memberships[0];
}

/**
 * Which top-level experience (customer or pro) AppShell renders, for the one population
 * WP 03.12's switcher actually reaches — two or more real, resolved workspaces. Pulled out
 * of AppShell.jsx rather than left as JSX-adjacent logic (ENGINEERING_STANDARDS.md, "no
 * business logic in UI") — it is a small rule, but it is the rule that decides which entire
 * app a person sees, which is exactly the kind of decision this project's house style keeps
 * out of a component and testable on its own.
 *
 * Anyone not in that population — a single-workspace person, or any environment without
 * Epic 03's migrations, where `multiWorkspace` is always false — keeps whatever the
 * pre-Epic-03 `role` toggle state already says, completely unconsulted by this function.
 */
export function deriveEffectiveRole({ multiWorkspace, activeWorkspace, role }) {
  if (!multiWorkspace || !activeWorkspace) return role;
  return activeWorkspace.workspace_type === "professional" ? "pro" : "customer";
}

/**
 * The name a switcher shows for one membership — UNIFIED_PRODUCT_IA_REVIEW.md §3's own
 * finding: `m.workspace_name || m.workspace_type` used to print a raw backend value
 * ("personal", "professional") straight to the user the moment a workspace had no real
 * name. Every real workspace does have one (0034/0135's own naming, "My Home" or the
 * pro's business name/full name) — this fallback exists only for the column's own
 * nullability (migration 0030), never expected to fire against real data, and must speak
 * the same human vocabulary as everything else when it does: "Home" for a personal
 * workspace, "Business" for a professional or business one — never the type string
 * itself, per the CPO mandate's own "the word workspace should disappear" instruction.
 */
export function humanWorkspaceName(membership, t) {
  if (membership.workspace_name) return membership.workspace_name;
  return membership.workspace_type === "personal" ? t.workspaceFallbackHome : t.workspaceFallbackBusiness;
}

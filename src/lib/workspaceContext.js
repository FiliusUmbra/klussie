// Epic 03 WP09 — resolves the signed-in person's workspace memberships once per session
// bootstrap, the first real caller of the Workspace engine's client-facing contract
// (`api.current_workspace_memberships()`, migration 0031; the engine also exposes
// `api.resolve_workspace_context()` and `api.decide_permission()`, migration 0036 — WP09
// does not yet need either, and calling them without a workspace id to ask about would be
// nothing this package has).
//
// THERE IS NO GATEWAY (ADR-0024). Roadmap §14 wrote WP 03.09 as "resolve request context
// once at the gateway", and ADR-0024 found there is no gateway to put it in and none built
// in this epic — the browser is the caller, exactly as it already is for
// `current_identity()` (Epic 02 WP06). "Once per request" becomes "once per statement"
// (ADR-0024 decision part 2); this module is the one place the SPA makes that statement for
// workspace membership, the same role `loadProfile` already plays for identity.
//
// THIS DOES NOT CHANGE WHAT ANYONE SEES. It resolves data and nothing yet reads it to scope
// a query (that is WP 03.11's read switch) or to render a switcher (WP 03.12). A
// single-workspace person must see no difference — PLATFORM_DOMAIN_MODEL.md §27's
// requirement for the whole epic — and resolving memberships correctly while acting on none
// of them is exactly that.
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
 * scope, one row per active, unexpired membership (`workspace.current_memberships()`,
 * migration 0031). Empty array on any failure, logged rather than thrown; see this module's
 * header for why a missing resolver must never be fatal.
 */
export async function loadWorkspaceMemberships() {
  try {
    const { data, error } = await supabase.schema("api").rpc("current_workspace_memberships");
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
 * The workspace a person acts in when nothing asks them to choose: the sole membership,
 * when there is exactly one. Returns null for zero memberships (nothing backfilled yet, or
 * the resolver fell back) and for more than one — PLATFORM_DOMAIN_MODEL.md §27 requires a
 * single-workspace person to see no workspace concept anywhere, and picking one of several
 * automatically would be a permission decision made in the client, which ADR-0024 rules
 * out. The multi-workspace case is WP 03.12's switcher, not this function's job.
 */
export function resolveActiveWorkspace(memberships) {
  if (!Array.isArray(memberships) || memberships.length !== 1) return null;
  return memberships[0];
}

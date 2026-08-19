// Platform Activation Slice 0, WP 0.5 — whether the signed-in person's currently active
// workspace is the internal Operations Workspace (ADR-0030). The one check AppShell
// needs to decide whether to render OperatorApp instead of Customer/Pro.
//
// Composed from api.my_workspace_has_capability() (migration 0134), which already
// refuses to reveal anything about a workspace the caller has no real membership in —
// so this module adds no new authorization logic of its own, only the one capability
// key it happens to check for.
import { supabase } from "./supabaseClient";

const OPERATIONS_CAPABILITY_KEY = "platform_operations";

/**
 * False on any failure — no active workspace, an unresolved schema, a missing function,
 * a workspace the caller no longer belongs to — never thrown. Failing toward "not an
 * operator workspace" is the only safe default here: a false negative costs an operator
 * one extra render of the ordinary customer view; a false positive would expose
 * operator-only UI to someone who should not see it. Mirrors the exact fallback idiom
 * loadWorkspaceMemberships() already established (workspaceContext.js) — a missing
 * resolver must never be fatal, and must never fail open either.
 */
export async function isOperatorWorkspace(workspaceId) {
  if (!workspaceId) return false;
  try {
    const { data, error } = await supabase.schema("api").rpc("my_workspace_has_capability", {
      p_workspace_id: workspaceId,
      p_capability_key: OPERATIONS_CAPABILITY_KEY,
    });
    if (error) {
      console.warn("operator workspace check unavailable, continuing without it:", error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn("operator workspace check unavailable, continuing without it:", err.message);
    return false;
  }
}

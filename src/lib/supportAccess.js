// Support access, WP S.1 — the client half of the flow SUPPORT_ACCESS_DESIGN.md scopes
// and migration 0172 (WP S.0) contracts. Reads through
// api.support_access_grants(), writes through api.grant_support_access()/
// api.end_support_access(). Same reshape/fallback idiom every other operator-only read
// switch in this codebase already uses (see workspaceLookup.js, trustSafety.js).
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

function reshapeGrant(row) {
  return {
    membershipId: row.membership_id,
    operatorName: row.operator_name,
    purpose: row.purpose,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    status: row.status,
  };
}

/**
 * Every support-access grant ever made for one workspace, most recent first. Never
 * throws — a caller with no operator membership sees an empty page, the same
 * EXISTS-gated behaviour every read switch in this codebase already produces.
 */
export async function fetchSupportAccessGrants(workspaceId) {
  try {
    const { data, error } = await supabase.schema("api").rpc("support_access_grants", { p_workspace_id: workspaceId });
    if (error) {
      console.warn("support access grants unavailable:", error.message);
      return [];
    }
    return (data ?? []).map(reshapeGrant);
  } catch (err) {
    console.warn("support access grants unavailable:", err.message);
    return [];
  }
}

/**
 * Requests support access to a workspace — a real, stated purpose and a bounded
 * duration (1-72 hours; workspace.grant_support_access_for_caller()'s own check,
 * enforced server-side regardless of what the client sends). actorRef is the operator's
 * own auth user id, matching
 * becomePro()'s/Trust & Safety's own p_actor_type: "person" convention for a real,
 * human-initiated action.
 */
export async function grantSupportAccess({ workspaceId, purpose, durationHours, actorRef }) {
  const { error } = await supabase.schema("api").rpc("grant_support_access", {
    p_membership_id: uuidv7(),
    p_workspace_id: workspaceId,
    p_purpose: purpose,
    p_duration_hours: durationHours,
    p_audit_id: uuidv7(),
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/** Ends an active support-access grant before its own expiry. */
export async function endSupportAccess({ membershipId, actorRef }) {
  const { error } = await supabase.schema("api").rpc("end_support_access", {
    p_membership_id: membershipId,
    p_audit_id: uuidv7(),
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

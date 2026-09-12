// Pro Workspace remarks, 2026-09-12 (Theme C) — the write side of ADR-0027's own
// membership.join.approve (migration 0036), reachable for the first time via migration
// 0220. See that migration's own header for why this joins an existing `professional`
// workspace as a real 'employee' membership rather than provisioning a new `business`
// workspace type.
//
// Callers throw the raw error, same as pros.js/homeInventory.js's own write functions —
// each caller maps to its own generic, localized message rather than this module
// collapsing every distinct failure (already-a-member, already-pending, not-yet-decided)
// into one string a caller could not tell apart.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

/** Real, active professional workspaces matching `query` by name, capped at 10. Never
 * includes a workspace the caller already belongs to. */
export async function searchProfessionalWorkspaces(query) {
  const { data, error } = await supabase.schema("api").rpc("search_professional_workspaces", { p_query: query });
  if (error) throw error;
  return data || [];
}

export async function requestToJoinWorkspace(workspaceId, message, actorRef) {
  const { error } = await supabase.schema("api").rpc("request_to_join", {
    p_request_id: uuidv7(),
    p_workspace_id: workspaceId,
    p_message: message || null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/** The pending requests for one workspace — refuses (throws) unless the caller holds
 * membership.join.approve there. */
export async function fetchJoinRequests(workspaceId) {
  const { data, error } = await supabase.schema("api").rpc("list_join_requests", { p_workspace_id: workspaceId });
  if (error) throw error;
  return data || [];
}

export async function decideJoinRequest(requestId, decision, actorRef) {
  const { error } = await supabase.schema("api").rpc("decide_join_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_membership_id: uuidv7(),
    p_event_id: uuidv7(),
    p_membership_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

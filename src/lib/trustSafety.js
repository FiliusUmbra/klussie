// Slice 5, WP 5.2 — Trust & Safety's client half. Reads through
// api.trust_safety_queue()/api.case_detail() (migration 0171); writes through
// api.file_case()/api.record_decision(). The platform_operations gate for every read
// lives entirely in those functions, not here — this module holds only the reshape and
// the fallback idiom every other read switch in this codebase already uses (see
// workspaceLookup.js, this file's own nearest precedent).
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

export const TRUST_SAFETY_QUEUE_PAGE_SIZE = 50;

function reshapeQueueRow(row) {
  return {
    id: row.case_id,
    reporterName: row.reporter_name,
    reportedWorkspaceId: row.reported_workspace_id,
    reportedWorkspaceName: row.reported_workspace_name,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
  };
}

function reshapeDecision(row) {
  return {
    id: row.id,
    operatorName: row.operatorName,
    action: row.action,
    reason: row.reason,
    capabilityKey: row.capabilityKey,
    decidedAt: row.decidedAt,
  };
}

function reshapeCaseDetail(row) {
  return {
    id: row.case_id,
    reporterName: row.reporter_name,
    reportedWorkspaceId: row.reported_workspace_id,
    reportedWorkspaceName: row.reported_workspace_name,
    category: row.category,
    details: row.details,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    status: row.status,
    createdAt: row.created_at,
    decisions: (row.decisions ?? []).map(reshapeDecision),
  };
}

/**
 * The open/escalated queue, oldest first. Never throws — a caller with no operator
 * membership sees an empty page, the same EXISTS-gated behaviour every read switch in
 * this codebase already produces (see searchWorkspaces()'s own identical stated design).
 */
export async function fetchTrustSafetyQueue({ offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.schema("api").rpc("trust_safety_queue", {
      p_limit: TRUST_SAFETY_QUEUE_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      console.warn("trust & safety queue unavailable:", error.message);
      return [];
    }
    return (data ?? []).map(reshapeQueueRow);
  } catch (err) {
    console.warn("trust & safety queue unavailable:", err.message);
    return [];
  }
}

/** One case in full, including its own decision history. Null if not found or not an operator. */
export async function fetchCaseDetail(caseId) {
  const { data, error } = await supabase.schema("api").rpc("case_detail", { p_case_id: caseId });
  if (error) throw error;
  const row = data?.[0];
  return row ? reshapeCaseDetail(row) : null;
}

/**
 * Records an operator decision — warn, suspend, escalate, or close with no action.
 * capabilityKey is required for 'suspend', ignored otherwise (the same pairing
 * safety.decisions' own CHECK constraint enforces server-side). actorRef is the
 * operator's own auth user id, matching becomePro()'s own p_actor_type: "person"
 * convention for a real, human-initiated action.
 */
export async function recordDecision({ caseId, action, reason, capabilityKey, actorRef }) {
  const { error } = await supabase.schema("api").rpc("record_decision", {
    p_decision_id: uuidv7(),
    p_case_id: caseId,
    p_action: action,
    p_reason: reason || null,
    p_capability_key: action === "suspend" ? capabilityKey : null,
    p_withdrawal_history_id: uuidv7(),
    p_withdrawal_event_id: uuidv7(),
    p_decided_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/**
 * Files a new case — the real path ReportSheet.jsx cuts over to (WP 5.1). Requires a
 * real prior engagement between the caller's own workspace and reportedWorkspaceId, as
 * the requesting side (safety.file_case_for_caller()'s own check).
 */
export async function fileCase({ reportedWorkspaceId, category, details, subjectType, subjectId, actorRef }) {
  const { error } = await supabase.schema("api").rpc("file_case", {
    p_case_id: uuidv7(),
    p_reported_workspace_id: reportedWorkspaceId,
    p_category: category,
    p_details: details || null,
    p_subject_type: subjectType || null,
    p_subject_id: subjectId || null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

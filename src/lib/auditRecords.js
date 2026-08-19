// Platform Activation Slice 0, WP 0.6 — reads platform.audit_records through
// api.list_audit_records() (migration 0133). The Operator shell's own read path; the
// EXISTS-gated permission check lives entirely in that function, not here — this module
// holds only the reshape and the fallback idiom every other read switch already uses.
import { supabase } from "./supabaseClient";

export const AUDIT_PAGE_SIZE = 25;

function reshape(row) {
  return {
    id: row.audit_id,
    occurredAt: row.occurred_at,
    workspaceId: row.workspace_id,
    actorType: row.actor_type,
    actorRef: row.actor_ref,
    action: row.action,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    outcome: row.outcome,
    authority: row.authority,
    correlationId: row.correlation_id,
    detail: row.detail,
  };
}

// Empty strings from untouched filter fields mean the same thing as "no filter" —
// api.list_audit_records()'s own parameters are nullable, and an empty string is not a
// value anyone typed on purpose.
const orNull = (value) => (value === "" || value == null ? null : value);

/**
 * One page of audit records, newest first, matching the filters given.
 *
 * Never throws. A caller with no operator membership sees an empty page — the same
 * EXISTS-gated behaviour every read switch in this codebase already produces — and so
 * does a caller hitting any other failure (an unresolved schema, a missing function).
 * There is deliberately no way for this function's own return value to distinguish
 * "you may not see this" from "there is nothing to see," matching
 * platform.list_audit_records()'s own stated design.
 */
export async function fetchAuditRecords({
  workspaceId,
  actorRef,
  actionPrefix,
  occurredFrom,
  occurredTo,
  offset = 0,
} = {}) {
  try {
    const { data, error } = await supabase.schema("api").rpc("list_audit_records", {
      p_workspace_id: orNull(workspaceId),
      p_actor_ref: orNull(actorRef),
      p_action_prefix: orNull(actionPrefix),
      p_occurred_from: orNull(occurredFrom),
      p_occurred_to: orNull(occurredTo),
      p_limit: AUDIT_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      console.warn("audit records unavailable:", error.message);
      return [];
    }
    return (data ?? []).map(reshape);
  } catch (err) {
    console.warn("audit records unavailable:", err.message);
    return [];
  }
}

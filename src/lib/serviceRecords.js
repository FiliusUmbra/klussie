// Platform Activation Slice 3, WP 3.2 — the customer's own read of a job's Service
// Record, once one exists. WP 3.0/0164 built the contract (api.resolve_service_record_
// for_request, two-sided, keyed by request id — the one thing no earlier read exposed);
// this is the client side of that same "fail toward nothing shown" read: a request with
// no record authored yet (every request, until WP 3.3 ships a real editor) returns null,
// not an error — RequestDetailSheet.jsx renders that as an educating empty state, never
// a crash.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

// Reshapes the flat api.* row into the camelCase shape the component reads, the same
// convention reshapeRequest()/reshapeWorkQuote() already establish in requests.js.
function reshapeServiceRecord(row) {
  return {
    id: row.id,
    performedAt: row.performed_at,
    workPerformed: row.work_performed,
    agreedPrice: row.agreed_price === null ? null : Number(row.agreed_price),
    priceCurrency: row.price_currency,
    warrantyUntil: row.warranty_until,
    customerApproved: row.customer_approved,
    customerApprovedAt: row.customer_approved_at,
    aiSummary: row.ai_summary,
    recommendations: row.recommendations,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function fetchServiceRecordForRequest(requestId) {
  const { data, error } = await supabase
    .schema("api")
    .rpc("resolve_service_record_for_request", { p_request_id: requestId });
  if (error) throw error;
  return data?.[0] ? reshapeServiceRecord(data[0]) : null;
}

// actorId is the caller's own auth id (the property's current steward, checked server-
// side by work.record_service_record_approval_for_caller() — no client-side permission
// logic here, matching propertyTwin.js's own established restraint).
export async function approveServiceRecord(serviceRecordId, actorId) {
  const { error } = await supabase.schema("api").rpc("record_service_record_approval", {
    p_service_record_id: serviceRecordId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorId,
  });
  if (error) throw error;
}

// Platform Activation Slice 3 — the client side of the Service Record contract.
//
// WP 3.2: the customer's own read of a job's Service Record, once one exists. WP 3.0/0164
// built the contract (api.resolve_service_record_for_request, two-sided, keyed by request
// id — the one thing no earlier read exposed); this is the client side of that same "fail
// toward nothing shown" read: a request with no record authored yet returns null, not an
// error — RequestDetailSheet.jsx renders that as an educating empty state, never a crash.
//
// WP 3.3: the pro's own write — createServiceRecord() (api.create_service_record, one
// creation call, no draft, per 0084's own "created already complete" design — see
// WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md §5) and the evidence-photo upload (0165's own new
// contract, closing the one genuinely-required gap that design note's own §4 found:
// property.document_attachments had no way to attach a document from the PERFORMING side
// at all before this).
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

// WP 3.3 — the pro's own single creation call (api.create_service_record_for_caller
// resolves performing_workspace_id/property_id from engagementId alone; nothing here is
// trusted from the client beyond what the caller typed). Returns the new record's id.
// warrantyUntil/agreedPrice/recommendations/content are all genuinely optional — the
// design note's own §2 finding: the true minimum record is performedAt + workPerformed
// alone, both already defaulted/required in the editor's own Tier 0.
export async function createServiceRecord({
  engagementId, actorRef, performedAt, workPerformed,
  agreedPrice = null, priceCurrency = null, warrantyUntil = null,
  recommendations = null, content = {},
}) {
  const serviceRecordId = uuidv7();
  const { error } = await supabase.schema("api").rpc("create_service_record", {
    p_service_record_id: serviceRecordId,
    p_engagement_id: engagementId,
    p_performed_at: performedAt,
    p_work_performed: workPerformed,
    p_agreed_price: agreedPrice,
    p_price_currency: priceCurrency,
    p_warranty_until: warrantyUntil,
    p_ai_summary: null,
    p_recommendations: recommendations,
    p_content: content,
    p_event_id: uuidv7(),
    p_warranty_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
  return serviceRecordId;
}

// The performing annex — margin, internal cost, supplier pricing, scheduling notes,
// internal commentary. §13.2: "private by construction, not by a checkbox someone can
// get wrong" — this is a SEPARATE write from createServiceRecord(), matching the
// contract's own two-table split (work.service_record_performing_annexes), never merged
// into the same call. Every field optional; calling this at all is optional too.
export async function writePerformingAnnex({
  serviceRecordId, internalCost = null, margin = null,
  supplierUsed = null, supplierPrice = null, schedulingNotes = null, internalCommentary = null,
}) {
  const { error } = await supabase.schema("api").rpc("write_performing_annex", {
    p_annex_id: uuidv7(),
    p_service_record_id: serviceRecordId,
    p_internal_cost: internalCost,
    p_margin: margin,
    p_supplier_used: supplierUsed,
    p_supplier_price: supplierPrice,
    p_scheduling_notes: schedulingNotes,
    p_internal_commentary: internalCommentary,
  });
  if (error) throw error;
}

// WP 3.3, 0165 — evidence photos, the one genuinely-required new capability the design
// note's own §4 found. Uploads to the same 'documents' bucket every Document Engine
// write since 0141 uses, rooted under the pro's own workspace folder (0165's own storage-
// path check), then attaches under the record's own originating request — shared with
// the requesting workspace server-side (0165's own document_shares row), so the customer
// reads it back through the exact same api.my_documents({p_request_id}) call
// RequestPhotosStrip.jsx already uses, filtered to this one type_key.
export async function uploadServiceRecordEvidence(serviceRecordId, workspaceId, actorRef, file) {
  const path = `${workspaceId}/${serviceRecordId}/${crypto.randomUUID()}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { error } = await supabase.schema("api").rpc("create_document_for_service_record", {
    p_document_id: uuidv7(),
    p_attachment_id: uuidv7(),
    p_service_record_id: serviceRecordId,
    p_storage_path: path,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) {
    // Matches documents.js's own established idiom: the upload already landed; cleaning
    // it up here keeps the bucket from accumulating objects nothing will ever reference.
    await supabase.storage.from("documents").remove([path]).catch(() => {});
    throw error;
  }
}

// Evidence only — filters the same request-scoped read RequestPhotosStrip.jsx already
// uses down to type_key = 'service_evidence', so a pre-job "here's what's broken" photo
// and a post-job evidence photo never render in the same strip undifferentiated (the
// design note's own §4 flagged this as a real decision, resolved here by type_key).
export async function fetchServiceRecordEvidence(requestId) {
  const { data, error } = await supabase.schema("api").rpc("my_documents", { p_request_id: requestId });
  if (error) throw error;
  const evidenceRows = (data || []).filter((row) => row.type_key === "service_evidence");
  if (evidenceRows.length === 0) return [];

  const SIGNED_URL_TTL_SECONDS = 3600;
  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrls(evidenceRows.map((row) => row.storage_path), SIGNED_URL_TTL_SECONDS);
  if (signError) throw signError;
  return evidenceRows.map((row, i) => ({ id: row.id, url: signed[i]?.signedUrl || null }));
}

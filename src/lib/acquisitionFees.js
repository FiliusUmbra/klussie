// Payments Slice A (WP A5) — the professional's own read/write path onto
// commerce.acquisition_fee_assessments (0230), reached only through the api.* delegates
// (0230's own grants: authenticated, nothing broader). No client ever computes a rate,
// a cap, or an eligibility decision — every value here is read back from what the server
// already decided, matching this codebase's own "never trust a client-supplied rate or
// amount" discipline (api/_lib/auth.js's own header).
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

/** Every acquisition-fee assessment for a professional workspace's own jobs. */
export async function fetchMyAcquisitionFeeAssessments(workspaceId) {
  if (!workspaceId) return [];
  const { data, error } = await supabase
    .schema("api")
    .rpc("my_acquisition_fee_assessments", { p_workspace_id: workspaceId });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    engagementId: row.engagement_id,
    rate: row.rate !== null ? Number(row.rate) : null,
    maxFee: row.max_fee !== null ? Number(row.max_fee) : null,
    currency: row.currency,
    baseAmount: Number(row.base_amount),
    feeAmount: Number(row.fee_amount),
    status: row.status,
    notChargeableReason: row.not_chargeable_reason,
    disclosedAt: row.disclosed_at,
    acceptedAt: row.accepted_at,
    invoiceId: row.invoice_id,
  }));
}

/** The professional's own explicit acceptance of a disclosed fee (decision table: shown before commitment). */
export async function acceptAcquisitionFeeDisclosure(assessmentId, actorRef) {
  const { error } = await supabase.schema("api").rpc("accept_acquisition_fee_disclosure", {
    p_assessment_id: assessmentId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

// The professional's own interim "the customer has paid me" attestation — see
// 0230_acquisition_fee_assessments.sql's own header for why this, not a real payment-
// provider signal, is what triggers invoicing today.
export async function confirmAcquisitionFeePaymentReceived(assessmentId, actorRef) {
  const { error } = await supabase.schema("api").rpc("confirm_payment_received", {
    p_assessment_id: assessmentId,
    p_invoice_id: uuidv7(),
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

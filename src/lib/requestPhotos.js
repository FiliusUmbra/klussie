// Platform Activation Slice 2, WP 2.6 — request-photo uploads write through the Document
// Engine's own request subject (property.create_document_for_request(), migration 0149),
// not the legacy service_request_photos table. Every caller of uploadRequestPhoto()
// (CustomerApp.jsx's own attachPhotos(), useConversation.js's own bookProfessional())
// already only ever holds a work.requests id after this slice's own identity migration —
// createServiceRequest()/createDirectedRequest() both return the work-shaped row now, so
// there is no remaining caller left holding a legacy id to write against.
//
// READS SPLIT ACROSS TWO ID SPACES — SEE RequestPhotosStrip.jsx's OWN `legacy` PROP
//
// fetchProLeads() stays legacy by design (src/lib/requests.js's own header), so a lead's
// own id is still the legacy service_requests.id — api.documents_for_service_request()
// (0063) is the only lookup that can ever find its photos, since request-photo documents
// created before this slice are mirrored there, keyed by the legacy id, and were never
// re-attached under work.requests. A customer's own request id is a work.requests id.
// Rather than guess which space an id belongs to (a real ambiguity two random-looking
// UUIDs cannot resolve safely), the caller states it explicitly.
//
// storage_bucket IS 'documents', NOT 'request-photos' — 0149's own write path hard-codes
// it, matching every Document Engine write since 0141, and the storage.objects policy
// that gates it requires the path's first folder segment to be a real workspace the
// caller is a member of — workspaceId, not customerId, is what the path is rooted under.
//
// A CUSTOMER REQUEST FROM BEFORE THIS SLICE HAS NO PHOTOS THROUGH THIS PATH
//
// property.document_attachments.request_id (0149) is a brand-new column; nothing
// retroactively re-attaches a pre-cutover request's already-mirrored legacy photos under
// it, and there is no work.requests -> legacy id resolver in the reverse direction this
// file could use even if it wanted to (only resolve_work_request_for_legacy() exists, the
// other way). A pre-cutover customer request's photo strip renders empty going forward —
// the same class of gap this slice has already accepted for an un-correlated legacy lead
// in sendQuote() (src/lib/requests.js), not a new category of risk.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

const SIGNED_URL_TTL_SECONDS = 3600;

export async function uploadRequestPhoto(requestId, customerId, workspaceId, file) {
  const path = `${workspaceId}/${requestId}/${crypto.randomUUID()}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
  if (error) throw error;

  const { error: rowError } = await supabase.schema("api").rpc("create_document_for_request", {
    p_document_id: uuidv7(),
    p_attachment_id: uuidv7(),
    p_request_id: requestId,
    p_type_key: "request_photo",
    p_storage_path: path,
    p_issuer: null,
    p_valid_from: null,
    p_valid_until: null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: customerId,
  });
  if (rowError) throw rowError;
}

async function signPhotos(rows) {
  if (rows.length === 0) return [];
  // Every mirrored request-photo document was backfilled/mirrored from the same
  // 'request-photos' bucket (0060/0061's own mapping) — grouping by storage_bucket rather
  // than assuming it is what lets this survive a future document type using a different
  // bucket without silently signing against the wrong one. New (WP 2.6) writes land in
  // 'documents' instead (this file's own header) — the grouping already handles both.
  const byBucket = new Map();
  for (const row of rows) {
    const list = byBucket.get(row.storage_bucket) || [];
    list.push(row);
    byBucket.set(row.storage_bucket, list);
  }

  const signedByPath = new Map();
  for (const [bucket, bucketRows] of byBucket) {
    const { data: signed, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(bucketRows.map((row) => row.storage_path), SIGNED_URL_TTL_SECONDS);
    if (error) continue;
    bucketRows.forEach((row, i) => signedByPath.set(row.storage_path, signed[i]?.signedUrl || null));
  }

  return rows.map((row) => ({ id: row.id, storagePath: row.storage_path, url: signedByPath.get(row.storage_path) ?? null }));
}

// legacy: true for a pro's own lead (fetchProLeads() stays legacy — requestId is a legacy
// service_requests.id). false (default) for a customer's own request (requestId is a
// work.requests id) — see this file's own header for why this cannot be inferred from the
// id alone.
export async function fetchRequestPhotos(requestId, { legacy = false } = {}) {
  if (legacy) {
    const { data, error } = await supabase.schema("api").rpc("documents_for_service_request", { p_request_id: requestId });
    if (error) throw error;
    return signPhotos(data || []);
  }

  const { data, error } = await supabase.schema("api").rpc("my_documents", { p_request_id: requestId });
  if (error) throw error;
  return signPhotos(data || []);
}

// Unreachable from any current UI (no call site) — left targeting the legacy table
// unchanged. The new engine has no delete/void path at the Postgres level yet (0141's own
// header: "delete_document() ... either" is deliberately not built), so there is nothing
// to cut this over to.
export async function deleteRequestPhoto(id, storagePath) {
  const { error } = await supabase.from("service_request_photos").delete().eq("id", id);
  if (error) throw error;
  await supabase.storage.from("request-photos").remove([storagePath]);
}

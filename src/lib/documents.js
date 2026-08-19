// Platform Activation Slice 1, WP 1.8 — the client side of api.create_document()
// (migration 0141, WP 1.6): uploads to the 'documents' Storage bucket, then creates the
// row that references what was actually uploaded.
//
// THE PATH MUST BE ROOTED UNDER THE CALLER'S OWN WORKSPACE — property.create_document()
// (0141) REFUSES ANYTHING ELSE
//
// 0141's own header: "storage_path must be rooted under the caller's own resolved
// workspace folder... a cheap, real integrity check." The path built here —
// `<workspaceId>/<documentId>/<filename>` — is the one shape both halves (the Storage
// policy and this function's own check) agree on; nothing else would pass.
//
// TWO WRITES, NO SHARED TRANSACTION — UPLOAD FIRST, ROW SECOND
//
// Storage and Postgres cannot commit together. If the row create fails after a
// successful upload, the object is simply never referenced by anything — an orphaned
// file, not a broken document a customer could see partially. The reverse order (row
// first) would let a customer "see" a document whose file was never actually stored.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

/**
 * Uploads `file` and creates a real document attached to a property
 * (`api.create_document()`, WP 1.6). `typeKey` must be one of the catalog's real values
 * (`warranty`/`certificate`/`manual`/`other`, per 0141's own seed) — the form offers only
 * those, and the database's own foreign key is the backstop if it ever doesn't.
 * `actorRef` is the caller's own auth id (ADR-0019).
 */
export async function createDocument({ propertyId, workspaceId, actorRef, typeKey, issuer, validUntil, file }) {
  const documentId = uuidv7();
  const attachmentId = uuidv7();
  const storagePath = `${workspaceId}/${documentId}/${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { error } = await supabase.schema("api").rpc("create_document", {
    p_document_id: documentId,
    p_attachment_id: attachmentId,
    p_property_id: propertyId,
    p_type_key: typeKey,
    p_storage_path: storagePath,
    p_issuer: issuer || null,
    p_valid_from: null,
    p_valid_until: validUntil || null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) {
    // The upload already landed; the row did not. Cleaning it up here keeps the bucket
    // from accumulating objects nothing will ever reference — best-effort, since a
    // failure here must not hide the real error the caller needs to see.
    await supabase.storage.from("documents").remove([storagePath]).catch(() => {});
    throw error;
  }

  return { id: documentId };
}

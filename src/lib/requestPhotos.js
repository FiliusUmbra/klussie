import { supabase } from "./supabaseClient";

const SIGNED_URL_TTL_SECONDS = 3600;

// Private bucket (unlike avatars/portfolio) — path encodes both the owner and the
// request so RLS can scope pro visibility to matching requests only.
export async function uploadRequestPhoto(requestId, customerId, file) {
  const path = `${customerId}/${requestId}/${crypto.randomUUID()}`;
  const { error } = await supabase.storage
    .from("request-photos")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { error: rowError } = await supabase
    .from("service_request_photos")
    .insert({ request_id: requestId, storage_path: path });
  if (rowError) throw rowError;
}

// Epic 08 WP09 — the read switch. api.documents_for_service_request() (migration 0063) is
// tried first; property.documents holds exactly what this shape needs (storage_bucket,
// storage_path, id) with nothing dropped in translation, unlike the portfolio read (still
// on household_items' — actually service_request_photos' — original table: see
// src/lib/portfolio.js's own note on why its own switch is not made yet). A resolver
// failure (migrations not applied, RLS not yet exposing the schema) falls back to the
// original direct read — the same "add without switching becomes switching" discipline
// every read switch since Epic 03 WP 03.11 has used, silent to the caller either way.
async function fetchViaDocumentEngine(requestId) {
  const { data, error } = await supabase.schema("api").rpc("documents_for_service_request", { p_request_id: requestId });
  if (error) throw error;
  return data;
}

async function signPhotos(rows) {
  if (rows.length === 0) return [];
  // Every mirrored request-photo document was backfilled/mirrored from the same
  // 'request-photos' bucket (0060/0061's own mapping) — grouping by storage_bucket rather
  // than assuming it is what lets this survive a future document type using a different
  // bucket without silently signing against the wrong one.
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

export async function fetchRequestPhotos(requestId) {
  try {
    const documents = await fetchViaDocumentEngine(requestId);
    return await signPhotos(documents);
  } catch (err) {
    // Migrations 0055–0063 not yet applied to this environment, or the caller has no
    // session (api.documents_for_service_request() requires one — request photos are
    // never public, unlike portfolio). Either way, the original table is still
    // authoritative and still correct to read directly.
    console.warn("document engine unavailable for request photos, falling back:", err.message);
  }

  const { data, error } = await supabase
    .from("service_request_photos")
    .select("id, storage_path, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return signPhotos(data.map((row) => ({ id: row.id, storage_bucket: "request-photos", storage_path: row.storage_path })));
}

export async function deleteRequestPhoto(id, storagePath) {
  const { error } = await supabase.from("service_request_photos").delete().eq("id", id);
  if (error) throw error;
  await supabase.storage.from("request-photos").remove([storagePath]);
}

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

export async function fetchRequestPhotos(requestId) {
  const { data, error } = await supabase
    .from("service_request_photos")
    .select("id, storage_path, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (data.length === 0) return [];

  const { data: signed, error: signError } = await supabase.storage
    .from("request-photos")
    .createSignedUrls(data.map((row) => row.storage_path), SIGNED_URL_TTL_SECONDS);
  if (signError) throw signError;

  return data.map((row, i) => ({ id: row.id, storagePath: row.storage_path, url: signed[i]?.signedUrl || null }));
}

export async function deleteRequestPhoto(id, storagePath) {
  const { error } = await supabase.from("service_request_photos").delete().eq("id", id);
  if (error) throw error;
  await supabase.storage.from("request-photos").remove([storagePath]);
}

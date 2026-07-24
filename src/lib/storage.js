import { supabase } from "./supabaseClient";

// Always stored at the same path so re-uploads overwrite instead of orphaning old files.
// The timestamp query param busts the browser/CDN cache for the (otherwise stable) URL.
export async function uploadAvatar(userId, file) {
  const path = `${userId}/avatar`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

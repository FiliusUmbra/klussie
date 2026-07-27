import { supabase } from "./supabaseClient";

// Each portfolio photo gets its own path (unlike the single fixed avatar path) since a
// pro can have many.
export async function uploadPortfolioImage(proId, file) {
  const path = `${proId}/${crypto.randomUUID()}`;
  const { error } = await supabase.storage
    .from("portfolio")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("portfolio").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function addPortfolioItem({ proId, imageUrl, storagePath, caption }) {
  const { data, error } = await supabase
    .from("portfolio_items")
    .insert({ pro_id: proId, image_url: imageUrl, storage_path: storagePath, caption: caption || null })
    .select("id, image_url, storage_path, caption, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchPortfolioItems(proId) {
  const { data, error } = await supabase
    .from("portfolio_items")
    .select("id, image_url, storage_path, caption, created_at")
    .eq("pro_id", proId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updatePortfolioCaption(itemId, caption) {
  const { error } = await supabase.from("portfolio_items").update({ caption: caption || null }).eq("id", itemId);
  if (error) throw error;
}

export async function deletePortfolioItem(itemId, storagePath) {
  const { error } = await supabase.from("portfolio_items").delete().eq("id", itemId);
  if (error) throw error;
  await supabase.storage.from("portfolio").remove([storagePath]);
}

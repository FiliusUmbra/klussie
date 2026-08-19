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

// Epic 08 WP09 — the read switch, completed once §5.6's own gap (caption had no home on
// property.documents) was resolved in 0064. api.my_documents({ p_workspace_id }) needs
// the pro's own Professional Workspace id, which this function does not have — proId is
// an auth id, not a workspace id — so the switch is keyed on resolving that first, itself
// falling back to the legacy read the same way a resolver failure anywhere else in this
// read switch does. image_url (a precomputed public URL, portfolio_items' own original
// shape) is rebuilt from storage_bucket/storage_path via getPublicUrl() rather than
// carried on property.documents, which holds a path, not a URL, matching every other
// document in this engine.
async function resolveProWorkspace(proId) {
  const { data, error } = await supabase.schema("api").rpc("resolve_public_professional_workspace", { p_pro_id: proId });
  if (error) throw error;
  return data;
}

function reshapeDocument(row) {
  const { data } = supabase.storage.from(row.storage_bucket).getPublicUrl(row.storage_path);
  return { id: row.id, image_url: data.publicUrl, storage_path: row.storage_path, caption: row.caption, created_at: row.created_at };
}

export async function fetchPortfolioItems(proId) {
  try {
    const workspaceId = await resolveProWorkspace(proId);
    if (workspaceId) {
      const { data, error } = await supabase.schema("api").rpc("my_documents", { p_workspace_id: workspaceId });
      if (error) throw error;
      return [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(reshapeDocument);
    }
  } catch (err) {
    // Migrations 0055–0064 not yet applied to this environment, or this pro has no
    // resolvable Professional Workspace — either way, the original table is still
    // authoritative and still correct to read directly.
    console.warn("document engine unavailable for portfolio items, falling back:", err.message);
  }

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

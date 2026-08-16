// Storage for "Mijn spullen" — the first real Property Memory table (0016).
//
// Replaces the hardcoded empty inventory src/lib/homeInventory.js used to return. The
// shape the panels consume is unchanged in spirit; it is now backed by rows.
//
// Photos follow the same pattern as src/lib/requestPhotos.js: a private bucket, the
// storage path on the row, and a short-lived signed URL minted at read time. Storing a
// URL would store something already expired.
import { supabase } from "./supabaseClient";
import { DEFAULT_ITEM_CATEGORY } from "./itemCategories.js";

const SIGNED_URL_TTL_SECONDS = 3600;

const ITEM_SELECT =
  "id, owner_id, name, category, room, brand, model, photo_path, purchased_on, notes, source, ai_suggestion, created_at, updated_at";

// Database row → the camelCase shape every component reads, same convention as
// requests.js. Dates stay as ISO date strings rather than becoming timestamps: a purchase
// date is a calendar day, and putting it through a Date would drag a timezone into
// something that has none.
function reshapeItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    room: row.room,
    brand: row.brand,
    model: row.model,
    photoPath: row.photo_path,
    photoUrl: null, // filled in by withSignedPhotos
    purchasedOn: row.purchased_on,
    notes: row.notes,
    source: row.source,
    aiSuggestion: row.ai_suggestion,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// One signing round-trip for the whole list rather than one per item. A photo that fails
// to sign leaves photoUrl null, which the card renders as its placeholder — a broken
// image is worse than no image.
async function withSignedPhotos(items) {
  const withPhotos = items.filter((item) => item.photoPath);
  if (withPhotos.length === 0) return items;

  const { data: signed, error } = await supabase.storage
    .from("item-photos")
    .createSignedUrls(withPhotos.map((item) => item.photoPath), SIGNED_URL_TTL_SECONDS);
  if (error) return items;

  const urlByPath = new Map(withPhotos.map((item, i) => [item.photoPath, signed[i]?.signedUrl || null]));
  return items.map((item) => (item.photoPath ? { ...item, photoUrl: urlByPath.get(item.photoPath) ?? null } : item));
}

// Epic 03 WP11 — the read switch. `workspaceId` is `useAuth().activeWorkspace?.workspace_id`
// (WP 03.09), null on a database without Epic 03's migrations or for anyone the resolver
// could not place in exactly one workspace — both fall back to `owner_id`, the same row set
// `workspace_id` was backfilled from (WP 03.06/03.07), so a single-workspace owner sees no
// difference either way. See requests.js's fetchCustomerRequests for the identical reasoning.
/** Everything this person has recorded, newest first. RLS scopes it to them. */
export async function fetchHouseholdItems(ownerId, workspaceId) {
  const query = supabase.from("household_items").select(ITEM_SELECT);
  const scoped = workspaceId ? query.eq("workspace_id", workspaceId) : query.eq("owner_id", ownerId);
  const { data, error } = await scoped.order("created_at", { ascending: false });
  if (error) throw error;
  return withSignedPhotos(data.map(reshapeItem));
}

// Empty strings are what an untouched form field holds; null is what "the owner doesn't
// know this" means in the database. Writing "" would make a blank field indistinguishable
// from a deliberate blank, and would sort and group differently.
const orNull = (value) => {
  const trimmed = (value ?? "").toString().trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Record a new item.
 *
 * `source` defaults to 'manual'. Pass 'ai_confirmed' together with `aiSuggestion` only
 * after the owner has actually accepted a model's proposal — 0016's check constraint has
 * no value for unconfirmed output on purpose, and the suggestion is retained so
 * recognition accuracy stays measurable later.
 */
export async function createHouseholdItem({
  ownerId, name, category, room, brand, model, purchasedOn, notes,
  source = "manual", aiSuggestion = null,
}) {
  const { data, error } = await supabase
    .from("household_items")
    .insert({
      owner_id: ownerId,
      name: (name || "").trim(),
      category: category || DEFAULT_ITEM_CATEGORY,
      room: orNull(room),
      brand: orNull(brand),
      model: orNull(model),
      purchased_on: purchasedOn || null,
      notes: orNull(notes),
      source,
      ai_suggestion: aiSuggestion,
    })
    .select(ITEM_SELECT)
    .single();
  if (error) throw error;
  return reshapeItem(data);
}

/** Edit an item. Only the fields passed are touched; updated_at is the database's job. */
export async function updateHouseholdItem(itemId, { name, category, room, brand, model, purchasedOn, notes }) {
  const { data, error } = await supabase
    .from("household_items")
    .update({
      name: (name || "").trim(),
      category: category || DEFAULT_ITEM_CATEGORY,
      room: orNull(room),
      brand: orNull(brand),
      model: orNull(model),
      purchased_on: purchasedOn || null,
      notes: orNull(notes),
    })
    .eq("id", itemId)
    .select(ITEM_SELECT)
    .single();
  if (error) throw error;
  return reshapeItem(data);
}

/**
 * Attach or replace an item's photo.
 *
 * Path is "<owner>/<item>/<random>", mirroring request-photos so the storage policy only
 * has to read the first segment. The old object is removed after the row points at the
 * new one: losing the photo but keeping the row is recoverable, the reverse leaves the
 * card pointing at nothing.
 */
export async function setHouseholdItemPhoto(itemId, ownerId, file, previousPath = null) {
  const path = `${ownerId}/${itemId}/${crypto.randomUUID()}`;
  const { error: uploadError } = await supabase.storage
    .from("item-photos")
    .upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("household_items").update({ photo_path: path }).eq("id", itemId);
  if (error) throw error;

  if (previousPath) await supabase.storage.from("item-photos").remove([previousPath]);

  const { data: signed } = await supabase.storage.from("item-photos").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return { photoPath: path, photoUrl: signed?.signedUrl || null };
}

/** Delete an item and its photo. The row goes first, for the same reason as above. */
export async function deleteHouseholdItem(itemId, photoPath = null) {
  const { error } = await supabase.from("household_items").delete().eq("id", itemId);
  if (error) throw error;
  if (photoPath) await supabase.storage.from("item-photos").remove([photoPath]);
}

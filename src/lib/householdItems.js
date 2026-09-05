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
import { uuidv7 } from "./ids.js";

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

// Epic 07 WP08 — the second read switch. Same shape as household_items row → camelCase
// item, but sourced from property.assets (0053's dual-write mirror) via api.my_assets()
// (0054, active only) rather than household_items directly. Field names differ
// (type/room_label/make/acquired_on vs category/room/brand/purchased_on — see 0052's own
// mapping) but the reshaped output is identical to reshapeItem's, so nothing downstream can
// tell which table actually answered.
function reshapeAsset(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.type,
    room: row.room_label,
    // The real room this item is placed in (Home Builder slice) — null for every item
    // created before this slice, or created without picking one. Display-only today:
    // property.update_asset() has no location_id parameter yet, so nothing can change
    // this once set (see createAsset()'s own header).
    locationId: row.location_id,
    brand: row.make,
    model: row.model,
    photoPath: row.photo_path,
    photoUrl: null, // filled in by withSignedPhotos
    purchasedOn: row.acquired_on,
    notes: row.notes,
    source: row.source,
    aiSuggestion: row.ai_suggestion,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// Epic 03 WP11, then Epic 07 WP08 — two read switches stacked. `workspaceId` is
// `useAuth().activeWorkspace?.workspace_id` (WP 03.09); `propertyId` is
// `homeProfile.property?.id` (WP 05.06, `src/lib/homeInventory.js`'s `fetchHomeProfile()`).
// Both are null until their own migrations exist and their own resolver can place the
// caller unambiguously — three tiers, tried in the order the roadmap built them:
// property.assets (newest, WP 07.08) -> workspace-scoped household_items (WP 03.11) ->
// owner-scoped household_items (original, pre-Epic-03). A single-workspace owner whose
// items have all been mirrored sees identical results at every tier — the same fallback
// discipline requests.js's fetchCustomerRequests already established.
/** Everything this person has recorded, newest first. RLS/the engine contract scopes it to them. */
export async function fetchHouseholdItems(ownerId, workspaceId, propertyId) {
  if (propertyId) {
    const { data, error } = await supabase.schema("api").rpc("my_assets", { p_property_id: propertyId });
    if (error) throw error;
    const sorted = [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return withSignedPhotos(sorted.map(reshapeAsset));
  }

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

// =========================================================================
// Platform Activation Slice 1, WP 1.8 — the real write path, through property.assets
// (api.create_asset()/update_asset()/retire_asset(), migration 0139) rather than
// household_items. Used whenever a real propertyId is known (WP 1.0 guarantees this for
// every account from signup onward); ItemFormSheet.jsx falls back to the functions above
// only when it is not — the exact two-tier shape fetchHouseholdItems() already
// established for reads, now mirrored on the write side.
//
// A GENUINE BUGFIX, NOT ONLY A CUTOVER
//
// Before this, editing or deleting an item whose card came from api.my_assets() (every
// account with a real property, i.e. every one WP 1.0 covers) called
// updateHouseholdItem(item.id, ...) / deleteHouseholdItem(item.id, ...) — both target the
// household_items TABLE by id, but item.id was a property.assets id (reshapeAsset's own
// `id: row.id`), not a household_items id. Both calls matched zero rows and surfaced as a
// save/delete failure. This was live and broken before WP 1.8; it is not a regression
// this work package introduces.
//
// NO SEPARATE "SET PHOTO" STEP
//
// The legacy flow uploads, then creates the row, then points it at the upload — three
// round trips, and a window where a freshly created item has no photo yet even though
// one was picked. property.assets' own contract accepts photo_path directly on
// create/update (WP 1.4), so the id is minted client-side first (ADR-0022), the photo
// uploads to it, and the create call already carries the final path — one fewer step,
// one fewer window.
//
// serial_number, parent_asset_id, installed_on, expected_service_life_months,
// warranty_expires_on and condition still go through as null — the contract has room
// for all seven; this form does not grow those fields (WP 1.8's own scope was the
// cutover, not a redesign, and nothing in the Home Builder slice needs them either).
//
// location_id IS now sent on create (Home Builder slice) — property.create_asset()
// (0139) always accepted it; only this client ever hardcoded it to null.
// property.update_asset() has no location_id parameter at all yet (a real, separate gap
// this slice does not extend — see householdItems.test.js's own note), so roomLabel
// stays the only room-shaped field an edit can change, exactly as it already could.
function assetFieldsFromForm({ name, category, room, brand, model, purchasedOn, notes }) {
  return {
    name: (name || "").trim(),
    type: category || DEFAULT_ITEM_CATEGORY,
    roomLabel: orNull(room),
    make: orNull(brand),
    model: orNull(model),
    acquiredOn: purchasedOn || null,
    notes: orNull(notes),
  };
}

async function uploadAssetPhoto(assetId, ownerId, file) {
  const path = `${ownerId}/${assetId}/${crypto.randomUUID()}`;
  const { error } = await supabase.storage.from("item-photos").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

/** Creates a real asset (property.assets) under a real property. `actorRef` is the
 * caller's own auth id (ADR-0019 — the same value ConversationHome.jsx already passes
 * as `ownerId`, since public.profiles.id references auth.users.id directly).
 * `locationId` (Home Builder slice) is the real room the item is placed in — property.
 * create_asset() always accepted this; it was hardcoded to null here until now.
 * `room` stays the display label (unchanged): when a real room was picked, the caller
 * passes that room's own name as `room` too, so the two never drift apart. */
export async function createAsset({ propertyId, ownerId, actorRef, locationId, name, category, room, brand, model, purchasedOn, notes, photoFile }) {
  const assetId = uuidv7();
  const photoPath = photoFile ? await uploadAssetPhoto(assetId, ownerId, photoFile) : null;
  const fields = assetFieldsFromForm({ name, category, room, brand, model, purchasedOn, notes });

  const { error } = await supabase.schema("api").rpc("create_asset", {
    p_asset_id: assetId,
    p_property_id: propertyId,
    p_name: fields.name,
    p_type: fields.type,
    p_make: fields.make,
    p_model: fields.model,
    p_serial_number: null,
    p_parent_asset_id: null,
    p_location_id: locationId || null,
    p_room_label: fields.roomLabel,
    p_acquired_on: fields.acquiredOn,
    p_installed_on: null,
    p_expected_service_life_months: null,
    p_warranty_expires_on: null,
    p_condition: null,
    p_photo_path: photoPath,
    p_notes: fields.notes,
    p_source: "manual",
    p_ai_suggestion: null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
  return { id: assetId, photoPath };
}

/** Edits a real asset. A new photo replaces the old one only after the update itself
 * succeeds — the same "row first, then clean up the old object" ordering
 * setHouseholdItemPhoto() already holds. */
export async function updateAsset(assetId, { ownerId, actorRef, previousPhotoPath, name, category, room, brand, model, purchasedOn, notes, photoFile }) {
  const photoPath = photoFile ? await uploadAssetPhoto(assetId, ownerId, photoFile) : previousPhotoPath || null;
  const fields = assetFieldsFromForm({ name, category, room, brand, model, purchasedOn, notes });

  const { error } = await supabase.schema("api").rpc("update_asset", {
    p_asset_id: assetId,
    p_name: fields.name,
    p_type: fields.type,
    p_make: fields.make,
    p_model: fields.model,
    p_serial_number: null,
    p_parent_asset_id: null,
    p_room_label: fields.roomLabel,
    p_acquired_on: fields.acquiredOn,
    p_installed_on: null,
    p_expected_service_life_months: null,
    p_warranty_expires_on: null,
    p_condition: null,
    p_photo_path: photoPath,
    p_notes: fields.notes,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;

  if (photoFile && previousPhotoPath) await supabase.storage.from("item-photos").remove([previousPhotoPath]);
  return { id: assetId, photoPath };
}

/** Retires a real asset (active -> retired, api.retire_asset()) — never a hard delete.
 * api.my_assets() (0054) already excludes retired assets, so the item disappears from
 * "Mijn spullen" exactly as a delete would appear to, while its history is kept. */
export async function retireAsset(assetId, actorRef) {
  const { error } = await supabase.schema("api").rpc("retire_asset", {
    p_asset_id: assetId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

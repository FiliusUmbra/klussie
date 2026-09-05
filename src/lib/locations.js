// Platform Activation Slice 1, WP 1.8 — the client side of api.create_location()
// (migration 0140, WP 1.5). A location's own write path, separate from
// src/lib/homeInventory.js the same way that file's own loadLocations() is: locations
// are read once alongside the property, but adding one is a distinct user action with
// its own form (LocationFormSheet.jsx), not a household_items-style cutover — Location
// has no legacy table to fall back to (0140's own header: "nothing depends on a location
// existing yet").
//
// Home Builder vertical slice — rename/retire/move added below, the client side of
// 0198_location_lifecycle_contract.sql, which closes the three gaps 0140's own header
// named and deliberately deferred to "a future work package."
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

/**
 * Creates a real location under a property (`api.create_location()`, WP 1.5). `parentId`
 * null means top-level, directly under the property — the real path's own path-
 * maintenance trigger (0044) computes the tree position; nothing here does. `actorRef`
 * is the caller's own auth id (ADR-0019).
 */
export async function createLocation({ propertyId, parentId, name, type, actorRef }) {
  const locationId = uuidv7();

  const { error } = await supabase.schema("api").rpc("create_location", {
    p_location_id: locationId,
    p_property_id: propertyId,
    p_parent_id: parentId || null,
    p_name: (name || "").trim(),
    p_type: type || null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;

  return { id: locationId };
}

/** Renames a location the caller stewards (`api.rename_location()`). `actorRef` is the
 * caller's own auth id (ADR-0019). */
export async function renameLocation({ locationId, name, actorRef }) {
  const { error } = await supabase.schema("api").rpc("rename_location", {
    p_location_id: locationId,
    p_name: (name || "").trim(),
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/**
 * Retires (never deletes) a location the caller stewards (`api.retire_location()`).
 * Refused by the contract itself while the room still has an active child room or an
 * active item placed in it — surfaced here as the real error, not swallowed, so the
 * sheet can show "clear this room first" rather than a generic failure.
 */
export async function retireLocation({ locationId, actorRef }) {
  const { error } = await supabase.schema("api").rpc("retire_location", {
    p_location_id: locationId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

/** Moves a location under a new parent, or to top-level when `newParentId` is null
 * (`api.reparent_location()`). Cross-property moves are refused by the contract itself
 * (property.reparent_location()'s own, untouched restraint). */
export async function moveLocation({ locationId, newParentId, actorRef }) {
  const { error } = await supabase.schema("api").rpc("reparent_location", {
    p_location_id: locationId,
    p_new_parent_id: newParentId || null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;
}

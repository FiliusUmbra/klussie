// Platform Activation Slice 1, WP 1.8 — the client side of api.create_location()
// (migration 0140, WP 1.5). A location's own write path, separate from
// src/lib/homeInventory.js the same way that file's own loadLocations() is: locations
// are read once alongside the property, but adding one is a distinct user action with
// its own form (LocationFormSheet.jsx), not a household_items-style cutover — Location
// has no legacy table to fall back to (0140's own header: "nothing depends on a location
// existing yet").
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

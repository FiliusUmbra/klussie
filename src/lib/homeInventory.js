// What is left of the placeholder data boundary for My Home.
//
// Platform Activation Slice 1, WP 1.3 — `rooms` and `documents` are real now, sourced
// from the Location and Document engines through the read contracts WP 1.1/WP 1.1's
// sibling epics already built (api.locations_for_property(), migration 0136;
// api.my_documents(), Epic 08). `installations` stays an empty placeholder — nothing in
// the schema distinguishes a fixed installation from an ordinary asset, and inventing that
// distinction client-side would be building ahead of a real engine concept, the same
// restraint this file's own history already demonstrates for property/rooms/documents in
// turn. `upcomingMaintenance` is fetched separately (src/lib/maintenance.js), because it
// is workspace-scoped, not property-scoped — see that module's own header for why.
//
// The property itself is real (Epic 05) — `property` below, resolved through
// api.my_properties() (migration 0041), following auth.jsx's exact fallback idiom.
//
// Platform Activation Slice 1, WP 1.10 — createPropertyForCaller() (below
// fetchHomeProfile()) is the client side of Option B's own lazy-creation trigger: a
// Professional workspace's "My Business" tab, opened for the first time with no
// property yet.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";

// The record a My Home installation is capable of holding, kept here as documentation
// of the target shape rather than as a type the code can enforce (TypeScript is
// Planned, MASTER_CONTEXT.md §3):
//
//   { id, name, description, room, brand, model, installedOn, ageApprox,
//     condition, photoUrl, documents: [], maintenanceHistory: [], linkedRequestIds: [] }

const EMPTY_HOME = Object.freeze({
  summary: null,
  rooms: [],
  installations: [],
  upcomingMaintenance: [],
  documents: [],
  property: null,
});

// Epic 05 WP06. `null` on any failure — no migrations in this database, `api` not yet
// exposed to PostgREST (ADR-0026), or genuinely no property backfilled yet — logged, never
// thrown, the same idiom workspaceContext.js's loadWorkspaceMemberships() established.
// Takes the first row: a workspace currently stewards at most one backfilled property
// (WP 05.02), and picking among several — if that ever changes — is not this function's
// job any more than resolveActiveWorkspace's was for workspaces.
async function loadProperty() {
  try {
    const { data, error } = await supabase.schema("api").rpc("my_properties");
    if (error) {
      console.warn("property context unavailable, continuing without it:", error.message);
      return null;
    }
    const property = Array.isArray(data) ? data[0] : null;
    return property ? shapeProperty(property) : null;
  } catch (err) {
    console.warn("property context unavailable, continuing without it:", err.message);
    return null;
  }
}

// Migration 0185 grew api.my_properties() with the address/quote-prep columns 0182
// added to property.properties. Shaped here once so loadProperty() (My Home) and
// fetchMyProperties() (the service-location picker, below) return the identical shape.
function shapeProperty(row) {
  return {
    id: row.id,
    name: row.name,
    street: row.street || "",
    houseNumber: row.house_number || "",
    postcode: row.postcode || "",
    municipality: row.municipality || "",
    country: row.country || "BE",
    propertyType: row.property_type || null,
    quotePrepNotes: row.quote_prep_notes || "",
  };
}

/** Whether a property's address is confirmed enough to be usable as a service location. */
export function hasConfirmedAddress(property) {
  return Boolean(property?.street && property?.postcode && property?.municipality);
}

/**
 * Every property the caller currently stewards (`api.my_properties()`, migration 0185).
 * Unlike `loadProperty()`/`fetchHomeProfile()`, which pick the first row for the My Home
 * surface, this returns the full list — the input to the service-location picker's
 * "My Home / another saved property" choice (`ServiceLocationField.jsx`). A workspace with
 * exactly one property (today's common case) simply renders that one choice.
 */
export async function fetchMyProperties() {
  const { data, error } = await supabase.schema("api").rpc("my_properties");
  if (error) throw error;
  return (data || []).map(shapeProperty);
}

/**
 * Sets a property's own address (`api.set_property_address()`, migration 0185) — the
 * write path the disclosure-consent flow (0182/0183) needs a real address to disclose.
 * Whole-value replace, not a sparse patch (the function's own comment) — callers always
 * send the full current set, matching `setEngagementAccessNotes()`'s own upsert shape.
 */
export async function setPropertyAddress({
  propertyId, street, houseNumber, postcode, municipality, country, propertyType, quotePrepNotes,
}) {
  const { error } = await supabase.schema("api").rpc("set_property_address", {
    p_property_id: propertyId,
    p_street: street || null,
    p_house_number: houseNumber || null,
    p_postcode: postcode || null,
    p_municipality: municipality || null,
    p_country: country || "BE",
    p_property_type: propertyType || null,
    p_quote_prep_notes: quotePrepNotes || null,
  });
  if (error) throw error;
}

// WP 1.3. `null` on any failure, the same fallback idiom as loadProperty() above — a
// missing migration or an unexposed schema must never break the homepage, and an empty
// tree reads identically to "nothing recorded yet," which for a real failure is a lie
// worth avoiding but not one this function can tell apart from the genuine case without
// surfacing an error nothing here is set up to show yet (see this file's own history:
// every earlier read switch here started the same "log and continue" way).
async function loadLocations(propertyId) {
  try {
    const { data, error } = await supabase.schema("api").rpc("locations_for_property", { p_property_id: propertyId });
    if (error) {
      console.warn("locations unavailable, continuing without them:", error.message);
      return [];
    }
    return (data ?? []).map((row) => ({ id: row.id, parentId: row.parent_id, name: row.name, type: row.type }));
  } catch (err) {
    console.warn("locations unavailable, continuing without them:", err.message);
    return [];
  }
}

// Flat, path-ordered rows in (id, parentId, name, type, path) → a real tree, one root
// array of { id, name, type, children }. property.locations_for_property() (migration
// 0136) deliberately returns the flat shape and leaves this assembly to the client — the
// same division of labour property.my_assets() already uses for a workspace's own asset
// list. Pure and synchronous so it is testable without a network call, matching
// knownFactsFrom below.
export function buildLocationTree(flatLocations) {
  const byId = new Map();
  for (const loc of flatLocations) {
    byId.set(loc.id, { id: loc.id, name: loc.name, type: loc.type, children: [] });
  }
  const roots = [];
  for (const loc of flatLocations) {
    const node = byId.get(loc.id);
    const parent = loc.parentId ? byId.get(loc.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

// A location tree (buildLocationTree()'s own shape), flattened into a picker list,
// indented by depth so a nested room still reads as nested. Shared by LocationFormSheet
// (picking a parent room) and ItemFormSheet (picking which room an item is in, Home
// Builder slice) — one flattening, not two copies drifting apart.
export function flattenLocationsForPicker(rooms, depth = 0) {
  return rooms.flatMap((node) => [
    { id: node.id, name: node.name, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenLocationsForPicker(node.children, depth + 1),
  ]);
}

// WP 1.3. Property-level documents only — api.my_documents() (Epic 08) requires exactly
// one subject (property.my_documents()'s own "exactly one subject must be given" rule),
// and a document attached directly to a specific location or asset is a real, distinct
// case this function does not attempt: the honest scope for a first pass is what shows on
// My Home's own top-level list, not everything attached anywhere in the twin. Browsing a
// location's or an asset's own documents belongs to that location's or asset's own detail
// view, a later work package, not a reason to fan this out into N+1 calls here.
async function loadDocuments(propertyId) {
  try {
    const { data, error } = await supabase.schema("api").rpc("my_documents", { p_property_id: propertyId });
    if (error) {
      console.warn("documents unavailable, continuing without them:", error.message);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      typeKey: row.type_key,
      issuer: row.issuer,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      caption: row.caption,
    }));
  } catch (err) {
    console.warn("documents unavailable, continuing without them:", err.message);
    return [];
  }
}

// Async on purpose even though most of this still resolves immediately: the call sites
// are written as if this were already a query, so the day the rest becomes one nothing
// above it changes.
//
// rooms/documents are fetched only once a property actually resolves — without one there
// is no property_id to ask either engine about, and the "no property yet" case is
// identical in shape to "a property with nothing recorded in it" from every caller's own
// point of view (homeInventory.test.js's own "still returns every field... all empty"
// case pins exactly this).
export async function fetchHomeProfile() {
  const property = await loadProperty();
  if (!property) return EMPTY_HOME;

  const [flatLocations, documents] = await Promise.all([
    loadLocations(property.id),
    loadDocuments(property.id),
  ]);

  return { ...EMPTY_HOME, property, rooms: buildLocationTree(flatLocations), documents };
}

/**
 * Creates a property for a workspace the caller has a live membership in
 * (`api.create_property()`, WP 1.10) — Option B's own lazy-creation trigger: a
 * Professional workspace's "My Business" tab, opened for the first time with no
 * property yet. `actorRef` is the caller's own auth id (ADR-0019).
 *
 * No "already has one" guard exists at the contract level (§9.1 permits many
 * properties) — callers are expected to check fetchHomeProfile()'s own `property` field
 * first and call this only when it resolves to null, the same way ProApp.jsx's "My
 * Business" tab does. Calling this when a property already exists creates a genuine
 * second one, not an error.
 */
export async function createPropertyForCaller({ workspaceId, actorRef, name }) {
  const propertyId = uuidv7();

  const { error } = await supabase.schema("api").rpc("create_property", {
    p_property_id: propertyId,
    p_steward_workspace_id: workspaceId,
    p_name: name,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: actorRef,
  });
  if (error) throw error;

  return { id: propertyId };
}

// Which pieces of Property Memory Klussie actually holds for this customer — the
// input to homeIntents.questionsFor(), so a follow-up question is skipped only when
// the answer is genuinely already known. Empty today, so nothing is skipped today.
export function knownFactsFrom(homeProfile) {
  const facts = new Set();
  if (!homeProfile) return facts;
  if (homeProfile.rooms?.length) facts.add("rooms");
  if (homeProfile.installations?.length) facts.add("installations");
  if (homeProfile.upcomingMaintenance?.length) facts.add("maintenanceHistory");
  return facts;
}

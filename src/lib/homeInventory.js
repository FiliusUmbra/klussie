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
import { supabase } from "./supabaseClient";

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
    return property ? { id: property.id, name: property.name } : null;
  } catch (err) {
    console.warn("property context unavailable, continuing without it:", err.message);
    return null;
  }
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

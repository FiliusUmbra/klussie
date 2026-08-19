// What is left of the placeholder data boundary for My Home.
//
// Three of the four things this file used to stand in for are now real:
//   - My Items has storage (0016) and a data layer (src/lib/householdItems.js).
//   - My Home V1 is derived from requests the customer already has
//     (src/lib/homeTimeline.js), which is what HOME_OPERATING_SYSTEM.md §2 means by
//     "History and People aren't hypothetical."
//   - The property itself is real (Epic 05) — `property` below, resolved through
//     api.my_properties() (migration 0041), following auth.jsx's exact fallback idiom.
//     Resolved, not yet used: nothing downstream reads it, the same "add without
//     switching" restraint Epic 03 WP09 held for workspace context.
//
// What remains genuinely unbuilt is the rest of the structural half of Property Memory:
// rooms, installations, scheduled maintenance and documents — Epics 06-08, not this one.
// No `home_assets` or `home_documents` table exists (ADR-0008), so those still return
// empty — and the only caller that matters is knownFactsFrom below, which decides whether
// a follow-up question can be skipped. Empty here means nothing is skipped, which is the
// correct behaviour while klussie genuinely knows none of it.
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

// Async on purpose even though most of this still resolves immediately: the call sites
// are written as if this were already a query, so the day the rest becomes one nothing
// above it changes.
export async function fetchHomeProfile() {
  return { ...EMPTY_HOME, property: await loadProperty() };
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

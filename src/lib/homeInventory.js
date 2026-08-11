// What is left of the placeholder data boundary for My Home.
//
// Two of the three things this file used to stand in for are now real:
//   - My Items has storage (0016) and a data layer (src/lib/householdItems.js).
//   - My Home V1 is derived from requests the customer already has
//     (src/lib/homeTimeline.js), which is what HOME_OPERATING_SYSTEM.md §2 means by
//     "History and People aren't hypothetical."
//
// What remains genuinely unbuilt is the structural half of Property Memory: rooms,
// installations, scheduled maintenance and documents. No `home_assets` or
// `home_documents` table exists (ADR-0008; ROADMAP Phase 13 plans that schema), so this
// still returns empty — and the only caller that matters is knownFactsFrom below, which
// decides whether a follow-up question can be skipped. Empty here means nothing is
// skipped, which is the correct behaviour while klussie genuinely knows none of it.

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
});

// Async on purpose even though it resolves immediately: the call sites are written
// as if this were already a query, so the day it becomes one nothing above it changes.
export async function fetchHomeProfile() {
  return EMPTY_HOME;
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

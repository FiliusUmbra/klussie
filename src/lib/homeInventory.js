// The data boundary for My Home and My Items.
//
// Deliberately the whole seam and none of the storage: no `home_assets`,
// `home_documents`, or `household_items` table exists (ADR-0008; ROADMAP Phase 13
// is where that schema is planned), and inventing one here would be an unapproved
// migration. What this module gives the UI is the *shape* those surfaces consume,
// so the panels are written against a real contract today and swapping this file
// for Supabase queries tomorrow touches no component.
//
// Everything returns empty. That is the honest current state, and the panels render
// it as an empty state rather than as sample data — Constitution Rule 9, and the
// same reason EXPERIENCE_VISION.md §8 refuses to claim insurance verification.

// The record a My Home installation is capable of holding, kept here as documentation
// of the target shape rather than as a type the code can enforce (TypeScript is
// Planned, MASTER_CONTEXT.md §3):
//
//   { id, name, description, room, brand, model, installedOn, ageApprox,
//     condition, photoUrl, documents: [], maintenanceHistory: [], linkedRequestIds: [] }
//
// And a My Items record:
//
//   { id, name, brand, model, serialNumber, purchasedOn, retailer, price,
//     receiptUrl, guaranteeExpiresOn, manualUrl, repairHistory: [], room, photoUrl }

const EMPTY_HOME = Object.freeze({
  summary: null,
  rooms: [],
  installations: [],
  upcomingMaintenance: [],
  documents: [],
});

const EMPTY_ITEMS = Object.freeze({
  appliances: [],
  electronics: [],
  furniture: [],
  garden: [],
  recent: [],
});

// Async on purpose even though it resolves immediately: the call sites are written
// as if this were already a query, so the day it becomes one nothing above it changes.
export async function fetchHomeProfile() {
  return EMPTY_HOME;
}

export async function fetchItemInventory() {
  return EMPTY_ITEMS;
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

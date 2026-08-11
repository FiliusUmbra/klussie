// Rules about what a professional's account currently is: promoted or not, which
// categories their offered services put them in, and what their registration type keeps
// them out of.
//
// Extracted from src/App.jsx, where each was a one-line expression inside a render
// function. They are small, but they are rules — "a flexi-job worker may not take
// certified work" is a compliance decision, not a disabled attribute.
//
// Pure and storage-free: src/lib/pros.js still owns reading and writing pro rows.

/** The one category reserved for certified professionals. */
export const SPECIALIST_CATEGORY_ID = "specialist";

/** Registration type that carries the Belgian flexi-job restrictions. */
export const PRO_TYPE_FLEXI = "flexi";

/**
 * Whether a profile's promotion is currently running.
 *
 * Compares against the moment it is asked rather than a cached timestamp — a boost that
 * expired mid-session has expired, and showing it as active would be klussie claiming
 * placement the professional is no longer getting.
 */
export function isBoosted(proProfile, now = new Date()) {
  return !!proProfile?.boosted_until && new Date(proProfile.boosted_until) > now;
}

/**
 * The distinct categories a professional's offered services belong to — the subscription
 * used to decide which new leads reach them.
 *
 * Unknown service IDs are dropped rather than passed through: a stale row pointing at a
 * service the catalog no longer has must not widen a professional's lead feed.
 */
export function offeredCategoryIds(offeredServiceIds, baseServices) {
  return [
    ...new Set(
      (offeredServiceIds ?? [])
        .map((id) => baseServices.find((s) => s.id === id)?.cat)
        .filter(Boolean)
    ),
  ];
}

/**
 * Whether a category is closed to this professional. Only the specialist category is
 * restricted, and only to flexi-job workers — Belgian flexi-job rules don't cover
 * certified trades.
 */
export function isCategoryLocked(categoryId, proType) {
  return categoryId === SPECIALIST_CATEGORY_ID && proType === PRO_TYPE_FLEXI;
}

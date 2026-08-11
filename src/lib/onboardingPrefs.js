// Where "has this customer seen the first-login tour?" is remembered.
//
// One module on purpose. The brief's rule — isolate a documented adapter rather
// than scattering localStorage calls — matters here because there are genuinely two
// backends in play during the rollout:
//
//   1. profiles.home_tour_completed_at, the real server-backed preference, following
//      the precedent profiles.onboarding_role_selected already set in migration 0011.
//      Added by supabase/migrations/0015_home_tour_preference.sql.
//   2. localStorage, used only while that migration hasn't been applied to a given
//      environment yet. A tour that reappears on every device is a worse first
//      impression than one that reappears after a browser reset, so the server value
//      always wins when it exists.
//
// Once 0015 is applied everywhere, the fallback becomes dead weight and this file is
// the single place to delete it from.

const STORAGE_KEY_PREFIX = "klussie.homeTourCompleted.";

// The tour is for new customers only (founder decision, 2026-08-11). Without a cutoff
// it would also appear once for every existing account, since `home_tour_completed_at`
// is null for a customer who signed up before the column existed — a tour explaining
// the basics to somebody who has already booked three jobs.
//
// A ship-date cutoff rather than "created in the last N days": the latter would keep
// firing for accounts that were new at some point but had already learned the product,
// and would change behaviour silently as time passed. This constant is the date the
// tour shipped and should not move.
const HOME_TOUR_AVAILABLE_FROM = Date.parse("2026-08-11T00:00:00Z");

// Conservative on missing data: an account with no readable created_at is treated as
// pre-existing and left alone, rather than shown a tour it may not need.
function isNewAccount(profile) {
  const createdAt = profile?.created_at ? Date.parse(profile.created_at) : NaN;
  return Number.isFinite(createdAt) && createdAt >= HOME_TOUR_AVAILABLE_FROM;
}

function storageKey(userId) {
  return `${STORAGE_KEY_PREFIX}${userId || "anonymous"}`;
}

// Reads from the already-loaded profile row rather than issuing its own query —
// src/lib/auth.jsx selects "*", so the column is present the moment it exists.
// `undefined` (column not yet in the schema) and `null` (column exists, never set)
// both mean "not completed", and both fall through to the local check.
export function hasCompletedHomeTour({ profile, userId }) {
  if (profile && profile.home_tour_completed_at) return true;
  try {
    return window.localStorage.getItem(storageKey(userId)) === "true";
  } catch {
    // Private-browsing modes throw on localStorage access. Treating that as "not
    // completed" shows the tour again rather than suppressing it silently.
    return false;
  }
}

// Records completion. Writes locally first so the tour never reappears on this
// device even if the network call fails, then tries the durable store.
// `updateProfile` is passed in rather than imported so this stays free of the auth
// context and testable without one.
export async function markHomeTourCompleted({ userId, updateProfile }) {
  try {
    window.localStorage.setItem(storageKey(userId), "true");
  } catch {
    // Nothing to do — the profile write below is the durable path anyway.
  }
  if (!updateProfile) return;
  try {
    await updateProfile({ home_tour_completed_at: new Date().toISOString() });
  } catch {
    // The column may not exist in this environment yet (see the note above). The
    // local record already stands, so the customer is not shown the tour twice.
  }
}

// Replaying from Profile → Help must not un-complete anything: the tour opens, and
// the stored completion stays exactly as it was. Exported so the intent is explicit
// at the call site rather than being "we simply didn't write anything."
export function isEligibleForFirstLoginTour({ profile, userId, roleSelected }) {
  // Never over the top of the role question — that flow owns the screen until it's
  // answered (AppShell's RoleSelectionScreen branch).
  if (!roleSelected) return false;
  if (!isNewAccount(profile)) return false;
  return !hasCompletedHomeTour({ profile, userId });
}

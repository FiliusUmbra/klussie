// Where "has this person seen PageTour.jsx's tour for page X?" is remembered — the
// per-page equivalent of onboardingPrefs.js's own home-tour tracking, but localStorage
// only. Unlike the first-login tour (profiles.home_tour_completed_at, a durable,
// cross-device record someone might reasonably ask "did I ever see this?" about), which
// page-level coachmarks someone has already seen is real per-viewer convenience state
// with no cross-device or audit value — the same class of thing ProDashboard.jsx's own
// useSeenLeadIds() already is for a different signal.
const STORAGE_PREFIX = "klussie.pageTourSeen.";

function storageKey(userId, pageId) {
  return `${STORAGE_PREFIX}${pageId}.${userId || "anonymous"}`;
}

export function hasSeenPageTour(userId, pageId) {
  try {
    return window.localStorage.getItem(storageKey(userId, pageId)) === "true";
  } catch {
    // Private browsing or storage disabled — show the tour rather than hide it.
    return false;
  }
}

export function markPageTourSeen(userId, pageId) {
  try {
    window.localStorage.setItem(storageKey(userId, pageId), "true");
  } catch {
    // Nothing durable to fall back to here, unlike the home tour's profile column —
    // this is deliberately local-only. Worst case the tour shows again next session.
  }
}

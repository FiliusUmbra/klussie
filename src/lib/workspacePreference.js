// Epic 03 WP12 — where "which workspace did this person pick last" is remembered.
//
// Client-only, deliberately, unlike onboardingPrefs.js's two-backend shape: the frozen
// architecture gives a workspace preference no server-side home yet (nothing in
// PLATFORM_DOMAIN_MODEL.md §27 says which engine owns it), and inventing a column for it in
// this migration would be exactly the kind of schema decision this roadmap reserves for the
// epic that actually needs one — not a work package whose job is "add the switcher."
//
// Follows onboardingPrefs.js's adapter shape regardless: one module, a prefixed key scoped
// by person so two accounts on the same device never collide, wrapped in try/catch for
// private-browsing modes that throw on localStorage access. §27's "switching is cheap and
// preserves place" is honoured for the common case (the same device, a normal browsing
// session); it is not honoured across devices or a cleared browser, which a person who
// switches from a stale preference simply lands on their default view instead (see
// resolveActiveWorkspace) — never on nothing, and never on an error.
const STORAGE_KEY_PREFIX = "klussie.activeWorkspaceId.";

function storageKey(userId) {
  return `${STORAGE_KEY_PREFIX}${userId || "anonymous"}`;
}

export function getPreferredWorkspaceId(userId) {
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function setPreferredWorkspaceId(userId, workspaceId) {
  try {
    window.localStorage.setItem(storageKey(userId), workspaceId);
  } catch {
    // Private-browsing modes throw. The switch still works for this session via React
    // state (AuthProvider) — it just won't be remembered on the next visit.
  }
}

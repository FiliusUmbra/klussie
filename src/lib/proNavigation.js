// Real addresses for the professional's tabs and Family's sections (live review 2026-10-04,
// item 15: every professional tab and every Family section shared one URL, so a reload
// dropped a professional back on Today and a section could not be linked or reached with the
// browser's Back button). Same shape and reasoning as customerNavigation.js; both are
// optional wiring — a caller that passes no route keeps its own local state exactly as before.
//
// Professional tabs live under /app/pro so they can never collide with the customer paths
// (/app/messages, /app/account...) when one person holds both a customer and a pro workspace.
const PRO_PATHS = {
  dashboard: "/app/pro",
  jobs: "/app/pro/jobs",
  business: "/app/pro/business",
  messages: "/app/pro/messages",
  profile: "/app/pro/account",
};

export function proTabFromPath(pathname) {
  const hit = Object.keys(PRO_PATHS).find((tab) => PRO_PATHS[tab] === pathname);
  return hit || "dashboard";
}

export function proPath(tab) {
  return PRO_PATHS[tab] || PRO_PATHS.dashboard;
}

const FAMILY_SECTIONS = ["today", "lists", "chores", "calendar", "people"];

export function isFamilyPath(pathname) {
  return pathname === "/app/family" || pathname.startsWith("/app/family/");
}

export function familySectionFromPath(pathname) {
  const part = pathname.startsWith("/app/family/") ? pathname.slice("/app/family/".length).split("/")[0] : "";
  return FAMILY_SECTIONS.includes(part) ? part : "today";
}

export function familyPath(section) {
  return section && section !== "today" && FAMILY_SECTIONS.includes(section) ? `/app/family/${section}` : "/app/family";
}

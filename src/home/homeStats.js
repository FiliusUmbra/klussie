import { trustedProfessionals } from '../lib/homeTimeline.js';

// Pure, so the numbers are testable without rendering anything.
export function homeStats({ items, homeProfile, maintenance, requests }) {
  const open = maintenance ? maintenance.filter((m) => m.status === 'open') : null;
  return {
    items: items ? items.length : null,
    docs: homeProfile ? (homeProfile.documents || []).length : null,
    upcoming: open ? open.length : null,
    pros: trustedProfessionals(requests || []).length,
    open,
  };
}

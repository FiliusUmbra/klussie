// "Vandaag voor jouw woning" — picks the one thing that genuinely matters most in
// a customer's account right now.
//
// Pure and data-only: it takes the requests CustomerApp already fetched and returns
// a descriptor. No fetching, no copy, no JSX — the component turns the descriptor
// into words via `t` (ENGINEERING_STANDARDS.md, "no business logic in UI").
//
// Everything here comes from real service_requests rows. Nothing invents urgency,
// and nothing claims a data source that doesn't exist: guarantee expiry, boiler
// service intervals, and property documents are all named in the brief and in
// HOME_OPERATING_SYSTEM.md, but no schema holds them yet (ADR-0008), so this module
// does not pretend to rank them. When those tables land, they become extra clauses
// in PRIORITY below — not a rewrite.
import { OPEN_STATUSES } from "./requestStatus.js";

// Lower number wins. Ordered by how much the customer's own decision is blocking
// something: a quote nobody has chosen stalls the job entirely; a completed job
// waiting on a review stalls nothing.
//
// Found by code audit: `accepted_pending_location_approval` (migrations 0182/0183 --
// the mandatory disclosure-consent step between accepting a quote and an actual
// booking, requestStatus.js's own REQUEST_STATUS_ORDER) was missing here entirely,
// even though requestStatus.js's own awaitingDecisionCount() already treats it as
// exactly as "your move" as quotes_ready -- a real, live status (RequestDetailSheet.jsx
// renders a real approve-and-confirm card for it), just never classified here. A
// request stuck at this stage stalls the booking just as completely as an unchosen
// quote does (arguably closer to done: the customer already picked a pro, one more tap
// finishes it) -- ranked alongside quotes_ready for exactly that reason, not below it.
const PRIORITY = [
  { kind: "quotes_ready", rank: 1, matches: (r) => r.status === "quotes_ready" && r.quotes.length > 0 },
  { kind: "accepted_pending_location_approval", rank: 1, matches: (r) => r.status === "accepted_pending_location_approval" },
  { kind: "booked", rank: 2, matches: (r) => r.status === "booked" },
  { kind: "awaiting_pro", rank: 3, matches: (r) => r.status === "awaiting_pro" },
  { kind: "collecting", rank: 4, matches: (r) => r.status === "collecting" },
  { kind: "needs_review", rank: 5, matches: (r) => r.status === "completed" && !r.review },
];

function classify(request) {
  const hit = PRIORITY.find((p) => p.matches(request));
  return hit ? { kind: hit.kind, rank: hit.rank, request } : null;
}

// The kind name alone, for callers that already have a request and only need to know
// which copy applies (the "in progress right now" list under the Today card).
export function kindOf(request) {
  return classify(request)?.kind ?? null;
}

// The single most useful item, or null when the account genuinely has nothing
// actionable — which is a real state to render honestly, not a gap to fill with a
// generic suggestion.
//
// Ties break on the most recent request: two requests waiting on quotes are equally
// urgent as categories, and the newer one is the one the customer was just thinking
// about.
export function pickTodayItem(requests) {
  const candidates = (requests || []).map(classify).filter(Boolean);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.rank - b.rank || b.request.createdAt - a.request.createdAt);
  return candidates[0];
}

// Everything else still in flight, so "Today" can show one priority without hiding
// the rest of what's running. Excludes whatever `pickTodayItem` already surfaced.
//
// requestStatus.js's own shared OPEN_STATUSES, not a local copy — see that constant's
// own comment for why: this file's own copy and homeTimeline.js's own copy of the same
// set drifted out of sync once already.
const IN_FLIGHT = OPEN_STATUSES;

export function activeRequests(requests, excludeId) {
  return (requests || [])
    .filter((r) => IN_FLIGHT.includes(r.status) && r.id !== excludeId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Completed work, newest first — the "Eerder werk" group in My Home. Already real
// data (HOME_OPERATING_SYSTEM.md §2: History is not hypothetical), unlike rooms,
// installations and documents.
export function completedWork(requests) {
  return (requests || [])
    .filter((r) => r.status === "completed" || r.status === "reviewed")
    .sort((a, b) => b.createdAt - a.createdAt);
}

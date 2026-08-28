// How a service request's status is presented: the order it progresses through, the
// badge tone it carries, and which locale key names it.
//
// Extracted from src/App.jsx, where StatusPill and RequestDetailSheet each built their
// own status→label map from `t`. Two maps of the same five statuses is one map too many:
// adding a status meant remembering both, and only one of them had a fallback.
//
// Copy stays out of here on purpose (same rule as homeIntents.js): this module returns
// `labelKey` values into `t`, never literal strings, so all 10 locales stay real.

/**
 * The lifecycle, in order. Index position drives the timeline on a request.
 *
 * `accepted_pending_location_approval` (migrations 0182/0183 — the mandatory
 * disclosure-consent flow) sits between `quotes_ready` and `booked`: quote acceptance no
 * longer jumps straight to a booked engagement, it opens a real intermediate step where
 * the exact address has not yet been shared with the professional. A request only reaches
 * `booked` once the customer explicitly approves that disclosure
 * (RequestDetailSheet.jsx's own consent card, `approveLocationDisclosure()`).
 */
export const REQUEST_STATUS_ORDER = [
  "collecting", "quotes_ready", "accepted_pending_location_approval", "booked", "completed", "reviewed",
];

const PRESENTATION = {
  collecting: { labelKey: "statusCollecting", tone: "amber" },
  quotes_ready: { labelKey: "statusQuotesReady", tone: "forest" },
  accepted_pending_location_approval: { labelKey: "statusAcceptedPendingLocation", tone: "amber" },
  booked: { labelKey: "statusBooked", tone: "forest" },
  completed: { labelKey: "statusCompleted", tone: "sage" },
  reviewed: { labelKey: "statusReviewed", tone: "sage" },
};

/**
 * Badge label key and tone for a status.
 *
 * An unrecognised status — a value a migration added before the client shipped — returns
 * a null `labelKey` and the neutral tone, so the caller shows the raw status rather than
 * an empty badge. Never throws: a status nobody anticipated must not blank the screen.
 */
export function statusPresentation(status) {
  return PRESENTATION[status] ?? { labelKey: null, tone: "sage" };
}

/**
 * The progress timeline for a request: every status in order, marked done, active, or
 * still ahead. Returns null for a status outside the lifecycle, which is the caller's
 * signal to render no timeline at all rather than one with nothing highlighted.
 */
export function timelineSteps(status) {
  const index = REQUEST_STATUS_ORDER.indexOf(status);
  if (index < 0) return null;
  return REQUEST_STATUS_ORDER.map((key, i) => ({
    key,
    labelKey: PRESENTATION[key].labelKey,
    done: i < index,
    active: i === index,
  }));
}

/** How soon a customer needs the job done, in the order the choices are offered. */
export const WHEN_PREFS = ["this_week", "next_week", "flexible"];

// Keys into `t`, resolved by the lang context's whenLabel.
export const WHEN_LABEL_KEYS = {
  this_week: "whenThisWeek",
  next_week: "whenNextWeek",
  flexible: "whenFlexible",
};

/**
 * Requests waiting on a real customer action — choosing a quote, or (0182/0183)
 * approving exact-location disclosure so the accepted booking can actually go through.
 * Both are "your move" states; the Requests tab's badge count treats them the same.
 */
export function awaitingDecisionCount(requests) {
  return (requests || []).filter(
    (r) => r.status === "quotes_ready" || r.status === "accepted_pending_location_approval"
  ).length;
}

/** Requests the customer has seen through to the end — their profile's "jobs completed". */
export function completedCount(requests) {
  return (requests || []).filter((r) => r.status === "completed" || r.status === "reviewed").length;
}

/** The customer's own reviews, in the order their requests came back. */
export function reviewedRequests(requests) {
  return (requests || []).filter((r) => r.review);
}

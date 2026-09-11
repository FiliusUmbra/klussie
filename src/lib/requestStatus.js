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

/**
 * Every status meaning "this request is still open" — nothing final has happened to it
 * yet, whether or not it's the customer's own move that's pending. Not simply
 * REQUEST_STATUS_ORDER minus its last two entries: `awaiting_pro` is real (a directed
 * request, ADR-0012) but lives only in the legacy table, outside that ordered lifecycle
 * entirely (see PRESENTATION's own comment on it, below) — so this is its own explicit
 * list, not a slice of another one.
 *
 * The one shared source for what used to be two independent copies of this exact set —
 * src/lib/homeToday.js's own IN_FLIGHT (the Today card / active-requests list) and
 * src/lib/homeTimeline.js's own IN_FLIGHT (My Home's own "Active" section) — found
 * drifted out of sync with each other, live, not hypothetically: a real status
 * (`accepted_pending_location_approval`) landed in one and not the other, and a request
 * stuck there disappeared from whichever surface still had the stale copy. Both files
 * import this now instead of keeping their own list and a comment promising to update it.
 */
export const OPEN_STATUSES = [
  "collecting", "awaiting_pro", "quotes_ready", "accepted_pending_location_approval", "booked",
];

const PRESENTATION = {
  collecting: { labelKey: "statusCollecting", tone: "amber" },
  quotes_ready: { labelKey: "statusQuotesReady", tone: "forest" },
  accepted_pending_location_approval: { labelKey: "statusAcceptedPendingLocation", tone: "amber" },
  booked: { labelKey: "statusBooked", tone: "forest" },
  completed: { labelKey: "statusCompleted", tone: "sage" },
  reviewed: { labelKey: "statusReviewed", tone: "sage" },
  // Found live during a UX review, 2026-09-07: `cancelled` has been a real status in
  // work.requests' own check constraint since 0001_init.sql (work.withdraw_request()
  // reaches it today; there is no customer-facing "cancel" button yet, but the status
  // itself is not the unanticipated case this table's own fallback below exists for) --
  // it was simply never added here, so every cancelled request fell through to the
  // fallback and showed its own raw, untranslated status string to the customer.
  cancelled: { labelKey: "statusCancelled", tone: "sage" },
  // Added 2026-09-07, defensively -- TESTING.md §6.2's own "known defect" for this one,
  // but traced end to end (not just added on faith): `awaiting_pro` is real, and still
  // gets written (src/lib/requests.js's createDirectedRequest(), ADR-0012's one-tap
  // directed booking) -- but only to the LEGACY `public.service_requests` table.
  // work.requests' own check constraint (0182_service_location_schema.sql) has no
  // `awaiting_pro` value at all -- structurally cannot hold it -- and createDirectedRequest()
  // dual-writes the correlated work.requests row at plain `collecting` (a directed
  // request's own distinctness lives in directed_workspace_id/auto_accept_max there, not
  // in status). Every current call site of statusPresentation() (StatusPill,
  // ProJobDetailSheet, myHomeParts) reads only work.requests-sourced statuses, so no live
  // UI path can pass this value through today -- confirmed, not assumed. §6.2 predates
  // WP 2.6's client cutover onto work.requests (requests.js's own header); this entry is
  // real coverage against a future path that reads legacy status directly, not the
  // closing of an actively reproducible customer-facing bug the way `cancelled` above was.
  awaiting_pro: { labelKey: "statusAwaitingPro", tone: "amber" },
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

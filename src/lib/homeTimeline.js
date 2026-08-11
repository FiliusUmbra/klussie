// "Mijn woning" V1 — the customer's property, derived entirely from rows that already
// exist.
//
// HOME_OPERATING_SYSTEM.md §2 draws the line this module sits on: History and People
// "aren't hypothetical — every completed request, quote, and review already sitting in
// the database is a home event," while rooms, systems and documents are genuinely new
// schema. So this file reframes what is real and invents nothing. Every value it returns
// traces to a service_request, a quote, a review or a profile column; there is no
// placeholder, no sample home, and no derived statistic that implies a data source
// klussie does not have.
//
// Pure and data-only, like homeToday.js: it takes the requests CustomerApp already
// fetched and returns descriptors. No fetching, no copy, no JSX — the panel turns these
// into words via `t` (ENGINEERING_STANDARDS.md, "no business logic in UI").

// A job counts as history once the work is done. 'booked' is still in progress, so it
// belongs to the active list, not the record.
const FINISHED = ["completed", "reviewed"];

// Everything the customer is currently waiting on. Mirrors homeToday.js's IN_FLIGHT plus
// 'booked', because My Home answers "what is happening to my house" rather than "what
// needs a decision from me".
const IN_FLIGHT = ["collecting", "awaiting_pro", "quotes_ready", "booked"];

const byNewest = (a, b) => b.createdAt - a.createdAt;

/**
 * What klussie actually knows about the property itself.
 *
 * Almost nothing, and it says so by returning nulls rather than filling gaps: there is no
 * rooms table, no floor area, no construction year (ADR-0008). City comes from the
 * customer's own profile, and the counts are of real requests. `since` is the first
 * request rather than the account creation date, because the first job is when klussie
 * genuinely started knowing this home — an account opened and never used has no property
 * history to date.
 */
export function propertySummary(profile, requests) {
  const list = requests || [];
  const oldest = list.length ? Math.min(...list.map((r) => r.createdAt)) : null;
  return {
    city: profile?.city || null,
    since: oldest,
    totalJobs: list.length,
    completedJobs: list.filter((r) => FINISHED.includes(r.status)).length,
    // True when there is genuinely nothing to show. The panel renders an invitation
    // rather than an empty header — never a blank page.
    isEmpty: list.length === 0 && !profile?.city,
  };
}

/** Work still in progress, newest first. */
export function openWork(requests) {
  return (requests || []).filter((r) => IN_FLIGHT.includes(r.status)).sort(byNewest);
}

/** Finished work, newest first — the spine of the timeline. */
export function finishedWork(requests) {
  return (requests || []).filter((r) => FINISHED.includes(r.status)).sort(byNewest);
}

/**
 * The professionals this household has actually worked with, most-used first.
 *
 * "Trusted" here means something specific and earned: they were booked and the job
 * finished. A professional who quoted and lost, or who is mid-job, is not yet part of the
 * home's history — counting them would inflate the one number on this surface that is
 * supposed to mean a real relationship (PROPERTY_MEMORY.md §4, "who has cared for it").
 *
 * Ties break on the most recent job, so two professionals with one job each appear in the
 * order the household would remember them.
 */
export function trustedProfessionals(requests) {
  const byPro = new Map();
  for (const request of finishedWork(requests)) {
    const quote = request.quotes?.find((q) => q.proId === request.bookedProId);
    if (!quote?.pro) continue;
    const existing = byPro.get(quote.pro.id);
    if (existing) {
      existing.jobCount += 1;
      existing.lastJobAt = Math.max(existing.lastJobAt, request.createdAt);
    } else {
      byPro.set(quote.pro.id, { pro: quote.pro, jobCount: 1, lastJobAt: request.createdAt });
    }
  }
  return [...byPro.values()].sort((a, b) => b.jobCount - a.jobCount || b.lastJobAt - a.lastJobAt);
}

/** Reviews this household has written, newest first. */
export function reviewsGiven(requests) {
  return (requests || [])
    .filter((r) => r.review)
    .sort(byNewest)
    .map((r) => ({ id: r.id, serviceId: r.serviceId, createdAt: r.createdAt, review: r.review }));
}

/**
 * The AI's read of each job, where one exists and says something.
 *
 * An analysis with no causes and no materials is a row that technically exists and tells
 * the customer nothing, so it is filtered out rather than rendered as an empty card. Same
 * rule AiAnalysisSummary already applies at render time; applying it here means the
 * section can report itself empty honestly.
 */
export function aiSummaries(requests) {
  return (requests || [])
    .filter((r) => {
      const analysis = r.answers?.aiAnalysis;
      return !!analysis && (analysis.possibleCauses?.length > 0 || analysis.recommendedMaterials?.length > 0);
    })
    .sort(byNewest)
    .map((r) => ({
      id: r.id,
      serviceId: r.serviceId,
      createdAt: r.createdAt,
      analysis: r.answers.aiAnalysis,
    }));
}

/**
 * Every request that might carry photos, newest first.
 *
 * Photos live in a separate table behind signed URLs (src/lib/requestPhotos.js), so this
 * returns the requests to ask about rather than the photos themselves — the gallery
 * fetches per request, exactly as RequestPhotosStrip already does. Returning ids here
 * keeps this module pure and keeps one photo-loading implementation in the codebase.
 */
export function requestsWithPossiblePhotos(requests) {
  return (requests || []).slice().sort(byNewest).map((r) => ({ id: r.id, serviceId: r.serviceId, createdAt: r.createdAt }));
}

/**
 * The unified history: one chronological list of what has happened to this home.
 *
 * A single request can produce two entries — the job, and the review written afterwards —
 * because they happened at different times and mean different things to the household.
 * Reviews carry no timestamp of their own in the current schema (reviews has no exposed
 * created_at through REQUEST_SELECT), so a review is dated to its request and ordered
 * immediately after it rather than being given an invented date.
 */
export function homeHistory(requests) {
  const events = [];
  for (const request of requests || []) {
    if (FINISHED.includes(request.status)) {
      events.push({ kind: "job", at: request.createdAt, id: `job-${request.id}`, request });
    }
    if (request.review) {
      events.push({ kind: "review", at: request.createdAt, id: `review-${request.id}`, request });
    }
  }
  // Job before its own review when they share a timestamp; newest group first.
  return events.sort((a, b) => b.at - a.at || (a.kind === "job" ? -1 : 1));
}

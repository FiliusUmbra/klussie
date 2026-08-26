// The rules AiIntakeSheet follows around an AI analysis: how many times klussie is
// allowed to ask again, which screen a result lands on, how confidently it is presented,
// and what a reviewed result becomes when it is submitted.
//
// Extracted from src/App.jsx. These are product decisions, not rendering — "ask at most
// twice", "85% is confident", "a low-urgency job defaults to flexible" — and every one
// of them was previously a literal inside a component that no test could reach.
//
// src/lib/aiIntake.js remains the transport (it calls the endpoint); this module is the
// interpretation of what comes back.

/**
 * How many follow-up rounds the model may ask for before klussie stops and shows the
 * review screen regardless. A customer who came to describe one leaky tap must never be
 * trapped in an interview.
 */
export const AI_FOLLOWUP_ROUND_LIMIT = 2;

// Confidence bands for the badge on the review screen. Named rather than inline so the
// thresholds can be argued about in one place — they are a claim about how sure klussie
// is being to a customer, not a styling detail.
const CONFIDENCE_HIGH = 85;
const CONFIDENCE_MEDIUM = 60;

/**
 * The editable fields seeded from an analysis, so a result handed over from the
 * conversation canvas populates the review form exactly the way one analysed inside the
 * sheet does.
 *
 * Budget prefers the top of the estimated range: it is the figure a customer is deciding
 * whether they can live with, and quoting them the floor would set up a disappointment.
 */
export function editableFromResult(res) {
  return {
    serviceId: res?.matchedServiceId || null,
    description: res?.description || "",
    budget: res?.estimatedBudget ? String(res.estimatedBudget.max ?? res.estimatedBudget.min ?? "") : "",
    when: res?.urgency === "low" ? "flexible" : "this_week",
  };
}

/**
 * Which stage the sheet opens on. With no prior result the customer still has to describe
 * the job; with one, they skip straight to whichever step that result implies.
 */
export function initialStage(result) {
  if (!result) return "compose";
  return result.followUpQuestions?.length ? "followup" : "review";
}

/**
 * Whether to ask the model's follow-up questions, or stop and let the customer review.
 * Both conditions matter: questions must exist, and klussie must not have used up its
 * allowance asking them.
 */
export function shouldAskFollowUp(result, round) {
  return result?.followUpQuestions?.length > 0 && round < AI_FOLLOWUP_ROUND_LIMIT;
}

/** Badge tone for how sure the analysis claims to be. */
export function confidenceTone(result) {
  if (!result) return "sage";
  if (result.confidence >= CONFIDENCE_HIGH) return "forest";
  if (result.confidence >= CONFIDENCE_MEDIUM) return "amber";
  return "sage";
}

/**
 * The catalog as the intake endpoint needs it — localised names and blurbs, so the model
 * classifies against the words the customer is actually reading rather than seed IDs.
 */
export function servicesForApi(baseServices, serviceInfo) {
  return baseServices.map((s) => ({
    id: s.id,
    name: serviceInfo(s.id).name,
    category: s.cat,
    blurb: serviceInfo(s.id).blurb,
  }));
}

/**
 * Whether the reviewed result is complete enough to become a real request. A matched
 * service and a description are the two things a professional cannot quote without.
 */
export function canSubmitIntake({ serviceId, description }) {
  return !!serviceId && (description || "").trim().length > 0;
}

/**
 * The reviewed analysis as a request payload.
 *
 * `matchedServiceId` is overwritten with the customer's choice: the stored analysis has
 * to agree with the request it produced, or a later reader sees klussie claiming a match
 * the customer overruled.
 */
export function buildIntakeRequest({ edited, result, baseServices, photos }) {
  return {
    serviceId: edited.serviceId,
    categoryId: baseServices.find((s) => s.id === edited.serviceId)?.cat,
    details: edited.description,
    detailsJson: result?.structuredFields || {},
    aiAnalysis: { ...result, matchedServiceId: edited.serviceId },
    whenPref: edited.when,
    budget: edited.budget,
    city: edited.city,
    // Beta-completion slice (0182/0185) — the service location chosen in
    // ServiceLocationField.jsx, passed straight through to createServiceRequest()'s own
    // location-resolution step. Absent from `edited` on any call site that hasn't been
    // updated to gate on it yet, same optional-and-null-safe shape requests.js already
    // gives resolveRequestLocation().
    location: edited.location ?? null,
    photos,
  };
}

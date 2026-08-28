// Platform Activation Slice 2, WP 2.6 — the client write/read cutover onto the
// Marketplace engine (work.requests/quotes/engagements). Every exported function below
// keeps its own external shape exactly as it was: same names, same return objects
// (reshapeRequest()'s own object, unchanged field for field), so RequestsList.jsx,
// RequestDetailSheet.jsx and CustomerProfile.jsx needed no changes at all. Two
// signatures grew a required workspaceId — createServiceRequest()/createDirectedRequest()
// (a real requesting workspace, which work.create_request() itself requires) and
// fetchProJobs() (a real offering workspace, which api.my_quotes()/api.my_engagements()
// require) — CustomerApp.jsx/ProApp.jsx both already had activeWorkspace?.workspace_id
// on hand for other calls; threading it into these two is the one small, necessary
// exception to "zero other file changes."
//
// fetchProLeads() DELIBERATELY STAYS ON LEGACY — SEE ITS OWN COMMENT BELOW
//
// Provider Intelligence (matching) stays legacy until Slice 6
// (SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md §1.7) — pro_matches_request() reads
// public.service_requests only, and has no new-schema equivalent to switch to.
//
// DUAL-WRITE AT CREATION — WHY, AND WHY ONLY THERE
//
// createServiceRequest()/createDirectedRequest()/sendQuote() write to BOTH legacy
// (unchanged) and work.* (new), correlated via service_request_id/legacy_quote_id — the
// real finding building this slice's own WP 2.6: pro_matches_request() and
// fetchProLeads()'s own "already quoted" exclusion both depend on legacy staying
// current for anything a pro might still be matched against. The rest of the lifecycle
// (accept/complete/cancel/review) is work.*-only; fetchProLeads() instead calls
// api.request_lifecycle_statuses() to exclude anything whose correlated work.requests
// row has already moved past collecting — see that function's own comment.
import { supabase } from "./supabaseClient";
import { uuidv7 } from "./ids.js";
import { initialsFrom, fetchPublicProInfo } from "./pros";
import { createPropertyForCaller, setPropertyAddress } from "./homeInventory.js";

function firstOrNull(x) {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null);
}

// Beta-completion slice (0182/0185) — the service-location picker's own write side.
// `location` comes from ServiceLocationField.jsx: `{ type: 'home' | 'saved_property' |
// 'one_time_address', propertyId, address? }`. `address` is present only when that
// property's own address still needs confirming — homeInventory.js's
// hasConfirmedAddress() is what the picker checks first. 'one_time_address' gets a fresh
// property row, the same shape work.confirm_legacy_request_location()'s own 0184 legacy
// path creates, built here for every new request going forward instead of retroactively.
//
// work.requests.location_selection_type (0182) is not written from this path — no
// version of work.create_request_for_caller() through 0184 accepts it as a parameter,
// and adding one would mean overloading a signature 0173-0179 have each re-published
// unchanged. A real, deliberately deferred follow-up (purely descriptive bookkeeping,
// not read by any enforcement path — api.matching_requests_for_pro() and the disclosure
// trigger both key off property_id alone), not silently worked around.
async function resolveRequestLocation(location, { workspaceId, actorRef }) {
  if (!location) return { propertyId: null };

  if (location.type === "one_time_address") {
    const { id: propertyId } = await createPropertyForCaller({
      workspaceId, actorRef, name: "Eenmalig serviceadres",
    });
    await setPropertyAddress({ propertyId, ...location.address });
    return { propertyId };
  }

  // 'home' or 'saved_property' — an already-real property; only write its address when
  // this is the first time it's being confirmed.
  if (location.address) {
    await setPropertyAddress({ propertyId: location.propertyId, ...location.address });
  }
  return { propertyId: location.propertyId };
}

// Resolves a batch of offering_workspace_id values to real, displayable pro info —
// workspace -> auth id (api.resolve_workspace_owner_auth_ids(), professional workspaces
// only, WP 2.6) -> real name/avatar/rating (fetchPublicProInfo(), already erasure-safe).
// Reputation stays legacy (§1.9); this is the bridge to it, not a new store.
async function resolveProInfoByWorkspace(workspaceIds) {
  const ids = [...new Set(workspaceIds)].filter(Boolean);
  const map = new Map();
  if (ids.length === 0) return map;

  const { data, error } = await supabase.schema("api").rpc("resolve_workspace_owner_auth_ids", {
    p_workspace_ids: ids,
  });
  if (error) throw error;

  const authIds = data.map((row) => row.auth_user_id);
  const proInfoByAuthId = await fetchPublicProInfo(authIds);
  for (const row of data) {
    map.set(row.workspace_id, proInfoByAuthId[row.auth_user_id] || null);
  }
  return map;
}

function reshapeWorkQuote(q, proInfoByWorkspace) {
  const pro = proInfoByWorkspace.get(q.offering_workspace_id) || null;
  return {
    id: q.id,
    proId: pro?.id ?? null,
    // Slice 5, WP 5.1 — the one field ReportSheet.jsx's own cutover needs and nothing
    // read before it: q.offering_workspace_id was already fetched (resolveProInfoByWorkspace
    // uses it two lines up) but never passed through. safety.file_case_for_caller() needs
    // a real workspace id, not proId (a person) — the exact gap legacy public.reports
    // could never have grown an enforcement action onto itself without first fixing.
    workspaceId: q.offering_workspace_id,
    price: Number(q.price),
    message: q.message,
    status: q.status,
    sentAt: new Date(q.sent_at).getTime(),
    pro,
  };
}

function reshapeWorkRequest(row, quotes, review) {
  const acceptedQuote = quotes.find((q) => q.status === "accepted");
  return {
    id: row.id,
    cat: row.category_id,
    serviceId: row.service_id,
    createdAt: new Date(row.created_at).getTime(),
    status: row.status,
    answers: {
      when: row.when_pref,
      details: row.details,
      fields: row.details_json || null,
      aiAnalysis: row.ai_analysis || null,
      budget: row.budget,
      city: row.city,
    },
    quotes,
    bookedProId: acceptedQuote?.proId ?? null,
    // ADR-0012. The new schema carries this as a workspace id, not a pro's own auth id
    // — checked directly before this cutover, nothing in the UI currently reads
    // directedProId/directedUntil/autoAcceptMax on the reshaped request object at all
    // (only src/lib/requests.js itself did, and only to pass them straight through). No
    // further resolution is done here; a future screen that needs to display who a
    // request is directed at should resolve directedProId (a workspace id) the same way
    // quote pro info already is, via resolveProInfoByWorkspace().
    directedProId: row.directed_workspace_id,
    directedUntil: row.directed_until ? new Date(row.directed_until).getTime() : null,
    autoAcceptMax: row.auto_accept_max != null ? Number(row.auto_accept_max) : null,
    review,
  };
}

async function fetchQuotesAndReviewsForRequests(rows) {
  const quotesByRequest = new Map();
  const allQuotes = [];
  await Promise.all(
    rows.map(async (row) => {
      const { data, error } = await supabase.schema("api").rpc("quotes_for_request", { p_request_id: row.id });
      if (error) throw error;
      quotesByRequest.set(row.id, data || []);
      allQuotes.push(...(data || []));
    })
  );

  const proInfoByWorkspace = await resolveProInfoByWorkspace(allQuotes.map((q) => q.offering_workspace_id));

  const reviewableIds = rows.filter((r) => r.status === "completed" || r.status === "reviewed").map((r) => r.id);
  const reviewsByRequest = new Map();
  await Promise.all(
    reviewableIds.map(async (id) => {
      const { data, error } = await supabase.schema("api").rpc("review_for_request", { p_request_id: id });
      if (error) throw error;
      const review = data?.[0];
      if (review) reviewsByRequest.set(id, { stars: review.stars, text: review.body });
    })
  );

  return rows.map((row) => {
    const quotes = (quotesByRequest.get(row.id) || [])
      .slice()
      .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
      .map((q) => reshapeWorkQuote(q, proInfoByWorkspace));
    return reshapeWorkRequest(row, quotes, reviewsByRequest.get(row.id) || null);
  });
}

// Dual-writes: a real legacy row (so pro_matches_request() finds it) and a real
// work.requests row (this platform's own lifecycle system of record from here on),
// correlated via service_request_id. See this file's own header for why both.
export async function createServiceRequest({
  customerId, workspaceId, serviceId, categoryId, details, detailsJson, aiAnalysis, whenPref, budget, city, location,
}) {
  const { propertyId } = await resolveRequestLocation(location, { workspaceId, actorRef: customerId });
  const legacyId = uuidv7();
  const { error: legacyError } = await supabase.from("service_requests").insert({
    id: legacyId,
    customer_id: customerId,
    service_id: serviceId,
    category_id: categoryId,
    details,
    details_json: detailsJson && Object.keys(detailsJson).length ? detailsJson : null,
    ai_analysis: aiAnalysis || null,
    when_pref: whenPref,
    budget: budget || null,
    city: city || null,
  });
  if (legacyError) throw legacyError;

  const requestId = uuidv7();
  const { error } = await supabase.schema("api").rpc("create_request", {
    p_request_id: requestId,
    p_requesting_workspace_id: workspaceId,
    p_property_id: propertyId,
    p_asset_id: null,
    p_location_id: null,
    p_category_id: categoryId,
    p_service_id: serviceId,
    p_details: details,
    p_when_pref: whenPref,
    p_budget: budget || null,
    p_details_json: detailsJson && Object.keys(detailsJson).length ? detailsJson : null,
    p_ai_analysis: aiAnalysis || null,
    p_city: city || null,
    p_service_request_id: legacyId,
    p_directed_workspace_id: null,
    p_auto_accept_max: null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: customerId,
  });
  if (error) throw error;

  const [reshaped] = await fetchQuotesAndReviewsForRequests([
    {
      id: requestId, category_id: categoryId, service_id: serviceId, status: "collecting",
      created_at: new Date().toISOString(), when_pref: whenPref, details, details_json: detailsJson || null,
      ai_analysis: aiAnalysis || null, budget: budget || null, city: city || null,
      directed_workspace_id: null, directed_until: null, auto_accept_max: null,
    },
  ]);
  return reshaped;
}

// One tap on the conversation canvas (Epic 03 WP9, implementing ADR-0012). Creates a
// request addressed to one professional's own workspace, carrying the ceiling the
// customer accepted along with the estimate. Dual-writes the same way
// createServiceRequest() does; proId is still the caller's own auth id, matching the
// legacy shape exactly — resolved to a real workspace internally via
// api.resolve_public_professional_workspace() (0065, already public, already
// established, already the pattern src/lib/portfolio.js's own resolveProWorkspace()
// uses), so no caller needs to know the new schema deals in workspaces at all.
export async function createDirectedRequest({
  customerId, workspaceId, serviceId, categoryId, proId, autoAcceptMax,
  details, detailsJson, aiAnalysis, whenPref, city, location,
}) {
  if (!proId) throw new Error("createDirectedRequest requires a professional to direct to");
  if (!(autoAcceptMax > 0)) throw new Error("createDirectedRequest requires a positive ceiling");

  const { propertyId } = await resolveRequestLocation(location, { workspaceId, actorRef: customerId });

  const { data: proWorkspaceId, error: proWorkspaceError } = await supabase
    .schema("api")
    .rpc("resolve_public_professional_workspace", { p_pro_id: proId });
  if (proWorkspaceError) throw proWorkspaceError;
  if (!proWorkspaceId) throw new Error("createDirectedRequest: the professional has no resolvable workspace");

  const legacyId = uuidv7();
  const { error: legacyError } = await supabase.from("service_requests").insert({
    id: legacyId,
    customer_id: customerId,
    service_id: serviceId,
    category_id: categoryId,
    details,
    details_json: detailsJson && Object.keys(detailsJson).length ? detailsJson : null,
    ai_analysis: aiAnalysis || null,
    when_pref: whenPref,
    city: city || null,
    status: "awaiting_pro",
    directed_pro_id: proId,
    auto_accept_max: autoAcceptMax,
  });
  if (legacyError) throw legacyError;

  const requestId = uuidv7();
  const { error } = await supabase.schema("api").rpc("create_request", {
    p_request_id: requestId,
    p_requesting_workspace_id: workspaceId,
    p_property_id: propertyId,
    p_asset_id: null,
    p_location_id: null,
    p_category_id: categoryId,
    p_service_id: serviceId,
    p_details: details,
    p_when_pref: whenPref,
    p_budget: null,
    p_details_json: detailsJson && Object.keys(detailsJson).length ? detailsJson : null,
    p_ai_analysis: aiAnalysis || null,
    p_city: city || null,
    p_service_request_id: legacyId,
    p_directed_workspace_id: proWorkspaceId,
    p_auto_accept_max: autoAcceptMax,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: customerId,
  });
  if (error) throw error;

  const [reshaped] = await fetchQuotesAndReviewsForRequests([
    {
      id: requestId, category_id: categoryId, service_id: serviceId, status: "collecting",
      created_at: new Date().toISOString(), when_pref: whenPref, details, details_json: detailsJson || null,
      ai_analysis: aiAnalysis || null, budget: null, city: city || null,
      directed_workspace_id: proWorkspaceId, directed_until: null, auto_accept_max: autoAcceptMax,
    },
  ]);
  return reshaped;
}

// The read cutover. workspaceId is required — work.requests has no customer_id concept
// at all, unlike legacy's own fallback shape (Epic 03 WP11). Every real user has a real
// Personal Workspace by now (WP 1.0's own backfill); an empty array is the honest
// answer for the one session this could ever be missing for.
export async function fetchCustomerRequests(customerId, workspaceId) {
  if (!workspaceId) return [];

  const { data: rows, error } = await supabase.schema("api").rpc("my_requests", { p_workspace_id: workspaceId });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const reshaped = await fetchQuotesAndReviewsForRequests(rows);
  return reshaped.sort((a, b) => b.createdAt - a.createdAt);
}

// Open leads matching this pro's offered services (RLS already scopes visibility);
// excludes ones they've already quoted. STAYS ON LEGACY, deliberately — see this file's
// own header. The one addition: excludes a lead whose correlated work.requests row has
// already moved past 'collecting' (booked/completed/cancelled elsewhere through the new
// engine) — without this, an already-accepted directed booking would keep reappearing
// as an open lead to every OTHER matching pro forever, since accepting/completing no
// longer touch legacy's own status column at all (WP 2.6's own dual-write decision:
// only creation writes to both).
//
// 'awaiting_pro' is included because that is the status a directed request sits in
// (ADR-0012), and RLS is what makes it appear for the addressed professional and nobody
// else while the window is open. Omitting it here would have hidden directed requests
// from the one person allowed to act on them.
export async function fetchProLeads(proId) {
  const { data, error } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .in("status", ["collecting", "awaiting_pro", "quotes_ready"])
    .neq("customer_id", proId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const candidates = data.map(reshapeRequest).filter((r) => !r.quotes.some((q) => q.proId === proId));
  if (candidates.length === 0) return candidates;

  const { data: statuses, error: statusError } = await supabase.schema("api").rpc("request_lifecycle_statuses", {
    p_service_request_ids: candidates.map((r) => r.id),
  });
  if (statusError) throw statusError;

  const stillOpenOrUncorrelated = new Set(candidates.map((r) => r.id));
  for (const row of statuses || []) {
    if (row.status !== "collecting") stillOpenOrUncorrelated.delete(row.service_request_id);
  }
  const open = candidates.filter((r) => stillOpenOrUncorrelated.has(r.id));

  return attachLeadLocations(open);
}

// Beta priority: "the professional sees only approximate location information during
// quotation" — api.matching_request_locations_for_pro() (0187) bridges fetchProLeads()'s
// own legacy-keyed candidates to api.matching_requests_for_pro()'s (0183) location
// fields, mirroring how request_lifecycle_statuses() already bridges status above. A
// candidate with no correlated work.requests row (predates dual-write) or no property
// selected on it yet simply gets `location: null` — ProDashboard.jsx's own rendering
// already treats an absent location the same as it always has: legacy's free-text city.
async function attachLeadLocations(candidates) {
  const { data: locations, error } = await supabase.schema("api").rpc("matching_request_locations_for_pro", {
    p_service_request_ids: candidates.map((r) => r.id),
  });
  if (error) throw error;

  const byLegacyId = new Map((locations || []).map((row) => [row.service_request_id, row]));
  return candidates.map((r) => {
    const row = byLegacyId.get(r.id);
    if (!row) return { ...r, location: null };
    return {
      ...r,
      location: {
        municipality: row.municipality,
        country: row.country,
        distanceBand: row.distance_band,
        propertyType: row.property_type,
        quotePrepNotes: row.quote_prep_notes,
      },
    };
  });
}

// The read cutover. workspaceId is the pro's own Professional Workspace — required, the
// same reasoning fetchCustomerRequests() now holds for the customer side. Sourced from
// api.my_quotes()/api.my_engagements(), never legacy: a booking's real lifecycle lives
// in work.* alone from acceptance onward (WP 2.6's own dual-write decision).
export async function fetchProJobs(proId, workspaceId) {
  if (!workspaceId) return { sent: [], booked: [], completed: [] };

  const [{ data: quotes, error: quotesError }, { data: engagements, error: engagementsError }] = await Promise.all([
    supabase.schema("api").rpc("my_quotes", { p_workspace_id: workspaceId }),
    supabase.schema("api").rpc("my_engagements", { p_workspace_id: workspaceId }),
  ]);
  if (quotesError) throw quotesError;
  if (engagementsError) throw engagementsError;

  const engagementByRequest = new Map((engagements || []).map((e) => [e.request_id, e]));

  const requestIds = [...new Set((quotes || []).map((q) => q.request_id))];
  const requests = await Promise.all(
    requestIds.map(async (id) => {
      const { data, error } = await supabase.schema("api").rpc("resolve_request", { p_request_id: id });
      if (error) throw error;
      return data?.[0] || null;
    })
  );
  const requestById = new Map(requests.filter(Boolean).map((r) => [r.id, r]));

  const reviewableIds = requestIds.filter((id) => {
    const r = requestById.get(id);
    return r && (r.status === "completed" || r.status === "reviewed");
  });
  const reviewsByRequest = new Map();
  await Promise.all(
    reviewableIds.map(async (id) => {
      const { data, error } = await supabase.schema("api").rpc("review_for_request", { p_request_id: id });
      if (error) throw error;
      const review = data?.[0];
      if (review) reviewsByRequest.set(id, { stars: review.stars, text: review.body });
    })
  );

  // .quotes keeps the exact shape ProJobs.jsx already reads (r.quotes.find(q =>
  // q.proId === proId)?.price) — proId is this workspace's own owner auth id, resolved
  // once here rather than per row, since every quote in this list is this same pro's.
  const [{ auth_user_id: myProId } = {}] = (
    await supabase.schema("api").rpc("resolve_workspace_owner_auth_ids", { p_workspace_ids: [workspaceId] })
  ).data || [];

  const reshapedByQuote = (quotes || []).map((q) => {
    const request = requestById.get(q.request_id);
    const engagement = engagementByRequest.get(q.request_id);
    return {
      id: q.request_id,
      serviceId: request?.service_id ?? null,
      quotes: [{ id: q.id, proId: myProId ?? proId, price: Number(q.price), status: q.status }],
      status: request?.status ?? q.status,
      bookedProId: engagement ? (myProId ?? proId) : null,
      engaged: Boolean(engagement),
      review: reviewsByRequest.get(q.request_id) || null,
      // WP 2.4's own real acceptance bar — the property/asset/location a booked job's
      // request carries (api.resolve_request() already returns all three; nothing new
      // to fetch), plus the engagement id, so ProJobDetailSheet.jsx can resolve the
      // scoped twin (propertyTwin.js) and match this job to its conversation without a
      // second round trip.
      propertyId: request?.property_id ?? null,
      assetId: request?.asset_id ?? null,
      locationId: request?.location_id ?? null,
      engagementId: engagement?.id ?? null,
    };
  });

  return {
    sent: reshapedByQuote.filter((r) => !r.engaged),
    booked: reshapedByQuote.filter((r) => r.engaged && r.status !== "completed" && r.status !== "reviewed"),
    completed: reshapedByQuote.filter((r) => r.engaged && (r.status === "completed" || r.status === "reviewed")),
  };
}

// Dual-writes, the same reasoning as createServiceRequest(). requestId is always a
// LEGACY id here — fetchProLeads() stays legacy, so every lead a pro ever quotes on is
// reached through a legacy id. Resolves the correlated work.requests row (if the lead
// was itself dual-written at creation) via api.resolve_work_request_for_legacy() (WP
// 2.6) and writes there too when one exists; when it does not — a lead that predates
// this slice's own dual-write — writes to legacy alone, a graceful degradation rather
// than a broken quote.
export async function sendQuote({ requestId, proId, workspaceId, price, message }) {
  const { error: legacyError } = await supabase.from("quotes").insert({
    request_id: requestId,
    pro_id: proId,
    price,
    message: message || null,
  });
  if (legacyError) throw legacyError;

  const { data: workRequestId, error: resolveError } = await supabase
    .schema("api")
    .rpc("resolve_work_request_for_legacy", { p_service_request_id: requestId });
  if (resolveError) throw resolveError;
  if (!workRequestId) return;

  const { error } = await supabase.schema("api").rpc("submit_quote", {
    p_quote_id: uuidv7(),
    p_request_id: workRequestId,
    p_offering_workspace_id: workspaceId,
    p_price: price,
    p_message: message || null,
    p_legacy_quote_id: null,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_auto_accept_engagement_id: uuidv7(),
    p_auto_accept_event_id: uuidv7(),
    p_auto_accept_engagement_event_id: uuidv7(),
    p_auto_accept_conversation_id: uuidv7(),
    p_auto_accept_customer_participant_id: uuidv7(),
    p_auto_accept_pro_participant_id: uuidv7(),
    p_auto_accept_conversation_event_id: uuidv7(),
    p_auto_accept_customer_participant_event_id: uuidv7(),
    p_auto_accept_pro_participant_event_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: proId,
  });
  if (error) throw error;
}

// quoteId/customerId are both work.* ids: the customer's own reshaped quotes (from
// fetchCustomerRequests(), above) already carry a work.quotes.id, never a legacy one.
export async function acceptQuote(quoteId, customerId) {
  const { error } = await supabase.schema("api").rpc("accept_quote", {
    p_quote_id: quoteId,
    p_engagement_id: uuidv7(),
    p_event_id: uuidv7(),
    p_engagement_event_id: uuidv7(),
    p_declined_event_id: uuidv7(),
    p_conversation_id: uuidv7(),
    p_customer_participant_id: uuidv7(),
    p_pro_participant_id: uuidv7(),
    p_conversation_event_id: uuidv7(),
    p_customer_participant_event_id: uuidv7(),
    p_pro_participant_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: customerId,
  });
  if (error) throw error;
}

// Beta-completion slice (0182/0183) — the disclosure-consent action itself.
// requestId is a work.requests id (the customer's own reshaped request), same restraint
// as markComplete() below: the engagement id is resolved here, at action time, rather
// than carried on every read. api.approve_location_disclosure() is the one and only
// place the engagement reaches 'active' and marketplace.engagement.created fires
// (0183's own header) — this is what actually completes the booking after quote
// acceptance, not acceptQuote() above.
export async function approveLocationDisclosure(requestId, customerId) {
  const { data: engagementId, error: resolveError } = await supabase
    .schema("api")
    .rpc("resolve_engagement_for_request", { p_request_id: requestId });
  if (resolveError) throw resolveError;
  if (!engagementId) throw new Error("approveLocationDisclosure: no engagement found for this request");

  const { error } = await supabase.schema("api").rpc("approve_location_disclosure", {
    p_engagement_id: engagementId,
    p_disclosure_id: uuidv7(),
    p_engagement_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: customerId,
  });
  if (error) throw error;
}

// requestId is a work.requests id (the customer's own reshaped request). The engagement
// id it books through was never carried on the read — resolved here, at action time,
// via api.resolve_engagement_for_request() (WP 2.6), the same restraint that keeps
// resolve_request()/my_requests() from carrying it on every page load.
export async function markComplete(requestId, customerId) {
  const { data: engagementId, error: resolveError } = await supabase
    .schema("api")
    .rpc("resolve_engagement_for_request", { p_request_id: requestId });
  if (resolveError) throw resolveError;
  if (!engagementId) throw new Error("markComplete: no engagement found for this request");

  const { error } = await supabase.schema("api").rpc("complete_engagement", {
    p_engagement_id: engagementId,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: customerId,
  });
  if (error) throw error;
}

// Writes the legacy review and completes work.requests' own state machine atomically,
// via api.submit_review_for_request() (WP 2.6) — see that function's own header for why
// this could not be two separate client calls (the legacy request id is deliberately
// never exposed to the client at all).
export async function submitReview({ requestId, customerId, stars, text }) {
  const { error } = await supabase.schema("api").rpc("submit_review_for_request", {
    p_request_id: requestId,
    p_stars: stars,
    p_body: text,
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: customerId,
  });
  if (error) throw error;
}

// Each subscribe* helper returns an unsubscribe function for a useEffect cleanup.
// Re-pointed at work.* — the customer/pro read cutover's own tables — except
// subscribeToProLeads(), which stays on legacy's own service_requests, matching
// fetchProLeads() itself staying legacy (see this file's own header).

export function subscribeToCustomerRequests(customerId, workspaceId, onChange) {
  if (!workspaceId) return () => {};
  const channel = supabase
    .channel(`customer-requests-${workspaceId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "work", table: "requests", filter: `requesting_workspace_id=eq.${workspaceId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "work", table: "quotes" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "work", table: "engagements", filter: `requesting_workspace_id=eq.${workspaceId}` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToRequestQuotes(requestId, onChange) {
  const channel = supabase
    .channel(`request-quotes-${requestId}`)
    .on("postgres_changes", { event: "*", schema: "work", table: "quotes", filter: `request_id=eq.${requestId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Unchanged: fetchProLeads() itself stays on legacy, so its own invalidation signal
// does too.
export function subscribeToProLeads(categoryIds, onChange) {
  if (!categoryIds.length) return () => {};
  const channel = supabase
    .channel(`pro-leads-${categoryIds.join("-")}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "service_requests", filter: `category_id=in.(${categoryIds.join(",")})` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToProQuoteUpdates(workspaceId, onChange) {
  if (!workspaceId) return () => {};
  const channel = supabase
    .channel(`pro-quotes-${workspaceId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "work", table: "quotes", filter: `offering_workspace_id=eq.${workspaceId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "work", table: "engagements", filter: `performing_workspace_id=eq.${workspaceId}` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// =========================================================================
// LEGACY-ONLY SUPPORT — fetchProLeads() itself, kept exactly as it always has been
// (see this file's own header for why it stays on legacy).

const REQUEST_SELECT = `
  id, customer_id, service_id, category_id, details, details_json, ai_analysis, when_pref, budget, city, status, booked_pro_id, created_at, updated_at,
  directed_pro_id, directed_until, auto_accept_max,
  quotes ( id, request_id, pro_id, price, message, status, sent_at,
    pro:pro_profiles ( profile_id, pro_type, profiles ( full_name, avatar_url ), pro_stats ( rating_avg, rating_count, badge_tier, is_certified ) )
  ),
  reviews ( id, stars, body )
`;

function shapePro(pro) {
  if (!pro) return null;
  const profile = firstOrNull(pro.profiles);
  const stats = firstOrNull(pro.pro_stats);
  return {
    id: pro.profile_id,
    name: profile?.full_name || "Pro",
    initials: initialsFrom(profile?.full_name),
    avatarUrl: profile?.avatar_url || null,
    proType: pro.pro_type,
    rating: Number(stats?.rating_avg) || 0,
    reviews: stats?.rating_count || 0,
    badgeTier: stats?.badge_tier || null,
    isCertified: stats?.is_certified || false,
  };
}

function reshapeRequest(row) {
  const quotes = (row.quotes || []).map((q) => ({
    id: q.id,
    proId: q.pro_id,
    price: Number(q.price),
    message: q.message,
    status: q.status,
    sentAt: new Date(q.sent_at).getTime(),
    pro: shapePro(q.pro),
  }));
  const review = firstOrNull(row.reviews);

  return {
    id: row.id,
    cat: row.category_id,
    serviceId: row.service_id,
    createdAt: new Date(row.created_at).getTime(),
    status: row.status,
    answers: { when: row.when_pref, details: row.details, fields: row.details_json || null, aiAnalysis: row.ai_analysis || null, budget: row.budget, city: row.city },
    quotes,
    bookedProId: row.booked_pro_id,
    directedProId: row.directed_pro_id,
    directedUntil: row.directed_until ? new Date(row.directed_until).getTime() : null,
    autoAcceptMax: row.auto_accept_max != null ? Number(row.auto_accept_max) : null,
    review: review ? { stars: review.stars, text: review.body } : null,
  };
}

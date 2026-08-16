import { supabase } from "./supabaseClient";
import { initialsFrom } from "./pros";

const REQUEST_SELECT = `
  id, customer_id, service_id, category_id, details, details_json, ai_analysis, when_pref, budget, city, status, booked_pro_id, created_at, updated_at,
  directed_pro_id, directed_until, auto_accept_max,
  quotes ( id, request_id, pro_id, price, message, status, sent_at,
    pro:pro_profiles ( profile_id, pro_type, profiles ( full_name, avatar_url ), pro_stats ( rating_avg, rating_count, badge_tier, is_certified ) )
  ),
  reviews ( id, stars, body )
`;

function firstOrNull(x) {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null);
}

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
    // ADR-0012. directedUntil is what separates "still waiting on this professional"
    // from "lapsed, now open to anyone" — the row itself never changes when the window
    // closes, so callers have to compare against the clock, same as the RLS gate does.
    directedProId: row.directed_pro_id,
    directedUntil: row.directed_until ? new Date(row.directed_until).getTime() : null,
    autoAcceptMax: row.auto_accept_max != null ? Number(row.auto_accept_max) : null,
    review: review ? { stars: review.stars, text: review.body } : null,
  };
}

export async function createServiceRequest({ customerId, serviceId, categoryId, details, detailsJson, aiAnalysis, whenPref, budget, city }) {
  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      customer_id: customerId,
      service_id: serviceId,
      category_id: categoryId,
      details,
      details_json: detailsJson && Object.keys(detailsJson).length ? detailsJson : null,
      ai_analysis: aiAnalysis || null,
      when_pref: whenPref,
      budget: budget || null,
      city: city || null,
    })
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return reshapeRequest(data);
}

// One tap on the conversation canvas (Epic 03 WP9, implementing ADR-0012). Creates a
// request addressed to one professional, carrying the ceiling the customer accepted
// along with the estimate.
//
// Deliberately does NOT write a quote, set booked_pro_id, or touch status beyond
// 'awaiting_pro': the professional's own quote is still the only thing that books this,
// and their price is still the only price. `directed_until` is left to the database —
// the length of the exclusive window is a platform rule, not something a client sends.
export async function createDirectedRequest({
  customerId, serviceId, categoryId, proId, autoAcceptMax,
  details, detailsJson, aiAnalysis, whenPref, city,
}) {
  if (!proId) throw new Error("createDirectedRequest requires a professional to direct to");
  if (!(autoAcceptMax > 0)) throw new Error("createDirectedRequest requires a positive ceiling");

  const { data, error } = await supabase
    .from("service_requests")
    .insert({
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
    })
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return reshapeRequest(data);
}

// Epic 03 WP11 — the read switch. `workspaceId` is `useAuth().activeWorkspace?.workspace_id`
// (WP 03.09): resolved but null on a database without Epic 03's migrations (production,
// today — docs/operations/PRODUCTION_MIGRATION_0018_0029.md), or for any person the
// resolver could not place in exactly one workspace. Falling back to `customer_id` in
// either case is not a hedge — it is the same row set `workspace_id` was backfilled from
// (WP 03.06, reconciled clean by WP 03.07), so a single-workspace customer sees no
// difference regardless of which filter actually runs. Once a workspace can hold more than
// its one backfilled member (household invites — none exist yet), this is the query that
// starts returning what the whole household can see rather than only what its own row says
// — the entire reason WP 03.10 gave this table an isolation policy to land on.
export async function fetchCustomerRequests(customerId, workspaceId) {
  const query = supabase.from("service_requests").select(REQUEST_SELECT);
  const scoped = workspaceId ? query.eq("workspace_id", workspaceId) : query.eq("customer_id", customerId);
  const { data, error } = await scoped.order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(reshapeRequest);
}

// Open leads matching this pro's offered services (RLS already scopes visibility);
// excludes ones they've already quoted.
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
  return data.map(reshapeRequest).filter((r) => !r.quotes.some((q) => q.proId === proId));
}

export async function fetchProJobs(proId) {
  const { data, error } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const myQuoted = data.map(reshapeRequest).filter((r) => r.quotes.some((q) => q.proId === proId));
  return {
    sent: myQuoted.filter((r) => r.bookedProId !== proId),
    booked: myQuoted.filter((r) => r.bookedProId === proId && r.status === "booked"),
    completed: myQuoted.filter((r) => r.bookedProId === proId && (r.status === "completed" || r.status === "reviewed")),
  };
}

export async function sendQuote({ requestId, proId, price, message }) {
  const { error } = await supabase.from("quotes").insert({
    request_id: requestId,
    pro_id: proId,
    price,
    message: message || null,
  });
  if (error) throw error;
}

export async function acceptQuote(quoteId) {
  const { error } = await supabase.from("quotes").update({ status: "accepted" }).eq("id", quoteId);
  if (error) throw error;
}

export async function markComplete(requestId) {
  const { error } = await supabase.from("service_requests").update({ status: "completed" }).eq("id", requestId);
  if (error) throw error;
}

export async function submitReview({ requestId, customerId, proId, stars, text }) {
  const { error } = await supabase.from("reviews").insert({
    request_id: requestId,
    customer_id: customerId,
    pro_id: proId,
    stars,
    body: text,
  });
  if (error) throw error;
}

// Each subscribe* helper returns an unsubscribe function for a useEffect cleanup.

// Same fallback as fetchCustomerRequests, applied to Realtime's server-side row filter
// rather than to a query. A mismatch here is only ever staleness — the channel would miss
// an INSERT/UPDATE it should have pushed — never a correctness or isolation issue, since
// nothing about what a caller may read runs through this filter; it is an invalidation
// signal that ends in a call to fetchCustomerRequests, which is where the real gate is.
export function subscribeToCustomerRequests(customerId, workspaceId, onChange) {
  const filter = workspaceId ? `workspace_id=eq.${workspaceId}` : `customer_id=eq.${customerId}`;
  const channel = supabase
    .channel(`customer-requests-${workspaceId || customerId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "service_requests", filter },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToRequestQuotes(requestId, onChange) {
  const channel = supabase
    .channel(`request-quotes-${requestId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "quotes", filter: `request_id=eq.${requestId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

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

export function subscribeToProQuoteUpdates(proId, onChange) {
  const channel = supabase
    .channel(`pro-quotes-${proId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quotes", filter: `pro_id=eq.${proId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

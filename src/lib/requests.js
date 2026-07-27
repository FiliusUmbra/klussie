import { supabase } from "./supabaseClient";
import { initialsFrom } from "./pros";

const REQUEST_SELECT = `
  id, customer_id, service_id, category_id, details, details_json, when_pref, budget, city, status, booked_pro_id, created_at, updated_at,
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
    answers: { when: row.when_pref, details: row.details, fields: row.details_json || null, budget: row.budget, city: row.city },
    quotes,
    bookedProId: row.booked_pro_id,
    review: review ? { stars: review.stars, text: review.body } : null,
  };
}

export async function createServiceRequest({ customerId, serviceId, categoryId, details, detailsJson, whenPref, budget, city }) {
  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      customer_id: customerId,
      service_id: serviceId,
      category_id: categoryId,
      details,
      details_json: detailsJson && Object.keys(detailsJson).length ? detailsJson : null,
      when_pref: whenPref,
      budget: budget || null,
      city: city || null,
    })
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return reshapeRequest(data);
}

export async function fetchCustomerRequests(customerId) {
  const { data, error } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(reshapeRequest);
}

// Open leads matching this pro's offered services (RLS already scopes visibility);
// excludes ones they've already quoted.
export async function fetchProLeads(proId) {
  const { data, error } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .in("status", ["collecting", "quotes_ready"])
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

export function subscribeToCustomerRequests(customerId, onChange) {
  const channel = supabase
    .channel(`customer-requests-${customerId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "service_requests", filter: `customer_id=eq.${customerId}` },
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

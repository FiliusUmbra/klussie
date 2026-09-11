// Vercel serverless function. Requires an authenticated Supabase session — see
// api/_lib/auth.js — and is rate-limited per user via api/_lib/rateLimit.js, same as
// api/ai-intake.js and api/ask-about-item.js.
//
// WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT DO
//
// Given a request that needs more supply than the marketplace currently has, searches
// Google Places for real local businesses and records them as candidates
// (provider.record_sourced_leads_for_caller(), migration 0216). It does NOT contact
// anyone — there is no SMS/email dispatch here, and none is wired to fire automatically.
// See the migration's own header for why: PLATFORM_DOMAIN_MODEL.md §14.4's "automation
// beyond ordinary matching requires the customer's own explicit opt-in, never a silent
// platform default" applies here even though this endpoint reaches outside the platform
// rather than dispatching the customer's own job.
//
// AUTHORIZATION IS THE DATABASE'S JOB, NOT THIS FUNCTION'S — WITH ONE KNOWN, ACCEPTED
// COST TRADE-OFF
//
// api/_lib/auth.js's own header: least-privilege by construction, via RLS, not by
// convention. This function does not check the caller's own platform_operations
// capability before calling Places — provider.record_sourced_leads_for_caller() (0216)
// is the real authority and refuses a non-operator caller's persist attempt outright. The
// accepted cost: a non-operator can trigger one real Places API call (bounded by the same
// per-user rate limit every AI endpoint here already uses) before that refusal happens.
// Worth revisiting if real-world abuse ever makes that cost material; not worth a second,
// duplicated authorization check for now.
//
// EMAIL IS ALMOST NEVER AVAILABLE FROM PLACES — LEFT NULL, NOT GUESSED
//
// Google Places (New) returns name, address, phone and website reliably; it does not
// return an email address at all. A later enrichment step (reading the business's own
// website) could fill this in without ever needing a second table — see
// provider.external_leads' own comment (0216). Guessing one here (e.g.
// "info@" + hostname) would poison the record with a fact nobody actually confirmed.
import { verifyAuth, AuthError } from "./_lib/auth.js";
import { checkAndLogUsage, RateLimitError } from "./_lib/rateLimit.js";
// The explicit .ts extension is load-bearing, not a typo: src/lib/locations.js's own
// `from "./ids.js"` works because Vite's client bundler rewrites the extension for you.
// Vercel's serverless bundler does no such rewriting -- confirmed live under `vercel dev`,
// which fails with "Cannot find module ids.js" otherwise, since the real file is ids.ts.
import { uuidv7 } from "../src/lib/ids.ts";

const ENDPOINT = "source-providers";
const MAX_CANDIDATES = 8;
const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACES_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Found live during testing: api/ai-intake.js's own shared shape
  // (`res.status(status).json({ error: err.message })` for anything that isn't
  // AuthError/RateLimitError) leaks a raw, unhandled error straight to the client -- hit
  // for real here when checkAndLogUsage()'s own INSERT failed on a constraint this
  // endpoint hadn't been added to yet (0217). AuthError/RateLimitError carry deliberately
  // user-safe messages by construction (their own class definitions); anything else does
  // not, and is exactly the "raw backend error reaching the user" anti-pattern
  // documents.js's own header already names and fixes elsewhere in this codebase.
  let auth;
  try {
    auth = await verifyAuth(req);
    await checkAndLogUsage(auth.supabase, auth.user.id, ENDPOINT);
  } catch (err) {
    if (err instanceof AuthError || err instanceof RateLimitError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("source-providers auth/rate-limit error:", err);
    res.status(500).json({ error: "Could not verify your session. Please try again." });
    return;
  }

  const { requestId, serviceName, city } = req.body || {};

  if (!requestId || !serviceName || !city) {
    res.status(400).json({ error: "Provide requestId, serviceName, and city." });
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Provider sourcing is not configured." });
    return;
  }

  let places;
  try {
    const placesRes = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${serviceName} in ${city}, Belgium`,
        languageCode: "nl",
        regionCode: "BE",
      }),
    });
    const body = await placesRes.json();
    if (!placesRes.ok) throw new Error(body?.error?.message || `Places lookup failed (${placesRes.status})`);
    places = Array.isArray(body.places) ? body.places : [];
  } catch (err) {
    console.error("source-providers places lookup error:", err);
    res.status(502).json({ error: "Could not search for local providers. Please try again." });
    return;
  }

  if (places.length === 0) {
    res.status(200).json({ candidates: [] });
    return;
  }

  const candidates = places.slice(0, MAX_CANDIDATES).map((place) => ({
    leadId: uuidv7(),
    matchId: uuidv7(),
    source: "google_places",
    sourceRef: place.id,
    businessName: place.displayName?.text || place.formattedAddress || "Unknown business",
    phone: place.nationalPhoneNumber || null,
    website: place.websiteUri || null,
    email: null,
    city,
  }));

  const { error } = await auth.supabase.schema("api").rpc("record_sourced_leads", {
    p_request_id: requestId,
    p_leads: candidates.map((c) => ({
      id: c.leadId,
      source: c.source,
      source_ref: c.sourceRef,
      business_name: c.businessName,
      phone: c.phone,
      email: c.email,
      website: c.website,
      city: c.city,
      match_id: c.matchId,
      match_reason: { serviceName, city, source: "google_places_text_search" },
    })),
    p_event_id: uuidv7(),
    p_correlation_id: uuidv7(),
    p_actor_type: "person",
    p_actor_ref: auth.user.id,
  });

  if (error) {
    console.error("source-providers record_sourced_leads error:", error);
    // 42501 is Postgres's own SQLSTATE for insufficient_privilege — the real refusal
    // provider.record_sourced_leads_for_caller() raises for a non-operator caller.
    const status = error.code === "42501" ? 403 : 500;
    res.status(status).json({ error: "Could not record the sourced providers. Please try again." });
    return;
  }

  res.status(200).json({
    candidates: candidates.map(({ leadId, businessName, phone, website, city: candidateCity }) => ({
      id: leadId,
      businessName,
      phone,
      website,
      city: candidateCity,
    })),
  });
}

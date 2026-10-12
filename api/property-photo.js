// Vercel serverless function: the Street View hero image for a customer's own home.
// Requires an authenticated Supabase session and is rate-limited per user — see
// api/_lib/auth.js and api/_lib/rateLimit.js. The Google key never reaches a browser.
//
// WHY A SERVER-SIDE PROXY, NOT A DIRECT <img src="https://maps.googleapis.com/...key=...">
//
// A Maps key embedded in a page URL is a key published to everyone who opens the page; a
// referrer restriction is the only thing between it and anyone else's bill. Here the key is
// `GOOGLE_MAPS_API_KEY` in the server environment only, the address is read through the
// caller's own RLS-scoped client (so a person can only ever request a property they are a
// member of — `api.my_properties()` returns nothing else), and the image is streamed back
// with a private cache header. The browser never sees the key or the address-bearing URL.
//
// REAL DATA OR NOTHING (ADR-0011)
//
// No key configured → 501 `not_configured`; no confirmed address → 404 `no_address`; Google
// has no imagery for the spot → 404 `no_imagery`. In every one of those cases the client
// shows its gradient stand-in — never a placeholder photo of somewhere else, and never
// Google's grey "no imagery" tile (the free metadata call is made first for exactly that
// reason, so a billed image request is only made when there is a real picture).
import { verifyAuth, AuthError } from "./_lib/auth.js";
import { checkAndLogUsage, RateLimitError } from "./_lib/rateLimit.js";

const ENDPOINT = "property-photo";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METADATA_URL = "https://maps.googleapis.com/maps/api/streetview/metadata";
const IMAGE_URL = "https://maps.googleapis.com/maps/api/streetview";

export function addressQuery(p) {
  const street = [p.street, p.house_number].filter(Boolean).join(" ");
  const place = [p.postcode, p.municipality].filter(Boolean).join(" ");
  return [street, place, p.country || "BE"].filter(Boolean).join(", ");
}

function hasConfirmedAddress(p) {
  return Boolean(p?.street && p?.postcode && p?.municipality);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const propertyId = req.query?.propertyId;
  if (!propertyId || typeof propertyId !== "string" || !UUID.test(propertyId)) {
    res.status(400).json({ error: "Missing or invalid propertyId.", code: "bad_request" });
    return;
  }

  // Checked before anything is logged against the user's allowance: an unconfigured
  // deployment should cost a visitor nothing and never touch Google.
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    res.status(501).json({ error: "Property photos are not configured.", code: "not_configured" });
    return;
  }

  let auth;
  try {
    auth = await verifyAuth(req);
    await checkAndLogUsage(auth.supabase, auth.user.id, ENDPOINT);
  } catch (err) {
    if (err instanceof AuthError || err instanceof RateLimitError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("property-photo auth/rate-limit error:", err);
    res.status(500).json({ error: "Could not verify your session. Please try again." });
    return;
  }

  const { data: rows, error: readError } = await auth.supabase.schema("api").rpc("my_properties");
  if (readError) {
    console.error("property-photo property read error:", readError.message);
    res.status(500).json({ error: "Could not read this property. Please try again.", code: "property_unreadable" });
    return;
  }
  const property = (rows || []).find((p) => p.id === propertyId);
  if (!property || !hasConfirmedAddress(property)) {
    res.status(404).json({ error: "No confirmed address for this property.", code: "no_address" });
    return;
  }

  const location = addressQuery(property);
  try {
    const meta = await fetch(`${METADATA_URL}?location=${encodeURIComponent(location)}&key=${key}`);
    const metaJson = await meta.json();
    if (metaJson.status !== "OK") {
      res.status(404).json({ error: "No street imagery for this address.", code: "no_imagery" });
      return;
    }

    const image = await fetch(`${IMAGE_URL}?size=640x360&fov=80&source=outdoor&location=${encodeURIComponent(location)}&key=${key}`);
    if (!image.ok) {
      console.error("property-photo image fetch failed:", image.status);
      res.status(502).json({ error: "Could not load the street image.", code: "image_failed" });
      return;
    }
    const bytes = Buffer.from(await image.arrayBuffer());
    res.setHeader("Content-Type", image.headers.get("content-type") || "image/jpeg");
    // Private: the picture depicts one person's home. A day is plenty — and every cache hit
    // is a billed request not made.
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.status(200).send(bytes);
  } catch (err) {
    console.error("property-photo error:", err.message);
    res.status(502).json({ error: "Could not load the street image.", code: "image_failed" });
  }
}

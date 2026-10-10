# Property photo (Street View hero) — setup and behaviour

The My Home hero and Today's property card show a Street View photo of the customer's own
home when it can, and the existing gradient otherwise. Nothing changes until the key below is
configured; with no key the app behaves exactly as before.

## Turn it on

1. In Google Cloud, enable **Street View Static API** (its metadata endpoint is free; images are billed).
2. Create an API key and restrict it **by API** to Street View Static API only. (Server-side use, so an
   HTTP-referrer restriction would block it; the API restriction plus a billing budget alert is the guard.)
3. Add it in Vercel as **`GOOGLE_MAPS_API_KEY`** (Production and Preview; Development only if you want it locally).
   Never paste the key into chat, code, logs or a commit.
4. Apply migration `0238` (widens `ai_usage_log_endpoint_check` for `property-photo`) **before** the first
   real request — the endpoint rate-limits through that table and would otherwise fail its first usage-log insert.

## How it behaves

- `GET /api/property-photo?propertyId=…` (signed-in only). The address is read through the caller's own
  RLS-scoped `api.my_properties()`, so a person can only request a property they belong to.
- Order of checks: method → propertyId shape → key configured (501 `not_configured`, costs nothing) →
  auth + rate limit (20 per 10 minutes per user) → confirmed address (404 `no_address`) → free metadata
  call (404 `no_imagery` — the billed image is **never** requested when there is nothing to show) → image.
- Response is cached privately for a day; the client also remembers the answer (including "none") per
  property for the life of the page, so at most one billed request per property per page load.
- The key never leaves the server. The browser only receives image bytes.

## Not done on purpose

No stand-in photo, ever (ADR-0011: real data or nothing). A customer can't choose or upload their own
hero photo yet; that would be its own feature (property photo upload).

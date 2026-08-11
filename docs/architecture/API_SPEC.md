# Klussie — API Specification

**This document owns:** the real, current contracts of Klussie's
internal API endpoints, plus the shape planned for the future public
Platform API. It does not own how those endpoints talk to AI providers
internally (`AI_ARCHITECTURE.md`) or their threat model
(`../engineering/SECURITY.md`).

## Today: two internal endpoints

Both are Vercel serverless functions under `api/`. Both require a
Supabase session and are rate-limited per user. Neither is meant to be
called by anything other than the Klussie client — there is no public
API yet (see Planned, below).

### Common request requirements

- **Method:** `POST` only — any other method returns `405 Method not
  allowed`.
- **Auth:** `Authorization: Bearer <supabase access token>` header,
  required. Missing → `401`. Invalid/expired → `401`. Verified via
  `api/_lib/auth.js`, which authenticates as the calling user (not a
  service-role key) so every downstream query stays subject to that
  user's own RLS policies.
- **Rate limit:** 20 calls per 10-minute window, per user, per
  endpoint. Over limit → `429`.
- **Server error:** any unhandled failure → `500` with a generic,
  user-safe message; the real error is logged server-side, never
  returned to the client.

### `POST /api/ai-intake`

Analyzes a customer's described job (text, voice transcript, and/or
photos) into a structured work order.

**Request body:**

```json
{
  "text": "string, optional",
  "voiceTranscript": "string, optional",
  "photos": [{ "mediaType": "image/jpeg", "data": "base64 string" }],
  "priorQA": [{ "question": "string", "answer": "string" }],
  "services": [{ "id": "uuid", "category": "string", "name": "string", "blurb": "string" }],
  "locale": "nl | fr | de | en | ar | tr | ru | zh"
}
```

At least one of `text`, `voiceTranscript`, or `photos` is required
(`400` otherwise). `services` must be a non-empty array — the live
catalog is passed in by the client on every call, not assumed
server-side (`400` if missing/empty). Photos are capped server-side at
4 regardless of how many the client sends. `Content-Length` is bounded
by Vercel's platform-level body-size limit — no additional
application-level cap exists yet.

**Response body (`200`):**

```json
{
  "matchedServiceId": "uuid | null",
  "categoryId": "string | null",
  "problem": "string",
  "description": "string",
  "urgency": "low | medium | high",
  "confidence": 0,
  "estimatedDurationMinutes": { "min": 0, "max": 0 } ,
  "estimatedBudget": { "min": 0, "max": 0, "currency": "EUR" },
  "possibleCauses": ["string"],
  "recommendedMaterials": ["string"],
  "requiredSkills": ["string"],
  "structuredFields": { "...": "per-service, from src/lib/serviceQuestions.js" },
  "visionNotes": "string | null",
  "ocrText": "string | null",
  "brandDetected": "string | null",
  "followUpQuestions": [
    { "key": "string", "question": "string", "options": ["string"] }
  ]
}
```

`followUpQuestions` is only populated when `confidence` is below 85;
above that threshold it's an empty array. `matchedServiceId` is
guaranteed to either be `null` or an id that was actually present in
the request's own `services` array — see `AI_ARCHITECTURE.md`'s
guardrail note.

**Side effect:** emits a `ai_intake.analyzed` domain event
(`matchedServiceId`, `confidence`, `urgency`) on success.

### `POST /api/translate-message`

Translates a single chat message into a target locale.

**Request body:**

```json
{ "text": "string, max 2000 chars", "targetLocale": "nl | fr | de | en | ar | tr | ru | zh" }
```

`400` if `text` is missing, not a string, over 2000 characters, or if
`targetLocale` isn't one of the 10 supported locales.

**Response body (`200`):**

```json
{ "translatedText": "string" }
```

**Side effect:** emits a `message.translated` domain event
(`targetLocale`) on success.

## Error shape (both endpoints)

Every non-2xx response is `{ "error": "human-readable message" }`. No
machine-readable error codes exist yet — a client branches on HTTP
status, not on a code field.

## Planned: future endpoints

Not implemented — listed here so this document says what's coming
without letting anyone assume it already exists.

**Phase 4 — Payments** (`ROADMAP.md`): `POST /api/payments/create-intent`,
`POST /api/payments/webhook` — payment-intent creation and Stripe/Mollie
webhook handling.

**Phase 11 — Platform API** (`ROADMAP.md`): a versioned, public REST API
wrapping the same Core Platform modules used internally
(`api_clients` table for partner auth — `api_key_hash`, `scopes`,
`rate_limit_tier`; `api_request_log` for audit), with an OpenAPI spec
and webhook delivery keyed to the same domain events already flowing
internally. This is the point at which Klussie stops being an app with
internal endpoints and becomes something external systems (insurers,
real estate agencies, municipalities) integrate against directly.

**Phase 13 — AI Home** (`ROADMAP.md`): Home Profile data becomes
available through the Phase 11 Platform API once both exist.

None of the Planned endpoints have a request/response shape decided
yet — that's real design work for whichever phase actually starts them,
not something to pre-specify here.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 3)

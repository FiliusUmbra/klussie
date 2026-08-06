# Klussie — Security Posture & Threat Model

**This document owns:** what's actually protected today, what isn't yet,
and the reasoning behind each. It does not own the product-level rule
that motivates security work (`../product/PRODUCT_CONSTITUTION.md`,
Rule 5) or the code-level enforcement mechanics
(`ENGINEERING_STANDARDS.md`).

> Honest by design — this document names real gaps, not just real
> controls. A security document that only lists what's protected isn't
> a threat model, it's marketing copy.

## Model summary

Klussie's security posture rests on three real, verified mechanisms
today: **RLS-first authorization** (access control lives in Postgres
policies, not application code), **least-privilege server auth** (every
server-side Supabase client authenticates as the calling user via their
own access token — never the service-role key inside a user-facing
request path, per Constitution Rule 5), and **per-user rate limiting**
on the two AI endpoints. Nothing else in the platform has been
pen-tested or formally audited.

## Controls implemented today

**Row Level Security.** Every table has RLS enabled — verified
consistently correct across `service_requests`, `messages`, `reviews`,
`portfolio_items`, `reports`, and every other table in
`ARCHITECTURE.md`'s data model. A representative sample of the actual
policy shapes:

- `service_requests` — a customer manages only their own rows; a pro
  can only *see* a request if they offer the matching service, and if
  that service is `certified_only`, only if `pro_stats.is_certified` is
  true.
- `profile_contacts` — private by default; visible to the owner, and to
  the other party only once a real booking exists
  (`status in ('booked','completed','reviewed')`) — contact details
  aren't exposed just because two people are browsing the same
  marketplace.
- `conversations` — no insert policy exists at all; the only way a
  conversation row is created is through `handle_quote_accepted()`, a
  security-definer trigger function. A client cannot fabricate a
  conversation with someone it hasn't actually booked.
- `audit_log` / `domain_events` — zero client policies. The only write
  path into `domain_events` is the `emit_domain_event()`
  security-definer RPC, which does exactly one narrow thing and nothing
  else. `audit_log` currently has no write path at all — provisioned
  ahead of the mutations that will need it.

**Authentication.** `api/_lib/auth.js` verifies the `Authorization:
Bearer` token against Supabase on every request to `api/ai-intake.js`
and `api/translate-message.js`. There is no unauthenticated path into
either endpoint (`401` on missing/invalid/expired token) — this closed
what was, at the time of the original architecture review, a wide-open
gap (both endpoints had zero auth check).

**Rate limiting.** `api/_lib/rateLimit.js` — 20 calls per 10-minute
window, per user, per endpoint, backed by a real Postgres table
(`ai_usage_log`) rather than an external service. Stops a single
authenticated user from scripting a burst against the AI Gateway; does
**not** stop a burst of *new* signups each making a smaller number of
calls (see Gaps, below).

**Secrets.** `ANTHROPIC_API_KEY` and the Supabase service-role key (where
used at all) live in server-side environment variables only — never
shipped to the client bundle. `api/_lib/auth.js`'s own comment states
the constraint plainly: the returned Supabase client is authenticated as
the calling user, so it's subject to that user's RLS even when running
server-side.

**Structured AI output.** Not a security control by original intent, but
worth naming: `reason()`'s tool-forcing pattern
(`AI_ARCHITECTURE.md`) means the AI Gateway cannot return arbitrary
free-form text to a caller — only the exact JSON shape a `toolSchema`
describes. This meaningfully narrows (without eliminating) the blast
radius of a prompt-injection attempt, since the output is always
validated against a schema before anything downstream trusts it.

## Threat model by category

| Category | Real risk today | Current mitigation | Status |
|---|---|---|---|
| Unauthenticated AI abuse | A caller with no account running up Anthropic API costs | JWT verification on both AI endpoints | Closed |
| Scripted burst / cost abuse | An authenticated user (or many fake accounts) running excessive AI calls | Per-user, per-endpoint rate limiting (20/10min) | Partially closed — no defense against many *distinct* accounts, no CAPTCHA/bot detection on signup |
| Data exposure across users | One user reading another's private data (contact info, private messages, draft requests) | RLS policies, verified per-table | Strong — the platform's best-covered area |
| Prompt injection | Text or image content instructing the model to behave outside its intended task | Tool-forced structured output constrains the *shape* of a response; the guardrail rejecting hallucinated `matchedServiceId` values constrains one specific field | Partial — no dedicated prompt-injection testing has been done; a sufficiently crafted input could still influence free-text fields (`description`, `possibleCauses`) within the allowed schema |
| Dependency vulnerabilities | Known CVEs in `npm` dependencies | Two known CVEs (`brace-expansion`, `postcss`) were found and patched during a manual audit | No automated scanning in CI yet — a new CVE in an existing dependency wouldn't be caught until the next manual audit |
| Content moderation | Abusive, fraudulent, or unsafe content in requests, messages, or reports | A `reports` table exists (migration `0004`) for users to flag a business | No moderation workflow processes what gets reported yet (`ROADMAP.md` Phase 6) |
| Session handling | Token theft, session fixation | Standard Supabase Auth session handling; no custom session logic exists that could introduce its own bugs | Inherits Supabase's own security posture; not independently audited |
| Infrastructure / secrets | Service-role key or API keys leaking | Never present in client bundle; server-side env vars only | Implemented, not independently verified by a third party |

## Known gaps (stated plainly, not softened)

- **No penetration test has ever been run** against this platform, by
  anyone, at any point.
- **No bot/CAPTCHA defense** on signup or on the AI endpoints — only
  rate limiting, which only helps once an account already exists.
- **No automated dependency-vulnerability scanning** in CI — the two
  patched CVEs were found by a manual `npm audit` during an architecture
  review, not by a running process.
- **No moderation workflow** — reports go in, nothing structured comes
  out yet.
- **No incident-response plan or rehearsed disaster-recovery drill**
  exists yet — this is explicitly `ROADMAP.md` Phase 3's job, sequenced
  deliberately before Phase 4 (real payments) makes the cost of getting
  this wrong much higher.
- **No formal vulnerability-disclosure process.** If a security issue is
  found today, there's no dedicated `security@` contact or disclosure
  policy — report directly to the founder. This gap should close before
  any Phase 11 (Platform API) partner integration goes live, since
  external partners will reasonably expect one.
- **RLS coverage has not been independently verified** — "verified
  consistently correct" above means checked against the intended
  behavior during development and architecture review, not tested by
  an external auditor or a fuzzing harness.

## What changes this

`ROADMAP.md` Phase 1 already closed the two most urgent items (open AI
endpoints, no rate limiting). Phase 2 (testing/CI) is the prerequisite
for automated dependency scanning becoming real rather than manual.
Phase 3 (disaster recovery) is the prerequisite for an actual
incident-response plan. Phase 6 (trust & safety) is where the reports
table gets a real moderation workflow behind it. None of these are this
document's job to build — this document's job is to keep saying clearly
what's true until they do.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 3)

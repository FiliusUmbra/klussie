# Beta Readiness Report — 2026-08-28

**This document owns:** the founder's own 2026-08-28 mandate's final
deliverable — priority #10, "produce the final beta-readiness report."
It is a point-in-time assessment, not a plan — `PLATFORM_ACTIVATION_PROGRAMME.md`
§8 remains the one live checklist; this document is its sign-off,
matching `AUDIT_PRE_LAUNCH_2026-08-19.md`'s own precedent (a dated
report, not a competing roadmap).

**Scope.** Everything the 2026-08-28 mandate's ten priorities cover,
assessed against the mandate's own "Definition of beta-ready" section —
not a fresh audit of the whole platform (`AUDIT_PRE_LAUNCH_2026-08-19.md`
and the Platform Activation Programme's own Slice 0–5 history already
did that). This report answers one question: *is Klussie ready for a
**controlled** beta* — a small, founder-managed group of real customers
and professionals, not a public launch.

---

## Verdict

**Ready for a controlled beta**, with two accepted, named limitations
that a *controlled* beta's own small, founder-managed size can work
around without blocking the start — both require your own external
account setup, not more engineering, and both are explained under
§2 below with a concrete mitigation for starting anyway.

**Not ready for a public/self-serve launch** — the same two limitations
(§2) would be real, user-facing failures at any real volume, and
production has not been touched at all this pass (by design — the
mandate's own non-negotiable safeguard). Production's own migration
state relative to staging's 187 was not checked this session and should
be the first action of whatever session runs the actual cutover.

This verdict rests on real, live verification against staging
(`mxcuxnvjfnktwjcmkqqk`) — not on the automated suite passing alone,
per the mandate's own explicit instruction not to conflate the two.

---

## 1 · The mandate's own "Definition of beta-ready," addressed item by item

| Requirement | Status | Evidence |
|---|---|---|
| All critical customer and professional journeys work end to end | **Met** | Live-verified, both real accounts, real UI, not mocked: create request (manual-fallback path) → pro quotes it → customer accepts → disclosure-consent approval → booked → mark complete → review → pro authors Service Record → customer reads it back and approves it → messaging in both directions → document upload (real file to Storage) → pro sees approximate location while quoting. Not exercised live: voice capture (needs a real microphone, not practical under this automation) |
| Staging uses the intended schema and application version | **Met** | `supabase migration list --linked` — all 187 local migrations match remote exactly, zero drift, checked directly against staging today |
| RLS separation and anonymous denial are verified | **Partially met, scoped honestly** | This pass's own new write surface (property address, disclosure approval, pro location bridge) spot-checked live using each test account's own real auth token: cross-tenant write refused (403, `insufficient_privilege`), list reads correctly isolated per caller, direct schema access structurally blocked (`property`/`work` aren't PostgREST-exposed schemas at all). Slice 5's own older RLS surfaces were not re-audited this pass — no code in those areas changed |
| Exact-location privacy is enforced by the server/database | **Met** | The entire mandatory disclosure-consent flow (migrations 0182–0187) is enforced by a real trigger (`work.engagements_guard_disclosure_before_active()`), not client-side convention — an engagement cannot reach `active` without a matching, unrevoked `work.location_disclosures` row, checked at the database level regardless of which code path tries to write it. `api.matching_requests_for_pro()`'s own select list never includes street/postcode/coordinates, and the base `property.properties` row is unreachable to a quoting-but-not-yet-approved workspace by RLS, independent of what any client happens to request |
| Configured authentication methods are tested honestly | **Met, and one real gap found doing so** | Email/password — the only actually-configured provider — used dozens of times this session, works correctly, including the manual-fallback request-creation path built specifically because the AI Gateway is blocked on preview deployments. The four OAuth buttons are real (they hit Supabase's live `/auth/v1/authorize` and return an honest "provider not enabled" error) but genuinely unconfigured — `AUTH_PROVIDER_SETUP.md`'s own long-standing, already-known finding, not new. **New finding, this session**: attempting a genuinely fresh signup (not one of the seeded test accounts, which bypass Supabase's own signup path entirely) hit `"email rate limit exceeded"` on the third attempt — no SMTP provider is configured, so Supabase's own built-in signup-email service, not meant for real volume, is the only thing sending confirmation emails. See §2 |
| Uploads and access controls work | **Met** | A real document (property warranty) uploaded through the real UI to Supabase Storage, with a real `property.documents` row created via `api.create_document()`. Found and fixed a real bug in the process (§3) |
| No known critical or high-severity defect remains | **Met** | Five real, previously-undiscovered defects found by exercising the live app were all fixed and live-verified this pass — see §3. None currently open |
| Mobile layouts are usable | **Met** | Every screen touched or built this pass was tested at the mobile viewport (375×812), the platform's own primary target |
| Accessibility fundamentals are covered | **Met, honestly scoped** | `docs/design/ACCESSIBILITY.md`'s own long-standing "Touch targets" finding (four named controls plus the app-wide `.chip` primitive) is now fully closed or honestly documented as structurally unfixable — see §4. Broader WCAG-level fundamentals (contrast, keyboard nav, RTL) were audited in an earlier session and not re-run this pass, since no code in those areas changed |
| Supported locales do not contain broken critical flows | **Met** | All 10 locales carry the new strings this pass added (`appStrings.test.js`'s own parity check enforces this in CI); a real localization bug was found and fixed in the process (§3) |
| Loading, empty and failure states are usable | **Met** | `ServiceLocationField`'s own loading state, the AI-failure → manual-fallback path (previously a genuine dead end — §3), and every existing empty/error state exercised along the way all render correctly |
| Monitoring and diagnostic logging are sufficient without leaking sensitive information | **Not assessed this pass** | Outside this mandate's own ten priorities; no logging/monitoring infrastructure was touched or reviewed |
| The automated suite and staging smoke tests pass | **Met** | 2433 tests, 236 files, all passing; lint/typecheck/build all clean, confirmed immediately before every one of the 10 PRs merged today |
| Remaining limitations are documented and acceptable for a controlled beta | **Met** | This report, §2 |

---

## 2 · The two accepted limitations — both external, both named honestly

Neither of these is code work. Both require an external account under
your (or Klussie's) name, the same category of gap `AUTH_PROVIDER_SETUP.md`
already documented for the four OAuth providers before this session.

### 2.1 · No SMTP provider configured (new finding, this session)

Supabase's own built-in signup-email service is not meant to carry real
signup volume and rate-limits quickly — confirmed live, `"email rate
limit exceeded"` on the third fresh-signup attempt in a few minutes.

**Mitigation for starting a controlled beta anyway:** since this is a
*founder-managed* beta, not self-serve, accounts for the first cohort
can be provisioned the same way `customer@staging.klussie.test`/
`pro@staging.klussie.test` were — a direct account creation, bypassing
the rate-limited email path entirely. This does not scale past a small
group, which is exactly the size a controlled beta is.

**Real fix, when ready to scale:** register a transactional-email
provider (Resend, Postmark, SendGrid) and configure it under Supabase
Dashboard → Authentication → Email → SMTP Settings. See
`AUTH_PROVIDER_SETUP.md`'s own new section for the full writeup.

### 2.2 · OAuth providers unconfigured (already known, not new)

Google/Apple/Microsoft/Facebook sign-in buttons are real but return an
honest "provider not enabled" error. Already fully documented, with a
realistic setup sequence, in `AUTH_PROVIDER_SETUP.md` — unaffected by
this pass, named here only so this report is a complete picture.

**Mitigation:** email/password is fully functional and is what every
test account this session used. A controlled beta does not need OAuth
to start.

---

## 3 · Real defects found and fixed this pass

All five were found by exercising the live application against staging,
not by static review — the same discipline this codebase's own
documented history (`MASTER_CONTEXT.md` §4, the Slice 1–5 completion
records) has repeatedly shown static tests cannot catch on their own.

| # | Defect | Found while | Fixed in |
|---|---|---|---|
| 1 | `api.my_properties()` never returned the address columns 0182 added, and no write path existed for them at all | Wiring the service-location picker | PR #112 (migration 0185) |
| 2 | A column default on `service_requests.directed_until`, unconditional since migration 0014, broke *every ordinary* (non-directed) request insert — undetected because nothing had ever exercised `createServiceRequest()` live before this session (AI Gateway blocked, and the one other client trigger has been dead code since a prior redesign) | The very first live request-creation attempt this pass | PR #112 (migration 0186) |
| 3 | A customer review permanently hid the pro's own "write it up" Service Record entry point — `work.engagements` has no `'reviewed'` status at all, but the client's own gate checked the *request's* status, which keeps advancing after a review | Closing the create→review loop live | PR #115 |
| 4 | Every document uploaded through the real UI showed the raw, untranslated type key ("warranty") instead of a real localized label, in every locale, always — `DocumentUploadSheet.jsx` has no caption field, so the fallback path is the only path | Completing a real document upload live | PR #119 |
| 5 | `AiIntakeSheet`'s own documented C8 promise ("AI failure degrades to the manual form, no dead end") was never actually built — a failed analysis was a genuine dead end, and it is currently the *only* reachable way to create a request on staging at all, given the AI Gateway gap and `ServiceSheet`'s own separately-dead trigger | Discovering the AI Gateway is blocked | PR #112 |

---

## 4 · Accessibility — touch targets closed

`ACCESSIBILITY.md`'s own long-standing "Touch targets" section named
four icon-only controls below the 44×44px platform-HIG minimum and
explicitly deferred fixing them, calling it "a real design decision per
control, not a one-line change." Closed this pass, PRs #120/#121:

- **`.sheet-close` / `.modal-close`** — hit-slop (an invisible
  pseudo-element expanding only the tap zone, never the visible icon),
  live-verified with a real hit-test at a point outside the visible
  circle.
- **`.photo-remove-btn`** — a smaller, deliberately partial 28px fix;
  its parent clips overflow, and the full 44px would turn roughly a
  third of a small photo thumbnail into an invisible "remove this
  photo" zone.
- **`.chat-input-row button`** (message send) — tried hit-slop, verified
  live it **cannot** work: this button sits inside a `Drawer`'s own
  `overflow-y:auto` scroll container, and the CSS Overflow spec forces
  the other axis to compute as non-`visible` too, no matter what's
  declared. Confirmed against the real computed style, not just
  reasoned about. Named honestly as unfixed rather than left as
  non-functional CSS. A real fix exists (restructure `Drawer`) but is a
  bigger, separate change.
- **`.chip`** (every service/when/where/category picker in the app) —
  the same hit-slop attempt, verified live it also can't work (same
  underlying CSS constraint, this time via `.chiprow`'s own
  `overflow-x:auto`). Fixed with a real box-size increase to exactly
  44px, checked against the highest chip-density screen in the app
  (the pro's own six-category services picker) before shipping — no
  regression.

---

## 5 · What was deliberately not built this pass, named rather than silently dropped

- **Engagement access instructions** (`work.set_engagement_access_notes()`)
  — real backend, no client screen. Nothing currently needs it before a
  booking is active.
- **`ServiceSheet.jsx`/`QuoteFormSheet.jsx`/`Discover.jsx`** — a
  pre-existing, already-documented orphaned screen from before this
  session (`EXPERIENCE_VISION.md` §10's own open question about where
  the category-browse UI belongs); flagged clearly (PR #114) rather
  than silently left, not removed since no replacement home is agreed.
- **`.chat-input-row button`'s own 44px touch target** — see §4; a real,
  structural `Drawer` change, not a touch-target tweak.
- **Real device/native file-dialog upload testing** — this session's
  browser tooling has no native file-dialog interaction; the document
  upload was verified via a synthetically-constructed `File` object
  through the real save path (Storage + `api.create_document()`), which
  exercises the same code a real file picker would, but a literal
  native-dialog interaction was not attempted.
- **Voice capture** — needs a real microphone; not practical to verify
  under this automation.

---

## 6 · Evidence

- **10 PRs merged this pass** (#112–#121), all squash-merged to `main`,
  all CI-green (lint/typecheck/test/build) before merge, all live-
  verified against staging before opening.
- **2433 tests, 236 files, all passing** as of `main`'s current tip
  (`8b2ae4c`).
- **187 migrations, staging and `main` in exact agreement** — confirmed
  directly via `supabase migration list --linked` today, not assumed.
- **Production untouched** — no `supabase link` to production at any
  point, no Vercel production deploy or config change, per the
  founder mandate's own non-negotiable safeguards. Production's own
  migration count relative to staging's 187 is unknown to this session
  and should be the first check of whatever session runs the real
  cutover.

---

## 7 · Recommendation

Start the controlled beta on staging (or a fresh production
environment prepared through the — currently paused — production-reset
track, once that track is resumed) with founder-provisioned accounts for
the first cohort, avoiding §2.1's rate limit entirely at this scale.
Revisit §2 (SMTP, OAuth) before any wider or self-serve rollout. The
production-reset runbook itself remains paused, as instructed, and this
report does not reopen it — that stays a separate, later decision.

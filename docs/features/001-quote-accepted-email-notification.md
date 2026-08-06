# FB-001: Quote-Accepted Email Notification

> **Note:** this brief is the worked example referenced from
> `README.md` and `TEMPLATE.md` — it demonstrates the format against a
> real, plausible slice of `../architecture/ROADMAP.md` Phase 8, and is
> genuinely usable as a starting point when that phase begins. It is
> not a commitment to build this exact slice first within Phase 8.

**Status:** Proposed
**Author:** (Foundation Freeze, Phase 5 — illustrative)
**Date:** 2026-08-06
**Roadmap phase:** `../architecture/ROADMAP.md` Phase 8, Engagement &
Notifications — one narrow slice of it, not the whole phase.

## Summary

Email a pro when a customer accepts their quote, so they find out
without having the app open.

## Problem

Today, a pro only learns their quote was accepted by opening the app.
This is already a named, real gap — cited directly in
`../architecture/ROADMAP.md`'s UX-friction findings ("No notification
outside an open tab — the single biggest gap against the 'professional
response time < 5 min' KPI") and again in `../MASTER_CONTEXT.md` §13
("No notifications outside an open tab — drop-off risk between AI
intake and a pro's response"). A pro who doesn't check back promptly
risks the booking stalling before the job even starts — the customer
is left waiting on someone who doesn't yet know they've been booked.

## Principle(s) served

- **Trust** — a pro who's told promptly when they've been booked can
  act promptly; a customer left wondering whether their booking
  "went through" is a trust failure, even though the data is correct.
- **Retention** — a pro who repeatedly misses bookings because they
  didn't see the acceptance in time has a real reason to stop trusting
  the platform to bring them work reliably.

## KPI(s) moved

- **Average booking completion** (primary for this slice) — the
  mechanism is direct: a pro who's notified immediately is more likely
  to follow through on a booking than one who finds out hours later,
  possibly after the customer has given up and gone elsewhere.
- **Professional retention** (secondary) — a pro who consistently
  learns about bookings promptly has one fewer reason to disengage from
  the platform.

*(Phase 8's own stated primary KPI, professional response time, is more
directly served by a different slice — notifying a pro of a **new
matching request**, not an accepted quote. That's a separate, later
feature brief; conflating the two here would make this brief's KPI
claim less honest, not more complete.)*

## Not doing

- Push notifications or SMS — email only, this slice.
- Notifying the *customer* of anything — this brief is pro-facing only.
- A digest/batching model — one email per acceptance, sent immediately.
- Notification preferences UI — this slice ships with email
  unconditionally on; preference controls (`notification_preferences`,
  per `../architecture/ROADMAP.md` Phase 8) are a separate, larger
  piece of the same phase.
- Notifying a pro about a new *matching request* (a different, real
  gap, more directly tied to Phase 8's stated primary KPI) — worth its
  own brief.

## Design

No new Design System component — this is an email, not an in-app
surface. Copy needs drafting against `../design/COPY_GUIDELINES.md`'s
voice (warm, human, specific — not a generic transactional-email
template): subject line should name the customer and the job, not read
as a system notification ("Cathy just booked you for the kitchen sink
repair," not "Your quote status has changed").

## Data model

No new tables needed for this slice specifically (the fuller
`notification_preferences` table belongs to the larger Phase 8 effort,
not this narrow slice). No RLS changes — this is a server-triggered
side effect, not a client-readable resource.

## Backend / API

This is the first thing to actually wire the `QuoteAccepted` event —
today only `ai_intake.analyzed` and `message.translated` are emitted
(`../architecture/ARCHITECTURE.md`, Domain Events). New migration:
extend `handle_quote_accepted()` (`supabase/migrations/0001_init.sql`)
to call `emit_domain_event('QuoteAccepted', jsonb_build_object(...))`
alongside its existing work, inside the same transaction. New: a small
serverless function or Supabase Edge Function subscribed to that event,
calling Resend or Postmark (per `../architecture/ROADMAP.md` Phase 8's
stated provider choice — not yet decided between the two, see Open
Questions) to send the email.

**Core Platform layer:** starts Notifications (`Planned` today per
`../architecture/ARCHITECTURE.md`'s Core Platform layer status table)
— this is the first real usage of that layer, not a full
implementation of it.

## AI

None. No AI Gateway call is involved in this slice.

## Feature flag

`notify_pro_quote_accepted` — `enabled_globally: false` at launch,
rolled out via `rollout_percentage` to a small cohort first so email
deliverability and copy can be checked against real sends before every
pro gets it.

## Testing requirements

- A test that `handle_quote_accepted()` reliably calls
  `emit_domain_event('QuoteAccepted', ...)` on every accepted quote,
  not just some.
- A deliverability check against a real test inbox (SPF/DKIM
  configured correctly is a named risk in `../architecture/ROADMAP.md`
  Phase 8) before wider rollout.
- Confirm no duplicate email sends if the event fires more than once
  for the same acceptance (idempotency).

## Rollout

Development → Internal (send to test accounts only) → Beta (small real
cohort via the feature flag's rollout percentage) → Production.

## Risks

Sender-reputation risk if SPF/DKIM aren't configured correctly before
this ships — the same named risk `../architecture/ROADMAP.md` Phase 8
already flags for the phase as a whole. Email fatigue risk is low for
this specific slice (one email per actual booking, not a recurring
digest), but worth revisiting once more Phase 8 notification types
exist alongside this one.

## Open questions

- Resend vs. Postmark — `../architecture/ROADMAP.md` names both as
  options for Phase 8 without deciding between them; this brief doesn't
  resolve that either.
- Should this email include a direct "get directions" / "message the
  customer" action, or just the acceptance fact? Affects scope and
  Design's copy work meaningfully enough to need an answer before
  `Approved`.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 5)

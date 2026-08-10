# ADR-0012: One-Tap Booking Commits the Customer, Not the Professional

**Status:** Proposed (decided; WP9 implements it — no code exists yet)
**Date:** 2026-08-10
**Related:** `../product/EXPERIENCE_VISION.md` §3, §4, §7,
`../product/HOMEPAGE_DIRECTION.md`,
`../product/PRODUCT_CONSTITUTION.md` Rules 9 and 10,
`../architecture/EPIC_03_CONVERSATION_EXPERIENCE_PLAN.md` WP9 and open
question 3, `../../supabase/migrations/0001_init.sql`
(`handle_quote_accepted()`), `0004-domain-events-via-security-definer-rpc.md`,
`0011-trust-strip-shows-only-verified-signals.md`

## Context

`EXPERIENCE_VISION.md` §3 ends the journey at **"Books — One button. A
warm confirmation, not a transactional receipt. → Relieved,"** and §4
names **Booking** ("one button, no second-guessing") and **Relief** as
the last two of the six states. Epic 03's WP1–WP8 and WP10–WP12 are
built; WP9 is the only package left, and it has been blocked since
planning on what that button actually does to the data model.

Today `service_requests.status` reaches `'booked'` through exactly one
path: a `quotes` row transitions `sent → accepted`, and
`handle_quote_accepted()` sets `status = 'booked'` plus
`booked_pro_id`, declines the sibling quotes, and opens the
conversation. There is no other writer of that status anywhere in the
schema.

Three facts make the obvious implementation impossible to do honestly,
and they are the reason this needs a decision rather than a coding
session:

1. **`quotes.price` is `not null`.** A quote cannot exist without a
   price. Any flow that manufactures a quote on the professional's
   behalf must therefore also manufacture their price.
2. **The canvas has no price to use.** WP8 deliberately renders the AI's
   `estimatedBudget` as a *range*, labelled as an estimate, because no
   quote exists at that point in the flow — presenting a range as a
   firm price is the shortcut Rule 9 exists to rule out, and the
   component says so in a comment.
3. **A professional's consent today is the act of quoting.** Nobody is
   committed to a job until they have seen it and named their own
   price. `pro_matches_request()` governs who may *see* a request; the
   quote is how they opt in.

The real alternatives:

**Option A — Instant book.** One tap writes request + quote +
acceptance in a single action, reaching `'booked'` through the existing
machinery with no schema change. It is the only option that satisfies
the approved copy literally. It also requires the platform to write a
financial commitment into a named professional's mouth, priced from an
AI estimate they never saw, and to fire `QuoteSubmitted` for a quote no
professional submitted — corrupting the event stream Epic 01 wired
honestly (ADR-0004). It converts the marketplace from opt-in work to
assigned work, which is a change to the professional's relationship
with the platform, not a UI detail.

**Option B — Route into the existing quote flow.** Booking creates an
ordinary request and waits for quotes. Entirely honest, entirely
already built, and it deletes the approved experience: "Books →
Relieved" becomes "Sent → wait," and the Relief state has nothing to
show. The epic's ground rules forbid redesigning an approved
experience, and this is that.

Neither is acceptable as stated, which is what kept the question open.

## Decision

**One tap is a real, binding commitment — from the customer, to one
named professional. It is not a claim that the professional has
agreed.** The professional's own acceptance is still what books the
job, and their own price is still the only price that ever exists.

Concretely, WP9 builds:

- A **directed request**: one tap creates a `service_requests` row
  carrying the matched professional's id and a status meaning *awaiting
  that professional*, visible to them and to nobody else. No `quotes`
  row is written by the customer, ever.
- A **pre-authorization ceiling** captured from the same tap: the
  customer has already seen the estimate range and accepted it, so
  their consent is stored as a maximum. When the professional responds
  with a price at or below it, acceptance is automatic — the request
  reaches `'booked'` through `handle_quote_accepted()`, unchanged, with
  every existing trigger and domain event firing for real reasons. Only
  a price *above* the ceiling comes back to the customer.

The customer taps once and is done, which is what §3 promises. The
professional is never committed without consent, and the platform never
invents their price.

**What Relief may say.** The Relief state may confirm that the request
is placed and that this professional has it — not that the job is
confirmed or when anyone arrives. WP9's illustrative copy in the
execution plan, "Book Peter — arrives today," may **not** ship as
written: no one has committed to today.

## Consequences

- **WP9 is unblocked**, with schema work it was planned not to need.
  Its own brief says "no schema change is expected, but that depends on
  the answer to open question 3" — this is that dependency resolving
  the other way. A new migration adds the directed-professional
  reference, the new status to the `service_requests` check constraint,
  and the consent ceiling.
- **The Relief state is real relief from *choosing*, not from
  *waiting*.** This is the honest reading of §3, where the stated payoff
  is "One match, not a list… No comparing required." It is a narrower
  promise than the prototype's copy implies, and that narrowing is the
  accepted cost — the same trade ADR-0011 made for the trust strip:
  fewer claims that are all true beats more claims where one isn't.
- **`HOMEPAGE_DIRECTION.md` is not rewritten.** As with ADR-0011, the
  approved prototype stays the historical record of what was approved,
  with a pointer to this ADR so a future reader doesn't restore
  "arrives today" thinking it was dropped by accident.
- **A new failure mode exists and must be designed, not ignored: the
  professional who never responds.** A directed request has one
  recipient, so an unanswered one is a dead end where the old
  many-quotes flow would have degraded gracefully. WP9 must define what
  happens on timeout — fall back to open quoting is the obvious
  candidate, but it is a real decision and is explicitly *not* made
  here.
- **`ProfessionalDispatched` finally has a real transition to hang on.**
  Epic 01 left it unwired because no state change corresponded to it
  (see `0012_domain_event_wiring.sql`'s header). A professional
  accepting a directed request is a genuine candidate; wiring it is a
  follow-up, not part of WP9.
- **This rules out assigned work as a growth lever**, permanently and on
  purpose. If a future proposal argues for auto-assigning jobs to raise
  conversion, this ADR is the reason it does not simply get built:
  Rule 9 puts the professional's consent above the funnel.
- **No money moves, so the customer's commitment has no teeth yet.**
  Payments are Epic 04 (`EXECUTION_ROADMAP.md`), gated behind ADR-0005.
  Until then the ceiling is a consent record, not a hold on funds, and
  a customer can still abandon a directed request at no cost. Naming it
  rather than pretending otherwise: deposits and cancellation terms
  belong to Epic 04, and this decision is compatible with adding them.
- **Two-sided liquidity gets harder before it gets easier.** Directing a
  request at one professional removes the competitive pressure of
  several pros quoting, which is what the marketplace has relied on for
  price discovery. `EXECUTION_ROADMAP.md` Epic 09's real ranking work is
  what makes a single directed match trustworthy at scale; until then
  the match quality is WP8's deliberately simple trust-score sort, and
  that limit is now load-bearing in a way it was not before.

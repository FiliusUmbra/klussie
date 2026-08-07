# ADR-0011: The Trust Strip Shows Only Signals Backed by Real Data

**Status:** Implemented (decision made; WP7 implements it)
**Date:** 2026-08-06
**Related:** `../product/HOMEPAGE_DIRECTION.md`,
`../product/EXPERIENCE_VISION.md` §8 (Trust Framework),
`../product/PRODUCT_CONSTITUTION.md` Rule 9,
`../architecture/EPIC_03_CONVERSATION_EXPERIENCE_PLAN.md` WP7

## Context

Two approved documents disagreed about the trust strip's contents, and
the conflict only surfaced when Epic 03's execution plan tried to turn
them into buildable work.

`HOMEPAGE_DIRECTION.md`'s approved prototype renders the strip as
"Verified pros · Insured work · 4.9★ average." But
`EXPERIENCE_VISION.md` §8's Trust Framework — approved in the same
review cycle — explicitly marks two of those signals as unbacked:
**Insured work** ("No real insurance-verification data exists yet …
needs its own workstream, not implied by copy alone") and **Fast
response** ("No tracked response-time metric confirmed yet"). It states
the rule plainly: "The framework doesn't get to claim them on screen
until they are."

`PRODUCT_CONSTITUTION.md` Rule 9 (trust beats growth) names this exact
failure mode: "a certification badge with no evidence behind it —
these are the kind of shortcuts this rule exists to rule out."

So the prototype's literal copy and the framework governing it
contradicted each other. Two real options: ship the aspirational copy
as designed and backfill the verification workstream later, or ship
only what's currently evidenced and accept a shorter strip.

## Decision

The trust strip displays **only signals backed by real data at render
time**. "Insured work" does not ship until real insurance-verification
data exists behind it. Same standard applies to any future signal added
to the strip.

Real today, per `EXPERIENCE_VISION.md` §8 and verified against the
schema: verified-professional status (`pro_stats.is_certified`, badge
tiers), the computed trust score and real review ratings, real
portfolio photos and testimonials, and plainly-shown quote pricing.

## Consequences

- WP7 (`EPIC_03_CONVERSATION_EXPERIENCE_PLAN.md`) is unblocked, with a
  narrower, honest scope: build the strip from the real set above.
- `HOMEPAGE_DIRECTION.md`'s prototype copy is **not** rewritten — it
  stays as the historical record of what was approved, with a pointer
  to this ADR added so a future reader doesn't restore "Insured work"
  thinking it was dropped by accident.
- A shorter strip is an accepted cost. Rule 9 makes this trade
  explicitly: fewer claims that are all true beats more claims where
  one isn't.
- **Unresolved sub-question, flagged rather than assumed:** a rating
  aggregate is "real" but thin when the database holds very few
  reviews. Showing "4.9★ average" computed from a handful of ratings is
  technically true and arguably still misleading. WP7 should decide a
  minimum-data threshold below which the rating signal is withheld
  rather than shown — the same reasoning `ROADMAP.md` Phase 10 already
  applies to marketplace signals ("needs a minimum-data threshold
  gating when any signal surfaces").
- When insurance verification does get built, it belongs to Trust &
  Safety (`EXECUTION_ROADMAP.md` Epic 06) — adding the signal to the
  strip is then a small follow-up, not a redesign.

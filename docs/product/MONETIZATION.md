# Klussie — Monetization

**This document owns:** the revenue model — what Klussie charges for,
who pays, and how each stream is sequenced. It does not own the
technical implementation of payments (`ROADMAP.md` Phase 4), the KPIs
revenue features are checked against (`../MASTER_CONTEXT.md` §14), or
the product principles that constrain how revenue features may be built
(`PRODUCT_CONSTITUTION.md`).

## Current state: zero real revenue

Klussie has no way to collect money today. This is the single
most-repeated finding across every architecture review of this
codebase, and it stays true until `ROADMAP.md` Phase 4 ships:

- The 12% commission figure exists only as a display-only constant on a
  demo invoice — no charge is ever actually made.
- "Boost" (paid placement for a pro) is UI-only; tapping it does not
  charge anyone.
- No `payments` table, no Stripe/Mollie integration, no payout mechanism
  for professionals exists in the schema or the codebase.

This isn't an oversight — it's a deliberate sequencing decision. Per
`ROADMAP.md`'s ADR-005 (recorded in `../MASTER_CONTEXT.md` §15),
Testing/CI and Disaster Recovery were moved ahead of Payments in the
roadmap specifically because once real money moves, every later change
becomes higher-risk — the safety net had to exist first.

## Revenue streams, planned

Sequenced by which roadmap phase introduces each:

### 1. Commission (Phase 4 — primary, first)

A percentage of each booking's value, taken at the point a quote is
accepted and paid. The real schema shape (`ROADMAP.md` Phase 4): a
`payments` table with `amount`, `platform_fee`, `payout_status`,
`provider_ref`, and a `revenue_stream` column — built to support more
than one stream from day one rather than assuming commission is the
only kind of charge that will ever exist. Ships behind a `STRIPE`
feature flag, through the Beta release stage before full Production
rollout (`ROADMAP.md` Phase 2's release pipeline).

### 2. Boosted placement (Phase 4, made real)

Already exists as a UI concept (`boosted_until` on `pro_profiles`); Phase
4 is what turns tapping "Boost" into an actual charge instead of a
no-op. Constrained by Constitution Rule 9 (**trust beats growth**): a
paid-boost feature must never misrepresent a boosted pro as more
qualified or better-reviewed than an unboosted one — it buys visibility,
not a fake trust signal.

### 3. Professional subscription tier (Phase 10)

Not yet designed in detail. Named directly in `ROADMAP.md` Phase 10
(Intelligence Platform) as something business-intelligence features for
pros could plausibly be sold behind, once that phase's analytics
surface exists to have something worth subscribing to.

### 4. Platform API licensing (Phase 11)

Per-partner API access (`api_clients` table — `rate_limit_tier` implies
tiered/paid access levels) once external systems — insurers, real
estate agencies, municipalities — can integrate directly. Revenue model
for this tier (flat fee, usage-based, or both) is not yet decided; it's
real design work that belongs to Phase 11, not this document.

### 5. White-label licensing (Phase 12)

Full multi-tenant deployments ("City of Brussels, powered by klussie")
— `tenants.billing_plan` in the Phase 12 schema implies this is sold as
software, not booked as jobs. The highest-complexity, highest-risk
revenue stream in the roadmap; not built until Phase 12's tenant
isolation is proven safe (see `../engineering/SECURITY.md`'s note on
why multi-tenancy is sequenced late).

## What doesn't get built, and why

Consistent with `PRODUCT_CONSTITUTION.md`'s Design Constitution
("Klussie wins through trust, not novelty") and Rule 9 (trust beats
growth):

- **No tiered or volume-based commission exists yet** — no lever to
  reward high-volume pros with a lower rate. A real gap, not a design
  choice; worth revisiting once real transaction volume exists to
  design against.
- **No fake urgency or scarcity mechanics** ("only 2 spots left,"
  countdown timers on quotes) — these are exactly the kind of shortcut
  Rule 9 exists to rule out, regardless of whether they'd convert
  better.
- **No revenue feature ships without a KPI it's expected to move**
  (Rule 10) — commission moves *average booking completion*; boost is
  expected to move *professional retention* by giving pros a lever they
  control; neither ships, or stays shipped, if it doesn't.
- **No payment data is ever handled by application code directly** —
  Stripe/Mollie's own hosted/tokenized flows are the intended
  integration shape (`../engineering/SECURITY.md`), not a
  custom card-collection form.

## Honest summary

Every number in this document that looks like a business model is a
plan, not a result. Zero euros have moved through Klussie as of this
writing. The roadmap's own sequencing — foundation, then testing, then
disaster recovery, *then* payments — is the monetization strategy's
first and most important decision: don't touch real money until the
platform can be trusted not to lose it.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 3)

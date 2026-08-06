# Klussie — Execution Roadmap: 10 Epics

**This document owns:** the epic-level sequence that bridges completed
documentation to real implementation work — what to build, in what
order, and why. It does not own phase-level technical detail (each
epic below maps to specific phases in `architecture/ROADMAP.md`, which
remains the technical source of truth) or individual feature scoping
(`features/`, used once an epic is broken into shippable slices).

> This is the closing deliverable of the Foundation Freeze initiative
> (Phase 9 of 9). Foundation Freeze built and audited the documentation
> that now permanently remembers Klussie, independent of any single
> conversation. This document is where that documentation stops being
> read and starts being executed against.

## How to read this

Ten epics, each large enough to be a real body of work, small enough to
have a clear finish line. Every epic maps to one or more
`architecture/ROADMAP.md` phases — this document doesn't re-derive
technical scope, it sequences and names what's already scoped there,
plus one epic (03) that exists *outside* `ROADMAP.md`'s original 13
phases because it was designed and approved after that roadmap was
written.

**Status is honest, not aspirational:** every epic below is `Not
started` except where explicitly noted otherwise. This document does
not claim progress that hasn't happened.

## Dependency sequence

```
01 Foundation Completion ──┬─→ 04 Monetization Launch
                            │      (ADR-0005: money doesn't move until
                            │       01 + 02 are both real)
02 Operational Resilience ─┘
03 Conversational Homepage ───→ (independent — design is done, ADR-0007/0008
                                  approved; only depends on 01's Core
                                  Platform groundwork being stable)
05 Marketplace Engine ─────────→ 09 AI Engine v2 & Intelligence Platform
                                  (matching quality depends on a real
                                   configurable taxonomy existing first)
06 Trust & Safety ──────────────────────────┐
07 Performance & Scale ─────────────────────┼─→ 10 Platform Expansion
08 Engagement & Notifications ──────────────┘    (API/White Label/AI Home —
                                                    highest-risk, needs every
                                                    other epic's discipline
                                                    proven first)
```

Epics not shown connected above (05, 06, 07, 08) can proceed in
parallel once 01 and 02 are done — none blocks another directly, though
all of them are real prerequisites for 10.

---

## Epic 01 — Foundation Completion

**Maps to:** `architecture/ROADMAP.md` Phase 1 (remaining scope) + Phase 2
**Status:** In progress. Done as of migration `0012`: 5 of the 9 planned
domain events now fire for real (`RequestCreated`, `QuoteSubmitted`,
`QuoteAccepted`, `JobCompleted`, `ReviewSubmitted` — the other 4 don't
have a real underlying transition yet, see `architecture/ARCHITECTURE.md`'s
Domain Events section); the Permissions layer item is closed by an
explicit deferral, not new code (`adr/0010`); a real, running test
harness exists (Vitest, wired against `src/lib/requests.js` as its
first real suite). **Not done:** TypeScript conversion, a CI pipeline,
a staging Supabase project, Playwright e2e, and the full
Development → Internal → Beta → Production release pipeline — all of
Phase 2's remaining infrastructure-dependent scope, left for this
epic's next continuation rather than attempted without the real
infrastructure decisions (CI provider, staging project) that require
the founder's input.

**Entry criteria:** none — already underway.
**Exit criteria:** every domain event with a real underlying transition
fires (done — see Status); CI blocks a merge on lint/typecheck/test
failure (not done); a real Development → Internal → Beta → Production
pipeline exists, replacing today's direct-to-production deploy (not
done).
**Key docs:** `architecture/ARCHITECTURE.md` (Core Platform layer
status), `engineering/ENGINEERING_STANDARDS.md` (the scorecard this
epic is closing line items on), `adr/0001`, `adr/0003`, `adr/0004`.

## Epic 02 — Operational Resilience

**Maps to:** `architecture/ROADMAP.md` Phase 3
**Status:** Not started.

**Entry criteria:** Epic 01's release pipeline exists (a rollback
runbook needs a real pipeline to roll back within).
**Exit criteria:** a rehearsed backup/restore drill has actually been
run once against the staging project, not just documented as possible;
a written incident-response runbook exists for "production is down" and
"we shipped a bad migration."
**Key docs:** `engineering/SECURITY.md` (the gap this closes), `adr/0005`
(why this is sequenced before money moves).

## Epic 03 — Conversational Homepage Implementation

**Maps to:** no `ROADMAP.md` phase number — this design work was
completed and approved (`adr/0007`, `adr/0008`) after `ROADMAP.md` was
written, and is genuinely ready to build now rather than waiting for a
later phase slot.
**Status:** Not started — design approved, zero application code
written. `VoiceCapture`, `PhotoCapture`, `TrustStrip`, and `UnfoldPanel`
(`product/EXPERIENCE_VISION.md` §10) don't exist in `src/design-system/`
yet.

**Entry criteria:** none beyond Epic 01's Core Platform groundwork
being stable — this is client-side UI work, not dependent on payments,
trust & safety, or any other business-logic epic.
**Exit criteria:** the Discover tab's category grid is no longer the
first thing a customer sees; the six-state canvas
(`product/EXPERIENCE_VISION.md` §4) is real and navigable end to end;
the one open question in `product/HOMEPAGE_DIRECTION.md` (returning-user
behavior) is resolved, not deferred silently.
**Key docs:** `product/HOMEPAGE_DIRECTION.md`, `product/EXPERIENCE_VISION.md`,
`adr/0007`, `adr/0008`. First feature brief this epic should probably
produce: implementing `TrustStrip` as a standalone Design System
component, since every other piece depends on it existing.

## Epic 04 — Monetization Launch

**Maps to:** `architecture/ROADMAP.md` Phase 4
**Status:** Not started.

**Entry criteria:** Epics 01 and 02 both done — per `adr/0005`, real
money doesn't move through the platform until the testing/CI foundation
and a rehearsed disaster-recovery plan both exist.
**Exit criteria:** a real charge and payout can complete end to end in
production behind the `STRIPE` feature flag; `audit_log` actually
receives rows for refunds and payouts.
**Key docs:** `product/MONETIZATION.md`, `architecture/ROADMAP.md` Phase
4's full technical scope, `engineering/SECURITY.md` (payment-data
handling posture).

## Epic 05 — Marketplace Engine

**Maps to:** `architecture/ROADMAP.md` Phase 5
**Status:** Not started.

**Entry criteria:** none blocking — can start independently once Epic
01 is stable.
**Exit criteria:** a brand-new service can be added purely through an
admin surface, with zero code changes, and renders correctly in both
the manual quote form and AI intake.
**Key docs:** `architecture/ROADMAP.md` Phase 5.

## Epic 06 — Trust & Safety

**Maps to:** `architecture/ROADMAP.md` Phase 6
**Status:** Not started.

**Entry criteria:** none blocking.
**Exit criteria:** `is_certified` is backed by a real, admin-reviewed
document, not a bare boolean; the `reports` table has a working
moderation workflow behind it, not just a place for reports to
accumulate unread.
**Key docs:** `architecture/ROADMAP.md` Phase 6, `engineering/SECURITY.md`
(moderation gap).

## Epic 07 — Performance & Scale

**Maps to:** `architecture/ROADMAP.md` Phase 7
**Status:** Not started.

**Entry criteria:** none blocking.
**Exit criteria:** every list-fetching function in `src/lib` is
paginated; Discover's search is a real index, not a client-side filter
over the full catalog.
**Key docs:** `architecture/ARCHITECTURE.md` (Known gaps section, which
names these exact items).

## Epic 08 — Engagement & Notifications

**Maps to:** `architecture/ROADMAP.md` Phase 8
**Status:** Not started. A worked example already exists at
`features/001-quote-accepted-email-notification.md`, illustrative
rather than a commitment, but a genuinely usable starting slice for
this epic.

**Entry criteria:** none blocking.
**Exit criteria:** a pro or customer can learn about a relevant event
(quote accepted, new message) without the app open; Core's Notifications
layer moves from `Planned` to `Implemented` in
`architecture/ARCHITECTURE.md`'s Core Platform layer status table.
**Key docs:** `features/001-quote-accepted-email-notification.md`,
`architecture/ROADMAP.md` Phase 8.

## Epic 09 — AI Engine v2 & Intelligence Platform

**Maps to:** `architecture/ROADMAP.md` Phase 9 + Phase 10, combined —
both are "the AI Gateway grows beyond per-request intake" in nature,
and Phase 10's marketplace-memory work directly feeds Phase 9's
matching quality (`architecture/ROADMAP.md` Phase 10's own stated
dependency).
**Status:** Not started.

**Entry criteria:** Epic 05 (Marketplace Engine) should be substantially
done first — weighted matching and marketplace intelligence both need a
real configurable taxonomy under them, not the hardcoded 15-service
catalog.
**Exit criteria:** matching ranks by trust score and fit, not just rule
matching; an internal assistant can answer a plain-language question
about marketplace signals; `architecture/ROADMAP.md`'s minimum-data
threshold gate (Phase 10's stated risk) is respected — this doesn't
ship until Epics 04–05 have produced meaningful real usage to analyze.
**Key docs:** `architecture/AI_ARCHITECTURE.md`, `architecture/ROADMAP.md`
Phases 9 and 10.

## Epic 10 — Platform Expansion (API, White Label, AI Home)

**Maps to:** `architecture/ROADMAP.md` Phase 11 + Phase 12 + Phase 13 —
the same three phases `product/HOME_OPERATING_SYSTEM.md` §7 already
groups together as its "Year 5" horizon, combined here for the same
reason: all three are XL-complexity, multi-year-horizon bets that
shouldn't start until everything before them is proven in production.
**Status:** Not started. `product/HOME_OPERATING_SYSTEM.md` and
`product/PROPERTY_MEMORY.md` are this epic's design spec for the AI Home
slice specifically.

**Entry criteria:** every other epic in this document, substantially
done. This is stated plainly, not softened: `architecture/ROADMAP.md`
itself calls Phase 12 (White Label) "the highest architectural risk in
the roadmap after Payments" and says not to start it "until Phase 2's
testing discipline and Phase 6's RLS patterns are both mature and
proven in production" — which in this document's numbering means Epics
01 and 06.
**Exit criteria:** varies by slice (a versioned public API with a real
partner sandbox; strict tenant-isolation tests passing for white-label;
a persistent Home Profile tied into every past request) — this epic is
large enough that it should be broken into its own feature briefs
before work starts, not executed as one undifferentiated block.
**Key docs:** `product/HOME_OPERATING_SYSTEM.md`, `product/PROPERTY_MEMORY.md`,
`architecture/ROADMAP.md` Phases 11–13.

---

## Foundation Freeze: complete

This closes the nine-phase Foundation Freeze initiative:

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Documentation audit | Done |
| 2 | Reorganize `docs/` into category folders | Done |
| 3 | Write the five missing strategic docs | Done |
| 4 | Extract ADRs into `docs/adr/` | Done |
| 5 | Feature-brief template | Done |
| 6 | `AI_CONTEXT.md` | Done |
| 7 | Role-based reading guides | Done |
| 8 | Implementation Readiness Review | Done |
| 9 | Execution roadmap, 10 named epics | Done — this document |

The repository, not this or any other conversation, now holds
Klussie's full context: what it is, why it's built the way it is, what
comes next, and in what order. Nothing about the product's actual
implementation has changed as a result of Foundation Freeze — that
work starts now, with Epic 01.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 9 — final)

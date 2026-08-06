# ADR-0006: Design Direction Lock — Evolve the Warm Identity, Reject the Cooler SaaS-Dashboard Register

**Status:** Implemented (governance; component-level implementation
ongoing — see `../design/README.md`'s Document Map for current status)
**Date:** 2026-08-05
**Related:** `../design/DESIGN_SYSTEM.md`,
`../product/PRODUCT_CONSTITUTION.md`'s Design Constitution. Supersedes
[ADR-0002](0002-warm-paper-ticket-design-language.md).

## Context

The product's visual language had started drifting toward a generic
SaaS/dashboard aesthetic — the kind of look any B2B tool defaults to
without a deliberate reason. [ADR-0002](0002-warm-paper-ticket-design-language.md)
had only provisionally kept the existing warm identity by default, not
locked it as an intentional choice, which left room for that drift to
keep happening one component at a time.

Two real directions were on the table: continue toward a cooler,
more clinical register closer to Linear/Vercel Dashboard/GitHub (common
reference points for "modern SaaS"), or explicitly commit to and evolve
the existing warm identity (forest green, sage, amber, Fraunces display
type, generous whitespace) that the product had been building since
its first migration.

## Decision

Lock the direction: evolve the existing warm "paper ticket" identity —
reduce heavy borders and paper effects, increase breathing room and
subtle motion — rather than moving toward a colder, more corporate
register. Brand personality must stay warm, human, trustworthy,
premium, and calm — never corporate, cold, or "AI-first" visually.

## Consequences

- Every future component and screen is checked against this direction,
  not just "does it look modern" — `../design/DESIGN_SYSTEM.md`'s Final
  Rule exists specifically to make this checkable rather than a matter
  of taste each time.
- This closes the previously-open "design language: decision needed"
  question that had been sitting unresolved across multiple earlier
  documents (see `../architecture/ROADMAP.md`'s manifesto-alignment
  section, which had flagged it before this ADR resolved it).
- Component-level implementation of this direction is ongoing, not a
  single completed action — see the Design System's own governance
  document for what's actually shipped versus still pending.

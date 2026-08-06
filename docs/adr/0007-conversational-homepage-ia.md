# ADR-0007: Conversational-First Homepage Over Marketplace/Category-Grid IA

**Status:** Implemented (design direction — see Consequences for what
this does and doesn't mean is built)
**Date:** 2026-08-06
**Related:** `../product/HOMEPAGE_CONCEPTS.md`,
`../product/HOMEPAGE_DIRECTION.md`, `../product/EXPERIENCE_VISION.md`

## Context

The existing homepage followed a conventional marketplace pattern:
search bar, category grid, service cards — the same information
architecture as most services marketplaces. A deliberate brief rejected
that pattern outright and asked for a homepage designed as if by Apple,
Airbnb, or OpenAI, with the first interaction being conversational, not
a grid to browse. Three genuinely different concepts were explored
(`HOMEPAGE_CONCEPTS.md`): A, "The Concierge Chat" (pure chat thread,
zero chrome); B, "The Single Question" (radical restraint, one input,
progressive reveal); C, "The Trusted Companion" (ambient trust,
warmth as structure).

## Decision

Replace the category-grid entry point with a single evolving
conversational canvas — Concept C's warm greeting and persistent trust
strip, combined with Concept B's restraint of one entry point that
unfolds in place rather than navigating through screens. The canvas
moves through six states in place (Rest → Problem → AI Understanding →
Trust → Professional → Booking → Relief) with zero page navigations.
Voice and photo input are first-class, equal-weight actions alongside
typing, not secondary options buried in a composer.

This replaces the Discover tab specifically. It does **not** remove
Requests, Messages, or Profile — those remain a quiet, unchanged
secondary utility layer for a returning customer with something already
in progress.

## Consequences

- This is a design decision, documented and approved as of this ADR —
  it has **not** yet been implemented in `src/App.jsx`. Four new
  components are anticipated (`VoiceCapture`, `PhotoCapture`,
  `TrustStrip`, `UnfoldPanel`) per `EXPERIENCE_VISION.md` §10 — none
  exist in the codebase yet.
- The existing category-grid matching logic underneath Discover stays
  real and needed; only its role as the first thing a user sees
  changes.
- Two trust signals the design explicitly wants ambient (insurance
  verification, response-time tracking) aren't backed by real data yet
  — the design cannot claim them on screen until they are, per
  Constitution Rule 9.
- One open question this ADR does not resolve: what changes for a
  returning user with a job already in progress — noted honestly in
  `HOMEPAGE_DIRECTION.md` as undecided.

# ADR-0002: Keep the Warm "Paper Ticket" Design Language for Now

**Status:** Superseded by [ADR-0006](0006-design-direction-lock.md)
**Date:** 2026-08-04
**Related:** `../design/DESIGN_SYSTEM.md`

## Context

Early in the project, the visual direction question came up: keep
evolving the existing warm identity (forest green, sage, amber,
Fraunces display type, generous whitespace, paper-like surfaces), or
move toward a colder, more "AI-native" register more common in the
manifesto's own reference points.

## Decision

Default to the existing warm identity rather than a colder register,
to keep shipping without blocking on an unresolved design debate. Loose
reasoning at the time: it aligns with the manifesto's trust framing
better than a cold register would.

## Consequences

This was a provisional, low-confidence default, not a considered
brand decision — and it was later found to be actively drifting toward
a generic SaaS/dashboard look in practice. See
[ADR-0006](0006-design-direction-lock.md), which supersedes this with
an explicit, deliberate lock in the opposite direction (double down on
warmth, explicitly reject the cooler register) rather than continuing
to default by inertia.

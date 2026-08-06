# ADR-0005: Move Testing/CI/Disaster Recovery Ahead of Payments in the Roadmap

**Status:** Implemented (sequencing decision, reflected throughout `../architecture/ROADMAP.md`)
**Date:** 2026-08-04
**Related:** `../architecture/ROADMAP.md` Phases 2, 3, 4

## Context

An earlier draft of the platform roadmap had real payments (commission,
Stripe/Mollie integration) as the next major phase after the initial
security/Core Platform foundation — ahead of a formal testing framework
and any disaster-recovery planning. The reasoning for that ordering was
business urgency: revenue matters, and payments unlock it.

## Decision

Reorder the roadmap: Phase 2 = Testing, CI, types, and release strategy;
Phase 3 = Disaster Recovery & operational resilience; Phase 4 = Real
Payments — moved back one slot from where it originally sat. Once real
money moves through the platform, every later change becomes
higher-risk; the safety net has to exist before that's true, not after.

## Consequences

- Payments launches onto a codebase that already has automated tests, a
  real release pipeline (Development → Internal → Beta → Production),
  and a rehearsed backup/restore + incident-response plan — not the
  first thing to touch production with real financial stakes.
- Revenue is delayed by two full phases relative to the original
  sequencing. This was accepted deliberately, not overlooked — a
  payments bug shipped onto an untested foundation risks far more than
  the delay costs.
- This ordering is now load-bearing for how every phase after it is
  planned: nothing downstream assumes payments exist before Phase 4,
  and nothing in Phases 2–3 assumes real money is already at stake.

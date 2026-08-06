# FB-NNN: Title

**Status:** Proposed
**Author:** name
**Date:** YYYY-MM-DD
**Roadmap phase:** which `../architecture/ROADMAP.md` phase this
belongs to, if any — or "None, standalone" if it doesn't

## Summary

One or two sentences. If you can't summarize it this short, the brief
is probably scoped too large — split it.

## Problem

What's broken, missing, or costing users/pros something today. Cite the
real evidence if it exists (a UX-friction finding in `../architecture/ROADMAP.md`,
a risk in `../MASTER_CONTEXT.md` §13, a support pattern) — "it seemed
useful" is explicitly not sufficient (Constitution Rule 4).

## Principle(s) served

Which of the six Product Principles
(`../product/PRODUCT_CONSTITUTION.md`) this serves — Trust, Simplicity,
Conversion, Retention, Scalability, Marketplace Liquidity. At least one,
required by Rule 10.

## KPI(s) moved

Which of the eight Product KPIs (`../MASTER_CONTEXT.md` §14) this is
expected to move, and roughly how — "closes the biggest gap against
Professional response time < 5 min" is a real answer; "should help
retention" without a mechanism is not. At least one, required by Rule
10.

## Not doing

Explicit scope boundary. What this brief deliberately excludes, so a
reviewer doesn't have to guess whether an adjacent idea was forgotten or
ruled out on purpose.

## Design

- Does this need a new Design System component, or reuse existing ones?
  Check `../design/COMPONENT_LIBRARY.md` first.
- Any copy needed — draft it against `../design/COPY_GUIDELINES.md`'s
  voice, don't leave placeholder text for someone else to write later.
- Accessibility implications, if any beyond the Design System's
  defaults (`../design/ACCESSIBILITY.md`).

## Data model

New tables/columns, or changes to existing ones. Include the RLS
posture for anything new — "public read" and "no client write policy"
are both real, valid answers; "TBD" is not (Constitution Rule 5).

## Backend / API

New endpoints, or changes to existing ones. Which Core Platform layer(s)
this touches (`../architecture/ARCHITECTURE.md` §Core Platform layer
status) — and whether it introduces a new layer usage or extends an
existing one.

## AI

Does this call the AI Gateway? A new capability, or reuse of
`reason()`/`translate()`? If a new prompt is needed, it gets its own
`/ai/{capability}/prompt.md` + `evaluation.md`
(`../architecture/AI_ARCHITECTURE.md`) — not an inline string.
"None" is a fine, real answer for most features.

## Feature flag

Per Protected Decisions (`../MASTER_CONTEXT.md` §17): every
capability-gated feature ships behind a Feature Flag. Name it here even
if the value is obvious (`key`, default state, rollout plan) — this is
what makes "how do we turn this off if it's wrong" answerable before
it ships, not after.

## Testing requirements

What proves this works, specific enough that someone else could execute
it — not "test thoroughly." If it touches AI, does it need a new
evaluation case (`../architecture/AI_ARCHITECTURE.md`)? If it touches
RLS, what's the specific policy test?

## Rollout

Which stage of the release pipeline
(`Development → Internal → Beta → Production`,
`../architecture/ROADMAP.md` Phase 2) this needs to pass through before
full rollout, and any rollout percentage/audience targeting via the
feature flag.

## Risks

What could go wrong, and how bad — same honesty standard as a roadmap
phase's Risks field. "None" is rarely a real answer; if it genuinely is,
say why.

## Open questions

Anything not yet decided that a reviewer should weigh in on before this
moves to `Approved`. A brief with no open questions has usually not
been thought through carefully enough — see `README.md`.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 5)

# ADR-0010: Defer Permissions Layer Formalization Until Trust & Safety Needs It

**Status:** Implemented (as a deferral decision — see Consequences)
**Date:** 2026-08-06
**Related:** `../architecture/ARCHITECTURE.md` (Core Platform layer
status), `../architecture/ROADMAP.md` Phase 6 (Trust & Safety / Admin
Tooling), `../EXECUTION_ROADMAP.md` Epic 01

## Context

`../architecture/ROADMAP.md` Phase 1 named "a Permissions layer
formalizing today's RLS into one checkpoint" as part of Klussie Core's
foundation, and `../EXECUTION_ROADMAP.md` Epic 01 carried that forward
as remaining scope. Two real options existed for closing it: build a
`Permissions` module now (a server-side checkpoint layered over RLS,
the kind an admin surface would call for role-based checks beyond what
RLS alone expresses), or wait until a real caller actually needs one.

Today, every access-control decision in the codebase is already
correctly expressed as RLS policy per table (verified consistently
correct — `../engineering/SECURITY.md`) plus `api/_lib/auth.js`'s JWT
verification. No admin-only surface exists yet to call a role-based
checkpoint — that's `../architecture/ROADMAP.md` Phase 6's job, not
built until then.

## Decision

Don't build a Permissions module now. Building an abstraction with no
real caller contradicts a pattern this project already follows
elsewhere on purpose — see `../architecture/AI_ARCHITECTURE.md`'s
reasoning for not splitting vision into its own AI Gateway capability
until a provider actually forces that split: speculative structure
built ahead of a real need tends to guess wrong about the shape that
need turns out to have. RLS-per-table plus JWT verification remains the
real, sufficient posture until Trust & Safety (Epic 06) needs
role-based admin checks, at which point the Permissions layer gets
built against that actual requirement.

## Consequences

- `../architecture/ARCHITECTURE.md`'s Core Platform layer status table
  now points at this ADR from the Permissions row instead of saying
  "In Progress" with no explanation of what's blocking it or why it's
  not simply unstarted.
- Epic 01's exit criteria in `../EXECUTION_ROADMAP.md` is satisfied for
  this specific item by this explicit, reasoned deferral — not by a
  built module. Anyone revisiting Epic 01's status should read this ADR
  before assuming the item was overlooked.
- When Epic 06 starts, its first real task is designing the Permissions
  checkpoint against the actual admin surface it needs to protect —
  this ADR's job is done once that happens, and this record stays as
  the reason the layer wasn't built earlier.

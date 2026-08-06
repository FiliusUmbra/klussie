# ADR-0009: Reorganize `docs/` Into Category Subfolders

**Status:** Implemented
**Date:** 2026-08-06
**Related:** `../MASTER_CONTEXT.md` Document Map, `../../README.md`
Repository Structure

## Context

`docs/` had grown to ten root-level files (`MASTER_CONTEXT.md`,
`PRODUCT_CONSTITUTION.md`, `ENGINEERING_STANDARDS.md`,
`AUTH_PROVIDER_SETUP.md`, plus six newly-transcribed strategic and
vision docs) with no categorization, alongside an already-categorized
`docs/design/` folder of 14 files. Left flat, the root would keep
growing indefinitely with no way to tell governance docs from vision
docs from operational runbooks at a glance.

## Decision

Adopt category subfolders — `design/`, `product/`, `architecture/`,
`engineering/`, `operations/` — active immediately, with `features/`,
`adr/`, and `company/` reserved for later Foundation Freeze phases
rather than created speculatively empty. `MASTER_CONTEXT.md` stays at
`docs/` root as the entry point every session reads first;
`docs/design/` was left untouched since it was already well-organized.

## Consequences

- Nine files moved (`git mv`, history preserved) into their category
  folders; every real cross-reference across the repo (`README.md`,
  code comments, `docs/design/README.md`, `MASTER_CONTEXT.md` itself)
  was updated so nothing 404s.
- Bare filename mentions without a path (the existing convention
  throughout the doc set) were deliberately left alone rather than
  converted to full paths everywhere — consistent with how the docs
  already referenced each other before this reorganization.
- `docs/adr/` — reserved by this same decision — became active one
  phase later, in [Foundation Freeze Phase 4](../architecture/ROADMAP.md),
  which is what this very ADR now lives inside.

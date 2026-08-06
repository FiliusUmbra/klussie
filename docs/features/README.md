# Feature Briefs

**This document owns:** what a feature brief is for, when to write one,
and the index of every feature brief written so far. It does not own
the template's own field-by-field content (`TEMPLATE.md`) or phase-level
planning (`../architecture/ROADMAP.md`).

## What a feature brief is for

A roadmap phase in `../architecture/ROADMAP.md` scopes a chunk of work —
"Trust & Safety / Admin Tooling," "Engagement & Notifications." A
feature brief scopes one shippable slice inside that chunk, with the
same rigor a phase gets (components affected, data model, testing,
risks) but small enough to actually build in one sitting.

Write one before building anything that:

- Touches the data model (a new table, or a column with real behavior
  behind it — not a typo fix).
- Adds a new Core Platform layer usage, or a new AI Gateway capability
  call.
- Is user-visible and changes behavior, not just styling.
- Someone could reasonably ask "why does this exist" about, a year from
  now, without an easy answer in the code itself.

Don't write one for a bug fix, a copy change, a refactor with no
behavior change, or a component-library addition that already has a
design spec in `../design/`.

## The one rule that governs every brief

**Constitution Rule 10:** every feature must serve at least one Product
Principle and be expected to move at least one Product KPI. A feature
brief that can't fill in those two fields honestly isn't ready to build
— that's the template doing its job, not a formality to skip past.

## Process

1. Copy `TEMPLATE.md` to `NNN-short-kebab-title.md` in this folder
   (numbered sequentially, like `adr/`).
2. Fill it out — including the fields that are uncomfortable to fill
   out honestly, like "Not doing" and "Open questions." A brief that
   has no open questions and no explicit non-goals is usually a brief
   that hasn't been thought through yet.
3. Status starts at `Proposed`. Move to `Approved` once reviewed,
   `In Progress` once work starts, `Shipped` once it's live,
   `Rejected` if it doesn't happen — rejected briefs stay in the repo
   as a record of what was considered and why it didn't proceed, same
   as a superseded ADR.
4. Add a row to the index below.

## Index

| # | Title | Status |
|---|---|---|
| [001](001-quote-accepted-email-notification.md) | Quote-accepted email notification | Proposed — illustrative example, see note in the file |

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 5)

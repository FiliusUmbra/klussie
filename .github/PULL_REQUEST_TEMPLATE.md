# Epic NN WPnn — <title>

**Work package.** `implementation/epic-NN/wp-NN.NN-slug.md`
**Migration step.** add · backfill · dual-write · reconcile · switch reads · retire · not a migration

## What this does

One paragraph. What is true after this that was not true before.

## Behaviour change

- [ ] **None** — this package is behaviour-preserving
- [ ] **Yes** — described below, and stated in the work package's
      acceptance criteria

<!-- If yes: exactly what a user sees differently. -->

## Gates

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run typecheck` <!-- once WP 00.03 has landed -->
- [ ] CI green
- [ ] Manual verification, if a user-facing flow was touched

## Architecture

- [ ] No frozen document modified
- [ ] No branch on workspace type
- [ ] No engine writes another engine's aggregates
- [ ] No business rule added to a trigger, component or data-access module
- [ ] Permission logic not reimplemented
- [ ] Any deviation has an ADR, dated before the code

## Scope

- [ ] The diff matches the work package's stated file list
- [ ] Nothing unrelated was refactored or tidied in passing

## Tests

<!-- What was added or changed, and what it proves. -->

## Rollback

<!-- Specifically. Not "revert the commit".
     Data migration: what is dropped, what is left, is anything lost?
     Read-switch: which read path reverts? -->

## Reconciliation

<!-- Read-switch packages only. Which reconciliation ran, and its result.
     A read-switch without a passing reconciliation does not merge. -->

---

*Reviewer:* [`implementation/templates/REVIEW_CHECKLIST.md`](../implementation/templates/REVIEW_CHECKLIST.md)

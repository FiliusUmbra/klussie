# Epic 00 — Engineering Foundations

**Status.** Not started
**Purpose.** Make the next twenty-six epics safe to attempt.
**Definition.** [`docs/IMPLEMENTATION_ROADMAP.md`](../../docs/IMPLEMENTATION_ROADMAP.md) §10
**Work packages.** [`docs/IMPLEMENTATION_ROADMAP.md`](../../docs/IMPLEMENTATION_ROADMAP.md) §11

---

## Why this epic is first

Twenty-six epics of migration against a **live production database**,
with no CI gate and no environment other than production, is not a risk
to be managed — it is a near-certainty of undetected regression.
`docs/MASTER_CONTEXT.md` §12 already lists no-CI as the
highest-severity technical debt.

Nothing else starts until this is done.

## Work packages

| WP | Title | Complexity | Status |
|---|---|---|---|
| 00.01 | Add CI pipeline for lint, test and build | Low | **In review** — [wp file](wp-00.01-ci-pipeline.md) |
| 00.02 | Add CHANGELOG and release note conventions | Low | **In review** — [wp file](wp-00.02-changelog.md) |
| 00.03 | Introduce TypeScript toolchain without migrating code | Medium | **In review** — [wp file](wp-00.03-typescript-toolchain.md) |
| 00.04 | Migrate one leaf module to TypeScript as proof | Low | **In review** — [wp file](wp-00.04-first-typescript-module.md) |
| 00.05 | Add type-check to CI | Low | Not started |
| 00.06 | Provision the staging Supabase project | Medium | Not started |
| 00.07 | Document and verify a restore | Medium | Not started |
| 00.08 | Add a regression baseline for the current product | **High** | Not started |

## Acceptance

From the epic definition:

- [ ] CI runs lint, test and build on every push and PR, and blocks merge
      on failure
      <!-- WP 00.01 delivers the pipeline and the failing run. "Blocks
           merge" additionally requires branch protection, a GitHub
           repository setting that cannot be created from the repo.
           Outstanding for this gate — see wp-00.01-ci-pipeline.md. -->
- [ ] **Branch protection enabled on `main`**, requiring the CI check to
      pass before merge (manual repository setting)
- [ ] A staging Supabase project exists, with all migrations applied from
      empty, proving replayability
- [ ] TypeScript compiles alongside JavaScript, with at least one module
      migrated to prove the toolchain
- [ ] `CHANGELOG.md` exists
- [ ] A verified restore has been performed from a production backup

## Notes

**00.08 is the one to watch.** It is the reference every later migration
proves itself against — the difference between "the tests pass" and "we
know the app still works." It is marked High complexity and is the most
likely package in this epic to be under-scoped.

**00.06 is a hard prerequisite for all schema work.** No migration in any
epic runs before staging exists.

**No platform code changes in this epic.** Tooling, configuration,
environments and tests only. `00.04` touches one leaf module solely to
prove the TypeScript toolchain works.

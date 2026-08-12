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
| 00.01 | Add CI pipeline for lint, test and build | Low | **Complete** — approved, [wp file](wp-00.01-ci-pipeline.md) |
| 00.02 | Add CHANGELOG and release note conventions | Low | **Complete** — approved, [wp file](wp-00.02-changelog.md) |
| 00.03 | Introduce TypeScript toolchain without migrating code | Medium | **Complete** — approved, [wp file](wp-00.03-typescript-toolchain.md) |
| 00.04 | Migrate one leaf module to TypeScript as proof | Low | **Complete** — approved, [wp file](wp-00.04-first-typescript-module.md) |
| 00.05 | Add type-check to CI | Low | **Complete** — approved, [wp file](wp-00.05-typecheck-in-ci.md) |
| 00.06 | Provision the staging Supabase project | Medium | **Complete** — 17/17 migrations replayed from empty ([wp file](wp-00.06-staging-environment.md)) |
| 00.07 | Document and verify a restore | Medium | **Complete** — verified by design and tooling; drill deferred (Free plan) ([wp file](wp-00.07-verify-restore.md)) |
| 00.08 | Add a regression baseline for the current product | **High** | **Complete** — 59 flows inventoried, defects pinned ([wp file](wp-00.08-regression-baseline.md)) |

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
- [x] A staging Supabase project exists, with all migrations applied from
      empty, proving replayability — **17/17, no file modified, verified
      via `migration list --linked` and a clean `db push --dry-run`**
- [ ] TypeScript compiles alongside JavaScript, with at least one module
      migrated to prove the toolchain
- [ ] `CHANGELOG.md` exists
- [x] A backup strategy exists and its path is verified end to end —
      native `pg_dump` 18.4 over the session pooler, no Docker, no plan
      upgrade ([ADR-0017](../../docs/adr/0017-free-tier-disaster-recovery-strategy.md))
- [ ] ~~A verified restore has been performed from a production backup~~
      **Deferred — operational constraint.** The Free plan provides two
      projects and neither can be consumed as a restore target. Recorded
      in `docs/operations/DISASTER_RECOVERY.md` §8; not an engineering
      failure

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

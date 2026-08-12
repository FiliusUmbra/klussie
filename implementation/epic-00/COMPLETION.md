# Epic 00 — Completion Record

**Epic.** 00 — Engineering Foundations
**Started.** 2026-08-12
**Completed.** 2026-08-12
**Work packages.** 8 of 8

---

## 1 · Gates

- [x] **1** Every work package finished
- [x] **2** `npm run lint` passes
- [x] **3** `npm test` passes — **411 tests, 24 files**
- [x] **4** `npm run build` succeeds
- [ ] **5** CI green on the branch — **never observed running** (§6)
- [x] **6** No known regressions
- [x] **7** Architecture preserved — no frozen document modified in any package
- [x] **8** Documentation updated (§4)
- [x] **9** Deviations recorded as ADRs — 0016, 0017, 0018
- [x] **10** Deployed to staging and verified — staging built and verified in WP 00.06

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| CI runs lint, test, build on every push and PR | **Yes** | `.github/workflows/ci.yml`; failing test proven to exit non-zero |
| CI blocks merge on failure | **No** | Needs branch protection — a repository setting, not a file (§6) |
| Staging project exists, all migrations applied from empty | **Yes** | 17/17, no file modified; verified by `migration list --linked` and a clean `db push --dry-run` |
| TypeScript compiles alongside JavaScript, one module migrated | **Yes** | `tsconfig.json`, `typecheck` script, `reportReasons.ts` |
| `CHANGELOG.md` exists | **Yes** | With a stated format and an Epic 00 entry |
| A verified restore has been performed | **No** | Deferred — Free plan provides two projects, neither consumable (ADR-0017, `DISASTER_RECOVERY.md` §8) |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 00.01 | Add CI pipeline for lint, test and build | Complete |
| 00.02 | Add CHANGELOG and release note conventions | Complete |
| 00.03 | Introduce TypeScript toolchain without migrating code | Complete |
| 00.04 | Migrate one leaf module to TypeScript as proof | Complete |
| 00.05 | Add type-check to CI | Complete |
| 00.06 | Provision the staging Supabase project | Complete |
| 00.07 | Document and verify a restore | Complete — drill deferred |
| 00.08 | Add a regression baseline for the current product | Complete |

## 4 · Documentation updated

- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md` — known gaps corrected
- [x] `CHANGELOG.md`
- [x] `docs/IMPLEMENTATION_ROADMAP.md` — epic status
- [x] `docs/adr/README.md` — 0016, 0017, 0018
- [x] `docs/engineering/TESTING.md` — created
- [x] `docs/operations/ENVIRONMENTS.md`, `DISASTER_RECOVERY.md`,
      `POSTGRES_TOOLS_WINDOWS.md` — created
- [ ] Epic 01 work packages decomposed — **not started, awaiting approval**

## 5 · What actually happened

**Deviations from plan.** Two packages could not be completed as written,
both for the same underlying reason: the roadmap was drafted assuming
capabilities the Free plan does not provide.

- **WP 00.06** was planned as manual SQL pasting because the repository
  had no CLI. Investigation showed the Supabase CLI works via `npx`,
  maintains a migration ledger, and needs no `config.toml` for cloud use.
  The runbook was corrected *before* anyone followed it.
- **WP 00.07** set out to verify a restore and found there was nothing to
  restore. It was redesigned twice — first around the discovery that no
  backup existed, then around the CTO decision to stay on Free — and
  closed with the drill deferred.

**ADRs written.** Three, all in WP 00.07's territory:

| ADR | Decision |
|---|---|
| 0016 | Operate on Free without automatic backups — **superseded by 0017** |
| 0017 | A self-managed free-tier DR strategy: native `pg_dump`, no Docker |
| 0018 | Restore Mode — recorded, deliberately **not** implemented |

**Surprises.** Five findings that changed the work:

1. **`supabase db dump` excludes the `auth` schema.** It captures your
   schema for migrations, not your database for recovery. A backup taken
   with its defaults contains **no user accounts** — a restore from one
   produces a working application nobody can log into.
2. **Nine triggers make a naive restore actively wrong**, re-running the
   product's own history rather than reproducing it. This changed the
   backup design to section-ordered dumps.
3. **The pooler host is per project, not per region.** Both Klussie
   projects are `eu-west-1` and sit on different clusters. The wrong host
   fails with a message that points at the wrong cause.
4. **CI would have been green while local lint failed**, because ESLint
   matched generated Astro files that are gitignored and absent from a
   fresh checkout.
5. **31 of 53 user-facing components have no render test** — sharper
   than the debt register implied, and it includes the entire
   request-to-review loop.

**Deferred.** The restore drill (ADR-0017, operational constraint) and
render tests for the 31 uncovered components (separate Phase 2 debt).

## 6 · Regressions and known issues

| Issue | Severity | Tracked where |
|---|---|---|
| CI has never been observed running | Medium | Below — pushes exist, no run confirmed from here |
| Branch protection not enabled on `main` | Medium | Gate 5; repository setting |
| Restore never drilled | **High** | `DISASTER_RECOVERY.md` §8, ADR-0017 |
| 31 components without render tests | Medium | `MASTER_CONTEXT.md` §12, `TESTING.md` §4 |
| 14 literal escape defects | Low | Now **pinned** by `knownDefects.test.js` |
| `nanoid` advisory (pre-existing) | Low | Predates this epic; untouched |

**No regressions were introduced.** No application behaviour changed in
any of the eight packages.

## 7 · Verification performed

**Automated.** 404 → **411 tests**, 22 → **24 files**. Every package ran
lint, type-check, test and build before commit.

**By probe, not assumption.** Each gate was proven able to fail: a
deliberately failing test exits non-zero; a type error exits 2; "fixing"
one euro sign fails the baseline; an unlisted component fails coverage.

**Manual.** Staging verified in WP 00.06 — all 17 migrations from empty,
independently re-verified read-only afterwards.

**Not performed.** No restore drill. No CI run observed.

## 8 · Sign-off

- [x] Seven of ten gates met; gate 5 needs a repository setting, and two
      acceptance criteria are deferred with recorded reasons
- [x] Repository releasable
- [x] Epic 01 ready to start — **staging exists, which was the hard
      prerequisite**

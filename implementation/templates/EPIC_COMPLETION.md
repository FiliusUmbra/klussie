# Epic NN — Completion Record

> Copy to `implementation/epic-NN/COMPLETION.md` when closing an epic.
> Delete this quote block.
>
> Gates are `docs/IMPLEMENTATION_ROADMAP.md` §7. An epic is not complete
> because its code is written.

**Epic.** NN — <name>
**Started.** YYYY-MM-DD
**Completed.** YYYY-MM-DD
**Work packages.** N of N

---

## 1 · Gates

- [ ] **1** Every work package finished
- [ ] **2** `npm run lint` passes
- [ ] **3** `npm test` passes
- [ ] **4** `npm run build` succeeds
- [ ] **5** CI green on the branch
- [ ] **6** No known regressions
- [ ] **7** Architecture preserved — reviewed against the epic's
      referenced documents
- [ ] **8** Documentation updated (§4 below)
- [ ] **9** Any deviation recorded as an ADR
- [ ] **10** Deployed to staging and verified

## 2 · Acceptance criteria

Each criterion from the epic definition, with evidence — not a tick.

| Criterion | Met? | Evidence |
|---|---|---|
| | | |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| NN.01 | | | |

## 4 · Documentation updated

- [ ] `docs/MASTER_CONTEXT.md` — §2 milestone, §3 current state, §4
      health, §12 debt
- [ ] `docs/architecture/ARCHITECTURE.md` — what is *currently built*
- [ ] `CHANGELOG.md`
- [ ] `docs/IMPLEMENTATION_ROADMAP.md` — epic status
- [ ] `docs/adr/README.md` — if any ADR was written
- [ ] `docs/engineering/TESTING.md` — if the strategy changed
- [ ] Next epic's work packages decomposed, if starting immediately

## 5 · What actually happened

**Deviations from plan.** What was planned versus what was done, and why.

**ADRs written.** Number, title, what forced it.

**Surprises.** What was harder or easier than expected — this is the
section that makes the next epic's estimates better.

**Deferred.** Anything consciously left, with the reason and where it is
now tracked. "Nothing" is a valid answer; silence is not.

## 6 · Regressions and known issues

| Issue | Severity | Tracked where |
|---|---|---|

If none: say so explicitly. An empty section reads as an unanswered
question.

## 7 · Verification performed

**Automated.** Test counts before and after; new coverage.

**Manual.** Which flows were verified, on which environment, by whom.

**Performance.** For epics touching the hot paths in
`SUPABASE_ARCHITECTURE.md` §20 — what was measured, and against what
baseline.

## 8 · Sign-off

- [ ] All ten gates met
- [ ] Repository releasable
- [ ] Next epic ready to start

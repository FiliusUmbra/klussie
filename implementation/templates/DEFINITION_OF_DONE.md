# Definition of Done

Two levels. A work package is done when §1 holds. An epic is done when
§1 holds for every package **and** §2 holds.

Neither list is aspirational. An item that cannot be ticked is not done.

---

## 1 · Work Package

**Correctness**

- [ ] Every acceptance criterion in the work package is met, checked
      literally rather than approximately
- [ ] Behaviour changed exactly as the package said it would — no more,
      no less
- [ ] Nothing outside the package's stated scope was touched

**Quality gates**

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] `npm run typecheck` passes *(once WP 00.03 has landed)*
- [ ] CI green on the branch *(once WP 00.01 has landed)*

**Tests**

- [ ] Tests added or changed for the logic this package touches
- [ ] Regression tests still pass — existing behaviour is unchanged
      unless the package said otherwise
- [ ] For a read-switch: the reconciliation package passed with zero
      discrepancies

**Architecture**

- [ ] No frozen document was modified
- [ ] No engine writes another engine's aggregates
- [ ] No branch on workspace type
- [ ] Business rules are not in triggers, components or data-access
      modules
- [ ] Any deviation is recorded as an ADR, written *before* the code

**Releasable**

- [ ] The application works — verified, not assumed
- [ ] The rollback path is written down and is genuine
- [ ] The work package file is updated with what actually happened

---

## 2 · Epic

Everything above, for every package, plus roadmap §7:

- [ ] Every work package in the epic is complete
- [ ] Manual verification list executed on staging
- [ ] No known regressions
- [ ] Architecture reviewed against the epic's referenced documents
- [ ] `docs/MASTER_CONTEXT.md` updated — milestone, current state,
      health, debt
- [ ] `docs/architecture/ARCHITECTURE.md` updated — it owns what is
      *currently built*
- [ ] `CHANGELOG.md` updated
- [ ] `docs/adr/README.md` updated if any ADR was written
- [ ] `docs/IMPLEMENTATION_ROADMAP.md` epic status updated
- [ ] Next epic's work packages decomposed, if starting immediately

---

## The three that get skipped under pressure

Named because they are the ones that decide whether this project stays
maintainable:

1. **Tests for the logic this package touches.** Not later. Not in a
   catch-up package.
2. **The ADR, written before the code.** An ADR written afterwards is a
   justification, not a decision.
3. **Documentation at epic completion.** Deferred documentation becomes
   wrong documentation, and wrong documentation is worse than none.

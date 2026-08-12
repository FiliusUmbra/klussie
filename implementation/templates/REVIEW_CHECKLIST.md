# Review Checklist

Used for "Review implementation" sessions and before merging any work
package. **A review reports findings; it changes nothing.** Fixes happen
in a separate pass.

Order matters: architecture violations are cheapest to catch and most
expensive to miss, so they come first.

---

## 1 · Architecture — the expensive failures

- [ ] **No frozen document was modified.** Check the diff for
      `docs/architecture/*` and `docs/product/PRODUCT_CONSTITUTION.md`
- [ ] **No branch on workspace type.** Search the diff for any conditional
      on Personal / Professional / Business. Behaviour branches on
      capability
- [ ] **No engine writes another engine's aggregates.** Cross-schema
      writes must fail on grants; a workaround is a finding
- [ ] **Business rules are not in triggers.** A trigger may refuse an
      impossibility; it may not make a decision
      (`SUPABASE_ARCHITECTURE.md` §4)
- [ ] **Permission logic is not reimplemented.** It belongs to the
      Workspace and Capability engines
- [ ] **Both gates present** where behaviour is gated — capability *then*
      permission
- [ ] **AI owns no business rule.** Intelligence proposes; owning engines
      decide
- [ ] **No new boundary crossing** beyond the closed registry
      (`DATABASE_ARCHITECTURE.md` §6)
- [ ] **Any deviation has an ADR**, dated before the implementation

## 2 · Scope

- [ ] The diff matches the work package's stated file list — extra files
      are a finding, not a bonus
- [ ] Nothing unrelated was refactored, tidied or "improved" in passing
- [ ] Behaviour changed exactly as stated; a behaviour change in a
      package that claimed to be behaviour-preserving is a defect

## 3 · Data

- [ ] Every workspace-scoped row carries its workspace directly — not
      derived by traversal
- [ ] Mutability class respected: nothing updates or deletes an
      append-only table
- [ ] No cascading deletes
- [ ] No foreign key from a durable record to identity
- [ ] Backfills are idempotent and re-runnable — verified, not asserted
- [ ] A read-switch is preceded by a reconciliation that passed with zero
      discrepancies
- [ ] RLS enabled on every new table
- [ ] No personal data denormalised into a durable record

## 4 · Code

- [ ] Existing code was extended rather than rewritten, or the reason is
      stated
- [ ] No duplicated business logic
- [ ] No component over 300 lines, no function over 40
- [ ] No temporary hack without an ADR and a removal trigger
- [ ] Naming, comment density and idiom match the surrounding code
- [ ] No secret, key or token in code, data, events, logs or audit

## 5 · Tests

- [ ] Tests exist for the logic this package touches
- [ ] Tests explain *why* a rule matters, not merely that it holds
- [ ] Regression coverage for behaviour that must not change
- [ ] For UI: focus, keyboard, live regions, contrast, touch targets
- [ ] For hot paths: query cost considered
      (`SUPABASE_ARCHITECTURE.md` §20)

## 6 · Gates

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run typecheck` *(once WP 00.03 has landed)*
- [ ] CI green
- [ ] Definition of Done satisfied

---

## Reporting findings

For each finding: **what is wrong**, **where** (`file:line`), **why it
matters**, and **what the fix is**. Rank most severe first.

Severity:

| Level | Meaning |
|---|---|
| **Blocking** | Architecture violation, data-loss risk, tenancy leak, or a broken gate. Does not merge |
| **Should fix** | Correctness or maintainability problem within the package's scope |
| **Note** | Worth knowing; may be deferred with a stated reason |

**Do not manufacture findings.** A clean review is a legitimate outcome
and reporting one honestly is more useful than padding the list.

# WP NN.NN — <Title>

> Copy this file to `implementation/epic-NN/wp-NN.NN-slug.md` when
> starting a work package. Delete this quote block.
>
> Conforms to `docs/IMPLEMENTATION_ROADMAP.md` §6. If the package cannot
> be described in this format, it is too large — split it.

**Epic.** NN — <epic name>
**Status.** Not started | In progress | In review | Done
**Branch.** `epic-NN/wp-NN.NN-short-slug`
**Complexity.** Low | Medium | High

---

## Goal

One sentence: what is true after this package that was not true before.

## Migration step

If this package is part of a six-step migration (roadmap §3), state which
step. Otherwise write "Not a migration."

`add` · `backfill` · `dual-write` · `reconcile` · `switch reads` · `retire`

> **Read-switch packages only:** name the reconciliation package that
> must have passed first. A read-switch without a passing reconciliation
> is not permitted.

## Architecture references

The specific sections that constrain this work. Not whole documents.

- `docs/architecture/<DOC>.md` §N — what it requires of this package

## Scope

**In scope**
-

**Explicitly out of scope**
-

> Anything discovered mid-package that is out of scope gets noted here
> and raised — not absorbed.

## Files expected to change

| File | Change |
|---|---|
| | |

## Impact

**Database.** Migration? Additive / backfill / read-switch / retire /
none. Name the migration file if one is created.

**Backend.** What changes, or "none".

**Frontend.** What changes, or "none".

**Behaviour.** Does a user see anything different? If yes, say exactly
what. If no, say "none — this package is behaviour-preserving."

## Tests

| Test | Type | What it proves |
|---|---|---|
| | unit / integration / regression | |

> Never "none" except where the roadmap explicitly permits it. House
> style: tests explain *why* a rule matters, not merely that it holds.

## Acceptance criteria

Objective and checkable. No judgement calls. Each one either passes or
does not.

- [ ]
- [ ]

## Verification

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run typecheck` *(once WP 00.03 has landed)*
- [ ] Manual verification, where the package touches a user-facing flow
- [ ] Definition of Done satisfied

## Rollback

Specifically what reverting looks like — not "revert the commit".

**If this is a data migration:** what is dropped, what is left, and
whether any data is lost. Steps 1–4 must be losslessly reversible.

**If this is a read-switch:** which read path reverts, and confirmation
that no data change is involved.

## Notes

Anything a reviewer or a future reader needs. Findings raised, decisions
taken, surprises encountered.

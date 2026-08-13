# Epic 02 — Identity Engine

**Status.** In progress — 6 of 7 packages
**Purpose.** Separate the platform's identity from Supabase Auth, and
introduce the person reference that survives erasure.
**Definition.** [`docs/IMPLEMENTATION_ROADMAP.md`](../../docs/IMPLEMENTATION_ROADMAP.md) §10
**Work packages.** [`docs/IMPLEMENTATION_ROADMAP.md`](../../docs/IMPLEMENTATION_ROADMAP.md) §13

---

## Entry criteria

- **Epics 00 and 01 complete.** Both are — staging exists, and the
  `identity` schema and its role were created in Epic 01 WP 01.01/01.02.

## Work packages

| WP | Title | Complexity | Status |
|---|---|---|---|
| 02.01 | [Create the identity table (add)](wp-02.01-identity-table.md) | Low | **Done** |
| 02.02 | [Backfill identities from existing profiles](wp-02.02-identity-backfill.md) | Medium | **Done** — [ADR-0022](../../docs/adr/0022-backfilled-identifiers-are-uuidv7-minted-in-sql.md) needs sign-off |
| 02.03 | [Add UUIDv7 generation](wp-02.03-uuidv7.md) | Low | **Done** |
| 02.04 | [Dual-write identity on signup and profile change](wp-02.04-dual-write.md) | Medium | **Done** |
| 02.05 | [Reconcile identity against profiles](wp-02.05-reconcile-identity.md) | Medium | **Done** — the gate works; it has nothing to stand on |
| 02.06 | [Switch profile reads to the identity engine](wp-02.06-read-switch.md) | **High** | **Done** — per [ADR-0023](../../docs/adr/0023-identity-display-resolution-versus-row-visibility.md), accepted |
| 02.07 | Implement erasure by redaction | **High** | Not started |

**02.06 is the only behaviour-changing package in this epic**, and
roadmap §3 makes 02.05's reconciliation a hard gate on it: a read-switch
without a passing reconciliation is not permitted.

> **02.06 was blocked and is now unblocked on staging.** WP 02.05 built
> the gate and found it had nothing to compare. Staging is now seeded
> (`supabase/seed/staging_test_accounts.sql`, `ENVIRONMENTS.md` §4.4) and
> `RECONCILE_IDENTITY.sql` **passes over four real rows**, so the read
> switch may proceed against staging.
>
> **Production remains a separate gate.** It has none of migrations
> `0018`–`0027` and an unreconciled ledger (§9), so the reconciliation
> must be run there too — after those migrations and the backfill land —
> before reads switch for real users. That sequencing is a founder
> decision and would want the three `Proposed` ADRs accepted first.

## Architecture this epic must satisfy

Read these sections before starting — not the whole documents:

- `SYSTEM_ARCHITECTURE.md` §6.1 — the Identity Engine: what it owns, and
  the longer list of what it does **not** (roles, permissions,
  membership; it is asked, never asks)
- `SUPABASE_ARCHITECTURE.md` §11.4 — identity and erasure; the two rules
  it imposes on every migration
- `SUPABASE_ARCHITECTURE.md` §3 — UUIDv7, application-generated
- `SUPABASE_ARCHITECTURE.md` §5 — no foreign key from a durable record to
  identity; no cascading deletes anywhere
- `DATABASE_ARCHITECTURE.md` §8 — the identity aggregate, and the erasure
  decision it calls "the hardest question in the document"

## Acceptance

- [ ] Every existing user has an identity row with a person reference
- [ ] All existing auth flows work unchanged — login, signup,
      become-a-pro, profile edit
- [ ] Erasing an identity leaves referencing rows intact
- [ ] No durable table foreign-keys to identity

## Notes

**This epic is not additive throughout, unlike Epic 01.** Packages 02.01
to 02.05 are; **02.06 switches reads** and is the first package in the
implementation roadmap that can regress the product. 02.07 adds a path
that does not yet exist for users.

**The existing `profiles` table is not touched.** It keeps working, and
keeps being written, until step 6 retires it — which is not in this epic.

**Two rules from `SUPABASE_ARCHITECTURE.md` §11.4 constrain every package
here**, and both are easy to violate by accident:

1. **No durable table may foreign-key to the identity row**, or erasure
   becomes impossible or destructive.
2. **No durable table may copy personal data.** A display name
   denormalised into a record for convenience is a personal-data leak
   that erasure cannot reach.

## Raised during the epic

**The roadmap's migration numbers for this epic are wrong**, because Epic
01 needed two migrations §12 did not list. §13 names
`0023_identity.sql`; `0023` and `0024` are the emission helper and the
consumer cursors. This epic starts at **`0025`**, and every later
package's number shifts by two.

**~~02.02 backfills before 02.03 provides UUIDv7 generation.~~
Resolved in 02.02 by [ADR-0022](../../docs/adr/0022-backfilled-identifiers-are-uuidv7-minted-in-sql.md).**
The sequencing was not the problem: 02.03 delivers a *JavaScript*
generator, which cannot supply values to a SQL migration however it is
ordered. Backfills mint v7 in SQL from each row's own creation time,
through a function no engine can execute.

**~~`src/lib/ids.ts` is TypeScript, and server-side resolution is
unverified.~~ Verified in WP 02.04: it does not resolve.**
`import("./src/lib/ids.js")` fails with `ERR_MODULE_NOT_FOUND` under
Node, while the existing `.js` precedent
(`api/ai-intake.js` → `serviceQuestions.js`) resolves — Vite maps a `.js`
specifier onto a `.ts` file and Node does not. **Nothing in `api/` needs
it**, so nothing was changed and `ids.ts` was not converted. This becomes
a real decision when server-side code first has to generate an
identifier.

**The roadmap is wrong about how signup works, and it changes where this
epic's code goes.** §13 lists `src/lib/auth.jsx` and `api/_lib/auth.js`
for WP 02.04, which assumes the application creates users. It does not:
`public.handle_new_user()` has been an `AFTER INSERT` trigger on
`auth.users` since migration 0001, creating the profile inside the auth
transaction. A client-side write can therefore never be transactional
with it, two of the three signup paths finish through a redirect, and the
client has no grants on the `identity` schema in any case. WP 02.04 put
the dual-write in the trigger. **02.06's read-switch should be planned
against the real mechanism rather than §13's description.** Raised in
[WP 02.04](wp-02.04-dual-write.md) finding 1.

**~~Staging has no profiles, so every backfill in this roadmap will be
"verified" against an empty database.~~ Closed 2026-08-13 — staging is
seeded.** The point stood: within minutes of real rows existing,
`VERIFY_IDENTITY_BACKFILL.sql` failed on a defect it had carried since WP
02.02 — three of its checks counted the whole table rather than the rows
they created, which is only correct on an empty database. Fixed, and the
original note follows.

**~~Original:~~** `public.profiles` holds zero
rows, although ENVIRONMENTS.md §4.4 calls for two seeded accounts and
Epic 00's completion record lists them as verified. WP 02.02 worked
around it by building a population inside a rolled-back transaction —
strictly better than counting zero against zero, and strictly weaker than
real seeded data. **Epic 03's workspace backfill is the risk register's
highest-severity item and would inherit the same gap.** Raised in
[WP 02.02](wp-02.02-identity-backfill.md) finding 2; fixing it is a
WP 00.06 obligation, not a package in this epic.

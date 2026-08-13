# Epic 02 — Identity Engine

**Status.** In progress — 1 of 7 packages
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
| 02.02 | Backfill identities from existing profiles | Medium | Not started |
| 02.03 | Add UUIDv7 generation | Low | Not started |
| 02.04 | Dual-write identity on signup and profile change | Medium | Not started |
| 02.05 | Reconcile identity against profiles | Medium | Not started |
| 02.06 | Switch profile reads to the identity engine | **High** | Not started |
| 02.07 | Implement erasure by redaction | **High** | Not started |

**02.06 is the only behaviour-changing package in this epic**, and
roadmap §3 makes 02.05's reconciliation a hard gate on it: a read-switch
without a passing reconciliation is not permitted.

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

**02.02 backfills before 02.03 provides UUIDv7 generation.** The
person reference is application-generated (§3) and `0025` deliberately
gives it no database default, so the backfill in 02.02 has no generator
to call. Either 02.02 generates v7 values in SQL, or 02.03 moves ahead of
it. **Not decided here** — raised in
[WP 02.01](wp-02.01-identity-table.md) finding 2 for 02.02's session.

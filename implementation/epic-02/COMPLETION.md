# Epic 02 — Completion Record

**Epic.** 02 — Identity Engine
**Started.** 2026-08-13
**Completed.** 2026-08-13
**Work packages.** 7 of 7

---

## 1 · Gates

- [x] **1** Every work package finished — 7 of 7
- [x] **2** `npm run lint` passes
- [x] **3** `npm test` passes — **561 tests, 42 files**
- [x] **4** `npm run build` succeeds
- [ ] **5** CI green on the branch — **never observed** (no `gh` CLI
      here). The failure that blocked every branch was fixed and verified
      locally; no run has been seen
- [ ] **6** No known regressions — **no regression is known, and the
      manual verification list was not walked.** See §6
- [x] **7** Architecture preserved — no frozen document modified; two
      decisions recorded as ADRs, one of them accepted before its code
- [x] **8** Documentation updated (§4)
- [x] **9** Deviations recorded as ADRs — 0022, 0023
- [x] **10** Deployed to staging and verified — migrations `0025`–`0029`;
      twelve verification scripts pass

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Every existing user has an identity row with a person reference | **Yes** | `RECONCILE_IDENTITY.sql` check 1 over five real rows, including one created by a live signup |
| All existing auth flows work unchanged | **Yes, with a caveat** | No write path was touched; `VERIFY_IDENTITY_DUAL_WRITE.sql` proves signup still creates profile and contact rows, driving the real trigger. **A real signup through the running app succeeded end to end** (§7). The profile *display* surfaces were not walked in a browser |
| Erasing an identity leaves referencing rows intact | **Yes** | `VERIFY_IDENTITY_ERASURE.sql` check 3 — eleven row counts compared before and after, including `messages` and `conversations` |
| No durable table foreign-keys to identity | **Yes** | `VERIFY_IDENTITY.sql` check 2, across every schema rather than this epic's tables |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 02.01 | Create the identity table | Complete | No FK in either direction; erasure constraint checked field by field |
| 02.02 | Backfill identities from profiles | Complete | ADR-0022 written first |
| 02.03 | Add UUIDv7 generation | Complete | Monotonic; proven live (§7) |
| 02.04 | Dual-write on signup and profile change | Complete | Went in the trigger, not the client — the roadmap was wrong about the mechanism |
| 02.05 | Reconcile identity against profiles | Complete | Found the gate had nothing to stand on |
| 02.06 | Switch profile reads to the identity engine | Complete | ADR-0023 accepted first |
| 02.07 | Erasure by redaction | Complete | Wrote the first row into `platform.audit_records` |

## 4 · Documentation updated

- [x] `docs/MASTER_CONTEXT.md` — §2 milestone, §3 state, §4 health, §12 debt
- [x] `docs/architecture/ARCHITECTURE.md` — what is currently built
- [x] `CHANGELOG.md`
- [x] `docs/IMPLEMENTATION_ROADMAP.md` — epic status and what it carries
- [x] `docs/adr/README.md` — 0022, 0023
- [x] `docs/engineering/TESTING.md` — six diagnostics became twelve
- [x] `docs/operations/ENVIRONMENTS.md` — staging seeded; `.env.local`
      gap recorded
- [ ] Epic 03 work packages — **not decomposed.** §14 already contains
      twelve, written before Epic 01; §5 below is why they need re-reading

## 5 · What actually happened

**Deviations from plan.** The roadmap's file list was wrong for **five of
the seven packages**, always the same way and always for the same reason.

| WP | §13 says | Reality |
|---|---|---|
| 02.02 | — | Numbers off by two; Epic 01 needed two migrations §12 did not list |
| 02.04 | `src/lib/auth.jsx`, `api/_lib/auth.js` | The application does not create users; a trigger does |
| 02.05 | `scripts/reconcile/identity.js` | A Node script cannot read the `identity` schema |
| 02.06 | `src/lib/auth.jsx`, `src/profile/*` | Needed a migration and an accepted ADR |
| 02.07 | `api/_lib/identity.js` | Would wrap a function no role can call |

**The roadmap was written before Epic 01 decided that application code
does not reach the new schemas.** Its file lists have not caught up, and
Epic 03's twelve packages in §14 were written at the same time. They
should be re-read against that before anyone starts.

**ADRs written.** Two.

| ADR | Decision | What forced it |
|---|---|---|
| 0022 | Backfilled identifiers are UUIDv7 minted in SQL from the row's own creation time | A backfill has no application in it, and 02.03's JavaScript generator cannot supply a SQL migration however it is sequenced |
| 0023 | Cross-user profile reads resolve display information; they do not read the identity row | **Accepted before its code was written.** A straight read switch could not hold identical permissions and identical UI at once |

**Surprises.** Seven that changed the work.

1. **The application does not create users.** A trigger has, since
   migration `0001`, inside the auth transaction. No client-side write
   can be transactional with it.
2. **`identity.identities` cannot be read by a client without leaking
   contact details.** Migration `0001` split contacts out of `profiles`
   so RLS could gate them on a confirmed booking; the identity row merges
   both column groups, and there is no field-level security in this
   design. Measured, not argued — ADR-0023 carries the output.
3. **A migration cannot expose a schema to PostgREST.**
   `pgrst.db_schemas` is not set on the `authenticator` role, so exposed
   schemas are configured outside the database. This made ADR-0023's
   outcome *stricter* than the ADR planned for.
4. **Revoking `EXECUTE` from `PUBLIC` is not enough on Supabase.**
   Default privileges in `public` grant to `anon` by name. Two
   `SECURITY DEFINER` resolvers reading every person's row were callable
   anonymously until an explicit revoke was added.
5. **Deleting an auth user destroys both sides of every conversation.**
   `public.profiles` is the parent of nine cascading foreign keys and
   cascades from `auth.users` itself.
6. **Staging had no data**, so the reconciliation gating the read switch
   was comparing nothing and reporting success.
7. **Seeding staging immediately exposed a defect** in a diagnostic
   committed in 02.02, which had counted the whole table rather than the
   rows it created — correct only on an empty database.

**Deferred.** Three, each with a stated home.

- **Step 6 is unreachable in this epic** (ADR-0023). `public.profiles`
  and `public.profile_contacts` both survive; retiring them needs an
  engine that can evaluate "is there a confirmed booking between these
  two parties", which is what their three policies encode.
- **`public.pro_profiles` is not redacted by erasure.** For a `flexi`
  sole trader, `business_name` is frequently the person's own name.
  Whether that is personal data or a public trading name is a legal
  question, and the erasure-request epic needs an answer before erasure
  is offered.
- **No erasure request flow.** The function is executable by nobody, as
  §13 intended.

## 6 · Regressions and known issues

**No regression is known.** WP 02.06 is the only package that changed
behaviour, and it was verified value-by-value: `VERIFY_IDENTITY_READ_PATH.sql`
check 1 compares both sources for **every person**, not a sample, and the
merged profile's key set is asserted equal to the profile row's.

**What was not done: the manual verification list was not walked.**
`docs/engineering/TESTING.md` §5 lists the profile, quote-card and
onboarding flows; none was opened in a browser against a database holding
this schema. `.env.local` points at production and staging's anon key was
not available to this session. **That is the one honest gap in this
epic**, and it sits under the package with the largest blast radius.

| Issue | Severity | Tracked where |
|---|---|---|
| Read switch never seen rendering | **High** | This section; `TESTING.md` §5 flows |
| ADR-0020, 0021, 0022 still `Proposed` | **High** while their tables are empty | `MASTER_CONTEXT.md` §12 |
| `pro_profiles` not redacted by erasure | **High** before erasure is offered | WP 02.07 finding 3 |
| `auth.users` deletion cascades into nine tables | **High** | WP 02.07 finding 2; violates §5 and §11.4, predates this epic |
| A real personal email now sits in staging | Medium | §7 — the maintainer's own, from a live signup; `ENVIRONMENTS.md` §6 says staging holds no real personal data |
| Audit write path otherwise unallocated | Medium | Epic 01; partially closed by 02.07 |
| Production has none of `0018`–`0029`; ledger unreconciled | **High** before any deploy | `ENVIRONMENTS.md` §9 |
| CI never observed running | Medium | Gate 5; unchanged from Epic 00 |

## 7 · Verification performed

**Automated.** 497 → **561 tests**, 34 → **42 files**. Every package ran
lint, type-check, test and build before commit.

**On staging.** Migrations `0025`–`0029` applied after dry runs. **Twelve
scripts pass together** — eleven `VERIFY_*` and the reconciliation.

**By probe, not assumption.** Every gate in this epic was proven able to
fail before it was trusted — thirty-one probes across seven packages,
each reverted. Four found real defects:

- A read path that would have put **erased people's names back on
  screen**.
- Two `SECURITY DEFINER` resolvers **callable by anonymous visitors**.
- A merge that dropped `onboarding_role_selected` and
  `home_tour_completed_at`, which **no test caught** and which would have
  made the onboarding screen reappear for every existing user forever.
- A diagnostic of my own whose privacy check **passed while checking
  nothing**, because it read a `returns table` function's columns off a
  composite type.

**Live, and unplanned — the strongest evidence in the epic.** A real
signup went through the running application against staging during this
work:

| Property | Result |
|---|---|
| The client supplied a `person_ref` | yes |
| The trigger used it verbatim rather than minting | yes |
| It is a valid UUIDv7 | yes |
| `created_at` preserved onto the identity | yes |

That is `src/lib/ids.ts` → `auth.jsx` signup metadata →
`handle_new_user()` → an identity row in the same transaction, exercised
by a person rather than a test. It is proof for WP 02.03 and 02.04 that
no test in this repository could have given.

**Not performed.** No browser walk of the profile surfaces. No CI run
observed. Nothing applied to production.

## 8 · Sign-off

- [x] Eight of ten gates met
- [x] Repository releasable
- [ ] **Next epic ready to start — with two things to settle first.**
      Epic 03 is the roadmap's highest-risk item, and it inherits both of
      this epic's open questions: the three `Proposed` ADRs should be
      accepted before anything writes to the tables they govern, and
      §14's twelve work packages were written under an assumption about
      where code lives that this epic disproved five times.

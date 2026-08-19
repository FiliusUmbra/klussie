# Production migration runbook — `0018`–`0029`

**This document owns:** the one-time procedure for bringing Epics 01 and
02 to production. It does not own environment configuration
([`ENVIRONMENTS.md`](ENVIRONMENTS.md)), backups
([`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md)), or what the migrations
do (their own headers, and the epic completion records).

**Status: not started.** Production has none of `0018`–`0029` and an
unreconciled migration ledger.

---

## 1 · What is already true

**The application code is deployed.** `main` was pushed on 2026-08-13,
and Vercel builds from it. Production is therefore *already running* the
Epic 02 read paths against a database that has none of the schema they
read.

**That is survivable by design and was tested for.** Both read paths fall
back when the resolvers are absent:

| Path | Without the migrations | Console |
|---|---|---|
| `loadProfile` | Returns the `public.profiles` row, exactly as before | `identity read unavailable, falling back to profiles: function does not exist` |
| `fetchPublicProInfo` | Uses the embedded `profiles(full_name, avatar_url)` join, exactly as before | `identity display resolution unavailable, falling back to profiles` |

So a user sees no difference today, and an engineer sees a warning in the
console. **This is the intended degraded state, not an incident** — but
it is also not the finished state, and the warnings will appear on every
page load until this runbook is executed.

**Nothing else in Epics 01–02 is reachable from application code**, so
nothing else is affected: no engine runs, no consumer runs, `emit_event`
has no callers, and `public.domain_events` is still the product's live
event path.

## 2 · Preconditions

- [ ] **A verified backup exists**, taken today.
      [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) §5. Klussie is on the
      Supabase Free plan with **no automatic backups**
      ([ADR-0017](../adr/0017-free-tier-disaster-recovery-strategy.md)),
      so this gate is the only thing that makes step 5 recoverable.
- [ ] **The three `Proposed` ADRs are accepted or revised** —
      [0020](../adr/0020-events-partitioning-parameters.md),
      [0021](../adr/0021-one-audit-table-with-nullable-workspace.md),
      [0022](../adr/0022-backfilled-identifiers-are-uuidv7-minted-in-sql.md).
      §6 explains why this is a precondition and not a formality.
- [ ] **A quiet window.** Step 5 replaces the signup trigger. A signup
      landing mid-statement is safe — it is one transaction — but a
      failure there is a failure of signup, so do it when a failed
      signup is noticed rather than discovered.
- [ ] `psql` and the Supabase CLI available
      ([`POSTGRES_TOOLS_WINDOWS.md`](POSTGRES_TOOLS_WINDOWS.md)).

## 3 · Reconcile the ledger — required, and it runs no SQL

Production's seventeen migrations were applied by hand, so it has **no**
`supabase_migrations.schema_migrations` table. The CLI reads that as
"nothing applied" and would try to run all seventeen against a populated
database.

```bash
npx supabase migration list --project-ref <production-ref>
npx supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 0016 0017 --project-ref <production-ref>
npx supabase migration list --project-ref <production-ref>
```

`migration repair` writes ledger rows only. **Confirm the first `list`
shows nothing applied before repairing** — repairing a ledger that
already has rows is how you skip a migration that never ran.

## 4 · Dry run

```bash
npx supabase db push --linked --dry-run
```

Expect exactly twelve: `0018` through `0029`. **Anything else means the
repair in §3 was wrong — stop.**

## 5 · Apply

```bash
npx supabase db push --linked
```

The three that carry risk, in order of how much:

| Migration | Risk | Why |
|---|---|---|
| `0027_identity_dual_write` | **Highest** | Replaces `handle_new_user()`, the live signup trigger. If it is wrong, **signups fail**. It is `create or replace` inside the migration's transaction, so a failure rolls back to the previous definition |
| `0026_identity_backfill` | **Irreversible** | Mints a permanent person reference for every real user. Re-running is a no-op, but a rollback followed by a re-run produces *different* references — see §8 |
| `0028`, `0029` | Low | Add functions nothing calls yet |

Everything else is additive and unused.

## 6 · Verify — the diagnostics, then the gate

```bash
for f in GRANTS EXTENSIONS EVENTS AUDIT EMISSION CONSUMERS IDENTITY IDENTITY_BACKFILL IDENTITY_DUAL_WRITE IDENTITY_READ_PATH IDENTITY_ERASURE; do
  psql -w -h <pooler-host> -p 5432 -U postgres.<production-ref> -d postgres -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_$f.sql || echo "FAILED: $f"
done
```

**Two of them write and roll back**, which is safe but worth knowing
before running them against production: `VERIFY_IDENTITY_DUAL_WRITE`
inserts into `auth.users`, and `VERIFY_IDENTITY_ERASURE` erases a real
person — both inside transactions they roll back. `VERIFY_EMISSION`
**commits** three events and then deletes them; it is the one file in the
set that is not purely transactional, and its header says so.

Then the gate:

```bash
psql -w -h <pooler-host> -p 5432 -U postgres.<production-ref> -d postgres -v ON_ERROR_STOP=1 -f supabase/diagnostics/RECONCILE_IDENTITY.sql
```

**This is the moment the read switch becomes real for users.** Until it
passes, the deployed code has been falling back to `public.profiles`;
once the schema exists and the reconciliation passes, every profile read
comes from the identity engine.

A non-zero exit means the two sources disagree. The fix is named in the
failure — usually re-running `0026`, which is idempotent — and the read
switch is not permitted until it passes
(`IMPLEMENTATION_ROADMAP.md` §8).

## 7 · Confirm the user-visible outcome

The console warnings from §1 should stop. Then walk the flows in
[`../engineering/TESTING.md`](../engineering/TESTING.md) §5 that touch a
profile:

- [ ] F1 — profile shows the signed-in user's details
- [ ] F2 — editing name and city persists
- [ ] F3 — avatar upload replaces the image
- [ ] A5 — role selection appears exactly once *(the merge keeps
      `onboarding_role_selected`; if this reappears for an existing user,
      stop)*
- [ ] C2 — first-login tour appears once *(same reason)*
- [ ] C16 — incoming quotes list the professional **by name**, not as
      "Pro"
- [ ] P7 — pro profile shows rating, badge and trust signals

**This is the verification Epic 02 could not perform**, because
`.env.local` pointed at production and staging's anon key was
unavailable. It is the epic's one open gap, and this is where it closes.

## 8 · Rollback

**Steps 1–4 of the migration pattern roll back by dropping what they
added.** The tables are empty of anything the application wrote, and no
application role can reach them.

```sql
drop function identity.erase_person(uuid, platform.actor_type, text, text);
drop function public.resolve_identity_display(uuid[]);
drop function public.current_identity();
-- 0027: restore handle_new_user() from 0001, drop on_profile_updated
-- then drop the identity and platform objects if unwinding fully
```

**The backfill is the exception, and it is not symmetric.** Deleting the
backfilled rows and re-running mints **different** person references.
Nothing stores one yet — no durable record references identity, by
design — so this is currently harmless. **It stops being harmless the
first time anything persists a person reference**, which is Epic 03.

**The application needs no rollback.** Its fallbacks mean removing the
functions returns it to the §1 state: correct, with console warnings.

## 9 · What this does not do

- **It does not retire `public.profiles` or `public.profile_contacts`.**
  Step 6 is unreachable while their policies encode a confirmed-booking
  relationship no engine can evaluate
  ([ADR-0023](../adr/0023-identity-display-resolution-versus-row-visibility.md)).
- **It does not expose erasure to anyone.** `erase_person` remains
  executable by no role.
- **It does not start any consumer or emit any event.** Epic 01's
  substrate stays unused; `public.domain_events` remains the live path.

---

Version 1.0 — 2026-08-13 (written after Epic 02 closed, before any
production application)

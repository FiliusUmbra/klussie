# Production migration runbook — `0018`–`0187`

**This document owns:** the real, current-scope procedure for bringing
production from its 17 hand-applied migrations to the same 187 that
staging and `main` are at today. It supersedes
[`../docs/operations/PRODUCTION_MIGRATION_0018_0029.md`](../docs/operations/PRODUCTION_MIGRATION_0018_0029.md)
(v1.0, 2026-08-13, "not started," scoped to `0018`–`0029` only) — that
document is retained as history, not deleted, matching this repository's
own convention for superseded documents. It does not own backup/restore
mechanics ([`DISASTER_RECOVERY.md`](../docs/operations/DISASTER_RECOVERY.md),
substantially corrected the same day this document was written) or what
any individual migration does (its own header).

**Status: planning only. Nothing in this document has been executed
against production.** Written 2026-08-28, in response to the founder's
own instruction to resume this track now that the beta candidate has
reached its release gate
([`BETA_READINESS_REPORT_2026-08-28.md`](BETA_READINESS_REPORT_2026-08-28.md)).
The non-negotiable safeguards governing this whole effort (no linking
the Supabase CLI to production, no production migration, no production
Vercel deploy or config change) remain in force — resuming this track
means resuming the *planning*, not crossing those lines without a
separate, explicit go-ahead for each one.

---

## 1 · What changed since v1.0, and why this document exists

The original runbook covered 12 migrations (`0018`–`0029`) — Epics 01
and 02 only, written the day Epic 02 closed. **170 migrations now exist
that document never anticipated** — every engine from Epic 03 onward,
the entire marketplace/conversation/trust-safety/disclosure-consent
activation programme, all of it. Nothing suggests production has
received anything beyond the original 17 hand-applied migrations since
— no later production-migration record exists anywhere in this
repository, and `../docs/operations/PRODUCTION_MIGRATION_0018_0029.md`
itself still reads "Status: not started."

**A real drill run against staging the same day this document was
written** (`DISASTER_RECOVERY.md` §8's own drill record) found three
genuine, previously-unknown defects in the disaster-recovery procedure
this whole effort depends on: the documented backup never covered most
of the platform's real schemas, it never captured role `GRANT`s at all,
and it excluded the `api` schema entirely (missing that dropping the
schemas it depends on cascade-drops its own delegate functions). All
three are now fixed in `DISASTER_RECOVERY.md` itself. **This document
would have been reckless to write before that drill** — it would have
inherited every one of those three blind spots as unstated assumptions.

---

## 2 · The real risk profile — clearer after the drill, not scarier

**The drill's own failures do not predict production's failures.**
Staging's drill hit "cannot change return type of existing function"
conflicts because it replayed old migration versions *against a
database already at the final, `0187` state* — an artifact of restoring
in place, not of the migrations themselves. **Production has none of
`0018`–`0187` at all.** Replaying them in order against a database that
has genuinely never seen them is the same shape of operation that
building staging from empty already proved works cleanly (`ENVIRONMENTS.md`
§1's own record: all 187 replay from empty, zero failures) — that risk
is *lower* than the drill's own, not higher.

**The real risk is different, and specific to production: the
backfill migrations, running against real production data for the
first time ever.** Every migration that moves existing rows into a new
shape — `0033`/`0034`/`0035` (workspace backfill), `0040` (property),
`0052` (assets), `0060` (documents), `0080` (capability grants), `0089`
(marketplace), `0181` (reports → safety.cases) — has only ever run
against staging's own handful of synthetic test rows, or, for `0181`
specifically, a disposable local rehearsal against a real anonymized
production copy (`97f32b8`'s own commit message). **None has ever run
against production's actual live rows, in place, for real.** That is
where a real, unpredicted failure is most likely to live — not in the
schema/function DDL, which the whole migration chain has already proven
solid dozens of times over.

---

## 3 · Preconditions — none met yet

- [ ] **A verified production backup, taken today, following the
      *corrected* procedure** (`DISASTER_RECOVERY.md` §5, corrected
      2026-08-28 — the full schema list, `api` included, grants
      understood to need separate handling via migration replay, not
      `pg_dump`). The original v1.0 runbook's own precondition; still
      unmet, and now backed by a procedure actually proven to catch its
      own gaps rather than one that had never been drilled.
- [ ] **A restore drill against the *corrected* procedure, completed
      (not just started).** The 2026-08-28 staging drill proved the
      schema+data restore path and found (and partly fixed) the grants
      and `api`-schema gaps; it was deliberately stopped before the
      `api` schema fix's own last step, a founder decision made
      mid-drill (`DISASTER_RECOVERY.md` §8's own drill record has the
      exact resume point). Finishing that drill — including a real
      functional smoke test afterward, not just the data checks already
      done — is a precondition for trusting the backup this whole plan
      depends on, not a nice-to-have.
- [ ] **A real row-count and spot-check inventory of production's
      current 17-migration data**, taken before anything else — this
      document does not yet know how many real customers, requests, or
      quotes exist in production today. The backfill migrations'
      correctness depends on that shape, and nobody has looked at it
      this session.
- [ ] **A decision on the three `Proposed` ADRs** the original runbook
      already named (`0020`, `0021`, `0022`) — still open; nothing in
      this session's own work touched them.
- [ ] **A quiet window** — unchanged reasoning from the original
      runbook, now covering 170 migrations' worth of surface instead of
      12.
- [ ] `psql`/`pg_dump`/`pg_restore` and the Supabase CLI available and
      verified (`POSTGRES_TOOLS_WINDOWS.md` — already done, 2026-08-12,
      still current as of this writing).

**None of the above are met as of this document's writing.** This
document stops at planning, per the founder's own instruction for this
session.

---

## 4 · The real shape of the work — three phases, not one `db push`

### Phase A — Bring production's schema and roles to the `0187` state

Reconcile the ledger exactly as v1.0's own §3 describes (production has
no `supabase_migrations` table — seventeen migrations were applied by
hand), then `supabase db push --linked --dry-run` should show exactly
`0018` through `0187`, 170 migrations, and nothing else. **If it shows
anything else, stop — the ledger reconciliation was wrong**, the same
gate v1.0 already named for its own smaller scope.

This phase is schema + roles + grants only. No customer-facing behavior
changes yet — every new engine stays unused by any client code until
Phase C, matching every prior epic's own "built, not yet wired" pattern
this whole codebase has followed since Epic 01.

### Phase B — The backfills, one at a time, verified after each

**Not one `db push` run.** Given §2's own real risk (backfills against
real data, untested), each backfill migration in the `0018`–`0187` range
should be isolated and its own real effect on production's actual data
checked before moving to the next, not trusted as a block alongside 20
other migrations that carry no data risk at all. A first pass at
identifying which of the 170 are backfills (not exhaustive — built from
migration names, cross-check against each file's own header before
relying on this list):

| Migration | Backfills |
|---|---|
| `0026` | Identity — mints a person reference for every real user |
| `0033`/`0034`/`0035` | Personal/professional/generic workspace backfill |
| `0040` | Property |
| `0052` | Assets |
| `0060` | Documents |
| `0080` | Capability grants |
| `0089` | Marketplace (`service_requests`/`quotes` → `work.*`) |
| `0181` | `public.reports` → `safety.cases` |
| `0184` | The one real active legacy engagement → the disclosure-consent flow |

**`0026` and `0089` carry the most real risk** — identity touches every
real user account without exception, and marketplace is the single
highest-volume legacy table set this platform has. Both deserve their
own isolated verification step, not just inclusion in a batch push.

### Phase C — The client cutover

**Already built and already live on staging** — every client-side read/
write path this whole 2026-08-28 session (and the sessions before it)
touched already targets the new schema. Phase C for production is
**a code deploy, not a migration** — once Phase A/B are verified,
whatever is already on `main` becomes correct the moment Vercel
redeploys production against the migrated database. This is the one
step of the whole plan that is genuinely simple, *because* the client
work is already done and already proven live.

---

## 5 · What this document deliberately does not decide

- **Exact backfill verification method per migration** — real
  row-count/spot-check queries against production's actual data, which
  this document has not seen. A future session with real backup-taken,
  drill-completed access writes these against the real shape of
  production's data, not invented here against an unknown.
- **Whether staging's still-open restore drill (§3) gets finished before
  or in parallel with Phase A's own dry run.** Both are real
  preconditions; their relative order is a scheduling call, not an
  engineering one.
- **The two accepted beta-readiness limitations** (SMTP, OAuth —
  `BETA_READINESS_REPORT_2026-08-28.md` §2) are unrelated to this
  migration and do not block it or get resolved by it.

---

Version 1.0 — 2026-08-28, written the same day as the staging restore
drill this document's own §2 and §3 depend on.

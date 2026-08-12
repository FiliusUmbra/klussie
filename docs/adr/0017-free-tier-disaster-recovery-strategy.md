# ADR-0017: A self-managed disaster recovery strategy on the Free plan

**Status:** Accepted
**Date:** 2026-08-12
**Supersedes:** [ADR-0016](0016-operate-production-on-free-plan-without-automatic-backups.md)
**Related:** `../operations/DISASTER_RECOVERY.md`,
`../operations/POSTGRES_TOOLS_WINDOWS.md`, `../IMPLEMENTATION_ROADMAP.md`
Epic 00 WP 00.07

## Context

ADR-0016 accepted operating production without automatic backups, with a
removal trigger expecting a plan upgrade before Epic 03. **The CTO has
decided that Klussie remains on the Supabase Free plan until it has
paying customers.** Upgrading is therefore not the answer, and the
exposure ADR-0016 recorded cannot simply be carried forward — twenty-six
epics of migration against an unrecoverable database is not a risk that
becomes acceptable by being written down twice.

The question changes from *"when do we upgrade?"* to *"what does a real
backup strategy look like with no plan entitlement, no Docker, and no
budget?"*

**Verified facts this decision rests on**, all established by running the
tools rather than inferred:

- Production is Free plan: no automatic backups, PITR disabled,
  `backups list` returns empty.
- `supabase db dump` **requires Docker** even for a remote database.
  Docker is not installed and is not wanted.
- The **session-mode pooler** at `aws-1-eu-west-1.pooler.supabase.com:5432`
  is reachable over IPv4 and supports `pg_dump`. Username format is
  `postgres.<project-ref>`.
- `supabase storage ls|cp` talks to the **Storage API, not the database**,
  works **without Docker**, and supports `--recursive`. Four buckets
  exist: `avatars`, `portfolio`, `request-photos`, `item-photos`.
- **Klussie has no Supabase Edge Functions.** `api/*.js` are Vercel
  serverless functions and are tracked in git.
- **`supabase db dump` excludes the `auth` and `storage` schemas.** It is
  built to capture *your* schema for migrations, not to recover a
  database. A dump taken with its defaults **contains no user accounts**.

Alternatives considered:

1. **Upgrade to Pro.** Ruled out by the CTO. Not revisited here.
2. **Install Docker to enable `supabase db dump`.** Heavy dependency,
   and it would still produce a dump missing `auth` — the wrong tool for
   recovery regardless of how it is run.
3. **Native PostgreSQL client tools over the session pooler.** No
   subscription, no container runtime, full control over which schemas
   are captured, and the standard `pg_dump`/`pg_restore`/`psql` toolchain
   any engineer already knows.
4. **Do nothing and accept the risk** — ADR-0016's position, now
   rejected as untenable for the duration of the roadmap.

## Decision

**Adopt a self-managed backup and restore strategy built on native
PostgreSQL client tools and the Supabase Storage CLI.** Option 3.

The full procedure is `../operations/DISASTER_RECOVERY.md`; the
installation guide is `../operations/POSTGRES_TOOLS_WINDOWS.md`. The
decisions that belong in an ADR rather than a runbook:

**Native `pg_dump` over the session-mode pooler, not `supabase db dump`.**
Two independent reasons: it needs no Docker, and — more importantly — it
lets us choose the schemas. Supabase's wrapper excludes `auth`, so its
output can never be a recovery artifact.

**`auth` is backed up explicitly.** User accounts are the one thing that
cannot be reconstructed from the repository, from Vercel, or from a
customer. Losing `auth.users` means every account is gone even if every
row of `public` survives.

**Backups are taken at four cadences**, of which one is a hard gate:
**before every production migration**, then daily, weekly, and a monthly
archive. The pre-migration backup is the one that matters most for this
roadmap, because it converts each schema epic from an irreversible act
into a recoverable one.

**RPO 24 hours, RTO 4 hours**, pre-revenue. Both tighten at first
revenue. Stated so that a future incident is measured against a number
somebody chose, rather than against whatever happened.

**At least one copy leaves the machine that made it.** A dump beside the
working tree protects against far less than it appears to.

**Free and open-source tooling only.** PostgreSQL client tools and the
Supabase CLI. No paid service, no new subscription.

## Consequences

**Makes easier**

- Klussie has a real, testable recovery path for the first time.
- Epic 03's production backfill becomes recoverable rather than
  irreversible — the specific risk ADR-0016 could only name.
- `pg_dump`/`pg_restore` are standard: any engineer can execute the
  restore from the runbook without knowing Supabase's internals.
- Storage objects and user accounts are covered, neither of which
  `supabase db dump` would have captured.

**Makes harder**

- **The strategy depends on somebody running it.** Automatic backups fail
  safe; manual ones fail silent. The schedule is only real if it is
  performed, and nothing in the platform will complain if it is not.
- A tooling installation is now a prerequisite for operating Klussie
  safely. That is documented, but it is a step a new engineer must
  complete before they can deploy a migration.
- Backups contain real personal data. They must be stored, transported
  and destroyed accordingly — a handling obligation that did not exist
  when there were no backups at all.
- Restoring `auth` into a *new* project is nuanced. The runbook covers
  it, and the drill exists to prove it rather than assume it.

**Rules out**

- Treating `supabase db dump` output as a backup.
- Any production migration without a preceding verified dump, once the
  tooling is installed.
- Storing the only copy of a backup on the machine that produced it.
- Claiming a recovery objective until a drill has measured one.

**What this does not fix.** RPO is 24 hours, so up to a day of customer
activity is still lost in a disaster. That is a deliberate early-stage
trade, not an oversight, and it is the first thing to tighten when
revenue arrives.

# ADR-0016: Operate production on the Free plan, without automatic backups

**Status:** Superseded by [ADR-0017](0017-free-tier-disaster-recovery-strategy.md)
**Date:** 2026-08-12
**Related:** `../operations/DISASTER_RECOVERY.md`,
`../operations/ENVIRONMENTS.md`, `../IMPLEMENTATION_ROADMAP.md` Epic 00
WP 00.07, `../architecture/DATABASE_ARCHITECTURE.md` §4

## Context

WP 00.07 set out to verify that Klussie's backups can be restored. The
investigation found there is nothing to restore.

**Verified read-only against the production project, Supabase CLI
v2.114.0, 2026-08-12:**

```
supabase backups list --project-ref <production-ref>
→ { region: "eu-west-1", walg_enabled: true,
    pitr_enabled: false, backups: [], physical_backup_data: {} }
```

The plan was subsequently confirmed by the CTO as **Free**.

Supabase's published policy is that Free Plan projects receive **no
automatic backups** and are directed to export their own data with
`supabase db dump`; Pro and above receive daily backups with seven days
of retention, and Point-in-Time Recovery is a paid add-on above that.

**The recommended fallback does not currently work either.** Two further
facts, both verified rather than assumed:

- `supabase db dump` **requires Docker**, even when dumping a remote
  database — it runs `pg_dump` inside a container. Docker is not
  installed on the development machine, and the command fails with
  `LegacyDockerRunError`.
- Native `pg_dump` and `psql` are not installed either, so there is no
  Docker-free path to a logical dump today.

**The honest summary: Klussie currently has no working backup mechanism
of any kind.** Not on the platform, and not locally.

This matters more than it would for most projects at this stage, because
`IMPLEMENTATION_ROADMAP.md` commits to migrating this database across
twenty-six epics — including Epic 03, which backfills a workspace onto
every existing row. Those migrations follow a six-step pattern whose
rollback guarantees assume the data still exists.

**Alternatives considered:**

1. **Upgrade to Pro.** Daily backups, seven-day retention, PITR available
   as an add-on. Costs money per project per month, and staging would
   likely want it too.
2. **Install Docker and schedule `supabase db dump`.** Free in licence
   terms, and gives an off-Supabase copy — the only kind that survives an
   account-level problem. Costs a tooling dependency and someone to own
   the schedule and verify the output.
3. **Install native Postgres client tools and schedule `pg_dump`.** Same
   benefit, lighter dependency than Docker, more setup per machine.
4. **Accept the exposure for now**, with the decision recorded and
   revisited at a defined trigger.

## Decision

**Operate production on the Free plan without automatic backups, for
now.** Option 4.

This is a deliberate, informed acceptance of risk rather than an
oversight. It is recorded here because the alternative — leaving it
implicit — means a future contributor finds an unbacked production
database and cannot tell whether anyone knew.

**Removal trigger.** This decision is revisited, and expected to be
reversed, at whichever comes first:

- **Before the first migration of Epic 03 runs against production.**
  That epic backfills a workspace onto every existing row; it is the
  first change in the roadmap whose failure mode is unrecoverable data
  rather than a revertable read path.
- **Before Klussie holds data whose loss would end the product** —
  paying customers, completed transactions with financial records, or
  service records that constitute someone's property history.
- **On any incident** that demonstrates the exposure concretely.

Until then, `DISASTER_RECOVERY.md` §6 stays empty and Klussie's backups
remain unproven, which is accurate rather than alarmist.

## Consequences

**Makes easier**

- No cost while the product has no paying users and low data volume.
- No tooling dependency added to the development environment at a moment
  when Epic 00 is deliberately minimising what it changes.
- The decision is written down, so the next person to look does not have
  to work out whether it was intentional.

**Makes harder**

- **A database loss is currently unrecoverable.** Not "slow to recover" —
  unrecoverable. Every request, quote, message, review and household item
  in production exists in exactly one place.
- The roadmap's migration work carries a risk it would not otherwise
  carry. The six-step pattern's rollback story assumes reversible steps;
  it does not protect against a dropped or corrupted table.
- `DATABASE_ARCHITECTURE.md` §4 requires verified restore for
  Historical-class data. That requirement is knowingly unmet.
- WP 00.07 cannot meet its acceptance criteria, since a restore drill
  needs something to restore. It stays blocked rather than being
  redefined into something it can pass.

**Rules out**

- Claiming any recovery-time objective. There is none.
- Treating Epic 01 onward as protected by a rollback path in the event of
  data loss, as opposed to logical error.
- Any statement to users, present or future, that their data is backed
  up.

**What would change the picture cheaply.** Option 2 or 3 — a scheduled
logical dump — costs no subscription and produces the only copy that
survives an account-level problem. It needs a tooling decision and an
owner. It is not part of this ADR because the CTO's instruction was to
record the Free-plan decision and proceed, and adding tooling is a
separate decision that deserves its own consideration rather than being
smuggled in here.

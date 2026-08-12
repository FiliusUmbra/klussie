# Klussie — Disaster Recovery

**This document owns:** what is backed up, how, how often, how to restore
it, and the record of drills performed. It is written so that an engineer
who has never seen this system can recover it using only this page.

Prerequisite: [`POSTGRES_TOOLS_WINDOWS.md`](POSTGRES_TOOLS_WINDOWS.md).
Decision and rationale: [ADR-0017](../adr/0017-free-tier-disaster-recovery-strategy.md).

> **A restore that has never been tested is a hypothesis.** §8 is empty.
> Until it has a row, Klussie's recovery is unproven.

---

## 1 · The situation this strategy is built for

Klussie runs on the **Supabase Free plan** and stays there until it has
paying customers ([ADR-0017](../adr/0017-free-tier-disaster-recovery-strategy.md)).
That means:

| Platform mechanism | Available? |
|---|---|
| Automatic daily backups | **No** — Pro and above only |
| Point-in-Time Recovery | **No** — paid add-on |
| Downloadable platform backups | **No** — not offered on Free |

**Everything below is self-managed.** Nothing recovers Klussie unless
somebody ran a backup first.

**Two things Supabase's own tooling will not do for you**, both verified:

- **`supabase db dump` requires Docker**, even against a remote database.
- **`supabase db dump` excludes the `auth` and `storage` schemas.** It
  exists to capture your schema for migrations, not to recover a
  database. **A dump taken with its defaults contains no user accounts.**

This strategy therefore uses native `pg_dump` over the session-mode
pooler, which needs no Docker and lets us choose exactly which schemas
are captured.

## 2 · What must be backed up

| Asset | Lives in | Recoverable from git? | Mechanism |
|---|---|:---:|---|
| **Application schema** | Postgres `public` | Partly — migrations exist, drift does not | `pg_dump --schema-only` |
| **Application data** | Postgres `public` | **No** | `pg_dump --data-only` |
| **User accounts** | Postgres `auth` | **No** | `pg_dump -n auth` |
| **Storage metadata** | Postgres `storage` | **No** | `pg_dump -n storage` |
| **Storage objects** | Supabase Storage (S3) | **No** | `supabase storage cp -r` |
| **Migrations** | `supabase/migrations/` | **Yes** | git |
| **Serverless functions** | `api/*.js` | **Yes** | git — Vercel, not Supabase |
| **Application config** | repo | **Yes** | git |
| **Environment variables** | `.env.local`, Vercel project settings | **No** — gitignored | §6, manual |

**Three of these are the whole job**, because everything else either
lives in git or can be rebuilt from it: **`public` data**, **`auth`
users**, and **storage objects**.

**Klussie has no Supabase Edge Functions.** The `api/*.js` endpoints are
Vercel serverless functions, tracked in git, redeployed from the
repository. Nothing to back up separately — but see §6 for their
environment variables, which are *not* in git.

## 3 · Objectives

Chosen for a pre-revenue product, and deliberately modest. Both tighten
at first revenue.

| Objective | Target | Meaning |
|---|---|---|
| **RPO** — Recovery Point Objective | **24 hours** | Up to one day of activity may be lost |
| **RPO around migrations** | **~0** | A pre-migration backup precedes every schema change |
| **RTO** — Recovery Time Objective | **4 hours** | From decision-to-restore to serving customers |

**Why 24 hours is acceptable now**, and will not be later: Klussie has no
paying customers and low daily volume, so a day's loss is recoverable by
asking a handful of people to resubmit. At the first paid transaction
that stops being true, because a lost payment is not something a customer
should be asked to repeat.

**RTO is a target, not a measurement.** It becomes real when §8 has a
row.

## 4 · Schedule

| Cadence | Scope | Retention | Trigger |
|---|---|---|---|
| **Pre-migration** | Full — schema, data, auth | Until the migration is confirmed good, minimum 7 days | **Mandatory gate** before any production migration |
| **Daily** | Data + auth | 7 days | End of day, if anything changed |
| **Weekly** | Full + storage objects | 4 weeks | Monday |
| **Monthly archive** | Full + storage objects | **12 months**, off-site | 1st of the month |

**The pre-migration backup is the one that matters most for the
roadmap.** `IMPLEMENTATION_ROADMAP.md` commits to twenty-six epics of
migration against this database. That gate is what converts each schema
epic from an irreversible act into a recoverable one, and it is
referenced from `ENGINEERING.md` §8 for exactly that reason.

**At least one copy leaves the machine that made it.** A dump sitting
beside the working tree survives neither a disk failure nor a stolen
laptop. Monthly archives in particular belong somewhere else — a
different cloud account, or an external drive kept elsewhere.

## 5 · Taking a backup

Set the connection once per session. Details and the password source are
in [`POSTGRES_TOOLS_WINDOWS.md`](POSTGRES_TOOLS_WINDOWS.md) §5.

```bash
export PGHOST=aws-1-eu-west-1.pooler.supabase.com
export PGPORT=5432                 # session mode — 6543 will not work
export PGDATABASE=postgres
export PGUSER=postgres.<project-ref>
export PGPASSWORD='<database-password>'

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/path/outside/the/repo/klussie-backup-$STAMP
mkdir -p "$DEST"
```

> **Never write a dump inside the working tree.** `.gitignore` does not
> cover `*.sql`, so it would be committed — publishing every customer
> record to the repository.

### 5.1 · Schema

```bash
pg_dump --schema-only --no-owner --no-privileges \
        -n public -n auth -n storage \
        -f "$DEST/schema.sql"
```

### 5.2 · Application data

```bash
pg_dump --data-only --no-owner --no-privileges \
        --column-inserts -n public \
        -f "$DEST/data-public.sql"
```

`--column-inserts` is slower and larger than COPY format, and is chosen
deliberately: the output is readable, diffable, and survives a partial
restore. At Klussie's current volume the cost is irrelevant; revisit when
it stops being.

### 5.3 · User accounts — the one nothing else covers

```bash
pg_dump --data-only --no-owner --no-privileges \
        --column-inserts \
        -t auth.users -t auth.identities \
        -f "$DEST/data-auth.sql"
```

**Without this file, a restore produces a working application that
nobody can log into.**

### 5.4 · Storage objects

No Docker; talks to the Storage API rather than the database:

```bash
for b in avatars portfolio request-photos item-photos; do
  npx supabase storage cp -r "ss:///$b" "$DEST/storage/$b" \
      --project-ref <project-ref> --experimental
done
```

The four buckets above are the current set. Confirm with
`npx supabase storage ls --project-ref <ref> --experimental` — a new
bucket added by a future epic must be added here.

### 5.5 · Environment variables

See §6. They are not in git and not in the database.

### 5.6 · Record it

Append a line to the backup log kept alongside the archives: timestamp,
what was captured, byte sizes, and who took it. A backup nobody can find
is not a backup.

## 6 · Environment variables

Not in git, not in the database, and required to bring the application
back up.

| Variable | Where it lives | Where to recover it from |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local`, Vercel | Supabase dashboard — new project's URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local`, Vercel | Supabase dashboard — new project's anon key |
| `ANTHROPIC_API_KEY` | `.env.local`, Vercel | Anthropic console — **cannot be recovered, only reissued** |

The first two are regenerated by the restore itself. **`ANTHROPIC_API_KEY`
is different**: if it is lost and no copy exists, a new key must be
issued and updated in Vercel. Keep a copy in a password manager — not in
the repository, not in a backup archive.

Capture the full Vercel environment configuration whenever it changes.
It is small and changes rarely, which is exactly why it gets forgotten.

## 7 · Restore procedure

Written to be executed by an engineer who has not seen this system
before. Assumes the worst case: the production project is gone.

**Before starting, note the time.** §8 wants the duration.

### Step 1 — Create a target project

Supabase dashboard → new project, region **`eu-west-1`** to match, named
distinctly. Record its project ref and database password.

### Step 2 — Install the tools

[`POSTGRES_TOOLS_WINDOWS.md`](POSTGRES_TOOLS_WINDOWS.md), if not already
done. Verify with `pg_dump --version` ≥ 17.

### Step 3 — Point the connection at the new project

As §5, with the new project's ref and password.

### Step 4 — Restore the schema

```bash
psql -f "$BACKUP/schema.sql"
```

Expect errors about objects that already exist — Supabase creates `auth`
and `storage` itself. **Read them.** Errors about `public` tables are
real; errors about Supabase-managed objects are not.

**Alternative, and preferred if the backup predates recent migrations:**
apply the repository's migrations instead —
`npx supabase db push --linked` — then restore data only. The migrations
are authoritative for schema; the dump is authoritative for data.

### Step 5 — Restore user accounts, then data

Order matters. `public` rows reference `auth.users`.

```bash
psql -f "$BACKUP/data-auth.sql"
psql -f "$BACKUP/data-public.sql"
```

### Step 6 — Restore storage objects

```bash
for b in avatars portfolio request-photos item-photos; do
  npx supabase storage cp -r "$BACKUP/storage/$b" "ss:///$b" \
      --project-ref <new-ref> --experimental
done
```

Buckets must exist first — the schema restore creates their metadata.

### Step 7 — Repoint the application

Update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel to the
new project, re-add `ANTHROPIC_API_KEY`, and redeploy.

### Step 8 — Verify against known data

Not "it looks fine". Check specific things:

- [ ] Row counts for `service_requests`, `quotes`, `messages`, `reviews`,
      `profiles` match the source
- [ ] A known user can sign in
- [ ] A known request shows its quotes and conversation
- [ ] An avatar and a request photo both load
- [ ] Creating a new request works end to end

### Step 9 — Record it

Fill in §8, including **how long it took**. That number is the only
honest RTO.

## 8 · Drill record

| Date | Source | Target | Verified against | Duration | Result |
|---|---|---|---|---|---|
| — | — | — | — | — | **No drill has ever been performed** |

### Prerequisites verified 2026-08-12

Not a drill, but the assumptions the drill rests on are no longer
assumptions:

| Checked | Result |
|---|---|
| Client tools installed | **PostgreSQL 18.4** — `pg_dump`, `pg_restore`, `psql` |
| Client ≥ server | 18.4 vs 17.6 ✓ |
| Pooler reachable from Windows | **Yes** — resolved to IPv4 `54.247.26.119`, TLS handshake completed |
| Session mode port 5432 correct | **Yes** — server responded with an auth challenge |
| Storage API without Docker | **Yes** — four buckets listed on both projects |

Connectivity was proven with a deliberately invalid password: the server
answered `password authentication failed`, which is a reachability
success. **Only credentials and a restore target now stand between this
and a completed drill.**

## 9 · Handling backups safely

**A backup is a complete copy of the customer database.** It carries
every obligation the production database does.

- **Never inside the working tree.** `.gitignore` does not cover `*.sql`.
- **Never in staging.** `ENVIRONMENTS.md` §6 forbids production data
  there; a drill uses a short-lived scratch project, destroyed after.
- **Encrypt archives at rest**, particularly the off-site monthly ones.
- **Destroy expired backups** per the retention in §4. An old dump on an
  unmonitored drive is an unmanaged copy of everyone's personal data.
- **Restrict access** to whoever operates recovery.

## 10 · Open items

- **Nothing is automated yet.** The schedule in §4 is performed by hand.
  Scripting it is a natural follow-up and needs an owner; a manual
  schedule fails silently, which is its main weakness (ADR-0017).
- **§8 is empty.** Until a drill runs, RTO is a target and the procedure
  is untested.
- **`.gitignore` does not cover `*.sql`.** Mitigated by instruction here;
  a rule in `.gitignore` would be stronger.

---

Version 2.0 — 2026-08-12 (Epic 00 WP07: replaced the "no mechanism"
posture with a self-managed free-tier strategy per ADR-0017 — native
`pg_dump` over the session pooler, explicit `auth` capture, storage via
the Storage API, four cadences, stated RPO/RTO)

Version 1.0 — 2026-08-12 (recorded that no backup mechanism existed)

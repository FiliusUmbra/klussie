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

**Connection targets, verified 2026-08-12:**

| Project | Ref | Pooler host |
|---|---|---|
| `klussie` (production) | `wyxspgdzwyzsqezmtndx` | `aws-0-eu-west-1.pooler.supabase.com` |
| `klussie-staging` | `mxcuxnvjfnktwjcmkqqk` | `aws-1-eu-west-1.pooler.supabase.com` |

**The pooler host is per project, not per region.** Both are in
`eu-west-1` and they are on different clusters. The wrong host fails with
`(ENOTFOUND) tenant/user … not found`, which reads like a username error
and is not one. A new project's host is in Dashboard → Project Settings →
Database → Connection pooling.

```bash
# PGHOST is per project, not per region — see the table below.
export PGHOST=<the-project's-pooler-host>
export PGPORT=5432                 # session mode — 6543 will not work
export PGDATABASE=postgres
export PGUSER=postgres.<project-ref>
export PGPASSWORD='<database-password>'   # or omit and use pgpass.conf

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/path/outside/the/repo/klussie-backup-$STAMP
mkdir -p "$DEST"
```

> **Never write a dump inside the working tree.** `.gitignore` does not
> cover `*.sql`, so it would be committed — publishing every customer
> record to the repository.

### 5.0 · Why the dumps are split into four files

Klussie has **nine triggers**, and a naive data restore fires all of
them. That would not produce a copy of production; it would produce a
database that re-ran its own history:

| Trigger | On | What it would do during a restore |
|---|---|---|
| `handle_new_user` | `auth.users` insert | Insert into `public.profiles` — colliding with the restored profiles |
| `handle_new_pro_profile` | `pro_profiles` insert | Create `pro_stats` rows |
| `handle_quote_sent` | `quotes` insert | Move the parent request's status |
| `handle_quote_accepted` | `quotes` update | Book a request, decline siblings, open a conversation |
| `handle_new_request` | `service_requests` insert | Emit a domain event |
| `handle_new_review` | `reviews` insert | Recompute `pro_stats`, move request status |
| `handle_job_completed` | `service_requests` update | Emit a domain event |

**The fix is ordering.** `pg_dump --section` splits the schema so that
tables are created *before* the data loads and **triggers, indexes,
constraints and policies are created after it**. Nothing fires while rows
are arriving.

**One trigger cannot be deferred this way.** `handle_new_user` sits on
`auth.users`, which Supabase creates and manages — it exists in a fresh
project before any restore begins, and is not in our dump to reorder.
Restoring `auth.users` **will** fire it and create `profiles` rows. The
mitigation is `--on-conflict-do-nothing` on the public data dump, so the
trigger-created rows do not break the restore. **Whether the resulting
profile rows carry the restored values or the trigger's defaults is the
single most important thing for the drill (§7 step 8) to check.**

### 5.1 · Schema — pre-data

Tables, types and functions. No triggers, no constraints.

```bash
pg_dump -w --schema-only --section=pre-data \
        --no-owner --no-privileges --quote-all-identifiers \
        --schema=public \
        -f "$DEST/01-schema-pre.sql"
```

### 5.2 · Platform data — accounts and buckets

The rows nothing else can reconstruct.

```bash
pg_dump -w --data-only --no-owner --column-inserts \
        -t auth.users -t auth.identities -t storage.buckets \
        -f "$DEST/02-data-platform.sql"
```

**Without `auth.users`, a restore produces a working application that
nobody can log into.** `storage.buckets` is included because the buckets
must exist before objects can be uploaded back into them (§5.4).

### 5.3 · Application data

```bash
pg_dump -w --data-only --no-owner --column-inserts \
        --on-conflict-do-nothing \
        --schema=public \
        -f "$DEST/03-data-public.sql"
```

`--column-inserts` is slower and larger than COPY, and is chosen
deliberately: the output is readable, diffable, and survives a partial
restore. `--on-conflict-do-nothing` is what makes the file tolerate rows
the `auth.users` trigger has already created (§5.0). At Klussie's current
volume the size cost is irrelevant; revisit when it stops being.

### 5.4 · Schema — post-data

Indexes, constraints, triggers and RLS policies. **Applied last**, so
none of them act on the data as it loads.

```bash
pg_dump -w --schema-only --section=post-data \
        --no-owner --no-privileges --quote-all-identifiers \
        --schema=public \
        -f "$DEST/04-schema-post.sql"
```

### 5.5 · The three named backups

| Backup | Files | Use |
|---|---|---|
| **Schema backup** | `01` + `04` | Capturing structure. Rarely used alone — migrations are the authoritative schema source |
| **Data backup** | `02` + `03` | Daily cadence, when the schema has not changed |
| **Full logical backup** | `01`–`04` | Everything the database holds. **The standard.** Add §5.6 storage objects for weekly and monthly |

`-w` on every command means *never prompt for a password* — the
credential comes from `pgpass.conf`, so nothing sensitive appears in a
command, a script, or a terminal history.

### 5.6 · Storage objects

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

### 5.7 · Environment variables

See §6. They are not in git and not in the database.

### 5.9 · Why `--column-inserts` rather than COPY

`pg_dump --data-only` emits `COPY … FROM stdin` by default, which is the
faster format. Klussie deliberately does not use it. The reasoning, since
this is the kind of choice that looks like an oversight later:

| Dimension | COPY (default) | `--column-inserts` | Better |
|---|---|---|---|
| **Restore speed** | One bulk statement; roughly 10–100× faster at volume | One parsed, planned statement per row | **COPY** |
| **File size** | Compact, tab-delimited | Column names repeated on every row | **COPY** |
| **Trigger interaction** | **Fires row-level triggers** | Fires row-level triggers | **Tie** — neither avoids §5.0 |
| **Conflict handling** | **Impossible.** No `ON CONFLICT`; one conflicting row aborts the entire table load | `--on-conflict-do-nothing` supported | **inserts, decisively** |
| **Failure granularity** | All-or-nothing per table | Per row — 3 bad rows lose 3 rows | **inserts** |
| **Portability** | PostgreSQL-specific | Standard SQL, hand-editable | **inserts** |
| **Schema evolution** | Column list explicit in the COPY header — tolerates reordering | Column list on every row — tolerates reordering | **Tie** |
| **Readability / diffability** | Poor | Good | **inserts** |

**The decisive row is conflict handling, and it is not a preference.**
Verified directly:

```
pg_dump --data-only --on-conflict-do-nothing …
→ error: option --on-conflict-do-nothing requires option --inserts,
  --rows-per-insert, or --column-inserts
```

§5.0 established that `handle_new_user` sits on `auth.users`, cannot be
deferred by `--section` ordering, and **will** create `profiles` rows
during a restore. Those rows conflict with the ones in
`03-data-public.sql`. With `--column-inserts` the conflict is skipped and
the restore continues. **With COPY, that single conflict aborts the whole
`profiles` load.**

**Schema evolution is a tie, not a win** — worth stating because it is
often cited as the reason to prefer inserts. Modern `pg_dump` writes an
explicit column list into the COPY header, so both formats survive column
reordering and added defaulted columns. Only plain `--inserts` (without
`--column-inserts`) is positional and fragile; it is not used here.

**Speed is currently irrelevant.** Measured on production, 2026-08-12:

```
public schema: 371 rows, 1064 kB total
```

At that volume the difference between COPY and per-row inserts is
unmeasurable. **Klussie is roughly three orders of magnitude away from
the point where this trade matters.**

**Revisit when any of these becomes true:**

- `03-data-public.sql` takes more than ~15 minutes to restore — at a
  4-hour RTO, restore time stops being free.
- Public data exceeds ~1 million rows or ~1 GB.
- **Restore Mode is adopted** ([ADR-0018](../adr/0018-restore-mode-suspend-triggers-during-logical-restore.md)).
  That removes the conflict problem entirely, which removes the only
  decisive argument for inserts — and COPY becomes the better default.

### 5.8 · Record it

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

### Step 4 — Restore, in this order

**The order is the design.** §5.0 explains why: triggers must not exist
while data is loading.

```bash
psql -w -v ON_ERROR_STOP=1 -f "$BACKUP/01-schema-pre.sql"     # tables, no triggers
psql -w                    -f "$BACKUP/02-data-platform.sql"  # accounts, buckets
psql -w                    -f "$BACKUP/03-data-public.sql"    # application data
psql -w -v ON_ERROR_STOP=1 -f "$BACKUP/04-schema-post.sql"    # triggers, indexes, policies
```

`ON_ERROR_STOP=1` on the schema steps because a failure there means the
rest is meaningless. **Deliberately not set on the data steps** — the
`auth.users` trigger creates profile rows, so conflicts are expected and
`--on-conflict-do-nothing` handles them. **Read the output anyway.**

**Alternative for step 1, preferred if the backup predates recent
migrations:** apply the repository's migrations instead —
`npx supabase db push --linked` — then load `02` and `03`. The migrations
are authoritative for schema; the dump is authoritative for data. Note
this creates triggers early, so §5.0's hazard returns; only use it when
the schema files are known stale.

### Step 5 — Restoring an individual backup type

| You have | Restore with |
|---|---|
| Schema backup only | `01` then `04`. Produces an empty, correct database |
| Data backup only | `02` then `03`, into a database whose schema already matches |
| Full logical backup | All four, in the order above |

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
- [ ] **`profiles` carry their restored values, not trigger defaults.**
      Pick a profile with a name and avatar and confirm both survived —
      this is the §5.0 `handle_new_user` hazard, and it is the one thing
      most likely to be silently wrong
- [ ] **`pro_stats` match the source**, rather than having been
      recomputed by `handle_new_review`
- [ ] **`domain_events` was not re-populated** by the restore itself
- [ ] Request statuses match the source — not moved by
      `handle_quote_sent` or `handle_job_completed`
- [ ] A known user can sign in
- [ ] A known request shows its quotes and conversation
- [ ] An avatar and a request photo both load
- [ ] Creating a new request works end to end — proving the triggers
      restored by `04` are live and working

### Step 9 — Record it

Fill in §8, including **how long it took**. That number is the only
honest RTO.

## 8 · Drill record

| Date | Source | Target | Verified against | Duration | Result |
|---|---|---|---|---|---|
| — | — | — | — | — | **No drill has ever been performed** |

### The backup path is verified — 2026-08-12

Everything below was an assumption when this document was written. All of
it has now been executed successfully:

| Checked | Result |
|---|---|
| Client tools installed | **PostgreSQL 18.4** — `pg_dump`, `pg_restore`, `psql` |
| Client ≥ server | 18.4 vs 17.6 ✓ |
| Native tools without Docker | **Yes** |
| `pgpass.conf` | **Working** — resolved from `%APPDATA%`, readable by tooling |
| Production authentication | **Succeeds** — `aws-0-eu-west-1.pooler.supabase.com` |
| Staging authentication | **Succeeds** — `aws-1-eu-west-1.pooler.supabase.com` |
| Session-mode port 5432 | **Correct** — `select` returned, server reports PostgreSQL 17.6 |
| Storage API without Docker | **Yes** — four buckets listed on both projects |
| All `pg_dump` flags used in §5 | **Present in 18.4**, including `--section` and `--on-conflict-do-nothing` |

**What remains unproven is the restore, not the backup.** A scratch
project and an executed drill are the only things between this document
and a measured RTO.

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

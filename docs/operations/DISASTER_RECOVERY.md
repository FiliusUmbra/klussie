# Klussie — Disaster Recovery

**This document owns:** what backup coverage Klussie actually has, how to
restore, and the record of restore drills performed. It does not own
environments (`ENVIRONMENTS.md`) or architecture.

> **A restore that has never been tested is a hypothesis.**
> `../architecture/DATABASE_ARCHITECTURE.md` §4 makes verified restore a
> requirement for Historical-class data, and this project has never run
> one.

---

## 1 · Verified backup posture

Queried read-only against the production project on 2026-08-12 with
Supabase CLI v2.114.0:

```
supabase backups list --project-ref <production-ref>

{ "region": "eu-west-1",
  "walg_enabled": true,
  "pitr_enabled": false,
  "backups": [],
  "physical_backup_data": {} }
```

| Fact | Value |
|---|---|
| Region | `eu-west-1` |
| Point-in-Time Recovery | **Disabled** |
| Physical backups listed | **None** |
| Postgres | 17.6.1.141 |

**`supabase backups list` reports *physical* backups** — that is its own
documented description.

## 2 · Confirmed: production is on the Free plan

**Confirmed by the CTO, 2026-08-12.** Recorded as
[ADR-0016](../adr/0016-operate-production-on-free-plan-without-automatic-backups.md).

Supabase's published policy:

- **Free Plan** — no automatic backups. Supabase directs Free projects to
  export their own data with `supabase db dump` and keep off-site copies.
  Backups are not available for download.
- **Pro / Team / Enterprise** — automatic daily backups, last 7 days
  accessible. PITR is a paid add-on which *replaces* daily backups.

> **Production has no automatic backup.** Every request, quote, message,
> review and household item exists in exactly one place. This is a
> knowingly accepted risk with a defined removal trigger — see ADR-0016 —
> not an oversight.

## 3 · The fallback mechanism, and why it does not currently work

`supabase db dump` produces a logical dump over the network and needs no
plan entitlement. It is what Supabase recommends to Free projects, and it
is the only backup that would exist off Supabase infrastructure.

```bash
npx supabase db dump --project-ref <ref> -f schema.sql                    # schema
npx supabase db dump --project-ref <ref> --role-only -f roles.sql         # roles
npx supabase db dump --project-ref <ref> --data-only --use-copy -f data.sql  # data
```

Restore is the reverse: roles, then schema, then data, into an empty
project.

**Verified 2026-08-12: this does not work on the current development
machine.**

```
npx supabase db dump --linked -f schema.sql
→ LegacyDockerRunError: failed to run docker.
```

`db dump` runs `pg_dump` inside a Docker container **even when dumping a
remote database**. Docker is not installed. Native `pg_dump` and `psql`
are not installed either.

| Mechanism | Available? |
|---|---|
| Supabase automatic backups | **No** — Free plan |
| Point-in-Time Recovery | **No** — disabled, paid add-on |
| `supabase db dump` | **No** — requires Docker, not installed |
| Native `pg_dump` / `psql` | **No** — not installed |

**There is currently no working backup mechanism of any kind.** Closing
this needs a tooling decision: install Docker, or install Postgres client
tools, or upgrade the plan. ADR-0016 §Consequences explains why that
decision was not folded into it.

**A schema-only dump is not a backup of the business.** It restores the
shape and loses every request, quote, message and review. Only a data
dump is a recovery of the product.

## 4 · The restore drill

The drill proves the copy is real. It is the whole point of this
document, and it has **not yet been performed.**

1. **Confirm the plan** (§2). This determines whether a platform backup
   exists to restore, or whether §3 is the only path.
2. **Create a scratch project.** Throwaway, clearly named, same region
   (`eu-west-1`), destroyed afterwards. **Not staging** — see §5.
3. **Restore into it.**
   - Platform backup: Dashboard → Database → Backups → restore to a new
     project. Supabase documents this as *"Restore to a new project"*.
   - Or from a §3 dump: roles, then schema, then data.
4. **Verify against known data.** Not "it looks fine": pick specific rows
   known to exist in production — a particular request, its quotes, its
   conversation — and confirm they are present and intact. Confirm row
   counts for the main tables match.
5. **Record the result in §6**, including **how long it took**. Recovery
   time is the number that matters in an incident, and it is unknown
   until measured.
6. **Destroy the scratch project.**

## 5 · Handling production data

**A restore drill copies real personal data into a new place.** That is a
data-protection decision, not a convenience, and it must be deliberate:

- **The scratch project is not staging.** `ENVIRONMENTS.md` §6 forbids
  copying production data into staging, and that rule stands. A drill
  target is single-purpose, short-lived, and destroyed when finished.
- **Restrict access** to it for its lifetime.
- **Destroy it promptly.** A forgotten drill project is an unmonitored
  copy of the customer database.
- **Never commit a dump.** `.gitignore` covers `*.local` and `.env*`, not
  `*.sql` — a dump written into the repository would be committed. Write
  dumps outside the working tree.
- **Prefer schema-only** for any rehearsal that does not specifically
  need real rows.

## 6 · Drill record

| Date | Source | Target | Verified against | Duration | Result |
|---|---|---|---|---|---|
| — | — | — | — | — | **No drill has ever been performed** |

Until a row exists here, Klussie's backups are unproven.

## 7 · Open decisions

**Resolved**

- ~~Which plan is production on?~~ **Free**, confirmed 2026-08-12.
- ~~Is operating without automatic backups acceptable?~~ **Accepted for
  now**, with a removal trigger — [ADR-0016](../adr/0016-operate-production-on-free-plan-without-automatic-backups.md).

**Still open**

- **Which tooling closes the gap?** Docker (enables `supabase db dump`),
  native Postgres client tools (lighter, per-machine setup), or a plan
  upgrade. Until one is chosen there is no mechanism at all (§3).
- **Who owns the schedule, and where do dumps live?** An unscheduled
  backup is not a backup. Off-site storage is the point — a dump on the
  same laptop as the working tree protects against far less than it
  appears to.
- **What recovery time is acceptable?** Unknown until §4 step 5 measures
  it, and unmeasurable until a mechanism exists.

**The removal trigger to watch:** ADR-0016 expects this decision to be
reversed **before Epic 03's first migration runs against production**.
That epic backfills a workspace onto every existing row — the first
change in the roadmap whose failure mode is unrecoverable data rather
than a revertable read path.

---

Version 1.0 — 2026-08-12 (Epic 00 WP07)

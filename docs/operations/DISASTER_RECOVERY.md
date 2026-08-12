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

## 2 · What this means, and the one thing still unconfirmed

Supabase's published policy:

- **Free Plan** — no automatic backups. Supabase explicitly directs Free
  projects to export their own data with `supabase db dump` and keep
  off-site copies. Backups are not available for download.
- **Pro / Team / Enterprise** — automatic daily backups, last 7 days
  accessible. PITR is a paid add-on which *replaces* daily backups.

The empty result above is what a **Free Plan** project looks like.

**It has not been confirmed which plan production is on.** The CLI does
not expose it — neither `projects list` nor `orgs list` returns a plan or
tier field. Determining it requires the dashboard (Organization →
Billing), which is a ten-second check and is **the single most important
open question in this document.**

> **Do not treat production as backed up until that check is done.**
> If the plan is Free, there is no automatic backup of production at all,
> and the only recoverable copy is one somebody makes deliberately (§3).

## 3 · The mechanism that works on every plan

`supabase db dump` produces a logical dump over the network. It needs no
plan entitlement, and it is what Supabase recommends to Free projects.

```bash
# Schema only — safe, contains no personal data
npx supabase db dump --project-ref <ref> -f schema.sql

# Roles
npx supabase db dump --project-ref <ref> --role-only -f roles.sql

# Data — contains real personal data, see §5 before running against production
npx supabase db dump --project-ref <ref> --data-only --use-copy -f data.sql
```

Restore is the reverse: apply `roles.sql`, then `schema.sql`, then
`data.sql` into an empty project.

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

- **Which plan is production on?** (§2) Everything else depends on it.
- **If Free: is that acceptable for a product with real users?** Upgrading
  to Pro buys daily backups with 7-day retention. That is a commercial
  decision, and it is the CTO's — recorded here because the roadmap
  commits to migrating this database across 26 epics, and doing that
  without a recoverable copy is a risk that should be taken knowingly
  rather than by default.
- **Should scheduled `db dump` exports run regardless of plan?** Supabase
  recommends it for Free projects, and it is the only backup that exists
  off Supabase infrastructure on any plan.
- **What recovery time is acceptable?** Unknown until §4 step 5 measures
  it.

---

Version 1.0 — 2026-08-12 (Epic 00 WP07)

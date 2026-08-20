# Klussie — Database Roles and Grants

**This document owns:** which database roles exist, what each may reach,
and the rules a later migration follows when it grants anything. It is
the operational companion to
[`../architecture/SUPABASE_ARCHITECTURE.md`](../architecture/SUPABASE_ARCHITECTURE.md)
§9, which is frozen and owns *why* the model is shaped this way.

It does not own row-level security (§6 of that document), the schemas
themselves (§2, implemented by migration `0018`), or the workflow
(`../../ENGINEERING.md`).

> **The property this exists to protect:** an engine that writes another
> engine's schema fails on privileges, not on review
> (`SUPABASE_ARCHITECTURE.md` §24 item 2).

---

## 1 · The four role classes

`SUPABASE_ARCHITECTURE.md` §9 defines four classes. Every role below is
one of them.

| Class | Reaches | Never |
|---|---|---|
| **Anonymous** | Published provider profiles and platform catalogues only | Any workspace-scoped schema |
| **Authenticated** | Workspace-scoped schemas under RLS | `platform`, `analytics_pf`, or write access to append-only tables |
| **Service** (background) | What a specific consumer needs, per consumer | Anything outside its declared job |
| **Operator** | Configuration and platform catalogues | Customer content, except through an audited support membership |

## 2 · The roles

Twelve roles, created by `supabase/migrations/0019_grants.sql`. **All are
`NOLOGIN` group roles.** Nothing connects as one; a real connection role
is granted membership by the epic that gives an engine its own
connection. They exist now so that every later table's privileges are a
one-line decision rather than an argument.

**Naming.** Every role this platform creates is prefixed `klussie_`.
Supabase owns `anon`, `authenticated`, `service_role`, `authenticator`,
`postgres` and `supabase_*`; the prefix makes "did we create this, or did
the platform" answerable by looking, and keeps `klussie_consumer_*`
visibly distinct from Supabase's elevated `service_role`, which is **not**
one of §9's per-consumer service roles.

### 2.1 · Engine roles — one per schema-owning tier

| Role | Owns schema | Owning engines |
|---|---|---|
| `klussie_engine_identity` | `identity` | Identity |
| `klussie_engine_workspace` | `workspace` | Workspace, Capability |
| `klussie_engine_property` | `property` | Property, Location, Asset, Document |
| `klussie_engine_work` | `work` | Maintenance, Service Record, Workflow, Marketplace, Conversation |
| `klussie_engine_knowledge` | `knowledge` | Knowledge, Intelligence |
| `klussie_engine_commerce` | `commerce` | Subscription, Billing |
| `klussie_engine_platform` | `platform` | Event Backbone, Audit, Administration |

**Each role is named for the schema it owns.** That is deliberate: it
makes a mis-pairing visible in the grant itself, and it is what
`supabase/migrations/__tests__/grants.test.js` checks mechanically.

**Three of the ten schemas have no engine role**, because no single
engine owns them. `derived` holds projections owned by "whichever engine
owns each projection" (§2) and is written by consumers; `analytics_ws`
and `analytics_pf` belong to the Analytics engine and are loaded by a
consumer.

### 2.2 · Background consumer roles

§9: *"Background consumers are not one role … A single omnipotent
background role is the same problem as an omnipotent user role,
delayed."*

| Role | Job | Schemas it may be inside |
|---|---|---|
| `klussie_consumer_projection` | Builds projections | `derived` |
| `klussie_consumer_search` | Maintains search support | `derived` |
| `klussie_consumer_analytics` | Loads analytics | `analytics_ws`, `analytics_pf` |
| `klussie_consumer_delivery` | Delivers events | `platform` |
| `klussie_consumer_workspace` | Creates scoped access grants from accepted engagements | `platform` (own bookkeeping), `workspace` (via one `SECURITY DEFINER` delegate only — no direct table privilege) |

The fifth role, and the first background consumer this platform has
ever actually run (`0162_engagement_access_grant_consumer.sql`,
[ADR-0031](../adr/0031-background-consumer-pattern-cursor-quarantine-pg-cron.md)).
Running it live surfaced a real, pre-existing gap this table's own
description below did not have: `platform.consumer_cursors` and
`platform.consumer_quarantine` enabled RLS with no policy at all since
Epic 01, meaning every one of the original four roles' table grants on
these two tables had never once actually worked. `0162` added the
missing policies for all five roles at once — see that migration's own
header for the full finding.

They hold `USAGE` and no table privileges — except the direct
`SELECT`/`INSERT`/`UPDATE` grants on `platform.consumer_cursors`/
`consumer_quarantine` every one of the five already has (§3 rule 2's
own mutable-table exception), and `klussie_consumer_delivery`/
`klussie_consumer_workspace`'s own direct `SELECT` on `platform.events`
itself. A consumer's grants are scoped
to *"what a specific consumer needs"*, which is a per-table fact and is
granted by the epic that creates the table.

### 2.3 · Operator

| Role | Reaches |
|---|---|
| `klussie_operator` | `platform` — configuration and catalogues |

Deliberately not `derived`, not `analytics_ws`, and none of the six
workspace-scoped tiers. An operator reaches customer content only through
an audited support membership, which is a Workspace-engine concept and
not a grant.

### 2.4 · The client-facing roles

`anon`, `authenticated` and `service_role` are Supabase's, and this
platform grants them **nothing on any of the ten schemas**. Their access
to `public` is untouched and the running product is unaffected.

Two different rules produce the same picture today, and a reader needs to
be able to tell them apart:

| Rule | Applies to | Meaning |
|---|---|---|
| **Never** | `anon` on any workspace-scoped schema; `authenticated` on `platform` and `analytics_pf` | Permanent. Anything that appears to need one of these is a finding, not a grant |
| **Not yet** | `authenticated` on the six workspace-scoped tiers and `derived` | Opened **per table**, by the epic that ships a direct-read path for it |

## 3 · The rules a later migration follows

Five rules. Each is a review question, not a preference.

**1 · Grant to a role's own schema; grant nothing else without a real
query.** §9 permits read-only access to other schemas, but "the narrowest
grants that let it work" means the read must exist first. A tier-wide
`SELECT` granted in advance is not narrow, and nothing revokes it later.

**2 · A new table is append-only until its migration says otherwise.**
The default privileges grant `SELECT` and `INSERT` and never `UPDATE` or
`DELETE`. §4 enforces append-only by withholding those privileges, and
§24 item 7 makes the mutability class a per-table declaration — so a
mutable table grants them explicitly, naming its class in the migration.
This is the fail-safe direction: forgetting leaves a table too strict,
never too loose.

**3 · A direct client read is opened per table, never per schema.** §7
permits the direct-read path *"only where membership alone is the
complete permission answer."* That is a per-table judgement; a schema-wide
grant makes it for every future table in advance.

**4 · No `CREATE` for any application role.** Migrations run as
`postgres`. An engine creating its own tables at runtime is not something
this architecture has.

**5 · Every grant is added by a migration**, never by hand in the
dashboard. A privilege that exists in one environment and not another is
the failure mode this whole model is meant to remove.

## 4 · Verifying the posture

```bash
psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
     -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_GRANTS.sql
```

Four checks, each raising an exception that names what is wrong:

1. Twelve roles exist and none can log in.
2. Each engine role reaches its own schema and no other.
3. `anon`, `authenticated` and `service_role` reach none of the ten.
4. A table created in a schema is `SELECT`+`INSERT` to its own engine and
   nothing to anyone else — checked by creating one inside a transaction
   that is rolled back.

Connection details are in
[`POSTGRES_TOOLS_WINDOWS.md`](POSTGRES_TOOLS_WINDOWS.md) §5.

**There are two halves to this and they fail differently.**
`VERIFY_GRANTS.sql` checks that the database *is* in the right state.
`supabase/migrations/__tests__/grants.test.js` checks that the migration
still *says* the right thing after somebody edits it — which running the
migration once cannot tell you.

## 5 · What this does not yet do

Stated so that its absence is not mistaken for a decision:

- **No role is granted to a connection role.** Nothing runs as an engine
  role yet, because no engine has its own connection. Application code
  still reaches `public` exactly as before.
- **No table privileges exist**, because no table exists in the ten
  schemas.
- **No cross-schema read is granted.** Rule 1 above.
- **RLS is untouched.** It is a separate concern (§6) and arrives with
  the tables it protects.

## 6 · Rollback

```sql
-- Default privileges must be revoked before the roles can be dropped.
alter default privileges for role postgres in schema identity  revoke all on tables, sequences from klussie_engine_identity;
alter default privileges for role postgres in schema workspace revoke all on tables, sequences from klussie_engine_workspace;
alter default privileges for role postgres in schema property  revoke all on tables, sequences from klussie_engine_property;
alter default privileges for role postgres in schema work      revoke all on tables, sequences from klussie_engine_work;
alter default privileges for role postgres in schema knowledge revoke all on tables, sequences from klussie_engine_knowledge;
alter default privileges for role postgres in schema commerce  revoke all on tables, sequences from klussie_engine_commerce;
alter default privileges for role postgres in schema platform  revoke all on tables, sequences from klussie_engine_platform;

-- Then the roles themselves. drop owned by removes remaining grants.
drop owned by klussie_engine_identity, klussie_engine_workspace, klussie_engine_property,
              klussie_engine_work, klussie_engine_knowledge, klussie_engine_commerce,
              klussie_engine_platform, klussie_consumer_projection, klussie_consumer_delivery,
              klussie_consumer_search, klussie_consumer_analytics, klussie_operator;

drop role klussie_engine_identity, klussie_engine_workspace, klussie_engine_property,
          klussie_engine_work, klussie_engine_knowledge, klussie_engine_commerce,
          klussie_engine_platform, klussie_consumer_projection, klussie_consumer_delivery,
          klussie_consumer_search, klussie_consumer_analytics, klussie_operator;
```

**No data is lost.** Nothing runs as these roles and no object is owned
by one. The revokes of §2.4 do not need reversing — they removed nothing,
because PostgreSQL grants nothing to `PUBLIC` on a newly created schema.

---

Version 1.0 — 2026-08-12 (Epic 01 WP02)

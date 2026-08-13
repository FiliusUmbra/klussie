# Klussie — Environments

**This document owns:** which environments exist, what each is for, how
to point the application at one, and the runbook for provisioning
staging. It does not own architecture (`../architecture/`), the
engineering workflow (`../../ENGINEERING.md`), or disaster recovery
(`DISASTER_RECOVERY.md`, WP 00.07).

---

## 1 · The environments

| Environment | Status | Purpose |
|---|---|---|
| **Local** | Available | Development. Points at whichever remote environment the developer configures |
| **Staging** | **Provisioned** (2026-08-12) — all 17 migrations replayed from empty | Verify before production |
| **Production** | Live, real users | Was the only environment Klussie had ever had |

> **Production is no longer the only environment.** Staging was built
> from an empty database by `supabase db push --linked`, applying all 17
> migrations in order with no file modified and no failure — the first
> time the migration chain has ever been proven to reconstruct the
> schema from nothing.

## 2 · The rule this document exists to enforce

> **No schema work happens in any epic until staging exists.**
>
> Epic 01 creates ten schemas and a partitioned events table. Epic 02
> onward migrate live data. None of it runs against a database that has
> no rehearsal environment.

This is why WP 00.06 sits before every migration in the roadmap, and why
it is a hard prerequisite rather than a convenience.

## 3 · Pointing the application at an environment

The application selects its environment entirely through configuration.
There is no environment name in the code, and none should ever be added.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Which Supabase project the client talks to |
| `VITE_SUPABASE_ANON_KEY` | Its public anonymous key |

Copy `.env.local.example` to `.env.local` and fill in the values for the
environment you intend to use. Switching environments is changing those
two values and restarting the dev server — nothing else.

**`.env.local` is gitignored and must stay that way.** It holds real
keys. Never commit it, never paste its contents into an issue, a PR or a
chat.

## 4 · Provisioning staging — runbook

**These steps require the Supabase account owner.** They cannot be
performed from the repository: creating a project needs dashboard access,
an organisation, a region choice, and a plan decision.

### 4.1 · Create the project

1. In the Supabase dashboard, create a new project in the same
   organisation as production.
2. **Name it so it cannot be mistaken for production** — `klussie-staging`
   rather than anything that reads like the live system.
3. **Choose the same region as production.** Latency and Postgres version
   behaviour should match what is being rehearsed; a staging environment
   in a different region rehearses the wrong thing.
4. Record the project URL and anon key. The service role key is not
   needed for the application and must not be placed in any client
   configuration.

### 4.2 · Apply the migrations

Use the Supabase CLI. No installation is required — `npx` fetches it, and
no `supabase/config.toml` is needed for a cloud-only workflow (§8).

```bash
npx supabase login
npx supabase link --project-ref <staging-project-ref>
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

**Always dry-run first.** It prints exactly which migrations would be
applied, in order, and changes nothing.

**The CLI maintains the ledger.** On first push it creates
`supabase_migrations.schema_migrations` in the target project and records
each migration as it lands. Subsequent pushes skip what is already
applied. Verify at any time with:

```bash
npx supabase migration list --linked
```

**Stop at the first failure and report it.** A migration that fails
against an empty database is a genuine defect in the migration set, not
a staging problem, and this is the first time that has ever been tested.

> **Do not run `db push` against production.** Production's 17 migrations
> were applied by hand, so its ledger is empty and the CLI would try to
> apply all of them again. §9 describes the one-time reconciliation that
> makes production safe.

### 4.3 · Verify the schema

Run `supabase/diagnostics/CHECK_STATE.sql` in the SQL Editor. It is
read-only and reports the real state of what the later migrations touch,
including constraints and function bodies that a column check would miss.

### 4.4 · Seed the test accounts

**Seeded 2026-08-13. Run
[`supabase/seed/staging_test_accounts.sql`](../../supabase/seed/staging_test_accounts.sql):**

```bash
psql -w -h <pooler-host> -p 5432 -U postgres.<staging-ref> -d postgres -v ON_ERROR_STOP=1 -f supabase/seed/staging_test_accounts.sql
```

Four sign-in-capable accounts, idempotent, with a shared password
documented in the script's header. It refuses to run against a database
that has not had Epic 01 and 02 applied — a cheap guard against being
pointed at production.

| Account | Why it exists |
|---|---|
| `customer@staging.klussie.test` | The ordinary case: every attribute populated |
| `pro@staging.klussie.test` | A professional with a pro profile and one offered service |
| `sparse@staging.klussie.test` | No name, no city, no phone — nulls are how a null-unsafe reconciliation passes over real drift |
| `external@staging.klussie.test` | No `person_ref` in its metadata, so the identity is minted as it is for a dashboard or OAuth signup |

**This was missing for a long time, and it mattered.** §5 has listed
"test accounts seeded" as an acceptance line since WP 00.06 and Epic 00's
completion record counted it as verified, but `public.profiles` held zero
rows. Epic 02's reconciliation — the hard gate on its read switch — was
therefore comparing nothing and reporting success, and every backfill in
the roadmap would have been "verified" the same way. Seeding immediately
exposed a real defect in a diagnostic that had only ever run against an
empty table.

Use addresses that are clearly non-production. **Never copy real user
data into staging** — it is a different security boundary and copying
production personal data into it is a data protection problem, not a
convenience. The accounts above are fixtures; nothing about them
describes a real person.

### 4.5 · Point the app at staging and verify

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the staging
values, run the app, and walk the flows listed in §5.

## 5 · Acceptance verification

WP 00.06 is complete when every line here is true. Until then it is
blocked, not done.

- [x] A staging Supabase project exists, distinctly named
- [x] All 17 migrations applied cleanly **from empty**, in order
- [x] `CHECK_STATE.sql` reports the expected schema state
- [x] Test accounts seeded — **2026-08-13**, four accounts including one
      customer and one professional (§4.4). Previously listed as done
      while the table was empty
- [ ] The application runs against staging
- [ ] Sign in works
- [ ] A customer can create a request
- [ ] A professional sees a matching lead and can quote
- [ ] Accepting a quote books the request and opens a conversation
- [ ] Messaging works, in both directions
- [ ] No console errors attributable to the environment

**The most valuable outcome of this exercise is not the environment.** It
is discovering whether seventeen migrations that have only ever been
applied incrementally to one database can actually rebuild it from
nothing. That has never been tested.

## 6 · Safety rules

- **Never run destructive operations against production.** Not a
  schema change, not a delete, not a "quick fix".
- **Never copy production data into staging.** Seed it instead.
- **Staging is not private.** Treat anything placed there as
  lower-assurance than production, and never put real personal data in
  it.
- **Migrations are rehearsed in staging first, always** — once staging
  exists, this stops being advice and becomes the rule for every epic
  from 01 onward.
- **The service role key never leaves the server side**, in any
  environment. `../architecture/SUPABASE_ARCHITECTURE.md` §7 and
  `MASTER_CONTEXT.md` §17 both make this a protected decision.

## 8 · The CLI and `config.toml`

**`config.toml` is not required for this workflow, and none exists.**
Verified against CLI v2.114.0: `link` succeeds without it, and both
`migration list --linked` and `db push --linked` work.

`supabase init` creates `config.toml` to configure the **local Docker
stack** — ports, auth settings, seed behaviour — and to hold vault
secrets that `db push` syncs unless `--skip-vault` is passed. Klussie
uses Supabase Cloud for staging, not local containers, so none of that
applies. `supabase status` failing without Docker is therefore expected
and is not a problem to fix.

**Linked projects are recorded in `supabase/.temp/`**, not in
`config.toml`. That directory holds the project ref, organisation and
cached server versions for **the machine you are on**. It is
gitignored and must stay so: each developer links their own, and
committing it would push one person's environment choice onto everyone
else.

**Migration filenames.** The CLI documents `<timestamp>_name.sql` and
compares only the leading version. This repository's `0001`–`0017`
sequence parses correctly and orders correctly — confirmed by
`migration list --linked`, which read all seventeen. New migrations
generated by `npx supabase migration new <name>` get a 14-digit UTC
timestamp; because `0…` sorts before `2…`, they order after the existing
sequence as intended. **The existing files must not be renamed** — a
version already recorded in a ledger cannot change.

## 9 · Reconciling production — required before any CLI use against it

Production's seventeen migrations were applied by hand, so it has **no
`supabase_migrations.schema_migrations` table**. The CLI would read that
as "nothing applied" and attempt to run all seventeen against a populated
database.

Before production is ever linked for a push, mark the existing migrations
as applied **without running them**:

```bash
npx supabase migration list --project-ref <production-ref>   # confirm empty first
npx supabase migration repair --status applied 0001 0002 … 0017 --project-ref <production-ref>
npx supabase migration list --project-ref <production-ref>   # confirm all now applied
```

`migration repair` only writes ledger rows; it executes no SQL from the
migration files. This is a one-time operation and is a prerequisite for
every schema epic from 01 onward.

## 10 · Known gaps

- **Production's ledger is not yet reconciled** (§9). Until it is,
  `db push` against production is dangerous.
- **`.env.local` on the maintainer's machine points at production**, not
  staging. Switching is two values (§3), but the default being production
  means an app run locally writes to real data — and a signup performed
  while testing creates a real account. Point it at staging unless
  production is specifically what is being checked.
- **`.env.local.example` omits `ANTHROPIC_API_KEY`**, which the AI
  endpoints require.
- **`supabase/diagnostics/CHECK_STATE.sql`** was written when no ledger
  existed. It remains useful for verifying what a migration actually
  created, but is no longer the only way to know what has been applied.

---

Version 1.1 — 2026-08-12 (Epic 00 WP06: corrected against Supabase CLI
v2.114.0 — the CLI does maintain a migration ledger, `config.toml` is not
required for cloud-only use, and linked projects live in `supabase/.temp/`)

Version 1.0 — 2026-08-12 (Epic 00 WP06)

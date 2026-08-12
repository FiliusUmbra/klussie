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
| **Staging** | **Not yet provisioned** — this document is the runbook | Verify before production |
| **Production** | Live, real users | The only environment Klussie has ever had |

> **Production has been the only environment since the first migration.**
> `../architecture/ARCHITECTURE.md` records this as a known gap, and
> `IMPLEMENTATION_ROADMAP.md` §5 is why Epic 00 comes first.

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

**There is no migration ledger and no Supabase CLI in this repository.**
`0001_init.sql`'s own header says to paste it into the SQL Editor, and
`supabase/diagnostics/CHECK_STATE.sql` exists precisely because nothing
records which files have been applied. Applying migrations is therefore a
manual, ordered operation.

Apply **in filename order, one at a time, confirming each succeeds before
starting the next**:

```
0001_init                        0010_phase1_foundation
0002_realtime                    0011_auth_onboarding
0003_avatars_storage             0012_domain_event_wiring
0004_trustlocal_features         0013_directed_requests
0005_fix_pro_matches_request…    0014_directed_until_default
0006_portfolio_testimonials      0015_home_tour_preference
0007_request_details_and_photos  0016_household_items
0008_ai_intake                   0017_locales_es_fa
0009_message_translations
```

Seventeen files. **Order matters** — later files alter tables earlier
ones create.

**Stop at the first failure and report it.** A migration that fails
against an empty database is a genuine defect in the migration set, not
a staging problem, and this exercise is the first time that has ever been
tested.

### 4.3 · Verify the schema

Run `supabase/diagnostics/CHECK_STATE.sql` in the SQL Editor. It is
read-only and reports the real state of what the later migrations touch,
including constraints and function bodies that a column check would miss.

### 4.4 · Seed the test accounts

Create the two accounts development has used throughout, so staging
exercises the same paths as local:

- A customer account.
- A professional account with a pro profile and at least one offered
  service.

Use addresses that are clearly non-production. **Never copy real user
data into staging** — it is a different security boundary and copying
production personal data into it is a data protection problem, not a
convenience.

### 4.5 · Point the app at staging and verify

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the staging
values, run the app, and walk the flows listed in §5.

## 5 · Acceptance verification

WP 00.06 is complete when every line here is true. Until then it is
blocked, not done.

- [ ] A staging Supabase project exists, distinctly named
- [ ] All 17 migrations applied cleanly **from empty**, in order
- [ ] `CHECK_STATE.sql` reports the expected schema state
- [ ] Test accounts seeded — one customer, one professional
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

## 7 · Known gaps

- **No migration ledger.** Nothing records which files have been applied
  to which environment. `CHECK_STATE.sql` infers state from the catalog
  instead. This is tolerable for seventeen hand-applied files and will
  not be tolerable for the migration volume Epics 01–14 introduce.
- **No Supabase CLI.** Migrations are applied by hand through the SQL
  Editor. Both of these are recorded as findings against WP 00.06 rather
  than solved inside it.

---

Version 1.0 — 2026-08-12 (Epic 00 WP06)

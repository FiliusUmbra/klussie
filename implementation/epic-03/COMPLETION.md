# Epic 03 — Completion Record

**Epic.** 03 — Workspace Engine
**Started.** 2026-08-14
**Completed.** 2026-08-16
**Work packages.** 12 of 12

---

## 1 · Gates

- [x] **1** Every work package finished — 12 of 12
- [x] **2** `npm run lint` passes
- [x] **3** `npm test` passes — **696 tests, 57 files**
- [x] **4** `npm run build` succeeds
- [x] **5** CI green on the branch — **observed this time.** PR #3's two
      "Lint, type-check, test, build" checks both passed, along with two
      Vercel preview deployments. The first epic in this roadmap where
      this gate has actual evidence rather than "never observed"
- [ ] **6** No known regressions — **no regression is known, and the
      manual verification list was not walked.** See §6
- [x] **7** Architecture preserved — no frozen document modified; four
      ADRs recorded (0024, 0025, 0026, 0027), each accepted as part of
      building the package it gated, not after the fact
- [x] **8** Documentation updated (§4)
- [x] **9** Deviations recorded as ADRs — 0024, 0025, 0026, 0027
- [ ] **10** Deployed to staging and verified — **migrations `0030`–`0038`
      are additive-only and have not been applied to any database this
      session.** No direct Postgres connection was available (§6)

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Every existing user has a Personal Workspace; every pro has a Professional Workspace; both belong to one identity | **Yes, on staging** | `VERIFY_BACKFILL_PERSONAL_WORKSPACE.sql`, `VERIFY_BACKFILL_PROFESSIONAL_WORKSPACE.sql`, `RECONCILE_WORKSPACE.sql` (10 checks, 7 real rows) — all run by the sessions that built WP 03.03/03.04/03.07, before this session's credential gap began |
| A user with one workspace sees no workspace concept anywhere in the UI | **Yes** | `WorkspaceSwitcher` renders `null` below two live memberships (`WorkspaceSwitcher.test.jsx`); the pre-Epic-03 topbar toggle is otherwise completely untouched |
| Every existing flow behaves identically | **Yes, by construction; not seen live** | Every switched read (`fetchCustomerRequests`, `fetchHouseholdItems`, `fetchProServices`, `fetchConversations`) falls back to its pre-Epic-03 filter when no workspace resolves — true of every account today, since production has none of these migrations. Tests assert the reshaped output is `toEqual` across both paths, not merely that neither throws. No browser session with valid credentials was available to confirm on a migrated database (§6) |
| Every workspace-scoped row carries its workspace | **Yes, on staging** | `VERIFY_WORKSPACE_COLUMN.sql`, `VERIFY_BACKFILL_WORKSPACE_IDS.sql` |
| Permission decisions are explainable | **Yes** | `workspace.decide_permission()` always returns exactly one row naming the membership and role that produced it, including deny-by-default with no membership at all — `VERIFY_WORKSPACE_PERMISSION_VOCABULARY.sql` check 4 |
| The membership helper is `STABLE` and evaluated once per statement | **Yes** | `VERIFY_MEMBERSHIP_HELPER.sql` check 4 (plan evidence); ADR-0026's "As implemented" section records the defect this requirement actually caught |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 03.01 | Workspace and membership tables | Complete | Three tables, not two — mutable current vs. append-only history are structurally different |
| 03.02 | The `STABLE` membership helper | Complete | ADR-0026: parameterless delegate required, not the originally-proposed `is_workspace_member(uuid)` — the argument shape that defeats once-per-statement evaluation |
| 03.03 | Backfill one Personal Workspace per identity | Complete | "My Home," matching the existing product's own naming |
| 03.04 | Backfill one Professional Workspace per pro profile | Complete | `coalesce(business_name, full_name, 'My Business')` |
| 03.05 | Workspace column on existing tables | Complete | Thirteen tables, nullable, unpopulated, unread — every table's eventual rule stated and cited in the migration itself |
| 03.06 | Backfill workspace on existing rows | Complete | The most error-prone package by the roadmap's own ranking; ordered for the derived chain (`service_requests` before `conversations` before `messages`) |
| 03.07 | Reconcile workspace assignment | Complete | Ten checks against real data; closes roadmap risk register item 1 for this environment |
| 03.08 | The workspace engine contract | Complete | ADR-0027's twelve-permission vocabulary, scoped deliberately to workspace lifecycle and membership only |
| 03.09 | Resolve request context once, client-side | Complete | Redefined by ADR-0024: no gateway exists or is built in this epic. `src/lib/workspaceContext.js` is the first real caller |
| 03.10 | The RLS isolation backstop | Complete | Narrowed by ADR-0025: adds a permissive policy to all thirteen tables, removes none of the 58 existing ones |
| 03.11 | The read switch | Complete | Two passes. First: `fetchCustomerRequests`, `fetchHouseholdItems`. Second, after catching a near-miss: `fetchProServices` switched; `fetchConversations` made additive, not switched (bilateral); `fetchPortfolioItems`/`fetchTestimonials` correctly left alone (shared with public profile viewing — switching would have broken it); `reports.js` had nothing to switch (no read exists) |
| 03.12 | The workspace switcher | Complete | `workspace.list_my_workspaces()` (migration 0038) added to carry type and name, which neither existing client-facing function returned. Reaches only the population with two or more real workspaces; everyone else keeps the pre-Epic-03 toggle exactly as it was |

## 4 · Documentation updated

- [x] `docs/MASTER_CONTEXT.md` — §2 milestone, §12 debt (two new rows)
- [x] `CHANGELOG.md`
- [x] `docs/IMPLEMENTATION_ROADMAP.md` — epic status and what it carries
- [x] `docs/adr/README.md` — 0024, 0025, 0026, 0027
- [x] `docs/engineering/TESTING.md` — `WorkspaceSwitcher` added to §5.8;
      regression baseline coverage test enforces this mechanically
- [ ] `docs/architecture/ARCHITECTURE.md` — not updated this session;
      owed before Epic 04 starts
- [ ] Epic 04 work packages — **not decomposed.** Roadmap §10 has the
      epic definition only

## 5 · What actually happened

**The roadmap's own wording for three of twelve packages did not survive
contact with the codebase, and each time the fix was recorded as an ADR
before the code that depended on it, not after.**

| WP | §14 says | Reality |
|---|---|---|
| 03.09 | "Resolve request context once at the gateway" | There is no gateway, and ADR-0024 decided none is built in this epic — the browser is the caller, "once per request" becomes "once per statement" |
| 03.10 | "The 58 existing policies simplify" | ADR-0025: two classes of policy (pre-engagement discovery, public professional profiles) cannot simplify to membership without deleting the mechanism that makes the marketplace work. The policy count went up, not down |
| 03.11 | Implied "every list, detail and dashboard query" is a uniform switch | It wasn't. `fetchPortfolioItems`/`fetchTestimonials` looked like candidates and would have been a real bug if switched — both are shared with public profile viewing, where the caller has no membership in the profile they're viewing |

**ADRs written.** Four, the most of any epic so far.

| ADR | Decision | What forced it |
|---|---|---|
| 0024 | Request context is resolved in the database until a gateway exists | No gateway has ever existed in this codebase; building one to satisfy WP 03.09's literal wording would have made Epic 03 both the largest and highest-risk epic in the roadmap |
| 0025 | Pre-engagement marketplace visibility and public professional profiles survive Epic 03 unchanged | The two classes of policy WP 03.10 cannot reshape without a catastrophic regression |
| 0026 | The membership helper is a `SECURITY DEFINER` function in a dedicated `api` schema | Epic 01's grant posture leaves no client role able to call anything in `workspace` directly, and the isolation predicate is the platform's hottest path — revised mid-package when the originally proposed shape was found to defeat its own performance requirement |
| 0027 | The workspace permission vocabulary | `decide_permission()` needs a defined set of permission keys before it can decide anything; scoped deliberately to what the Workspace engine itself owns |

**Surprises.** Four that changed the work.

1. **`api.is_workspace_member(uuid)`, as ADR-0026 originally specified it, cannot
   achieve once-per-statement RLS evaluation.** `STABLE` only permits that when a
   function's argument doesn't vary per row; the natural policy usage passes the
   scanned row's own column. Found building WP 03.02, before it shipped the
   exact failure mode it existed to prevent.
2. **The pre-existing "Previewing as: Customer | Pro" toggle already does most of
   what a workspace switcher does — and is visible to every signed-in user,
   including ones with a single workspace.** Discovered while scoping WP 03.12;
   led to an explicit, recorded decision (via `AskUserQuestion`) to build the real
   switcher only for the population with two or more genuine workspaces, and to
   leave the existing toggle untouched rather than risk removing the only path to
   "become a pro" for everyone else.
3. **`RoleSelectionScreen` asks the exact classification question
   `PLATFORM_DOMAIN_MODEL.md` §27 forbids.** Predates the freeze; not fixed in
   this epic; recorded in `MASTER_CONTEXT.md` §12 rather than silently worked
   around.
4. **This session has no direct Postgres connection**, unlike every prior
   session in this epic (WP 03.01–03.08's commits record `VERIFY_*.sql` runs
   against staging). Every SQL diagnostic from WP 03.09 onward was written but
   not run against a live database — see §6.

**Deferred.** Three, each with a stated home.

- **The rest of the marketplace read paths** (`fetchProLeads`/`fetchProJobs`,
  the pre-engagement discovery ADR-0025 already carves out) are Epic 12's job,
  by that ADR's own removal trigger.
- **`RoleSelectionScreen`'s classification question** — a product decision, not
  an implementation one (`MASTER_CONTEXT.md` §12).
- **`docs/architecture/ARCHITECTURE.md`** was not updated this epic; owed before
  Epic 04 starts.

## 6 · Regressions and known issues

**No regression is known.** Every read-switch package is fallback-first by
construction: a database without Epic 03's migrations — production, today —
takes the identical pre-Epic-03 path on every one of them.

**What was not done: nothing in this epic was seen rendering signed in, and no
SQL diagnostic from WP 03.09 onward was run against a database.** Two distinct
gaps, both new to this session rather than carried from Epic 02 unchanged:

- **No working credentials.** Both known test accounts
  (`vereecken.michael+customer1@gmail.com`, `+pro2@gmail.com`) returned
  "Invalid login credentials" against whichever project `.env.local` targets.
  A new account was deliberately not created to work around this — out of
  bounds regardless of environment.
- **No direct Postgres connection.** No pooler host/password, no linked
  Supabase CLI project. `VERIFY_WORKSPACE_ISOLATION_POLICIES.sql` and
  `VERIFY_LIST_MY_WORKSPACES.sql` are written, both following the exact
  probe discipline every prior `VERIFY_*.sql` in this epic used, and neither
  has been run.

| Issue | Severity | Tracked where |
|---|---|---|
| WP 03.09–03.12 not seen rendering or exercised live | **High** | This section; `MASTER_CONTEXT.md` §12 |
| No direct Postgres connection available to this session | **High** — blocks every future `VERIFY_*.sql` until resolved | This section; `MASTER_CONTEXT.md` §12 |
| `RoleSelectionScreen` violates §27/Principle 3 | **High**, pre-existing | `MASTER_CONTEXT.md` §12 |
| Migrations `0030`–`0038` not applied to production | **High** before Epic 04 touches anything read-switched | `operations/PRODUCTION_MIGRATION_0018_0029.md`, itself only covering `0018`–`0029` and owed an update |
| Three ADRs from Epic 01 still `Proposed` | High while their tables are empty | Carried, unchanged, from Epic 01/02 |
| `docs/architecture/ARCHITECTURE.md` not updated | Medium | §4 above |

## 7 · Verification performed

**Automated.** 561 → **696 tests**, 42 → **57 files**. Every package ran lint,
type-check, test and build before commit; all green, including this epic's
first observed CI run (PR #3, two passing "Lint, type-check, test, build"
checks and two Vercel preview deployments).

**On staging, but only through WP 03.08.** `VERIFY_WORKSPACE.sql`,
`VERIFY_MEMBERSHIP_HELPER.sql`, both backfill verifications,
`RECONCILE_WORKSPACE.sql`, `VERIFY_WORKSPACE_COLUMN.sql`, `VERIFY_BACKFILL_
WORKSPACE_IDS.sql` and `VERIFY_WORKSPACE_PERMISSION_VOCABULARY.sql` all
passed, run by the sessions that built WP 03.01–03.08. **Nothing from WP
03.09 onward has been run against any database.**

**Not performed.** No browser walk of any surface. No SQL diagnostic run
since WP 03.08. Nothing applied to production.

## 8 · Sign-off

- [x] Eight of ten gates met — an improvement on Epic 02's eight of ten, with
      a different two open (CI is now evidenced; staging verification is the
      new gap, for tooling reasons rather than credentials this time)
- [x] Repository releasable
- [ ] **Next epic ready to start — with two things to settle first.** A
      direct Postgres connection (or working staging credentials) needs to
      reach whichever session picks up WP 03.09–03.12's unrun diagnostics, and
      `docs/architecture/ARCHITECTURE.md` is owed an update this epic didn't
      make time for. Epic 04 (Capability) and Epic 05 (Property) are both now
      unblocked by the roadmap's own dependency graph.

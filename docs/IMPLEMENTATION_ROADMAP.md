# Klussie — Implementation Roadmap

**This document owns:** the engineering execution plan — how the frozen
architecture becomes a production platform, in what order, in what sized
pieces, and under what completion gates. It is the master plan every
implementation session works from.

It does **not** own architecture. The five frozen documents are the only
architectural source of truth:

| Document | Owns |
|---|---|
| [`product/PRODUCT_CONSTITUTION.md`](./product/PRODUCT_CONSTITUTION.md) | Product principles and rules |
| [`architecture/PLATFORM_DOMAIN_MODEL.md`](./architecture/PLATFORM_DOMAIN_MODEL.md) | What the platform is |
| [`architecture/DATABASE_ARCHITECTURE.md`](./architecture/DATABASE_ARCHITECTURE.md) | How it is represented in data |
| [`architecture/SYSTEM_ARCHITECTURE.md`](./architecture/SYSTEM_ARCHITECTURE.md) | How it behaves as software |
| [`architecture/SUPABASE_ARCHITECTURE.md`](./architecture/SUPABASE_ARCHITECTURE.md) | How it is persisted |

**Nothing in this document may contradict them.** Where implementation
appears to require it, that is an ADR, not a decision made in passing.

**This document supersedes two earlier plans**, and says so explicitly
rather than becoming a third competing roadmap:

| Superseded | Why |
|---|---|
| [`EXECUTION_ROADMAP.md`](./EXECUTION_ROADMAP.md) | Its 10-epic sequence predates the frozen architecture. Epics 01 and 03 were delivered; the rest assumed a marketplace, not a platform |
| [`architecture/ROADMAP.md`](./architecture/ROADMAP.md) | Its 13 phases predate the domain model and use a different, easily-confused phase numbering |

Both are retained as historical record. **Neither is a source of truth
for what to build next** — this document is. Where they disagree with
this one, this one wins.

---

## Table of contents

1. [How to Use This Document](#1--how-to-use-this-document)
2. [The Engineering Reality](#2--the-engineering-reality)
3. [The Migration Pattern](#3--the-migration-pattern)
4. [Engineering Rules](#4--engineering-rules)
5. [Epic Map and Sequencing](#5--epic-map-and-sequencing)
6. [Work Package Standard](#6--work-package-standard)
7. [Completion Gates](#7--completion-gates)
8. [Testing Strategy](#8--testing-strategy)
9. [Documentation Obligations](#9--documentation-obligations)
10. [Epic Definitions](#10--epic-definitions)
11. [Work Packages — Epic 00](#11--work-packages--epic-00)
12. [Work Packages — Epic 01](#12--work-packages--epic-01)
13. [Work Packages — Epic 02](#13--work-packages--epic-02)
14. [Work Packages — Epic 03](#14--work-packages--epic-03)
15. [Work Packages — Epic 05](#15--work-packages--epic-05)
16. [Risk Register](#16--risk-register)
17. [How Implementation Sessions Work](#17--how-implementation-sessions-work)

---

## 1 · How to Use This Document

**To start work:** "Start Epic 03" or "Start Work Package 03.04". The
session reads the epic definition (§10), its work packages, and the
frozen documents the epic references — then implements exactly that work
package and stops.

**Work packages are decomposed just-in-time.** §11–§14 contain complete
work packages for Epics 00–03, which is where implementation starts.
**Later epics are defined but not decomposed**, deliberately:

> Decomposing Epic 20 today produces fiction. The codebase it will act on
> does not exist yet, and eighteen months of intervening decisions will
> invalidate every file path and half the assumptions. Work packages are
> written at epic start, using the standard in §6, when the ground they
> stand on is real.

This is a planning decision, not an omission. The epic definitions carry
everything needed to sequence, resource and gate the work; the work
packages carry everything needed to *do* it, and are written when doing
begins.

## 2 · The Engineering Reality

**Klussie is a working product with real users.** It is deployed, it has
test accounts, it processes requests, quotes and messages. This is the
single most important constraint on everything below, and it rules out
the approach the architecture might otherwise suggest.

**The gap between current and target:**

| Dimension | Today | Target |
|---|---|---|
| Tenancy | None — identity carries role | Workspace, everywhere |
| Schemas | Everything in `public` | Ten schemas by engine tier |
| Business rules | Postgres triggers (`on_quote_accepted`, `on_job_completed`, …) | Versioned workflow definitions |
| Events | `domain_events` table, few consumers | Outbox, six consumer classes |
| Physical model | `household_items`, no property/location/asset | Property → Location → Asset with facets |
| Types | None | TypeScript |
| CI | None | Gate on lint, test, build |
| Environments | Production only | Staging + production |

**What this rules out.** A greenfield build of "Epic 01 — Identity
Engine" is meaningless: identity already exists and is load-bearing.
Every foundation epic is a **migration of working behaviour into the new
architecture**, not a new build. Treating them as new builds is how a
project ends up with two identity systems and no way to choose between
them.

**The non-negotiable:** *the application must be fully functional after
every completed work package.* Not after every epic — after every work
package. That is what §3 exists to make possible.

## 3 · The Migration Pattern

Every aggregate that already exists in some form migrates by the same six
steps. **This is the spine of the whole roadmap** and the reason no work
package ever breaks the application.

| Step | What happens | App state |
|---|---|---|
| **1 · Add** | New structure created alongside the old. Nothing reads or writes it | Unchanged — new structure is inert |
| **2 · Backfill** | Existing data copied into the new structure, idempotently and re-runnably | Unchanged — new structure now populated but unused |
| **3 · Dual-write** | Writes go to both old and new. Old remains authoritative | Unchanged — new structure now live but unread |
| **4 · Verify** | Reconciliation proves old and new agree, over real production data | Unchanged — this step ships no behaviour |
| **5 · Switch reads** | Reads move to the new structure. Old still written | **Behaviour change** — the only step that can regress, and the only one to roll back |
| **6 · Retire** | Old writes stop; old structure dropped after a soak period | Unchanged |

**Why six steps rather than one migration.** Each is a separate work
package with its own rollback point. Steps 1–4 are pure additions and
cannot break anything. Step 5 is the only risky one, and by the time it
runs, step 4 has already proved the new structure produces identical
answers over real data. Step 6 happens weeks later, after confidence.

**The rollback rule.** Steps 1–4 roll back by dropping what was added.
Step 5 rolls back by reverting one read path — a code change, not a data
change. **No step ever requires reversing a data migration**, which is
the property that makes this safe on a production database with no
staging history.

**Backfills are idempotent and re-runnable.** This is already established
practice in the repo (migrations `0013` and `0015` were made re-runnable
deliberately) and it becomes a rule: a backfill that can only be run once
is a backfill that cannot be trusted.

## 4 · Engineering Rules

Enforceable, and quotable in review. These extend
`engineering/ENGINEERING_STANDARDS.md` rather than replacing it.

**Architecture**

1. **No architectural drift.** The five frozen documents are the only
   source of truth. A deviation requires an ADR *before* the code.
2. **No engine bypasses another engine.** No direct writes into another
   engine's aggregates — enforced by schema grants
   (`SUPABASE_ARCHITECTURE.md` §9).
3. **Business rules belong in workflow definitions**, not in triggers,
   not in components, not in data-access modules.
4. **Permissions belong to the Workspace and Capability engines.** No
   feature implements its own access logic.
5. **AI never owns business rules.** Intelligence proposes; owning
   engines decide.
6. **Never branch on workspace type.** Branch on capability.

**Code**

7. **Extend before rewriting.** The default is to grow existing code.
   A rewrite needs a stated reason.
8. **No duplicate business logic.** A rule exists in one place.
9. **No feature-specific implementations** of a general concept.
10. **No temporary hacks.** If a shortcut is genuinely required, it is an
    ADR with a removal trigger, not a comment.
11. **No component over 300 lines, no function over 40** — existing
    standard, unchanged.

**Delivery**

12. **Every work package leaves the repository releasable.** Lint passes,
    tests pass, build succeeds.
13. **Every extracted or migrated module ships with tests.** This is the
    established refactor contract on this project and it is not relaxed.
14. **Behaviour changes are explicit.** A work package that changes what
    a user sees says so in its acceptance criteria. A migration work
    package that changes behaviour by accident is a defect.

## 5 · Epic Map and Sequencing

**Twenty-seven epics in nine tiers.** The order is dependency-driven; the
tiers describe *why* each group exists.

| Tier | Epics | Rationale |
|---|---|---|
| **0 · Engineering Foundation** | 00 | Nothing else is safe without it |
| **1 · Platform Foundation** | 01–04 | Tenancy and the event spine — everything depends on these |
| **2 · Physical Model** | 05–08 | The digital twin's parts |
| **3 · Work and Exchange** | 09–14 | Where the current product's behaviour migrates |
| **4 · Memory and Intelligence** | 15–18 | The compounding value |
| **5 · Platform Services** | 19–21 | Derived, consume events |
| **6 · Commercial** | 22 | Plans and capability bundles |
| **7 · Demand-gated** | 23–24 | Built when a customer requires it, not before |
| **8 · Delivery** | 25–26 | Reach and readiness |

```
E00 Engineering Foundations
      │
E01 Schema Foundation & Event Backbone
      │
E02 Identity ──► E03 Workspace ──► E04 Capability
                      │
      ┌───────────────┼───────────────┐
E05 Property ──► E06 Location ──► E07 Asset ──► E08 Document
      │
E09 Workflow ──► E10 Maintenance ──► E11 Service Record
                                          │
                              E12 Marketplace ──► E13 Conversation ──► E14 Billing
                                          │
E15 Timeline & Twin ── E16 Knowledge ── E17 Intelligence ── E18 Provider Intelligence
                                          │
      E19 Notification ── E20 Search ── E21 Analytics ── E22 Subscription
                                          │
                    E23 Enterprise ·· E24 Integration  (demand-gated)
                                          │
                              E25 Mobile ── E26 Production Readiness
```

**Three sequencing decisions worth defending:**

**Epic 00 is first and is not negotiable.** `MASTER_CONTEXT.md` §12 lists
no CI as the highest-severity debt, and this roadmap is a twenty-six epic
migration of a live production database. Running that without an
automated gate on lint, test and build is not a risk to be managed — it
is a near-certainty of undetected regression. Everything else waits.

**Workflow (09) precedes Marketplace (12).** The current booking state
machine lives in Postgres triggers, which `PLATFORM_DOMAIN_MODEL.md`
§14.2 replaces with versioned workflow definitions. Migrating the
marketplace before the workflow engine exists would mean either rebuilding
those triggers in the new schema — entrenching the thing being removed —
or leaving the marketplace without a state machine. Workflow first.

**Epics 23–24 are demand-gated, not scheduled.** Enterprise features and
integrations are architecturally ready and should not be built
speculatively. `PLATFORM_DOMAIN_MODEL.md` §5 makes the same point about
workspace groups: the question is answered by the first customer that
needs one, not in advance. Building them early spends months on
assumptions.

**Realistic phasing.** At single-maintainer pace, Tier 0–1 is the first
substantial block of work, and Tier 2–3 is where the current product's
behaviour actually moves. **Tiers 0–3 constitute the migration; tiers 4–6
are where the platform starts being worth more than what it replaced.**
Nothing after Tier 3 is on the critical path to a working platform.

## 6 · Work Package Standard

Every work package, for every epic, conforms to this. It is the template
used when later epics are decomposed.

**Sizing:** approximately 1–3 hours of focused work. A package that
cannot be described in this format is too large and must be split.

**Required fields:**

| Field | Meaning |
|---|---|
| **ID** | `EE.NN` — epic, sequence |
| **Title** | Imperative, specific |
| **Goal** | One sentence: what is true afterwards that was not before |
| **Files** | Expected to change. Approximate is fine; unbounded is not |
| **DB impact** | Migration? Additive/backfill/read-switch/retire? None? |
| **Frontend impact** | Including "none" |
| **Backend impact** | Including "none" |
| **Tests** | What is added or changed. Never "none" |
| **Acceptance** | Objective, checkable, no judgement calls |
| **Complexity** | Low / Medium / High |
| **Rollback** | What reverting looks like, specifically |

**Rules every work package obeys:**

- Independently testable and independently shippable.
- Leaves the application working — §2's non-negotiable.
- Touches no unrelated module.
- Contains no architectural change. If one seems needed, stop and write
  an ADR.
- Has a clear rollback point.
- Prefers extending existing code to rewriting it.

## 7 · Completion Gates

**A work package is complete when:** its acceptance criteria are met;
lint passes; tests pass; the production build succeeds; and the
application demonstrably still works.

**An epic is complete when all of the following are objectively true:**

| # | Gate | Verified by |
|---|---|---|
| 1 | Every work package finished | Checklist in the epic |
| 2 | Lint passes | `npm run lint` |
| 3 | All tests pass | `npm test` |
| 4 | Production build succeeds | `npm run build` |
| 5 | CI green on the branch | The pipeline from Epic 00 |
| 6 | No known regressions | Regression suite + manual verification list |
| 7 | Architecture preserved | Review against the epic's referenced documents |
| 8 | Documentation updated | The epic's documentation list (§9) |
| 9 | Any deviation recorded as an ADR | ADR index updated |
| 10 | Deployed to staging and verified | Staging environment from Epic 00 |

**An epic is not complete because its code is written.** Gates 6–10 are
the ones that get skipped under pressure, and they are the ones that
prevent this roadmap from producing an unmaintainable result.

## 8 · Testing Strategy

Applies to every epic. An epic's own definition adds only what is
specific to it.

| Layer | What it covers | When required |
|---|---|---|
| **Unit** | Rules, calculations, resolution logic, scope evaluation | Every work package touching logic |
| **Integration** | Engine contracts, event emission, projection building, RLS behaviour | Every work package touching a boundary |
| **Regression** | Existing behaviour that must not change | Every migration work package |
| **Build** | Production build succeeds | Every work package |
| **Accessibility** | Focus, keyboard, live regions, contrast, touch targets | Every work package touching UI |
| **Performance** | Query cost on the hot paths named in `SUPABASE_ARCHITECTURE.md` §20 | Epics touching those paths |
| **Manual** | A written verification list per epic, executed on staging | Every epic |

**The house style holds:** tests explain *why* a rule matters, not merely
that it holds.

**Migration testing has one additional requirement.** Every step-5
read-switch work package (§3) must be preceded by a reconciliation test
proving old and new produce identical results over real data. **A
read-switch without a passing reconciliation is not permitted.**

## 9 · Documentation Obligations

Updated at epic completion, not deferred:

| Document | When |
|---|---|
| `MASTER_CONTEXT.md` | Every epic — §2 milestone, §3 current state, §4 health, §12 debt |
| `architecture/ARCHITECTURE.md` | Every epic — it owns what is *currently built* |
| `adr/README.md` + new ADR | Any deviation, or any decision a future contributor could plausibly reverse |
| `IMPLEMENTATION_ROADMAP.md` | Epic marked complete; next epic's work packages added |
| `engineering/ENGINEERING_STANDARDS.md` | Only if a standard changed |
| `CHANGELOG.md` | Every epic — created in Epic 00 |
| Testing documentation | When the strategy or harness changes |

**The five frozen architecture documents are never updated by an epic.**
If reality diverges from them, that is an ADR and an architecture
decision, not a documentation edit.

## 10 · Epic Definitions

Each epic states purpose, business value, dependencies, the architecture
it must satisfy, its database/Supabase footprint, frontend and backend
work, testing beyond §8, acceptance, and future extensions.

---

### Epic 00 — Engineering Foundations

**Purpose.** Make the next twenty-six epics safe to attempt.

**Business value.** Indirect and decisive: every subsequent epic migrates
a live production database. Without an automated gate, a regression
reaches users unnoticed. This epic buys the ability to move quickly
later.

**Dependencies.** None. Nothing may precede it.

**Architecture references.** `engineering/ENGINEERING_STANDARDS.md`;
`SUPABASE_ARCHITECTURE.md` §21 (verified restore).

**Database.** None to the schema. Creates a **staging Supabase project**
— today production is the only environment that has ever existed.

**Supabase.** Staging project provisioned, migrations applied from
scratch to prove they are replayable, seed data for test accounts.

**Frontend.** None.

**Backend.** None. Tooling and configuration only.

**Testing.** Establishes the harness the other epics rely on: CI runs
lint, test and build on every push; the existing 22 test files must pass
unchanged.

**Acceptance.**
- CI pipeline runs lint, test and build on every push and pull request,
  and blocks merge on failure.
- A staging Supabase project exists, with all migrations applied from
  empty, proving replayability.
- TypeScript compiles alongside JavaScript, with at least one module
  migrated to prove the toolchain.
- `CHANGELOG.md` exists.
- A verified restore has been performed once from a production backup
  into a scratch environment.

**Future extensions.** E2E tests (Playwright), preview environments per
branch, automated dependency updates, coverage reporting.

---

### Epic 01 — Schema Foundation & Event Backbone

**Purpose.** Create the ten schemas and the event outbox, so every later
epic has somewhere correct to put things and a way to emit facts.

**Business value.** Indirect. It is the substrate; nothing works
correctly without it and nothing visible changes because of it.

**Dependencies.** Epic 00.

**Architecture references.** `SUPABASE_ARCHITECTURE.md` §2 (schemas), §9
(grants), §12 (event storage), §19 (partitioning);
`DATABASE_ARCHITECTURE.md` §23 (event-first);
`SYSTEM_ARCHITECTURE.md` §5 (the backbone).

**Database.** Ten schemas. Partitioned events table. Partitioned audit
table. Role grants mirroring engine ownership. Nothing in `public`.

**Supabase.** Extensions (`ltree`, `pg_cron`) in their own schema. Role
configuration.

**Frontend.** None.

**Backend.** Event emission helper usable inside a transaction. Cursor-based
consumer scaffolding. Audit write path.

**Testing.** Integration tests proving an event is emitted in the same
transaction as its change and is rolled back with it; that a consumer
resumes from its cursor; that grants prevent cross-schema writes.

**Acceptance.**
- Ten schemas exist with grants enforcing engine ownership.
- Events table is partitioned (hash by workspace, range by time) and
  append-only — update and delete fail for every application role.
- An event emitted in a rolled-back transaction does not exist.
- A consumer can be stopped, restarted, and resumes without gap or
  duplicate effect.
- Existing `domain_events` continues to work, untouched.

**Future extensions.** Queue-backed delivery, external event subscription
(Epic 24), replay tooling.

---

### Epic 02 — Identity Engine

**Purpose.** Separate the platform's identity from Supabase Auth, and
introduce the person reference that survives erasure.

**Business value.** Enables the workspace pivot; makes erasure lawful
without destroying history.

**Dependencies.** Epics 00, 01.

**Architecture references.** `SYSTEM_ARCHITECTURE.md` §6.1;
`SUPABASE_ARCHITECTURE.md` §11.4, §3 (UUIDv7), §5 (no FK to identity);
`DATABASE_ARCHITECTURE.md` §8.

**Database.** `identity` schema. Person reference. Backfill from existing
`profiles`. No foreign key from any durable record to identity.

**Supabase.** Auth becomes an adapter, not the identity model. Auth user
deletion must not cascade.

**Frontend.** Minimal — existing profile screens continue to work; the
data source moves beneath them.

**Backend.** Identity engine contract: authenticate, resolve a person
reference to display information, assert a verified attribute.

**Testing.** Regression on every existing auth and profile flow. Unit
tests on erasure semantics: redaction leaves the reference resolvable as
a key and unresolvable as a person.

**Acceptance.**
- Every existing user has an identity row with a person reference.
- All existing auth flows work unchanged — login, signup, become-a-pro,
  profile edit.
- Erasing an identity leaves referencing rows intact.
- No durable table foreign-keys to identity.

**Future extensions.** Federated identity, additional factors, portable
verified credentials, identity merge.

---

### Epic 03 — Workspace Engine

**Purpose.** Introduce workspaces and memberships, and migrate every
existing user onto them. **This is the pivot of the entire roadmap.**

**Business value.** Unlocks everything. Without it there is no tenancy,
no enterprise path, no capability model, and no platform — only a
marketplace.

**Dependencies.** Epics 00, 01, 02.

**Architecture references.** `PLATFORM_DOMAIN_MODEL.md` §2, §5, §7, §27;
`SYSTEM_ARCHITECTURE.md` §6.2; `SUPABASE_ARCHITECTURE.md` §6, §7, §8.

**Database.** `workspace` schema: workspace, membership (append-only
history plus current), invitations. Backfill: **one Personal Workspace
per existing user; one Professional Workspace per existing pro profile.**
Workspace column added to every existing workspace-scoped table.

**Supabase.** RLS reshaped — policies become isolation and membership;
the richer decisions move to the engine. The security-definer `STABLE`
membership helper is created here and is load-bearing for every later
epic's performance.

**Frontend.** The workspace switcher, **hidden entirely for
single-workspace users** — `PLATFORM_DOMAIN_MODEL.md` §27 requires the
concept to be invisible to the majority who have one. Active workspace
becomes part of every request.

**Backend.** Workspace engine contract: resolve context, decide
permission, manage membership. Request context resolved once and passed
inward (`SYSTEM_ARCHITECTURE.md` §12.1).

**Testing.** The heaviest regression burden in the roadmap. Every
existing flow must work identically for a user with exactly one
workspace. Reconciliation proving the backfill assigned every row to the
correct workspace. Performance tests on the membership helper.

**Acceptance.**
- Every existing user has a Personal Workspace; every pro has a
  Professional Workspace; both belong to one identity.
- A user with one workspace sees no workspace concept anywhere in the UI.
- Every existing flow behaves identically.
- Every workspace-scoped row carries its workspace.
- Permission decisions are explainable — the engine can state which
  membership, role and scope produced a decision.
- The membership helper is `STABLE` and evaluated once per statement.

**Future extensions.** Workspace groups, shared stewardship, directory
sync, custom roles.

---

### Epic 04 — Capability Engine

**Purpose.** Make behaviour capability-driven, and eliminate every
workspace-type branch before one can be written.

**Business value.** Pricing and packaging become product work rather than
engineering work; enterprise becomes a capability grant rather than a
rebuild.

**Dependencies.** Epic 03.

**Architecture references.** `PLATFORM_DOMAIN_MODEL.md` §6 (whole
chapter), Principle 1; `SYSTEM_ARCHITECTURE.md` §6.3, §34.

**Database.** Capability grants in `workspace`. Capability catalogue and
presets in `platform`. Convergence with the existing `feature_flags`
table rather than coexistence.

**Supabase.** Capability resolution joins the request context.

**Frontend.** A missing capability renders a feature **absent**, not
denied — `SYSTEM_ARCHITECTURE.md` §23 rule 13.

**Backend.** Capability engine contract; dependency resolution on grant
and withdrawal; the two-gate order enforced at the gateway.

**Testing.** Every feature tested with its capability present and absent
— two states, replacing the combinatorial type testing this removes.
A lint or test rule that fails the build on any workspace-type branch.

**Acceptance.**
- No code branches on workspace type. Enforced automatically.
- Capabilities resolve into the request context once per request.
- Withdrawing a capability removes behaviour and no data.
- Presets exist for Personal, Professional and Business.

**Future extensions.** Capability versioning, time-limited grants, scoped
capabilities (deferred by `PLATFORM_DOMAIN_MODEL.md` §30).

---

### Epics 05–08 — Physical Model

**Epic 05 — Property Engine.** Property aggregate and **stewardship as
append-only periods**. Backfill: existing "My Home" data becomes a
property per Personal Workspace. Timeline access scoped to stewardship
periods (`DATABASE_ARCHITECTURE.md` §25). References
`PLATFORM_DOMAIN_MODEL.md` §9, `SYSTEM_ARCHITECTURE.md` §7.1.

**Epic 06 — Location Engine.** Recursive tree with `ltree` materialised
paths; **subtree containment as a first-class operation**;
`LocationTreeChanged` wired to its consumers — scope invalidation and
re-indexing — in the same transaction as the path rewrite. The highest
correctness risk in the physical tier
(`SUPABASE_ARCHITECTURE.md` §11.2).

**Epic 07 — Asset Engine.** Assets, **declared facets**, and
**placements as append-only periods**. Migrates the existing
`household_items` table, which is the current product's asset concept in
embryo. References `PLATFORM_DOMAIN_MODEL.md` §11,
`SYSTEM_ARCHITECTURE.md` §7.3.

**Epic 08 — Document Engine.** Metadata in Postgres, content in Storage;
**attachment separated from sharing**; validity periods driving expiry.
Migrates existing avatars, portfolio images and request photos. Carries
the signed-URL mitigations from `SUPABASE_ARCHITECTURE.md` §11.3.

Each: dependencies are the preceding epic; testing follows §8 plus
regression on the data being migrated; acceptance is that existing
behaviour is identical and the new structure is authoritative.

---

### Epics 09–14 — Work and Exchange

**Epic 09 — Workflow Engine.** Definitions as versioned configuration;
instances pinned to a version; transitions append-only and authoritative;
current stage derived. **This epic ends the trigger-based state machine**
— `on_quote_accepted`, `on_job_completed`, `on_review_created`,
`on_request_created`, `on_quote_sent` become workflow definitions
(`SUPABASE_ARCHITECTURE.md` §23 conflict 3, §24 item 15). The single
largest behavioural risk in the roadmap and the reason it precedes
Marketplace.

**Epic 10 — Maintenance Engine.** Obligations, schedules, due and overdue
state, decoupled from who performs the work.

**Epic 11 — Service Record Engine.** Core, annexes and amendments as
three tables; the visibility classification structural rather than
policy-based; permanent and non-deletable. Identified by
`DATABASE_ARCHITECTURE.md` §32 as the highest-risk surface — this epic
warrants a dedicated security review before its read-switch.

**Epic 12 — Marketplace Engine.** Requests, quotes, engagements migrated
onto the new schema and driven by workflow definitions rather than
triggers. Engagements create scoped expiring memberships. **Provider
selection is not in this epic** — Marketplace executes; Provider
Intelligence chooses (`SYSTEM_ARCHITECTURE.md` §21 finding 3).

**Epic 13 — Conversation Engine.** Conversations bound to subjects;
messages immutable; originals permanent; translations derived. Migrates
existing messages and the `translations` cache.

**Epic 14 — Billing Engine.** Immutable financial records, multi-currency
and multi-jurisdiction from the first row. **The first real revenue
path** — commission is currently a display-only constant
(`MASTER_CONTEXT.md` §3). Sequenced here because it becomes possible the
moment engagements complete correctly.

---

### Epics 15–18 — Memory and Intelligence

**Epic 15 — Timeline & Digital Twin.** Timeline as a projection scoped to
stewardship periods; the twin **assembled, never stored**
(`DATABASE_ARCHITECTURE.md` §28); narrow summary projections only.

**Epic 16 — Knowledge Engine.** Workspace Knowledge as declared, binding
policy; graph edges with asserted and inferred permanently
distinguishable; the world graph; **promotion as an audited operation**.

**Epic 17 — Intelligence Engine.** Migrates the existing AI intake and
translation onto the engine contract. The six-stage loop. Published
memory versions append-only. Intelligence acts under a person's
authority with no elevated role.

**Epic 18 — Provider Intelligence Engine.** Selection across all supply
sources; decisions and overrides recorded append-only; explainability
captured *with* the recommendation. Makes the marketplace one strategy
among several rather than the default.

---

### Epics 19–22 — Services and Commercial

**Epic 19 — Notification Engine.** Workspace-scoped notifications;
identity-scoped inbox composed at read time; preferences per membership.
Closes the "no notifications outside an open tab" risk in
`MASTER_CONTEXT.md` §13.

**Epic 20 — Search Engine.** Postgres full-text across the eight domains;
**scope indexed, never post-filtered**; re-indexing on scope-affecting
events. Replaces the current client-side catalogue filter.

**Epic 21 — Analytics Engine.** Two physically separate schemas, two role
grants. First instrumentation of the KPIs in `MASTER_CONTEXT.md` §14,
none of which is currently measured.

**Epic 22 — Subscription Engine.** Plans as capability bundles; the six
tiers from `PLATFORM_DOMAIN_MODEL.md` §24. Separate from Billing so a
capability can be granted with no commercial event.

---

### Epics 23–24 — Demand-gated

**Epic 23 — Enterprise Features.** Scoped roles at depth, approval
workflows, compliance obligations, enterprise reporting, workspace
groups. **Not scheduled.** Built when a real enterprise customer requires
it, against their actual requirements rather than assumptions.

**Epic 24 — Integration Engine.** Adapters, outbound event subscription,
inbound data as commands through the normal gates. **Not scheduled.**
Each integration is added when there is a customer for it.

---

### Epics 25–26 — Delivery

**Epic 25 — Mobile Readiness.** Responsive completion, touch targets,
offline tolerance, push notification delivery, and the packaging decision
— which is an ADR, not a foregone conclusion.

**Epic 26 — Production Readiness.** Observability, alerting, performance
verification against the hot paths, security review, disaster-recovery
drill, runbooks, and the release process. Partly begun in Epic 00 and
continuous thereafter; this epic is the final gate rather than the first
attention.

---

## 11 · Work Packages — Epic 00

**00.01 · Add CI pipeline for lint, test and build**
**Goal.** Every push and pull request is automatically gated.
**Files.** `.github/workflows/ci.yml` (new).
**DB.** None. **Frontend.** None. **Backend.** None.
**Tests.** The pipeline runs the existing suite; no new tests.
**Acceptance.** Pipeline runs `npm run lint`, `npm test`, `npm run build`
on push and PR; a deliberately failing test blocks the run; all three
pass on the current branch.
**Complexity.** Low. **Rollback.** Delete the workflow file.

**00.02 · Add CHANGELOG and release note conventions**
**Goal.** Every epic's changes are recorded in one place.
**Files.** `CHANGELOG.md` (new), `docs/engineering/ENGINEERING_STANDARDS.md`.
**DB / Frontend / Backend.** None.
**Tests.** None — documentation only. *(The single permitted exception to
"never none"; noted explicitly so it is not treated as precedent.)*
**Acceptance.** `CHANGELOG.md` exists with a stated format; the standard
references it.
**Complexity.** Low. **Rollback.** Delete the file.

**00.03 · Introduce TypeScript toolchain without migrating code**
**Goal.** TypeScript compiles alongside JavaScript; nothing is converted.
**Files.** `tsconfig.json` (new), `package.json`, `vite.config.js`,
`eslint.config.js`.
**DB / Frontend / Backend.** None.
**Tests.** Existing suite must pass unchanged.
**Acceptance.** `npm run build` succeeds; a type-check script exists and
passes; no `.js` file has been converted.
**Complexity.** Medium. **Rollback.** Remove the config and the script.

**00.04 · Migrate one leaf module to TypeScript as proof**
**Goal.** Prove the toolchain on a real module with no dependents at
risk.
**Files.** One small `src/lib` module and its test.
**DB / Frontend / Backend.** None.
**Tests.** Existing tests for that module pass unchanged.
**Acceptance.** The module is `.ts`; its tests pass; the build succeeds;
type-check passes.
**Complexity.** Low. **Rollback.** Revert the file rename.

**00.05 · Add type-check to CI**
**Goal.** Type errors block merge.
**Files.** `.github/workflows/ci.yml`.
**Acceptance.** CI fails on a deliberately introduced type error.
**Complexity.** Low. **Rollback.** Remove the step.

**00.06 · Provision the staging Supabase project**
**Goal.** A second environment exists. Production stops being the only
one.
**Files.** `.env.example`, `docs/operations/ENVIRONMENTS.md` (new).
**DB.** All existing migrations applied from empty — which also proves
they are replayable, something never yet verified.
**Frontend / Backend.** Environment configuration only.
**Tests.** Manual verification that the app runs against staging.
**Acceptance.** Staging exists; all 17 migrations apply cleanly from
empty; the app runs against it; test accounts are seeded.
**Complexity.** Medium. **Rollback.** Delete the project; no production
impact at any point.

**00.07 · Document and verify a restore**
**Goal.** Prove the backups are real.
**Files.** `docs/operations/DISASTER_RECOVERY.md` (new).
**DB.** A production backup restored into a scratch environment.
**Acceptance.** A restore has been performed and its result verified
against known data; the runbook records exactly what was done and how
long it took.
**Complexity.** Medium. **Rollback.** None required — read-only against
production.

**00.08 · Add a regression baseline for the current product**
**Goal.** Capture what currently works, so later migrations can prove
they did not change it.
**Files.** `src/__tests__/regression/` (new), `docs/engineering/TESTING.md`
(new).
**Tests.** A written manual verification list covering every current
user-facing flow, plus automated regression tests for the flows that can
be automated without new infrastructure.
**Acceptance.** Every current flow is either covered by an automated test
or listed in the manual verification document. No flow is unlisted.
**Complexity.** High — this is the most valuable package in the epic and
the one most likely to be under-scoped.
**Rollback.** Delete the added tests.

## 12 · Work Packages — Epic 01

**01.01 · Create the ten schemas with no tables**
**Goal.** Schema structure exists; nothing has moved into it.
**Files.** `supabase/migrations/0018_schemas.sql`.
**DB.** Additive. Ten schemas created; `public` untouched.
**Acceptance.** All ten exist; the application is entirely unaffected;
migration is re-runnable.
**Complexity.** Low. **Rollback.** Drop the empty schemas.

**01.02 · Establish role grants mirroring engine ownership**
**Goal.** Cross-schema writes fail on privileges, not on review.
**Files.** `supabase/migrations/0019_grants.sql`,
`docs/operations/ROLES.md` (new).
**DB.** Grants only.
**Tests.** Integration tests proving a role cannot write outside its
schema.
**Acceptance.** Each role can write only its own schema; existing
application access to `public` is unchanged.
**Complexity.** Medium. **Rollback.** Revoke and restore prior grants.

**01.03 · Install extensions in a dedicated schema**
**Goal.** `ltree` and `pg_cron` available, not in `public`.
**Files.** `supabase/migrations/0020_extensions.sql`.
**Acceptance.** Extensions available; nothing in `public`.
**Complexity.** Low. **Rollback.** Drop extensions.

**01.04 · Create the partitioned events table**
**Goal.** The outbox exists and is append-only.
**Files.** `supabase/migrations/0021_events.sql`.
**DB.** Additive. Hash by workspace, range by time. Update and delete
revoked from all application roles.
**Tests.** Update and delete fail; inserts succeed; partition routing is
correct.
**Acceptance.** Table exists, partitioned, append-only, unused by the
application. Existing `domain_events` untouched.
**Complexity.** High. **Rollback.** Drop the table — nothing depends on
it yet.

**01.05 · Create the partitioned audit table**
**Goal.** Audit storage exists, writable by no application role.
**Files.** `supabase/migrations/0022_audit.sql`.
**Acceptance.** Exists; range-partitioned; no application role can write
or update; administrators can read.
**Complexity.** Medium. **Rollback.** Drop the table.

**01.06 · Add the transactional event emission helper**
**Goal.** An engine can emit an event inside its own transaction.
**Files.** `api/_lib/events.js` (extend — do not rewrite the existing
`emit_domain_event` path).
**Backend.** Emission helper.
**Tests.** An event emitted in a rolled-back transaction does not exist;
an event emitted in a committed transaction does.
**Acceptance.** Both tests pass; the existing domain-event path continues
to work unchanged.
**Complexity.** Medium. **Rollback.** Revert the module; existing path
unaffected.

**01.07 · Add cursor-based consumer scaffolding**
**Goal.** A consumer can read forward, record its position, and resume.
**Files.** `api/_lib/consumers/` (new).
**Tests.** A consumer stopped mid-stream resumes with no gap and no
duplicated effect; a poisoned event is quarantined rather than halting
the stream.
**Acceptance.** Both tests pass. No consumer is wired to anything real
yet.
**Complexity.** High. **Rollback.** Delete the module.

## 13 · Work Packages — Epic 02

**02.01 · Create the identity table (add)**
**Goal.** Structure exists; nothing reads or writes it.
**Files.** `supabase/migrations/0023_identity.sql`.
**DB.** Additive, step 1 of §3. UUIDv7 person reference. No FK to
`auth.users` that could cascade.
**Acceptance.** Table exists; application unaffected.
**Complexity.** Low. **Rollback.** Drop the table.

**02.02 · Backfill identities from existing profiles**
**Goal.** Every existing user has an identity row.
**Files.** `supabase/migrations/0024_identity_backfill.sql`.
**DB.** Step 2. Idempotent and re-runnable.
**Tests.** Row counts match; re-running changes nothing.
**Acceptance.** Every `profiles` row has a corresponding identity;
re-running the migration is a no-op.
**Complexity.** Medium. **Rollback.** Delete backfilled rows.

**02.03 · Add UUIDv7 generation**
**Goal.** Application-generated time-ordered identifiers are available.
**Files.** `src/lib/ids.js` (new) or its TypeScript equivalent.
**Tests.** Generated values are valid v7, monotonic within a millisecond,
and unique under concurrency.
**Acceptance.** Tests pass; nothing uses it yet.
**Complexity.** Low. **Rollback.** Delete the module.

**02.04 · Dual-write identity on signup and profile change**
**Goal.** New and changed users appear in both structures.
**Files.** `src/lib/auth.jsx`, `api/_lib/auth.js`.
**DB.** Step 3.
**Tests.** Signup creates both; profile edit updates both; regression on
all auth flows.
**Acceptance.** Both structures agree after every auth operation;
existing behaviour unchanged.
**Complexity.** Medium. **Rollback.** Remove the second write.

**02.05 · Reconcile identity against profiles**
**Goal.** Prove the two agree over real data before any read moves.
**Files.** `scripts/reconcile/identity.js` (new).
**DB.** Read-only. Step 4.
**Tests.** The reconciliation itself is the test.
**Acceptance.** Zero discrepancies against production data. **A non-zero
result blocks 02.06.**
**Complexity.** Medium. **Rollback.** None — read-only.

**02.06 · Switch profile reads to the identity engine**
**Goal.** Identity becomes authoritative for display information.
**Files.** `src/lib/auth.jsx`, `src/profile/*`.
**DB.** Step 5 — **the only behaviour-changing package in this epic.**
**Tests.** Full regression on profile display, editing and avatars.
**Acceptance.** Every profile surface renders identically to before, from
the new source.
**Complexity.** High. **Rollback.** Revert the read path — one code
change, no data change.

**02.07 · Implement erasure by redaction**
**Goal.** Erasing a person leaves durable history intact.
**Files.** `api/_lib/identity.js`, migration for the redaction path.
**Tests.** After erasure, personal data is gone, the person reference
still resolves as a key, and referencing rows are unchanged.
**Acceptance.** All three hold. No cascade occurs.
**Complexity.** High. **Rollback.** Revert the erasure path; no data
loss, since erasure is not yet exposed to users.

## 14 · Work Packages — Epic 03

The pivot. Twelve packages, and the read-switch is deliberately late.

**03.01 · Create workspace and membership tables (add)**
Additive. Membership carries role, scope, state, expiry, and an
append-only history. **Complexity.** Medium. **Rollback.** Drop.

**03.02 · Add the security-definer `STABLE` membership helper**
The single most performance-critical object in the platform
(`SUPABASE_ARCHITECTURE.md` §20). **Tests.** Resolution correctness;
evidence it is evaluated once per statement, not once per row.
**Complexity.** High. **Rollback.** Drop the function.

**03.03 · Backfill one Personal Workspace per existing user**
Idempotent. **Acceptance.** Every identity has exactly one Personal
Workspace and an owner membership; re-running is a no-op.
**Complexity.** Medium. **Rollback.** Delete backfilled rows.

**03.04 · Backfill one Professional Workspace per existing pro profile**
**Acceptance.** Every `pro_profiles` row has a Professional Workspace
owned by the same identity, which also retains its Personal Workspace —
the dual-role case that motivates the whole model.
**Complexity.** Medium. **Rollback.** Delete backfilled rows.

**03.05 · Add the workspace column to existing tables (add)**
Nullable, unpopulated, unread. **Complexity.** Low. **Rollback.** Drop
the columns.

**03.06 · Backfill workspace on existing rows**
Derived from ownership. **Acceptance.** No workspace-scoped row is
unassigned; every assignment is traceable to a rule, not a guess.
**Complexity.** High — the most error-prone package in the epic.
**Rollback.** Null the columns.

**03.07 · Reconcile workspace assignment**
Read-only. **Acceptance.** Every row's workspace matches its owner's
workspace under the stated rule. **Zero discrepancies required before
03.09.**
**Complexity.** Medium. **Rollback.** None.

**03.08 · Add the workspace engine contract**
Resolve context, decide permission, explain a decision. Not yet wired
into request handling. **Complexity.** High. **Rollback.** Delete the
module.

**03.09 · Resolve request context once at the gateway**
Identity, workspace, membership, scope resolved once and passed inward
(`SYSTEM_ARCHITECTURE.md` §12.1). **Complexity.** High.
**Rollback.** Revert to per-request resolution.

**03.10 · Reshape RLS policies to isolation and membership**
The 58 existing policies simplify; richer logic moves to the engine
(`SUPABASE_ARCHITECTURE.md` §23 conflict 1). **Tests.** Every existing
access test must pass; add cross-tenant negative tests.
**Complexity.** High. **Rollback.** Restore the previous policies.

**03.11 · Switch reads to workspace scoping**
**Step 5 — the behaviour-changing package of the entire epic.** Every
list, detail and dashboard query becomes workspace-scoped.
**Tests.** Full regression suite plus the manual verification list from
00.08.
**Acceptance.** Every flow behaves identically for a single-workspace
user.
**Complexity.** High. **Rollback.** Revert the read paths.

**03.12 · Add the workspace switcher, hidden for single-workspace users**
**Acceptance.** A user with one workspace sees no workspace concept
anywhere. A user with two sees a switcher; switching changes context;
notifications remain unified across workspaces
(`PLATFORM_DOMAIN_MODEL.md` §20, §27).
**Complexity.** Medium. **Rollback.** Hide the component.

## 15 · Work Packages — Epic 05

Decomposed 2026-08-16, at epic start, per §1's rule. Architecture read
first: `PLATFORM_DOMAIN_MODEL.md` §9 (Property and the Digital Twin),
`SYSTEM_ARCHITECTURE.md` §7.1 (Property Engine), `DATABASE_ARCHITECTURE.md`
§12 (Property and Stewardship — "the single most subtle thing in this
document") and §25 (Timeline). The `property` schema and its role
(`klussie_engine_property`) already exist, empty, since Epic 01
(`0018_schemas.sql`, `0019_grants.sql`) — this epic is what populates
them.

**The one thing every package here answers to.** Stewardship is a
*period*, not a column: a property's tenancy is `workspace_id` **as of
the current open stewardship period**, not a static stamp. Every
isolation decision in this epic is dynamic in a way nothing in Epic 03
was — DATABASE_ARCHITECTURE.md §12 names this explicitly as the hardest
thing in the whole document, and it is required by the frozen domain
model, not a choice this epic could simplify away.

**Scope, stated plainly so it isn't mistaken for more than it is.**
Epic 05 creates the Property aggregate and stewardship — nothing else.
Locations, assets, documents, maintenance and the real event-sourced
Timeline are Epics 06–08 and later; `SYSTEM_ARCHITECTURE.md` §7.1 lists
the Timeline projection under this engine's ownership, but a timeline
has nothing to show until property-scoped events exist to consume, and
nothing emits one yet. Building a Timeline this epic would be building
against an empty event stream — deferred, with the removal trigger
being "the first later epic whose events the timeline would show."
`src/lib/homeInventory.js`'s `fetchHomeProfile()` stub (rooms,
installations, documents — all empty, deliberately, since ADR-0008) is
untouched by this epic for the same reason: it starts having something
to return once Location and Asset exist, not before.

**A contradiction found and resolved before WP 05.01 was written, not
during it.** §12's own sentence ("stewardship is a period… those
periods are append-only") reads as one table; §4's Storage Classes table
puts *"property"* under Transactional and *"stewardship periods"* under
Historical ("write-once, never updated") **separately**. A single
`stewardship_periods` table with a nullable `ended_at` set once to close
it violates "never updated" in terms.
[ADR-0028](./adr/0028-stewardship-current-pointer-and-closed-period-log.md)
(Accepted) resolves it the same way Epic 03 resolved membership: a
**mutable current pointer** (`property.properties.steward_workspace_id`
— Transactional) plus a **genuinely append-only log of closed periods**
(`property.stewardship_periods` — Historical, rows written complete,
never touched again). One consequence worth stating up front: this
removes a dedicated property resolver from the decomposition entirely.
The isolation predicate is a plain column check against
`api.current_workspace_memberships()` — the current pointer *is* a
`workspace_id`-shaped column, so nothing new needs resolving. Six
packages, not seven.

**05.01 · Create the property and stewardship-period tables (add)**
Two tables in the pre-existing `property` schema: `property.properties`
(identity, `steward_workspace_id` + `steward_since` — the current
pointer, mutable — jurisdiction, mutable only by correction per §12) and
`property.stewardship_periods` (closed periods only, `began_at` and
`ended_at` both set at insert, guarded append-only by the same trigger
shape `workspace.membership_history` uses, migration 0030). RLS enabled
on `properties`, no policy yet — WP 05.05. Nothing reads or writes
either table. **Complexity.** Medium. **Rollback.** Drop both tables.

**05.02 · Backfill one property per Personal Workspace**
"My Home" becomes real: one `property.properties` row per Personal
Workspace (matching `workspace.workspaces` naming precedent from
migration 0033), `steward_workspace_id` set to that workspace,
`steward_since` = the workspace's own `created_at`.
`property.stewardship_periods` stays empty — nothing has ever
transferred, so there is nothing closed to log. Idempotent via existence
guards, re-runnable. Professional and Business workspaces are **not**
backfilled a property — nothing in the current product represents a
business's premises, and inventing a placeholder would be a guess
dressed as data, the exact thing ADR-0022's precedent warns against.
**Acceptance.** Every Personal Workspace has exactly one property,
correctly pointed; re-running changes nothing. **Complexity.** Medium.
**Rollback.** Delete backfilled rows — symmetric, since nothing yet
references a property by id.

**05.03 · Reconcile the backfill**
Read-only, and — unlike Epic 03's `RECONCILE_WORKSPACE.sql` — not a
separate script. Epic 03's reconciliation existed because WP 03.06
populated a `workspace_id` column on thirteen *existing* tables, each
against its own stated rule, which genuinely needed independent
re-derivation and comparison. Epic 05's backfill touches no existing
table — it only creates `property.properties` rows, one rule, one
source (`workspace.workspaces` where `type = 'personal'`) — so
`VERIFY_BACKFILL_PROPERTY.sql`'s check 1 already *is* the
reconciliation: it re-derives "every live Personal Workspace stewards
exactly one property" from real data and fails loudly if not. Building
a second script to duplicate that check would be structure with nothing
new to prove. This package's job is running it and gating WP 05.05/05.06
on the result — roadmap §3: "a read-switch without a passing
reconciliation is not permitted." **Complexity.** Low. **Rollback.**
None — read-only.

**05.04 · Add the property engine contract**
`property.resolve_property(property_id)` / `api.resolve_property(...)` —
state plus the current steward, mirroring `workspace.resolve_context()`'s
shape. No `decide_permission` analog yet: nothing in this epic has a
gated action to decide (no stewardship transfer, no attribute edit
through the engine) — building one now would repeat ADR-0027's own
restraint in reverse, a permission vocabulary with nothing to authorize.
Added when Epic 06 or a stewardship-transfer feature first needs it.
**Complexity.** Medium. **Rollback.** Drop the functions.

**05.05 · Add the RLS isolation policy for `property.properties`**
One permissive `for select` policy: `steward_workspace_id in (select
workspace_id from api.current_workspace_memberships())` — Epic 03's
existing membership helper, unchanged, per ADR-0028. This is the *first*
policy on this table, so there is no "adds, does not remove" tension to
narrate the way Epic 03 WP 03.10 had to; it simply exists where nothing
did. **Complexity.** Low–medium. **Rollback.** Drop the policy.

**05.06 · Resolve property context client-side, wire into My Home**
The Epic 03 WP 03.09 pattern, repeated: no gateway exists (ADR-0024 is
epic-agnostic — its removal trigger still hasn't fired), so the browser
resolves its own property context, once, the same way it already
resolves workspace context. `src/lib/homeInventory.js`'s
`fetchHomeProfile()` gains the property's id and name to its otherwise-
still-empty return shape (rooms/installations/documents stay empty —
see this section's scope note) — additive to a stub that currently
returns a frozen constant, so there is no existing behaviour to preserve
by omission. **Acceptance.** A signed-in person's own property resolves
correctly; nothing renders differently, since nothing downstream reads
the new fields yet. **Complexity.** Medium. **Rollback.** Revert the
client change; no data change.

## 16 · Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Epic 03 backfill assigns rows to the wrong workspace** | Critical | 03.07 reconciliation is a hard gate on 03.09; backfills idempotent and re-runnable |
| 2 | **Epic 09 changes booking behaviour while replacing triggers** | Critical | Workflow definitions must reproduce current trigger behaviour exactly before the switch; regression baseline from 00.08 is the reference |
| 3 | **Service Record visibility misclassification** (Epic 11) | Critical | Classification is structural, not policy-based; dedicated security review before the read-switch |
| 4 | **Location re-parenting leaves stale scopes and indexes** (Epic 06) | High | Path rewrite and `LocationTreeChanged` in one transaction; named consumers tested |
| 5 | **RLS predicate cost degrades at scale** | High | 03.02's helper is `STABLE` and security-definer; performance test in its acceptance |
| 6 | **Single maintainer, 27 epics** | High | Epics are independently valuable and sequenced so tiers 0–3 deliver a working platform; 23–24 are demand-gated and may never be built |
| 7 | **Production is still the only environment until 00.06** | High | Epic 00 precedes all schema work; no migration before staging exists |
| 8 | **Architectural drift under delivery pressure** | Medium | Gate 7 and 9; deviations require an ADR before code |
| 9 | **The roadmap outlives its assumptions** | Medium | Work packages decomposed just-in-time (§1); epic definitions revisited at tier boundaries |

## 17 · How Implementation Sessions Work

**From this point, no further planning documents are created.**

A session takes one of five shapes:

| Request | What happens |
|---|---|
| **"Start Epic X"** | Read the epic definition and its referenced architecture; decompose into work packages using §6 if not already done; add them to this document; begin 01 |
| **"Start Work Package Y"** | Implement exactly that package; run lint, tests and build; report against its acceptance criteria; stop |
| **"Review implementation"** | Review the diff against the frozen architecture and the epic's acceptance criteria; report findings; change nothing |
| **"Fix findings"** | Apply the findings; re-verify |
| **"Merge"** | Confirm gates §7; update the documents in §9; mark progress here |

**The standing rules for every session:**

- Read the frozen documents the epic references before writing code.
- Implement the approved scope only.
- Stop at the end of a work package. Do not continue into the next one.
- If implementation appears to require an architectural deviation, **stop
  and write an ADR**. Do not decide in passing.
- Leave the repository releasable.

---

**Epic status.** Updated as work completes.

| Epic | Status |
|---|---|
| 00 — Engineering Foundations | **Complete** 2026-08-12 — 8/8 packages. [Completion record](../implementation/epic-00/COMPLETION.md) |
| 01 — Schema Foundation & Event Backbone | **Complete** 2026-08-13 — 7/7 packages. [Completion record](../implementation/epic-01/COMPLETION.md) |
| 02 — Identity Engine | **Complete** 2026-08-13 — 7/7 packages. [Completion record](../implementation/epic-02/COMPLETION.md) |
| 03 — Workspace Engine | **Complete** 2026-08-16 — 12/12 packages. Not yet verified against a live database (gate 10 open). [Completion record](../implementation/epic-03/COMPLETION.md) |
| 04 — Capability Engine | Not started. Not blocking Epic 05 — the dependency graph (§5) branches Property directly off Workspace |
| 05 — Property Engine | **Complete** 2026-08-16 — 6/6 packages. Not yet verified against a live database (gate 10 open, same as Epic 03). [Completion record](../implementation/epic-05/COMPLETION.md) |
| 06–26 | Not started; work packages decomposed at epic start |

**Epic 03 closed with four ADRs**, each accepted as part of building the
package it gated rather than after the fact:
[0024](./adr/0024-request-context-resolved-in-the-database.md) (no API
Gateway exists or is built in this epic — the browser resolves context
directly, in the database, once per statement),
[0025](./adr/0025-marketplace-visibility-survives-epic-03.md) (two
classes of existing policy — pre-engagement discovery, public
professional profiles — survive WP 03.10 unchanged; it adds, it does not
simplify), [0026](./adr/0026-membership-helper-lives-in-public.md) (the
membership helper's `api`-schema placement, revised mid-package when the
originally specified shape was found to defeat its own performance
requirement) and [0027](./adr/0027-workspace-permission-vocabulary.md)
(the twelve-permission vocabulary `decide_permission()` needs). Full
account, including what §14's original wording got wrong for three of
twelve packages and why: [completion
record](../implementation/epic-03/COMPLETION.md).

**Production has none of Epics 01–03.** See
[`operations/PRODUCTION_MIGRATION_0018_0029.md`](./operations/PRODUCTION_MIGRATION_0018_0029.md)
— written for `0018`–`0029` (Epics 01–02) and not yet extended to cover
`0030`–`0038` (Epic 03). Every read path across all three epics falls
back gracefully when its migrations are absent, which is why production
has been safe to leave unmigrated — but the runbook needs a second pass
before it is run, and running it is still not scheduled.

**Carried out of Epic 00, still true after Epic 03:** the production
backup path is verified but **has never been restored**
([ADR-0017](./adr/0017-free-tier-disaster-recovery-strategy.md)). Epic
03's workspace backfill (WP 03.03/03.04/03.06) is the first change whose
failure mode is unrecoverable data rather than a revertable read path —
and it has not yet been run against production, so the risk is real but
not yet realised.

**Carried out of Epic 03**, and recorded in full in its [completion
record](../implementation/epic-03/COMPLETION.md):

- **This session had no direct Postgres connection**, unlike every
  session before it in this epic. `VERIFY_WORKSPACE_ISOLATION_POLICIES.sql`
  (WP 03.10) and `VERIFY_LIST_MY_WORKSPACES.sql` (WP 03.12) are written,
  following the same probe discipline as every prior diagnostic in this
  epic, and neither has been run. Nothing in WP 03.09–03.12 has been seen
  rendering signed in either — no working credentials for either known
  test account, and no new account created to work around that. **Not
  resolved before Epic 05 started** (it names the same gap below, now
  extended through four more migrations) — whoever picks up Epic 06
  should get this fixed rather than inherit it a fourth time.
- **`RoleSelectionScreen` asks the exact classification question
  `PLATFORM_DOMAIN_MODEL.md` §27 forbids.** Predates this epic; not fixed
  here — a product decision, not an implementation one. Recorded in
  `MASTER_CONTEXT.md` §12.
- **`docs/architecture/ARCHITECTURE.md` was not updated in Epic 03.**
  Closed in Epic 05 — both epics added to Known Gaps in the same pass.

**Carried out of Epic 05**, and recorded in full in its [completion
record](../implementation/epic-05/COMPLETION.md):

- **The same unverified-database gap, now four migrations deeper**
  (`0039`–`0042`, on top of Epic 03's `0037`–`0038`). Five new
  diagnostics written, none run. This is the third epic in a row to
  carry this gap forward rather than close it.
- **ADR-0028** resolved a genuine contradiction between
  `DATABASE_ARCHITECTURE.md` §4 and §12 — see the ADR and the completion
  record for the full reasoning. Worth a second read by whoever plans
  Epic 06 (Location) or Epic 07 (Asset): both epics will hit the same
  "is this Historical class object really append-only, or does it have
  a current-state half" question, since assets have placements described
  the same way properties have stewardship (`DATABASE_ARCHITECTURE.md`
  §14: "Placement is a period, not a field. As with stewardship...").

**Carried out of Epic 02**, and recorded in its
[completion record](../implementation/epic-02/COMPLETION.md):

- **§13 and §14's file lists predate Epic 01's decision that application
  code does not reach the new schemas.** The list was wrong for **five of
  Epic 02's seven packages**, always the same way: a Node script cannot
  read the `identity` schema, a JavaScript helper cannot be transactional
  with a database trigger, and a module wrapping an unreachable function
  is dead code. **§14's twelve Epic 03 packages were written at the same
  time and should be re-read before anyone starts.**
- **Epic 02 does not reach step 6.** `public.profiles` and
  `public.profile_contacts` both survive it
  ([ADR-0023](./adr/0023-identity-display-resolution-versus-row-visibility.md)).
  Retiring them needs an engine that can evaluate the confirmed-booking
  relationship their policies encode.
- **The read switch has never been seen rendering.** Verified at data and
  contract level only; `.env.local` points at production and staging's
  anon key was unavailable.
- **`auth.users` deletion cascades into nine tables**, violating §5's "no
  cascading deletes anywhere" and §11.4. Predates this epic; erasure
  routes around it by never deleting.

**Carried out of Epic 01**, and each recorded in its
[completion record](../implementation/epic-01/COMPLETION.md):

- **[ADR-0020](./adr/0020-events-partitioning-parameters.md) and
  [ADR-0021](./adr/0021-one-audit-table-with-nullable-workspace.md) are
  `Proposed`.** Both are implemented against empty tables, where changing
  them costs a `drop table` and a re-run. **That window closes at the
  first written row.**
- **The audit write path is unallocated.** Epic 01's definition lists it
  under Backend; no work package built it, and §8 correctly leaves
  `platform.audit_records` writable by no application role. Nothing needs
  it yet.
- **No application code can reach the `platform` schema**, deliberately —
  PostgREST does not expose it and must not. Engines call
  `platform.emit_event()` SQL-side; a real consumer needs a direct
  Postgres connection this repository does not have. A tooling decision
  for the epic that runs the first consumer.
- **Partition ranges run to the end of 2027** and are created by hand.
  The diagnostics are the only thing that will notice a lapse.

---

Version 1.0 — 2026-08-11 (the engineering execution plan for
`PLATFORM_DOMAIN_MODEL.md`, `DATABASE_ARCHITECTURE.md`,
`SYSTEM_ARCHITECTURE.md` and `SUPABASE_ARCHITECTURE.md`. The architecture
phase is closed; implementation begins at Epic 00)

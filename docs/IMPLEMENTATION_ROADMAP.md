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
16. [Work Packages — Epic 06](#16--work-packages--epic-06)
17. [Work Packages — Epic 07](#17--work-packages--epic-07)
18. [Work Packages — Epic 08](#18--work-packages--epic-08)
19. [Work Packages — Epic 09](#19--work-packages--epic-09)
20. [Work Packages — Epic 10](#20--work-packages--epic-10)
21. [Work Packages — Epic 04](#21--work-packages--epic-04)
22. [Work Packages — Epic 11](#22--work-packages--epic-11)
23. [Work Packages — Epic 12](#23--work-packages--epic-12)
24. [Work Packages — Epic 13](#24--work-packages--epic-13)
25. [Work Packages — Epic 14](#25--work-packages--epic-14)
26. [Risk Register](#26--risk-register)
27. [How Implementation Sessions Work](#27--how-implementation-sessions-work)

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

**Epic 13 — Conversation Engine.** Conversations bound to one of five
real subjects — engagement, asset, maintenance obligation, property, or
the workspace itself — all five real aggregates for the first time now
that Epics 05–12 exist. **Reviewed against every completed engine before
implementation** (`implementation/epic-13/DESIGN_REVIEW.md`): binds to
`work.engagements`, not a legacy request id, correcting an assumption
the original one-liner made before engagements were real; participation
is its own explicit table, not inferred from workspace membership;
messages carry an optional, typed reference to a structured moment (a
quote, a transition, an approval) rather than free text. Messages
immutable; originals permanent; translations derived, reusing the
existing AI Gateway `translate()` mechanism rather than waiting on
Intelligence (Epic 17, not yet built). Migrates existing messages and
the `translations` cache.

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

## 16 · Work Packages — Epic 06

Decomposed 2026-08-17, at epic start, per §1's rule. Architecture read
first: `PLATFORM_DOMAIN_MODEL.md` §10 (Location), `SYSTEM_ARCHITECTURE.md`
§7.2 (Location Engine), `DATABASE_ARCHITECTURE.md` §13 (Location) and
`SUPABASE_ARCHITECTURE.md` §11.2 (The Location Tree). §5's own sequencing
table names this epic's risk item explicitly: **"the highest correctness
risk in the physical tier"** — §21's finding, restated in §11.2, is that
re-parenting without its event **"is the single easiest place to
implement a correct architecture incorrectly."**

**Locations live in the `property` schema, not a new one.** Migration
0018 (Epic 01): *"Property, Location, Asset and Document share one
schema... §2 chose tier-level grouping precisely so those joins stay
inside a schema."* `property.locations`, owned by the same
`klussie_engine_property` role as `property.properties`. Migration 0020
(Epic 01, `ltree`) left an explicit note for this epic: *"Epic 06 grants
`usage on schema extensions` to `klussie_engine_property` when it
creates the first `ltree` column"* — followed literally in WP 06.01.

**Isolation is inherited, not owned.** `DATABASE_ARCHITECTURE.md` §13:
*"Workspace-scoped, inheriting the property's stewardship."* A location
carries `property_id`, never its own `workspace_id` or
`steward_workspace_id` column — duplicating the property's current
steward onto every location would create the exact two-answers problem
ADR-0028 avoided for property itself. The isolation policy joins through
`property.properties.steward_workspace_id`, an uncorrelated subquery
(`property_id in (select id from property.properties where
steward_workspace_id in (select workspace_id from
api.current_workspace_memberships()))`) — no location-specific resolver,
the third epic in a row where ADR-0026/0028's pattern needs no new
predicate.

**No backfill.** Unlike every prior epic, there is no clean, stated
mapping from existing data to a location row. `household_items.room` is
a free-text field — "kelder", "keuken" — not a structured location
reference, and inventing location rows from those strings would be
exactly the "guess dressed as data" ADR-0022's precedent rules out.
Locations are created empty, the same way `property.properties` was
created for zero rows before its backfill populated it — except nothing
populates this one in this epic. The first real location rows arrive
with a UI to create them (a later epic) or, possibly, an Epic 07 backfill
deriving distinct `household_items.room` values — that epic's decision,
not this one's.

**No client wiring.** `src/lib/homeInventory.js`'s `rooms: []` stays
empty — nothing in the current product reads a real location, so there
is no read to switch, unlike Epic 05's `fetchHomeProfile()`. This epic
is infrastructure with no user-visible surface at all, a fact worth
stating rather than discovering by its absence: **Property → Location →
Asset only becomes visible once Asset (Epic 07) gives `household_items`
a place to migrate to.**

**Containment stays engine-to-engine, not client-facing.** The "public
contract" `SYSTEM_ARCHITECTURE.md` §7.2 describes — tree read,
containment, ancestors/descendants — is consumed by *other engines*
(Workspace's scope resolution, Search), neither of which exists or is
wired yet (`ADR-0024`: *"there is no location tree until Epic 06, and no
consumer workspace uses scope"*). No `api`-schema delegate is built in
this epic for the same reason WP 05.04 built no `decide_permission`
analog: a contract with no real caller is dead code wrapped as
architecture. Built when Epic 04 (scoped capability grants) or Epic 20
(Search) first needs to call it.

**06.01 · Create the locations table (add)**
`property.locations` — `id`, `property_id` (references
`property.properties`), `parent_id` (self-referencing, nullable —
top-level under the property), `name`, `type` (configurable taxonomy,
no `check` constraint — domain model §10: "never hardcoded"), `path
extensions.ltree not null` (materialised path, GiST-indexed),
`retired_at` (soft-retire — "a room that no longer exists still hosted
work that happened," §13). `grant usage on schema extensions to
klussie_engine_property` — migration 0020's own instruction, executed
here. RLS enabled, no policy — WP 06.03, gated by nothing new (the
predicate already exists). **Complexity.** Medium. **Rollback.** Drop
the table; revoke the `extensions` grant.

**06.02 · Maintain the path alongside the parent pointer**
The parent pointer is authoritative (§11.2: *"the path is a maintained
denormalisation of it, and can be recomputed if it ever disagrees"*); a
trigger computes `path` from the parent's own path plus this location's
own label (`replace(id::text, '-', '_')`) on insert, so no caller ever
sets `path` directly and it can never silently drift on creation.
Top-level: `path = <property's own label>.<own label>` — the property
is the tree's root in every path, which is what lets containment be
checked without a second join to confirm which property a location
belongs to. **Complexity.** Medium — the first genuinely new mechanism
in this epic. **Rollback.** Drop the trigger; `path` stops being
maintained, nothing else breaks (still additive, still unread).

**06.03 · Add the RLS isolation policy for `property.locations`**
One permissive `for select` policy, the join described above. First
policy on this table, same posture as Epic 05 WP 05.05 — nothing to add
alongside. **Complexity.** Low–medium. **Rollback.** Drop the policy.

**06.04 · Add subtree containment as a first-class operation**
`property.location_within(location_id, subtree_root_id)` — `x.path <@
y.path`, ltree's own descendant-or-self operator, GiST-indexed, no
per-row recursive walk regardless of depth (§13's own requirement).
Plus `property.location_ancestors(location_id)` and
`property.location_descendants(location_id)`, same operator family.
Engine-schema logic only, per this section's own scope note — no `api`
delegate yet. **Tests.** Structural, plus a synthetic multi-level tree
in the staging diagnostic proving containment holds at real depth, not
just one level. **Complexity.** Medium. **Rollback.** Drop the
functions.

**06.05 · Add re-parenting, with the path rewrite and `LocationTreeChanged`
in one transaction**
The epic's actual risk. `property.reparent_location(location_id,
new_parent_id)`: rewrites `path` for the moved location **and every
descendant** (an `ltree` prefix replace — `new_path ||
subpath(old_path, nlevel(old_path))` — is the whole subtree's
transformation, per §11.2's "rewrites the moved subtree only"), then
calls `platform.emit_event()` (migration 0023) with
`LocationTreeChanged` **inside the same function, the same
transaction**. No consumer reacts yet — Workspace's scope cache doesn't
exist (ADR-0024) and Search doesn't exist (Epic 20) — so this emits into
an event stream nothing reads, the same "infrastructure ahead of its
consumer" posture Epic 01's own outbox has held since it was built.
Refuses a re-parent that would create a cycle (`new_parent_id`'s own
path must not already be within the location's current subtree).
**Tests.** Structural, plus the staging diagnostic's the most important
one this epic: re-parent a subtree three levels deep, confirm every
descendant's path updated correctly, confirm exactly one event row
exists, confirm a cycle attempt is rejected. **Complexity.** High — the
one package in this epic that deserves the most scrutiny before it is
ever run against real data, given this session's standing gap (§15,
"Carried out of Epic 05") in the ability to run any of it live.
**Rollback.** Drop the function; no data written by re-parenting a
location that was never re-parented.

## 17 · Work Packages — Epic 07

Decomposed 2026-08-17, at epic start, per §1's rule. Architecture read
first: `PLATFORM_DOMAIN_MODEL.md` §11 (Asset), `SYSTEM_ARCHITECTURE.md`
§7.3 (Asset Engine), `DATABASE_ARCHITECTURE.md` §14 (Asset and Facets).

**This is the first epic in the physical-model sequence with real,
existing, live data to migrate.** `public.household_items` (migration
0016) is already in production, already written by real customers,
unlike Property or Location, which started from nothing. That changes
what "migration" means here: Epic 07 is the first epic since Epic 03 to
need the full six-step pattern (§3) — add, backfill, **dual-write**,
reconcile, **switch reads**, retire — rather than the additive-only
shape Epics 05 and 06 got away with.

**Placement repeats stewardship's exact shape, on purpose.**
`DATABASE_ARCHITECTURE.md` §14: *"Placement is a period, not a field. As
with stewardship: an asset's relationship to a location is a
time-bounded placement, appended rather than overwritten."* Epic 06's
own completion record flagged this in advance. ADR-0028's decision
applies unchanged, cited rather than re-litigated: a mutable current
pointer (`property.assets.location_id` / `.placed_since`) plus a
genuinely append-only log of *closed* placements
(`property.asset_placements`) — no new ADR needed, because the frozen
documents already describe the identical shape and ADR-0028 already
settled how this codebase builds it.

**No real location to place a backfilled asset in.** Epic 06 built no
location backfill (§16's own scope note: nothing creates a real
location yet). Every asset this epic backfills is therefore created
**unplaced** — `location_id null` — with `household_items.room`'s free
text carried onto a plain `room_label` column, the exact bridge migration
0016 already promised in its own comment: *"When rooms become real, this
column is what gets backfilled from."* That backfill is a future epic's
job, not this one's.

**Facets are new structure, not a repeat of an existing pattern.**
`DATABASE_ARCHITECTURE.md` §14 rule 6: *"A facet's attributes are
declared, not free-form... held as platform-scoped configuration."*
Built, deliberately minimal: the catalog table and the instance table,
no seeded facet types — nothing in the current product needs one yet
(no vehicle, no HVAC unit, no compliance-gated asset), and inventing a
first facet type with no real requirement behind it would be exactly the
speculative structure ADR-0010 rules out.

**All eight packages are built.** WP 07.01–07.05 are additive or
read-only, the same risk class as Epics 05 and 06. WP 07.06–07.08 touch
real, existing user data for the first time in this sequence — but the
dual-write turned out not to touch `src/lib/householdItems.js` at all
(see 07.06 below and the completion record §5): it is a database
trigger, the same mechanism migration 0027 already established for
identity, transactional in a way an application-level second write
could never be. The reconciliation gate (§3: *"a read-switch without a
passing reconciliation is not permitted"*) is written and structurally
tested (`RECONCILE_ASSETS.sql`) but has not actually run — this
session's standing gap (no direct Postgres connection) is unchanged.
Per the engineering directive governing this session, that gap marks
live verification **Pending** rather than stopping implementation:
**`RECONCILE_ASSETS.sql` must still run and pass before WP 07.08 is
deployed anywhere with real users** — completing the epic does not
satisfy the gate, it only makes the unresolved gate matter more.

**07.01 · Create the assets and asset_placements tables (add)**
`property.assets` — core identity, type (unconstrained taxonomy, per
`type` here matching `property.locations.type`'s own restraint — not
`household_items.category`'s hardcoded six-value check, which this
schema does not repeat), make/model/serial, acquired/installed dates,
expected service life, warranty expiry, **current placement**
(`location_id`/`placed_since`, mutable — ADR-0028's shape), `room_label`
(the free-text bridge), condition, lifecycle state (constrained:
active/retired/disposed — a state machine, not a taxonomy, the same
distinction `workspace.memberships.state` vs `.role` already draws),
nesting (`parent_asset_id`, plain self-reference — no `ltree`; nothing
in the frozen documents states an asset-nesting depth requirement the
way §13 states one for locations, so a materialised path would be
structure with nothing demanding it), and the AI-provenance pair
`source`/`ai_suggestion`, matching `household_items`' own two-value
`source` check exactly (`manual`, `ai_confirmed` — no `bulk_import` or
`inferred` value yet; nothing produces one). `property.asset_placements`
— closed placements only, identical shape to `property.stewardship_periods`.
**Complexity.** Medium. **Rollback.** Drop both tables.

**07.02 · Create the facet system (add)**
`property.facet_types` — the declared catalog (facet type name, declared
attribute schema as `jsonb`, e.g. `{"registration": "text", "odometer":
"integer"}` — a schema *description*, not the data itself). No seeded
rows — deliberately, per this section's scope note. `property.asset_facets`
— one row per asset per facet type it carries, `attributes jsonb`
validated against the facet type's declared schema by a trigger, not a
`CHECK` constraint (`jsonb` key validation against another table's
row cannot be expressed as a `CHECK`). **Complexity.** Medium-high — the
first genuinely new validation mechanism since the append-only guard
triggers. **Rollback.** Drop both tables.

**07.03 · Add the RLS isolation policies for assets, placements and facets**
Assets: `property_id in (select id from property.properties where
steward_workspace_id in (select workspace_id from
api.current_workspace_memberships()))` — identical shape to Epic 06's
location policy. Facets: one join deeper, through `asset_id ->
property.assets.property_id`. `asset_placements` gets **no** policy —
closed placement history is read through the asset engine's own contract
(WP 07.04), the same restraint Historical-class objects get elsewhere in
this schema, never a direct table grant. **Complexity.** Medium.
**Rollback.** Drop the policies.

**07.04 · Add the asset engine contract**
`property.resolve_asset(asset_id)` (state, current placement, facets) and
`property.my_assets(property_id)` (every asset a property currently
holds, mirroring `property.my_properties()`'s discovery shape). No
`decide_permission` analog — the now-familiar restraint from WP 05.04 and
Epic 06, unchanged for the identical reason. **Complexity.** Medium.
**Rollback.** Drop the functions.

**07.05 · Backfill: migrate existing `household_items` rows into `property.assets`**
One `property.assets` row per live `household_items` row, `property_id`
resolved from the owner's Personal Workspace's property (Epic 05's own
backfill — one property per Personal Workspace already guarantees this
join has an answer for every existing owner). `category` → `type` as
plain text (the six existing values fit an unconstrained taxonomy
without translation). `room` → `room_label` verbatim. `photo_path`,
`purchased_on` → `acquired_on`, `notes`, `source`, `ai_suggestion`
carried across unchanged. Idempotent — a `household_items_id` column (not
part of the domain model, added here purely as the backfill's own
bookkeeping, the same role a foreign-key-shaped join column plays in
every other backfill in this roadmap) makes re-running a no-op.
`household_items` itself is untouched — still authoritative, still
written by the running application. **Complexity.** High — the first
backfill in this roadmap moving real, existing, unstaged production
data rather than deriving from a table this same epic just created.
**Rollback.** Delete backfilled rows; `household_items` is unaffected
either way.

**07.06 · Dual-write: `household_items` writes also write `property.assets`
(complete)**
Built as three triggers on `public.household_items` (0053: AFTER INSERT,
AFTER UPDATE with a WHEN guard on every mirrored column, BEFORE DELETE
disposing rather than deleting), not as a second write from
`src/lib/householdItems.js` — building it found migration 0027's identity
dual-write as closer precedent than the roadmap's own scope note, and a
trigger is the only place the mirror write can be transactional with the
primary one. `household_items` remains authoritative throughout (roadmap
§3, step 3). Zero lines of `src/lib/householdItems.js` changed for this
package. Also fixes a real bug found while building it: the
`household_items_id` foreign key had no `ON DELETE` clause, which would
have made `deleteHouseholdItem()` fail outright once any item had a
mirrored asset. **Complexity.** High. **Rollback.** Drop the three
triggers and their functions; `household_items` is unaffected.

**07.07 · Reconcile `household_items` against `property.assets` (complete,
structurally)**
`RECONCILE_ASSETS.sql`: every live `household_items` row's mapped
`property.assets` row matches `property.resolve_property_for_owner()` and
0053's field mapping, both re-derived fresh — the hard gate roadmap §3
requires before WP 07.08 may be trusted. Written and structurally tested
(`reconcileAssets.test.js`); **has not run against a database this
session** — live verification Pending, tracked in the completion record
§7 and `MASTER_CONTEXT.md` §12. **Complexity.** Medium. **Rollback.**
None — read-only.

**07.08 · Switch reads to `property.assets` (complete)**
The epic's one behaviour-changing package (roadmap §3, step 5) —
`src/lib/householdItems.js`'s `fetchHouseholdItems` gained a third,
outermost fallback tier: `propertyId` present reads `property.assets` via
`api.my_assets()` (narrowed to active-only by 0054, since a disposed or
retired asset is not an answer to "what does this household currently
own"); absent, it falls back to the two tiers Epic 03 WP 03.11 already
proved. No other function in the file changed — "friends" turned out to
be just this one read. **Complexity.** High. **Rollback.** Revert the
read path; no data change. **Deploy gate:** do not ship this to an
environment with real users before WP 07.07 has actually run and passed.

## 18 · Work Packages — Epic 08

**Dependencies.** `DATABASE_ARCHITECTURE.md` §15 (Document), owned by
the same `property` schema and `klussie_engine_property` role as
Property, Location and Asset (migration `0018`'s own grouping comment:
"read together constantly... §2 chose tier-level grouping precisely so
those joins stay inside a schema"). `SUPABASE_ARCHITECTURE.md` §11.3
(the signed-URL mitigations this epic must carry forward).

**Read before design — what this epic's own one-line roadmap summary
got wrong, found by reading §15 in full rather than building from the
one-liner alone.** The original scope note (above, written before this
epic's own frozen sections existed as a cross-check target) says
"migrates existing avatars, portfolio images and request photos." Checked
against `DATABASE_ARCHITECTURE.md` §15's actual definition — "evidence
that outlives what it was attached to" — and the domain model's own list
of examples (invoices, warranties, manuals, certificates, "a photo of a
leak") — an avatar is neither. It carries no type, no validity period, no
issuer, and is not "about" anything else; it is decoration on an identity
row, not evidence about a home. **`profiles.avatar_url` is deliberately
excluded from this epic.** Portfolio images ("photos of past work" — real
evidentiary content, `§15`'s own "photo of a leak" example is the same
shape) and request photos (identical reasoning) both genuinely fit and
are migrated. Recorded here explicitly, per this session's standing
discipline: the code and the frozen documents win over an earlier
assumption, including the roadmap's own.

**Three more findings from the same read-before-design pass, each
changing what would otherwise have been built:**

1. **Versioning is not a future evolution — it is a stated, current
   requirement, and it is ADR-0028's shape a third time.**
   `PLATFORM_DOMAIN_MODEL.md` §12 lists "versioning, since certificates
   are reissued" under "how it evolves," which reads as deferred. But
   `DATABASE_ARCHITECTURE.md` §15 states it as the model itself:
   *"Metadata mutable; content immutable — a reissued certificate is a
   new version, not an edit. Version history is retained."* The more
   specific, more authoritative document wins (this session's own
   standing rule for resolving exactly this kind of tension, applied
   here rather than picking the more convenient reading). The shape to
   build it is not new: a mutable current-version pointer plus a
   genuinely append-only log of superseded versions — ADR-0028's exact
   pattern, already reused once for Asset placement (Epic 07) without a
   new ADR. It is reused again here, for the same reason: the frozen
   documents already describe the identical shape.
2. **Document type must be a declared catalog, not free text — and
   unlike `facet_types` (Epic 07), it cannot ship empty.** §15: *"Documents
   that are evidence follow Historical retention. Documents that are
   convenience may be deleted by their owner. The distinction is carried
   by document type, so it is decided by configuration rather than a
   user's judgement in the moment."* `property.facet_types` (Epic 07)
   shipped with zero seeded rows because nothing needed one yet. This
   epic's own backfill (WP 08.06) needs real rows to classify
   `portfolio_items` and `service_request_photos` into — the first
   declared catalog in this roadmap that cannot follow `facet_types`'
   own restraint unmodified, and worth stating why rather than silently
   deviating from precedent.
3. **"Attachment is not a visibility grant" is stated as a principle that
   was *"nearly lost"* — meaning the RLS design has exactly one way to
   get this wrong, and this epic must not take it.** §15, verbatim:
   *"A document attached to an asset does not become visible to a
   contractor with access to that asset... Every document has exactly
   one owning workspace and an explicit sharing state. Attachment says
   what a document is about. Sharing says who may see it. The two are
   set independently."* Concretely: no isolation policy in WP 08.04 may
   join through `document_attachments` to grant visibility. The only two
   paths to seeing a document are membership in its owning workspace, or
   an explicit row in `document_shares`.

**Look for connections — what this epic strengthens without redesigning
it.** `service_request_photos`' own existing RLS (migration `0007`)
already implements attachment/sharing as two separate policies on one
table — "customers manage own," "matching pros can view" — without ever
naming it as such. This epic does not invent the separation; it gives an
already-real pattern its own structural home. The general form of
"matching pros can view" turns out to be nothing more than "share with
another workspace," since a professional's identity *is* a workspace in
this architecture (§27) — no new sharing primitive was needed, only the
existing workspace concept applied to a new object. `property.assets`'
own `warranty_expires_on` (Epic 07, unused since) is a second, smaller
connection: once real documents exist with their own validity periods,
that column's role changes from primary source to fallback — already
designed in full, ahead of this epic, in
[`GUIDANCE_SYSTEM.md`](../design/GUIDANCE_SYSTEM.md) §17.4.1.

**Experience Review, kept concise per this session's own standing
discipline (validation, not redesign).**
*Which journey uses this?* None yet, client-side — this epic is
structural, the same risk class Epics 05 and 06 were.
*Does Guidance expand because of it?* Yes, already — `GUIDANCE_SYSTEM.md`
§17.4.1 designed the Documents guidance moment ahead of this epic
existing, precisely so the sentence is ready the moment a real control
is.
*Does an existing conversation become smarter?* Not yet — that's the AI
intake's own extraction capability (§12: "reading a document to propose
structured facts"), a later connection, not this epic's job.
*Does this fulfil an existing promise rather than create a new one?*
Yes — Layer 1's own Act III.3 already told every customer "Klussie
already has that ready for you" before any of this existed; this epic is
what makes that sentence true.

**08.01 · The declared type catalog, the document aggregate, and its
version history (add)**
`property.document_types` — natural key `type_key`, `retention_class`
constrained (`'evidence'`, `'convenience'` — a real state machine, the
same restraint distinction `asset.lifecycle_state` already draws from
`asset.type`), seeded with exactly the two rows WP 08.06 needs
(`portfolio_photo`, `request_photo`), both `convenience` — neither is
compliance evidence, both may be deleted by their owner, matching what
is already true of them today. `property.documents` — owning workspace
(not null, set at creation, no transfer — nothing in §15 describes
document ownership transferring the way stewardship does), document
type, current version pointer. `property.document_versions` — closed,
immutable, append-only, ADR-0028's shape repeated a third time: storage
bucket/path, content hash, issuer, validity period, `superseded_at`.
**Complexity.** High — the first versioned aggregate in this roadmap.
**Rollback.** Drop all three tables.

**08.02 · Attachment — multi-subject, scoped to subjects that exist
today (add)**
`property.document_attachments`: one row per (document, subject) pair, a
document may have several. Four nullable subject columns —
`property_id`, `location_id`, `asset_id`, `workspace_id` — with a check
that exactly one is set per row, real foreign keys rather than a
stringly-typed polymorphic pair, so referential integrity is enforced by
the database rather than by convention. **Maintenance record and
marketplace engagement are named as real subjects in §15 and
deliberately not included** — neither table exists (Epic 10, Epic 12),
and adding a column that can never be populated is exactly the
speculative structure ADR-0010 rules out. **Complexity.** Medium.
**Rollback.** Drop the table.

**08.03 · Sharing — independent of attachment, the principle §15 calls
"nearly lost" (add)**
`property.document_shares`: `document_id`, `shared_with_workspace_id`,
`created_at`. No row means visible only to the owning workspace. Revoking
a share is a delete, not a closed period — sharing state is Transactional
(§4), not Historical; nothing in §15 requires a permanent record of past
sharing grants the way stewardship requires one of past stewards.
**Complexity.** Low. **Rollback.** Drop the table.

**08.04 · RLS isolation — the one place this epic can violate its own
stated principle (add)**
Owning-workspace membership *or* a row in `document_shares` naming the
caller's workspace — `api.current_workspace_memberships()`, the same
predicate every policy since Epic 03 reuses. **Never** a join through
`document_attachments`. A structural test asserts this negatively —
the isolation policy's own SQL must not reference
`document_attachments` at all, not merely "not use it for visibility,"
so a future edit cannot reintroduce the exact mistake §15 says was
nearly made once already. **Complexity.** Medium. **Rollback.** Drop the
policies.

**08.05 · The document engine contract (add)**
`property.my_documents(subject)` (mirroring `my_assets`'s discovery
shape, one subject at a time — property, location, asset or workspace)
and `property.resolve_document(document_id)` (current version's
metadata plus validity). Real `api` delegates from the start — this
epic's read-switch (WP 08.09, decomposed) is a genuine near-term caller,
the same relationship WP 07.04's asset contract already has. No
`share_document`/`revoke_share` mutation function yet — nothing in the
product creates a share today (WP 08.06's backfill sets `document_shares`
rows directly, in SQL, not through a mutation path a client would use);
building one now would be structure with no real caller, the same
restraint `decide_permission`-style functions have been held to since
WP 05.04. **Complexity.** Medium. **Rollback.** Drop the functions.

**08.06 · Backfill: `portfolio_items` and `service_request_photos` into
`property.documents` (backfill)**
One `property.documents` row (plus its single, closed-from-birth
version) per existing row in either source table — `portfolio_photo` or
`request_photo` type respectively. Owning workspace resolved via the
same ownership-chain join this roadmap has used since WP 03.06:
`portfolio_items.pro_id`/`service_request_photos.request_id` →
`identity.identities` → `workspace.memberships` (owner, active,
`professional`/`personal` respectively) → `workspace.workspaces`.
Attachment: portfolio photos attach to the pro's own Professional
Workspace (no asset/property exists for a pro's craft, only the
workspace itself is a real subject); request photos attach to nothing
today — no `service_requests`-to-`property` link exists yet (that link
does not arrive until Epic 12, Marketplace) — left genuinely unattached
rather than forcing a subject that doesn't fit, the same restraint that
kept Epic 07's backfilled assets unplaced. **Sharing, backfilled
directly**: every migrated `service_request_photos` row gets a
`document_shares` row toward whichever workspace `pro_matches_request()`
(migration `0004`) already names as a matching pro **at backfill time**
— a point-in-time snapshot of the existing RLS policy's own logic, not a
live rule; a pro who starts matching later gets no retroactive share,
named as a real, accepted limitation rather than hidden. `portfolio_items`
needs no share rows — it was always public, and stays public through its
own existing table until WP 08.09 (decomposed) switches reads.
**Neither source table is touched.** `avatar_url` is not backfilled at
all — see this section's own Platform Discovery. **Complexity.** High —
the second backfill in this roadmap moving real, existing production
data (after WP 07.05), and the first backfilling from two source tables
into one target in a single package. **Rollback.** Delete backfilled
rows; both source tables are unaffected either way.

**08.07 · Dual-write: `portfolio_items`/`service_request_photos` writes
also write `property.documents` (complete)**
Following Epic 07's WP 07.06 precedent exactly: a database trigger on
each source table, not an application-level second write. Read before
design found both source tables simpler than assumed —
`src/lib/portfolio.js` and `src/lib/requestPhotos.js` were read in full
before writing this package, and neither has a client-mutable field the
document model needs to track beyond creation (portfolio's own
`caption` has no equivalent column on `property.documents` and is a
stated, deliberate gap), so only INSERT and DELETE triggers were built
per table — no UPDATE trigger on either. **Also found and fixed, before
any live delete could hit it:** `document_attachments.document_id` and
`document_shares.document_id` (0056/0057) had no `ON DELETE` clause —
the same class of bug as Epic 07's `household_items_id`, caught this
time by re-reading those two migrations before writing the delete
triggers, fixed with `ON DELETE CASCADE` in the same migration rather
than needing a follow-up one. **Complexity.** High. **Rollback.** Drop
the four triggers and the two mirror functions; the FK fix stands
regardless, since it was a defect independent of dual-write existing.

**08.08 · Reconcile `property.documents` against both source tables
(complete, structurally)**
`RECONCILE_DOCUMENTS.sql`, following `RECONCILE_ASSETS.sql`'s own shape
— real row counts, null-safe discrepancy checks re-deriving owning
workspace and every mapped field fresh for both source tables, plus an
attachment-shape check specific to this epic (portfolio documents must
be attached to their owning workspace; request-photo documents must
stay unattached). Written and structurally tested; **has not run
against a database this session** — live verification Pending.
**Complexity.** Medium. **Rollback.** None — read-only.

**08.09 · Switch reads to `property.documents` (complete)**
Designing this package surfaced a genuine architectural gap, recorded in
full in `implementation/epic-08/COMPLETION.md` §5.5 (public visibility)
and the product owner's decision: **add explicit public-visibility
support to the isolation model.** Built as `property.document_types.
is_public` (`0062`) — carried by type, the same reasoning §15 already
gives `retention_class` — with `portfolio_photo` the only public type;
the isolation policy and both contract functions gained a third
visibility branch, guarded on `auth.uid() is not null` so an anonymous
caller falls through cleanly; the `api` delegates are now granted to
`anon`, matching `portfolio_items`' own real grant. The discoverability
half of the same finding (`service_request_photos` documents cannot be
found by subject) was resolved directly as ordinary implementation work,
not re-asked — a dedicated lookup, `property.documents_for_service_
request()` (`0063`), via the existing bookkeeping join, same visibility
rule as `resolve_document()` minus the public branch.

Building the client switch surfaced a third, narrower finding
(`implementation/epic-08/COMPLETION.md` §5.6): `fetchPortfolioItems()`
returns `caption`, a real client-mutable field with no equivalent on
`property.documents` — switching would have silently dropped it. Resolved
directly (lower-stakes than §5.5, no visibility trade-off): `property.
documents.caption` (`0064`), backfilled onto already-mirrored rows,
added to every contract function's return shape, and `portfolio_items`
gained its first-ever UPDATE mirror trigger. One more piece was needed to
finish the switch: `workspace.resolve_public_professional_workspace()`
(`0065`), the first "resolve *another* person's public workspace" lookup
in this roadmap (every prior resolver only answers "what are *my own*
workspaces"), granted to `anon` for the same reason `is_public` exists.

Both source tables are now switched and live: `fetchRequestPhotos`
(`src/lib/requestPhotos.js`) and `fetchPortfolioItems`
(`src/lib/portfolio.js`), each with a proven fallback to identical prior
behaviour. **Complexity.** High. **Rollback.** Revert either read path;
no data change. **Deploy gate:** do not ship without `RECONCILE_
DOCUMENTS.sql` having actually run and passed.

## 19 · Work Packages — Epic 09

**Dependencies.** `DATABASE_ARCHITECTURE.md` §18 (Workflow),
`SUPABASE_ARCHITECTURE.md` §23 Conflict 3 and §24 constraint 15 (the five
legacy triggers named as migration targets). Lives in `work`, owned by
`klussie_engine_work` — migration 0019's own grouping comment names this
role for "Maintenance, Service Record, Workflow, Marketplace and
Conversation engines," so Workflow is the first of five future engines to
land in this schema.

**Read before design — what this epic does not do, and why.** The
roadmap's own one-line summary (§10) reads "this epic ends the
trigger-based state machine." Checked against §18 itself ("Workflow
Instance — one workspace-scoped run of a definition") and against what
the five legacy triggers actually key off
(`public.service_requests`/`public.quotes`, keyed by `profiles.id`, not a
workspace): a workflow instance needs a real workspace-scoped subject,
and requests/quotes do not have one until Epic 12's own migration gives
them one — Epic 12's own line is explicit that this is *its* job.
**This epic builds the real, generic engine and authors the actual
booking-lifecycle rules as a genuine published definition. It does not
touch `public.service_requests`, `public.quotes`, or retire any of the
five legacy triggers** — recorded here and in
`implementation/epic-09/COMPLETION.md` §5.1, not silently dropped. Full
detail, including three further read-before-design findings (no backfill
step exists because there is no predecessor data; `subject_type`/
`subject_id` reuses `platform.emit_event()`'s own polymorphic-pair
precedent rather than inventing one; "who may perform," "evidence
required," "timing expectations" and "notifications" are all named in
§18 but not built, because none corresponds to something real yet), is
in the completion record.

**09.01 · The Workflow Definition aggregate (add)**
`work.workflow_definitions` — versioned per `definition_key`, immutable
once published except `deprecated_at`, never deleted.
`work.workflow_stages` and `work.workflow_transition_rules` — the
reachability graph, unconditionally append-only once their definition is
published. **Complexity.** Medium. **Rollback.** Drop all three tables.

**09.02 · The Workflow Instance aggregate (add)**
`work.workflow_instances` — a mutable `current_stage` pointer, ADR-0028's
shape a fourth time. `work.workflow_transitions` — the append-only
transition log, the truth per §18; `definition_id` denormalised from the
owning instance so both stage columns can be composite foreign keys into
`workflow_stages`. No foreign key from `subject_type`/`subject_id` to
anything — see the epic header. **Complexity.** Medium. **Rollback.**
Drop both tables.

**09.03 · RLS isolation (add)**
Ordinary workspace-scoped isolation for instances and transitions;
catalog visibility (`workspace_id is null`, or membership) for
definitions, stages and transition rules, one join deep for the latter
two. **Complexity.** Low. **Rollback.** Drop the five policies.

**09.04 · The workflow engine contract (add)**
`work.start_workflow_instance()` and `work.transition_workflow_instance()`
— the first write contract in this roadmap with no predecessor data to
mirror, so every identifier (instance, transition, event, correlation) is
a required parameter, none minted server-side (ADR-0022).
`work.transition_workflow_instance()` is Conflict 3's own distinguishing
test enforced in code: an event this stage's rules do not name is
refused, never guessed. Plus three read functions. No `api.*` delegate
for any of the five — `property.reparent_location()`'s own precedent
(migration 0047: a real write contract, no client caller yet, granted to
the engine role only), not `property.my_documents()`'s. **Complexity.**
High. **Rollback.** Drop all five functions.

**09.05 · The real booking-lifecycle definition, and its shadow
verification (add)**
`booking_request_lifecycle` v1 — the actual rules `on_request_created`,
`on_quote_sent`, `on_quote_accepted`, `on_job_completed` and
`on_review_created` carry today, reusing their own stage names
(`public.service_requests.status`'s five values) and event names
(migration 0012's own domain event vocabulary) rather than inventing new
ones. Includes a deliberate `quotes_ready -> quotes_ready` self-loop on a
second `QuoteSubmitted`, reproducing `handle_quote_sent()`'s own
`where status = 'collecting'` no-op exactly — missed on a first reading,
caught by re-reading the trigger's own guard clause before writing the
rule set. Declines-other-quotes and open-conversation, the legacy
trigger's cascading side effects, are a named, undone gap — no
action/effect mechanism exists yet, and building one with no real
consumer would be inventing structure ahead of Epic 12.
`VERIFY_WORKFLOW_CONTRACT.sql` is the shadow verification itself: walks a
synthetic instance through every one of the five events plus the
multi-quote no-op and the impossible-transition refusal, proving the
definition reproduces the trigger chain's decisions exactly.
**Complexity.** Medium. **Rollback.** Delete the twelve seeded rows across
all three tables (no instance can reference them yet).

## 20 · Work Packages — Epic 10

**Dependencies.** `DATABASE_ARCHITECTURE.md` §16 (Maintenance),
`SYSTEM_ARCHITECTURE.md` §8.1 (the Maintenance Engine). Lives in `work`,
alongside Epic 09's Workflow Engine — migration 0019's own grouping names
both, plus Service Record, Marketplace and Conversation, for this schema.

**Read before design — what this epic does not do, and why.** Three
relationships §16/§8.1 name are not wired here, each because its real
counterpart does not exist yet, the same restraint Epic 09 held: "due"
and "overdue" are computed at read time from `due_on`, not stored or
emitted as events, since firing `ObligationDue`/`ObligationOverdue` needs
a scheduled job with no consumer (Notification, Epic 19, is unbuilt).
"Produces workflow instances" is not wired — no maintenance-specific
workflow definition exists (Epic 09's own `booking_request_lifecycle`
describes a marketplace request, not this). "Resolved by service
records" is not wired — `ServiceRecordCompleted` is Epic 11's own event,
which does not exist yet; `work.complete_maintenance_obligation()` is a
direct call for now. Full detail in
`implementation/epic-10/COMPLETION.md` §5.

**10.01 · The Maintenance Schedule aggregate (add)**
`work.maintenance_schedules` — anchored to exactly one of an asset or a
location (narrower than `property.document_attachments`' four-subject
menu, matching what §16 actually names), `recurrence` a native
`interval`, ordinary mutable Transactional data, no version history.
**Complexity.** Low. **Rollback.** Drop the table.

**10.02 · The Maintenance Obligation aggregate (add)**
`work.maintenance_obligations` — authoritative once created (§16: not
conflated with a prediction), immutable once `status` reaches
`completed` or `cancelled`, enforced by a conditional guard trigger
reusing `property.documents_guard_deletion()`'s own shape (Epic 08).
Cancellation always carries a reason, enforced by both a table check and
the contract function. **Complexity.** Medium. **Rollback.** Drop the
table and its guard trigger.

**10.03 · RLS isolation (add)**
Ordinary workspace-scoped isolation for both tables, no sharing concept
— the same shape `work.workflow_instances` holds (migration 0068).
**Complexity.** Low. **Rollback.** Drop the two policies.

**10.04 · The maintenance engine contract (add)**
Create/cancel a schedule, create/complete/cancel an obligation, plus two
read functions. `work.generate_due_obligation()` handles exactly one
schedule, one obligation, per call — never a loop minting several ids
itself, since `platform.uuid_v7_at()` is documented backfill-only
(ADR-0022) and generating new obligations on an ongoing basis is runtime
generation, which belongs in the application. A schedule several periods
behind is caught up by calling it once per missed period, proven in
`VERIFY_MAINTENANCE_CONTRACT.sql` catching up three missed monthly
periods with three separate calls. No `api.*` delegate for any of the
eight functions — `property.reparent_location()`'s own precedent, now a
three-time pattern. **Complexity.** High. **Rollback.** Drop all eight
functions.

## 21 · Work Packages — Epic 04

**Built out of chronological order — read this before the migration
numbers below look wrong.** Epic 04 is Tier 1 in §5's own sequencing
diagram: Identity, Workspace, Capability, before any physical-model
epic. It was skipped when this roadmap was originally executed — no
branch, PR, or completion record for it ever existed, and no documented
reason was found anywhere in this document, `MASTER_CONTEXT.md`, or the
Decision Log. Found and confirmed empty while reporting Epic 10's
completion; built now, on request, rather than left open. Migrations
`0039`–`0074` already belong to Epics 05–10, each on its own open,
stacked PR — renumbering six PRs to give Epic 04 its "correct"
chronological position would be a far larger change than building the
epic itself. This epic's migrations are numbered `0075` onward,
continuing after Epic 10, and its branch is stacked on `epic-10`'s tip.
Nothing built in Epics 05–10 depends on Capability — each epic that
touched a capability-shaped concept said so explicitly and left it as a
named gap. Full detail in `implementation/epic-04/COMPLETION.md` §5.1.

**Dependencies.** `PLATFORM_DOMAIN_MODEL.md` §6 (whole chapter),
Principle 1; `DATABASE_ARCHITECTURE.md` §11 (Capability Grant), §34 (The
Capability Engine in Data). Epic 03 (workspaces must exist to grant
anything to).

**04.01 · The capability catalogue and dependency graph (add)**
`platform.capabilities` — the real 26-capability catalogue from §6.7,
seeded verbatim. `platform.capability_dependencies` — only the five
edges §6.2 itself states (its own diagram, plus one sentence of prose);
a plausible-but-unstated edge is not invented. **Complexity.** Medium.
**Rollback.** Drop both tables.

**04.02 · Capability presets (add)**
`platform.capability_presets`/`capability_preset_grants` — exactly three
presets (Personal, Professional, Business), transcribed from §6.8's own
table. Not four: this epic's own acceptance criterion names three, and
`workspace.workspaces.type` has no `'enterprise'` value to apply a
fourth to. Verified dependency-consistent against 0075's own graph, not
merely assumed. **Complexity.** Low. **Rollback.** Drop both tables.

**04.03 · The Capability Grant aggregate (add)**
`workspace.capability_grants`/`capability_grant_history` — shaped like
`workspace.memberships`/`membership_history` (Epic 03), not ADR-0028: a
capability grant is a set a workspace holds, not a single current value.
No unique constraint on (workspace_id, capability_key), the same reason
memberships has none on (person_ref, workspace_id). **Complexity.**
Medium. **Rollback.** Drop both tables and the guard trigger.

**04.04 · RLS isolation (add)**
Ordinary workspace-scoped isolation for the grant aggregate; unrestricted
authenticated-only read for the catalogue, matching `property.
document_types`/`facet_types`' own posture. **Complexity.** Low.
**Rollback.** Drop the six policies.

**04.05 · The capability engine contract (add)**
`grant_capability()`/`withdraw_capability()`, plus two reads. Grant does
not auto-cascade its dependencies — it refuses their absence, Conflict
3's own distinguishing test applied a third time (after Workflow's
transition rules and Maintenance's schedule generation), because
auto-cascading would mean minting several ids per call with no caller
supplying them, exactly what `work.generate_due_obligation()` (Epic 10)
already ruled out. Withdraw enforces the mirror rule: refuses while a
held capability still depends on the one being withdrawn. No `api.*`
delegate — `property.reparent_location()`'s posture, now a four-time
pattern. **A real bug caught before shipping**: the first draft of
`grant_capability()` minted its history row's id via `gen_random_uuid()`
internally, contradicting its own header — found by re-reading the
function against its own stated rule before running the tests.
**Complexity.** High. **Rollback.** Drop all four functions.

**04.06 · Backfill: apply the matching preset to every existing
workspace (add)**
`workspace.workspaces.type` maps directly onto `preset_key` — no lookup
table. Backdated to each workspace's own `created_at`, the same
reasoning every prior backfill's minted ids already used
(`platform.uuid_v7_at(source.created_at)`), extended here to the grant's
own recorded timestamp: the capabilities were always the workspace's
effective starting bundle, this migration is only the first thing to say
so structurally. Inserts directly, not through the contract function —
the same reason every other backfill in this roadmap does (0052, 0060):
the contract function protects a live write path from an inconsistent
request; a backfill already knows the full, correct picture. Idempotent
via `where not exists`, since the target table deliberately has no
unique constraint to conflict against. **Complexity.** Medium.
**Rollback.** Delete every row where `source = 'preset'`.

## 22 · Work Packages — Epic 11

**Dependencies.** `DATABASE_ARCHITECTURE.md` §17 (Service Record —
"the most consequential aggregate in the document"), `PLATFORM_DOMAIN_
MODEL.md` §13.2 and §32 item 5 (the frozen architecture's own
verification pass naming this split as "the part `DATABASE_ARCHITECTURE.
md` must get exactly right"), `SYSTEM_ARCHITECTURE.md` §8.2. Property
(Epic 05), Asset (Epic 07), Workspace (Epic 03).

**Read before design.** §17 and §13.2 were each read in full, twice,
before any SQL was written — three independent statements of the
identical classification table, cross-checked against each other. Full
findings in `implementation/epic-11/COMPLETION.md` §5, including a
second occurrence of Epic 04's own `gen_random_uuid()` id-minting
mistake, caught before shipping this time in a fraction of the time the
first one took, because the pattern was already named.

**11.01 · The Service Record shared core (add)**
`work.service_records` — no `owning_workspace_id`; the core "follows the
property" (§17), resolved live through `property_id ->
property.properties.steward_workspace_id`, the same shape
`property.assets`/`locations` already use, not `property.documents`'
frozen-owner shape. `performing_workspace_id` is the permanent,
non-revocable grant itself (§17) — a plain column, not a separate grants
table; no withdraw path exists anywhere in this schema for it. Rich,
variable content (diagnosis, symptoms, technicians, parts, measurements)
lives in `content jsonb`, not fifteen nullable columns — every field
shares one visibility rule regardless of type. Immutable except
`customer_approved`/`customer_approved_at`, which may move false ->
true exactly once. **Complexity.** High — the first aggregate in this
roadmap combining a live-resolution visibility path with a frozen one on
sibling tables. **Rollback.** Drop the table and its guard trigger.

**11.02 · The two private annexes, and the amendment log (add)**
`work.service_record_performing_annexes` — no workspace column of its
own; the core already has one. `work.service_record_property_annexes` —
freezes `owning_workspace_id` at write time, §17's own transfer table's
exact opposite of the core. Both unique per `service_record_id`, enforced
by the database, not the contract function alone.
`work.service_record_amendments` — append-only, either party may author
one. **Complexity.** Medium. **Rollback.** Drop all three tables.

**11.03 · RLS isolation (add)**
The core's own policy is the first in this schema where two independent
relationships — direct `performing_workspace_id` membership, OR the
property's current steward — combine with `or` rather than one chain
however many joins deep. The performing annex's policy has no path
through property stewardship; the property annex's policy has no path
through performing-workspace membership — proven structurally in
`VERIFY_SERVICE_RECORD_ISOLATION.sql`, which inspects the actual
`pg_policies` text, not only a scenario's pass/fail. **Complexity.**
High. **Rollback.** Drop all four policies.

**11.04 · The service record engine contract (add)**
Ten functions, none generic — `create_service_record()` is the
performing workspace's one write to the core; `record_service_record_
approval()` is the property side's one narrow write; the annexes and
amendments each get their own function. `write_property_annex()`
resolves the current steward itself, via a live join, rather than
trusting a caller-supplied workspace id — the one value in this epic
where a wrong value would cause the exact failure §17 names. **A real
bug caught before shipping**: the first draft of
`create_service_record()` minted its conditional `WarrantyArising`
event's id via `gen_random_uuid()` — the identical mistake Epic 04's
`grant_capability()` made — fixed by requiring `p_warranty_event_id` as
a parameter on every call. No `api.*` delegate for any of the ten
functions — `property.reparent_location()`'s posture, now a five-time
pattern. **Complexity.** Very High. **Rollback.** Drop all ten functions.

## 23 · Work Packages — Epic 12

**Dependencies.** `DATABASE_ARCHITECTURE.md` §19 (Marketplace),
`PLATFORM_DOMAIN_MODEL.md` §14.3, `SYSTEM_ARCHITECTURE.md` §8.4. Epic 03
(workspace), Epic 09 (Workflow — the engine this epic connects to but
does not yet switch onto), Epic 11 (Service Record — the completion
target this epic connects to but does not yet wire).

**This epic's own scope boundary — read before design, held across
every migration in it.** Epic 09's own header named the actual trigger
retirement "the single largest behavioural risk in the roadmap," and
this roadmap's own risk register (§24 row 2) requires the regression
baseline (WP 00.08) as "the reference" before that switch happens. This
epic builds the complete new schema, backfills every real request/quote/
booked-engagement, and ships a full contract proven to reproduce the
five legacy triggers' exact decisions — all additive, all reversible,
none of it live. It does **not** dual-write a real scoped access grant,
retire any legacy trigger, or switch the live booking flow onto
workflow-instance-driven logic. Full reasoning in
`implementation/epic-12/COMPLETION.md` §5.1.

**12.01 · The Request aggregate (add)**
`work.requests` — reuses `public.categories`/`services` directly rather
than migrating marketplace taxonomy (its own separate, low-priority debt
item, `MASTER_CONTEXT.md` §12). `workflow_instance_id` is a real,
unpopulated forward-connection to Epic 09. One-tap booking's
directed-quote window (ADR-0012) is deliberately not modelled — nothing
reads this schema yet to need it. **Complexity.** Medium. **Rollback.**
Drop the table.

**12.02 · The Quote aggregate (add)**
`work.quotes` — mirrors `public.quotes`' own shape, owned by the
offering workspace. **Complexity.** Low. **Rollback.** Drop the table.

**12.03 · The Engagement aggregate (add)**
`work.engagements` — a bilateral object, both parties denormalised
directly. `service_record_id` and `maintenance_obligation_id` are real,
unpopulated forward-connections to Epics 11 and 10. Immutable once
completed or cancelled, the same conditional-guard shape Epic 10's
obligations already use. No delete grant, ever — "permanent" (§19), no
exception. **Complexity.** Medium. **Rollback.** Drop the table and its
guard trigger.

**12.04 · RLS isolation (add)**
Requests: ordinary direct membership. Quotes: visible to either party —
the offeror directly, or the requester via a join through the request,
the second occurrence of the combined-OR shape Epic 11 first established.
Engagements: both parties direct, no join needed for either half.
**Complexity.** Medium. **Rollback.** Drop all three policies.

**12.05 · Backfill: requests, quotes, booked engagements (add)**
Reuses Epic 03's own already-resolved `service_requests.workspace_id`/
`quotes.workspace_id` columns rather than re-deriving the identity →
membership → workspace chain a third time — the same answer two already-
live read switches already depend on, not a second, independently-
computed one. Engagements backfilled only for `booked`/`completed`/
`reviewed` requests with a real accepted quote; `cancelled` is excluded
(no writer of that status exists anywhere in the current product).
**Complexity.** High. **Rollback.** Delete every row carrying a
`service_request_id`/`legacy_quote_id`, and every engagement referencing
one.

**12.06 · The marketplace engine contract (add)**
Thirteen functions reproducing the five legacy triggers exactly —
`submit_quote()`'s guarded first-quote transition, `accept_quote()`'s
bulk decline of every other open quote in one statement,
`complete_engagement()`'s request-completion side effect,
`mark_request_reviewed()`'s state-machine closure. `accept_quote()`'s
bulk decline emits one consolidated `QuoteDeclined` event rather than
one per declined row — the fourth occurrence of the "single, required,
conditionally-used event id" shape this roadmap has now needed.
**A real cross-schema privilege violation caught before shipping**: the
first draft built `work.grant_engagement_access()`, inserting directly
into `workspace.memberships` from `work` — a table `klussie_engine_work`
holds no privilege on at all. Removed entirely; the grant belongs to a
future Workspace-owned consumer of this epic's own `EngagementCreated`
event, per `SYSTEM_ARCHITECTURE.md`'s own Workspace section ("Events
consumed. `EngagementAccepted`"). No `api.*` delegate for any of the
thirteen functions — the sixth occurrence of that same restraint.
**Complexity.** Very High. **Rollback.** Drop all thirteen functions.

## 24 · Work Packages — Epic 13

**Dependencies.** `DATABASE_ARCHITECTURE.md` §20 (Conversation),
`PLATFORM_DOMAIN_MODEL.md` §15, `SYSTEM_ARCHITECTURE.md` §8.5. Epics 03,
05, 07, 10, 12 (all five real subjects a conversation may bind to).

**Reviewed against every completed engine before implementation, on
explicit request** — `implementation/epic-13/DESIGN_REVIEW.md` is that
review, produced and read before WP 13.01 began. Its headline finding:
all five subjects §15 names for a conversation (engagement, asset,
maintenance obligation, property, workspace) are real aggregates for the
first time only now, after Epics 05–12. The original one-liner for this
epic ("migrates existing messages and the `translations` cache") was
written before any of them existed and undersold what is now possible.

**13.01 · The Conversation aggregate (add)**
`work.conversations` — five nullable subject columns, exactly one
required. **Binds to `work.engagements`, not a request** — the single
largest correction the review made: §15 names the subject as "a
marketplace engagement," and legacy only bound to a request because no
engagement existed as a real row before Epic 12. Immutable except
`closed_at`, one-way. **Complexity.** Medium. **Rollback.** Drop the
table and its guard trigger.

**13.02 · Conversation Participants (add)**
`work.conversation_participants` — an explicit, managed roster keyed by
`person_ref` (no foreign key, matching every durable person-reference in
this schema), not derived from workspace membership. The review checked
the naive "either workspace" isolation shape (this epic's own nearest
precedent, Marketplace's engagement policy) against §20's own text and
found it would over-grant. `last_read_at` lives here, per participant —
legacy's single `messages.read_at` assumed exactly two parties, which
participation is no longer fixed at. **Complexity.** Medium.
**Rollback.** Drop the table.

**13.03 · Messages (add)**
`work.messages` — immutable except `translations` (jsonb, reusing the
exact existing mechanism, not waiting on Intelligence/Epic 17, not yet
built). `reference_type`/`reference_id` give a message an optional,
typed link to a structured moment (a quote, a transition, an approval —
§15's own words), reusing `platform.emit_event()`'s own polymorphic-
subject shape. **Complexity.** Medium. **Rollback.** Drop the table and
its guard trigger.

**13.04 · RLS isolation (add)**
All three policies check `work.conversation_participants`, never
`api.current_workspace_memberships()` — the first isolation policy
family in this schema to deliberately not reuse that resolver, because
this is the first table where workspace membership is genuinely the
wrong boundary. Reuses `public.current_identity()` (Epic 02) for "which
real person is asking." **Complexity.** High. **Rollback.** Drop all
three policies.

**13.05 · Backfill: every real conversation and message (add)**
Every legacy conversation already has a real engagement to bind to —
`handle_quote_accepted()` only ever created one at acceptance, which is
exactly the condition Epic 12's own engagement backfill used.
**Complexity.** High. **Rollback.** Delete every row carrying a
`legacy_conversation_id`/`legacy_message_id`.

**13.06 · The conversation engine contract (add)**
Eleven functions. **Two real bugs caught before shipping**:
`platform.events.workspace_id` is `not null` and is the table's own
partition key; the first draft of `close_conversation()` passed a
literal `null`, and `open_conversation()`'s first draft would have
silently recorded an asset or property id *as* a workspace id whenever a
conversation opened on one of the three subjects with no workspace
column of its own. Both fixed by `work.resolve_conversation_home_
workspace()`, a real resolver walking all five subjects to their actual
owning workspace — a genuinely new bug class for this roadmap, not a
repeat of the `gen_random_uuid()` pattern Epics 04/11 already caught.
No `api.*` delegate for any of the eleven functions — the seventh
occurrence of that restraint. **Complexity.** Very High. **Rollback.**
Drop all eleven functions.

## 25 · Work Packages — Epic 14

**Dependencies.** `DATABASE_ARCHITECTURE.md` §22, `SYSTEM_ARCHITECTURE.md`
§11.2 (Billing — note §11.1, Subscription, is a *different* engine
sharing the same `commerce` schema, built six epics later as Epic 22).
`PLATFORM_DOMAIN_MODEL.md` §24. Epic 12 (a real engagement to bill).

**Read before design.** No legacy financial data exists anywhere —
`src/lib/billing.js` is pure client-side display math with no persisted
record ("commission is currently a display-only constant"). This epic
is greenfield, the same shape Epic 09 held for the identical reason —
no backfill work package.

**14.01 · The Invoice aggregate (add)**
`commerce.invoices` — immutable except `status` (issued -> paid ->
credited, credited a true terminal). `kind = 'marketplace_commission'`
is the only real revenue source this epic produces; "commission record"
(§11.2) is interpreted as this kind of invoice, not a fourth table with
no stated shape to build against. `payer_workspace_id` is a real,
unpopulated forward-compatible column. **Complexity.** High.
**Rollback.** Drop the table and its guard trigger.

**14.02 · Credits (add)**
`commerce.credits` — append-only, the only correction mechanism ("credit
-and-reissue, never edit," §11.2). **Complexity.** Low. **Rollback.**
Drop the table.

**14.03 · Payments (add)**
`commerce.payments` — one table for both payments and payouts, a
`direction` column rather than two duplicated shapes, matching `work.
maintenance_obligations`' own `source`-column idiom (Epic 10).
Immutable except one guarded transition out of `pending`, into either
`settled` or `failed`. **Complexity.** Medium. **Rollback.** Drop the
table and its guard trigger.

**14.04 · RLS isolation (add)**
Invoices: workspace OR its distinct payer (§22's own isolation rule).
Credits: one join deep, through the parent invoice. Payments: ordinary
direct membership. **Complexity.** Medium. **Rollback.** Drop all three
policies.

**14.05 · The billing engine contract (add)**
Ten functions. `issue_marketplace_commission_invoice()` resolves a real
engagement's `agreed_price`/`performing_workspace_id` and composes
`issue_invoice()` rather than duplicating its insert — the third
occurrence of the compose-don't-duplicate pattern `work.generate_due_
obligation()` established (Epic 10). The commission rate is a required
parameter, never a hardcoded constant — pricing is product
configuration (§24), not an engine-baked number. `settle_payment()`
marks a linked invoice paid in the same transaction as settling an
inbound payment against it. **A named gap in the frozen event
vocabulary**: §11.2 has no `PayoutFailed` event, even though `commerce.
payments.status` structurally permits a failed outbound payment —
`fail_payment()` emits it anyway, a minimal, consistent extension of the
pattern the frozen list already establishes. No `api.*` delegate for any
of the ten functions — the eighth occurrence of that restraint.
**Complexity.** High. **Rollback.** Drop all ten functions.

## 26 · Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Epic 03 backfill assigns rows to the wrong workspace** | Critical | 03.07 reconciliation is a hard gate on 03.09; backfills idempotent and re-runnable |
| 2 | **Epics 09/12 change booking behaviour while replacing triggers** | Critical | Workflow definitions (Epic 09) and the marketplace contract (Epic 12) both proven, structurally, to reproduce current trigger behaviour exactly (`VERIFY_WORKFLOW_CONTRACT.sql`, `VERIFY_MARKETPLACE_CONTRACT.sql`) — but the actual switch (dual-write the scoped grant, retire the five legacy triggers, cut the live booking flow over) remains undone, deliberately, per Epic 12's own §5.1. Regression baseline from 00.08 is still the reference for whenever that switch happens |
| 3 | **Service Record visibility misclassification** (Epic 11) | Critical | Classification is structural, not policy-based; dedicated security review before the read-switch |
| 4 | **Location re-parenting leaves stale scopes and indexes** (Epic 06) | High | Path rewrite and `LocationTreeChanged` in one transaction; named consumers tested |
| 5 | **RLS predicate cost degrades at scale** | High | 03.02's helper is `STABLE` and security-definer; performance test in its acceptance |
| 6 | **Single maintainer, 27 epics** | High | Epics are independently valuable and sequenced so tiers 0–3 deliver a working platform; 23–24 are demand-gated and may never be built |
| 7 | **Production is still the only environment until 00.06** | High | Epic 00 precedes all schema work; no migration before staging exists |
| 8 | **Architectural drift under delivery pressure** | Medium | Gate 7 and 9; deviations require an ADR before code |
| 9 | **The roadmap outlives its assumptions** | Medium | Work packages decomposed just-in-time (§1); epic definitions revisited at tier boundaries |

## 27 · How Implementation Sessions Work

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
| 06 — Location Engine | **Complete** 2026-08-17 — 5/5 packages. Not yet verified against a live database (gate 10 open, fourth epic in a row). [Completion record](../implementation/epic-06/COMPLETION.md) |
| 07 — Asset Engine | **Complete** — 8/8 packages. Dual-write is a database trigger (0053), not an application-level second write. Live verification (RECONCILE_ASSETS.sql, the six-step pattern's hard gate) is Pending — written and structurally tested, not yet run against a database. [Completion record](../implementation/epic-07/COMPLETION.md) |
| 08 — Document Engine | **Complete** — 9/9 packages. Both read switches live (`fetchRequestPhotos`, `fetchPortfolioItems`), each with a proven fallback. Two real findings surfaced building the read switch and resolved in the same session — public visibility (a product decision) and a caption-mirroring gap (resolved directly). Live verification Pending — written and structurally tested, not yet run against a database. [Completion record](../implementation/epic-08/COMPLETION.md) |
| 09–26 | Not started; work packages decomposed at epic start |

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

**Carried out of Epic 06**, and recorded in full in its [completion
record](../implementation/epic-06/COMPLETION.md):

- **The same unverified-database gap, now four epics deep** —
  migrations `0043`–`0047`, five more diagnostics written, none run.
  Worth escalating rather than repeating a fifth time.
- **A real bug found and fixed by reasoning, not by running anything:**
  every `ltree` operator (`<@`, `@>`, `||`) and function (`nlevel`,
  `subpath`) lives in the `extensions` schema, not `pg_catalog`, and
  under this codebase's own `set search_path = ''` discipline none of
  them would have resolved — every containment check and the entire
  re-parenting rewrite would have failed at the first real call.
  `OPERATOR(extensions.<op>)` syntax and explicit `extensions.`
  qualification fix it; migration tests now assert no bare occurrence of
  either appears in the affected function bodies. **Worth a second read
  by whoever builds Epic 07 or 08** — both touch geometry or facets that
  may reach for other extensions, and this is the first place that trap
  was actually hit rather than merely documented.
- **No structural guard stops a direct `UPDATE ... SET parent_id` on
  `property.locations` from bypassing `reparent_location()` and leaving
  descendant paths stale.** A stated convention, not enforced — nothing
  reaches this table yet to violate it. Migration 0044's own header
  names this as a hardening item for Epic 07 or whichever epic first
  gives the table a real write path.

**Carried out of Epic 07 (complete — all 8 work packages)**, and recorded
in full in its [completion record](../implementation/epic-07/COMPLETION.md):

- **The epic completed without ever running its own reconciliation gate.**
  The standing engineering directive changed mid-epic: implementation no
  longer stops for lack of live verification — it completes, with
  structural tests and diagnostics, and marks live verification
  **Pending** with a stated reason, rather than stopping short. WP 07.06
  is a database trigger (not the application-level second write the
  roadmap's own WP 07.06 note had described — see the completion record
  §5 for why the nearer precedent, migration 0027's identity dual-write,
  won out). WP 07.07's `RECONCILE_ASSETS.sql` is written and structurally
  tested, never executed. WP 07.08's read switch is additive and falls
  back cleanly when unresolved. **Do not deploy WP 07.08 anywhere real
  users already use "Mijn spullen" without first running
  `RECONCILE_ASSETS.sql` and confirming it passes** — that rule is not a
  suggestion, Pending is not the same as satisfied.
- **A real bug found and fixed before any dual-write row could hit it**:
  `property.assets.household_items_id`'s foreign key had no `ON DELETE`
  clause, defaulting to `NO ACTION` — `deleteHouseholdItem()` would have
  started failing with a foreign-key violation the moment any item both
  had a mirrored asset and was deleted. Fixed with `ON DELETE SET NULL`
  in the same migration that would have made the bug guaranteed rather
  than latent. Found by reasoning through the DDL, the same method as
  Epic 06's ltree bug — see the completion record §5.
- **The same unverified-database gap, now six epics deep** — migrations
  `0048`–`0054`, seven diagnostics written across the epic, none run.
  `MASTER_CONTEXT.md` §12 raised this to Critical/P0 during this epic.
- **household_items_id was added as a bookkeeping column with no
  domain-model justification**, purely so the backfill is idempotent.
  Whoever eventually retires `household_items` (a future epic — step 6
  of the six-step pattern, not reached by this one) should retire this
  column alongside it, since nothing else will ever read it.
- **Migration 0044's parent_id-bypass hardening item (Epic 06) is now
  repeated for assets**: nothing stops a direct `UPDATE ... SET
  location_id` on `property.assets` from bypassing whatever placement
  operation a later epic eventually builds. Same convention-not-
  structure posture, same reason (nothing reaches this table's write
  path yet).

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

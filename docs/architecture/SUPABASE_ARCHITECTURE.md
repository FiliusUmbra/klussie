# Klussie — Supabase & PostgreSQL Architecture

**This document owns:** how the frozen architecture is physically realised
on PostgreSQL and Supabase — schema organisation, aggregate placement,
identifier and mutability strategy, Row Level Security philosophy, event
persistence, projection mechanics, partitioning, retention, and which
Supabase service does what. It is the blueprint every migration is
written against.

It does **not** own: what the platform is
([`PLATFORM_DOMAIN_MODEL.md`](./PLATFORM_DOMAIN_MODEL.md)), its data
architecture ([`DATABASE_ARCHITECTURE.md`](./DATABASE_ARCHITECTURE.md)),
or its software architecture
([`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md)) — all three frozen
and unmodified here.

> **Out of scope by design.** No migration SQL. No DDL. No table or column
> definitions. No policy bodies. No function bodies. No application code.
> This document decides *strategy and placement*; the migration milestone
> writes it.

**Where this document may name technology.** The three documents above are
deliberately vendor-neutral. This one is not — naming PostgreSQL features
and Supabase services is its entire purpose. Every such choice is
recorded with what it is chosen *over*, so that replacing it later is an
adapter change rather than an excavation (`SYSTEM_ARCHITECTURE.md` §18).

**§23 records a full implementation audit** against all three frozen
documents: eleven conflicts found before any SQL exists, ten resolved
here, and one that constrains *when* a capability can ship rather than
whether the architecture is right.

---

## Table of contents

**Part I — Foundations**
1. [Inherited Non-Negotiables](#1--inherited-non-negotiables)
2. [Schema Organisation](#2--schema-organisation)
3. [Identifier Strategy](#3--identifier-strategy)
4. [Mutability Classes](#4--mutability-classes)
5. [Referential Integrity](#5--referential-integrity)

**Part II — Security**
6. [Row Level Security Philosophy](#6--row-level-security-philosophy)
7. [Access Paths](#7--access-paths)
8. [RLS by Scenario](#8--rls-by-scenario)
9. [Roles, Grants and Secrets](#9--roles-grants-and-secrets)

**Part III — Aggregate Placement**
10. [Placement Reference](#10--placement-reference)
11. [The Difficult Four](#11--the-difficult-four)

**Part IV — Events**
12. [Event Storage](#12--event-storage)
13. [Consumers, Replay and Recovery](#13--consumers-replay-and-recovery)

**Part V — Derived Data**
14. [Projections Are Tables, Not Materialized Views](#14--projections-are-tables-not-materialized-views)
15. [Search](#15--search)
16. [AI Storage](#16--ai-storage)
17. [Analytics](#17--analytics)

**Part VI — Supabase Services**
18. [Service Roles](#18--service-roles)

**Part VII — Scale**
19. [Partitioning](#19--partitioning)
20. [Performance](#20--performance)
21. [Archiving and Backups](#21--archiving-and-backups)
22. [Multi-Region and Sharding](#22--multi-region-and-sharding)

**Part VIII — Audit**
23. [Implementation Audit](#23--implementation-audit)
24. [What the Migration Milestone Inherits](#24--what-the-migration-milestone-inherits)

---

# Part I — Foundations

## 1 · Inherited Non-Negotiables

Fifteen constraints arrive from `DATABASE_ARCHITECTURE.md` §39 and the
engine rules in `SYSTEM_ARCHITECTURE.md`. Each is either satisfied by a
decision below or is a finding in §23.

| # | Constraint | Where satisfied |
|---|---|---|
| 1 | Every record carries its workspace | §2, §6 |
| 2 | Subtree containment is a first-class operation | §11.2 |
| 3 | Service Record is core-plus-annexes | §11.1 |
| 4 | Personal identifiers separable from durable records | §11.4 |
| 5 | Events emitted in the same transaction as the change | §12 |
| 6 | Append-only means append-only | §4 |
| 7 | Projections rebuildable per workspace, incrementally | §14 |
| 8 | Workflow instances pin their definition version | §10 |
| 9 | No capability creates a parallel representation | §2, §10 |
| 10 | Platform- and workspace-scoped analytics physically separate | §17 |
| 11 | Events ordered per subject, not per workspace | §12 |
| 12 | Document attachment never implies sharing | §11.3 |
| 13 | Facet attributes declared before use | §10 |
| 14 | Location tree changes invalidate scopes and indexes | §11.2 |
| 15 | Promotion to platform scope is audited | §16 |

**The method.** For each aggregate: where it lives, why there, what may
reference it, how it grows, how long it is kept, how it is searched,
indexed, secured and archived. Where PostgreSQL cannot express something
the frozen architecture requires, that is recorded as a conflict rather
than quietly softened.

## 2 · Schema Organisation

**The decision: one PostgreSQL schema per engine tier, with grants
mirroring engine ownership.**

`SYSTEM_ARCHITECTURE.md` §1 rule 2 says an engine never reads or writes
another engine's aggregates directly. In application code that rule
depends on discipline. In PostgreSQL it can be *enforced*, and taking
that opportunity is the single most valuable structural decision
available here.

| Schema | Contains | Owning engines |
|---|---|---|
| `identity` | Identity, auth linkage, verified attributes | Identity |
| `workspace` | Workspace, membership, invitations, capability grants | Workspace, Capability |
| `property` | Property, stewardship, location, asset, facets, placements, document metadata | Property, Location, Asset, Document |
| `work` | Maintenance, service records and annexes, workflow definitions and instances, marketplace, conversations | Maintenance, Service Record, Workflow, Marketplace, Conversation |
| `knowledge` | Workspace Knowledge, graph edges, world graph, memory versions | Knowledge, Intelligence |
| `commerce` | Subscriptions, plans, financial records | Subscription, Billing |
| `platform` | Events, audit, jurisdiction rules, taxonomies, catalogues, configuration | Event Backbone, Audit, Administration |
| `derived` | All projections — timeline, twin summaries, provider scores, reputation, inbox, search support | Whichever engine owns each projection |
| `analytics_ws` | Workspace-scoped analytics | Analytics |
| `analytics_pf` | Platform-scoped analytics — **aggregates only** | Analytics |

**Why tier-level rather than one schema per engine.** Twenty-four schemas
would produce cross-schema joins for operations that are genuinely local
— property, location and asset are read together constantly. Tier-level
grouping keeps the common joins within a schema while still making the
boundaries that matter — identity, commerce, platform, and above all the
two analytics schemas — physically distinct.

**Why the two analytics schemas are separate.** `DATABASE_ARCHITECTURE.md`
§31 requires platform-scoped and workspace-scoped analytics to be
physically separate so the dangerous cross-tenant query is impossible to
write rather than merely discouraged. Separate schemas with separate
grants deliver exactly that: the role that can read `analytics_pf` has no
access to workspace detail, and the role that can read `analytics_ws`
cannot aggregate across tenants.

**What schemas are *not* used for.** Not multi-tenancy. A schema per
workspace is a well-known pattern and is wrong here: ten million schemas
is not operable, migrations become unbounded, and the connection pooler
would collapse. **Tenancy is a column, enforced by RLS** (§6).

**Extensions** live in their own schema and are never installed into
`public`. `public` itself holds nothing — a deliberate break from the
current codebase, where everything lives there.

## 3 · Identifier Strategy

**UUIDv7 for every aggregate identifier**, generated by the application
rather than the database.

**Why v7 over v4.** Random v4 identifiers scatter B-tree inserts across
the whole index, so at billions of event rows and tens of billions of
asset-related rows every insert dirties a different page. Time-ordered v7
keeps inserts local to the right-hand edge of the index, which reduces
write amplification, keeps caches warm, and makes range scans by
recency — the dominant access pattern for events, messages, transitions
and notifications — physically sequential.

**Why application-generated.** An engine must know an aggregate's
identity before it writes, so it can emit an event referencing it in the
same transaction (§12). Waiting for the database to assign one forces
either a round trip or a deferred event, and the second breaks
constraint 5.

**Why not bigint sequences.** They leak volume and ordering to anyone who
sees one, they are awkward across the multi-project future in §22, and
they make merging or relocating a workspace a renumbering exercise.

**Natural keys are never primary keys.** Registration numbers, serials,
VAT numbers and email addresses all change, are duplicated in practice,
and are frequently personal data subject to erasure. They are attributes,
sometimes uniquely constrained within a workspace, never identity.

**The person reference.** `identity` rows carry the UUID that durable
records reference. That reference **survives erasure** (§11.4) — this is
the mechanism behind constraint 4 and it is why it is a UUID owned by the
platform rather than the Supabase auth identifier.

## 4 · Mutability Classes

Every table is assigned exactly one class. The class determines its
privileges, its constraints, and what a migration may later do to it.

| Class | Meaning | Enforcement | Examples |
|---|---|---|---|
| **Append-only** | Insert only. No update, no delete, ever | `UPDATE`/`DELETE` not granted to any application role; a guard trigger raises on attempt | Events, audit, transitions, amendments, stewardship periods, placements, membership history, capability grant history, published memory versions, provider decisions, financial records |
| **Mutable** | Ordinary update in place | Normal grants | Workspace attributes, property attributes, asset attributes, knowledge rule current state, subscription state |
| **Soft-retire** | Never hard-deleted; marked retired and excluded by default | Retired-at column, partial indexes over live rows | Location, asset, document, knowledge rule, workflow definition, workspace (archival) |
| **Hard-delete permitted** | Genuinely disposable | Normal grants | Unaccepted requests past retention, declined quotes past retention, expired invitations, projections |

**On enforcing immutability with triggers.** The frozen architecture is
emphatic that business rules do not belong in storage-layer triggers.
An immutability guard is **not a business rule** — it is an integrity
constraint, the same category as a check constraint or a foreign key. It
encodes no process, no policy, and no decision; it asserts that a fact,
once written, stays written.

The distinguishing test, applied to every trigger the migration milestone
proposes:

> **Does this trigger make a decision, or does it refuse an impossibility?**
> Refusing an impossibility is a constraint and is permitted. Making a
> decision — deciding a status, cascading a state change, choosing a
> counterparty — is a business rule and belongs in a workflow definition.

The current schema fails this test in several places (§23, conflict 3).

**Soft-retire discipline.** Soft deletion is pervasive because the frozen
architecture forbids destroying history, and pervasive soft deletion has
a well-known cost: every query must exclude retired rows, and forgetting
once produces a visible bug. Two mitigations: retired rows are excluded
by the same partial indexes that serve the common queries, so the correct
query is also the fast one; and read paths consume projections (§14),
which never contain retired rows at all.

## 5 · Referential Integrity

**Foreign keys are used wherever they are affordable and correct**, which
is most places. Where they are not, the reason is recorded.

**Where foreign keys are used.** Within a schema, and across schemas for
stable parents — property to workspace, location to property, asset to
location, annex to service record core. These are the relationships whose
violation would be a corruption rather than a state.

**Where foreign keys are deliberately absent:**

| Relationship | Why no FK |
|---|---|
| Any table → `platform.events` | Events are partitioned and enormous; nothing references an event by key. Events reference *outward*, never inward |
| Durable records → `identity` | The person reference must survive erasure of the identity row (§11.4). A foreign key would make erasure impossible or cascade destruction into history |
| Projections → aggregates | Projections are rebuildable and lag by design; a constraint would couple a derived table's integrity to a source it is allowed to trail |
| Cross-region bilateral objects | Not expressible across projects (§22). Reconciled at the application layer |
| Audit → anything | Audit must survive the deletion of what it describes; that is the point of audit |

**No cascading deletes anywhere.** Not one. Cascades are how history
disappears quietly, and the frozen architecture forbids that outcome in
almost every case. Deletion is always an explicit, authored operation
with its own path.

**Cross-schema references are one-directional.** `work` references
`property` references `workspace` references `identity`. Nothing points
back up. This mirrors the engine tier rule in `SYSTEM_ARCHITECTURE.md` §2
and means a schema can be reasoned about knowing only what sits below it.

---

# Part II — Security

## 6 · Row Level Security Philosophy

### RLS is a backstop, not the permission system

This is the most consequential security decision in the document, and it
resolves a genuine tension between the frozen architecture and Supabase's
default model.

`SYSTEM_ARCHITECTURE.md` §12.1 resolves the request context **once** at
the API Gateway — identity, workspace, membership, scope, capabilities —
and passes it inward immutably. Supabase's default posture is the
opposite: clients hold a token and talk to PostgREST directly, and RLS is
the *only* gate.

Those two cannot both be the primary permission path without violating
`PLATFORM_DOMAIN_MODEL.md` Rule 11 — one permission path, no second way
to gain access.

**The resolution:**

> **The application layer is the permission system. RLS is a hard
> backstop that assumes the application is already correct and refuses to
> rely on it.**
>
> Every table has RLS enabled. No table is ever reachable with RLS
> disabled by an application role. But RLS policies express **workspace
> isolation and membership**, not the full permission model — because the
> full model includes capability gates, scoped roles, bilateral grants
> and classification rules that belong to the Workspace and Capability
> engines.

**Why not push everything into RLS.** Three reasons, each sufficient.
Policies complex enough to encode capability and scope become
per-row subquery machinery with unacceptable performance (§20). The
permission model must be *explainable* — `PLATFORM_DOMAIN_MODEL.md` §7
requires the platform to say *why* a decision went the way it did, and a
policy that returns zero rows explains nothing. And a policy cannot
distinguish "this does not exist in your workspace" from "you may not do
this," which `SYSTEM_ARCHITECTURE.md` §23 requires the product to present
differently.

**Why not skip RLS.** Because defence in depth is not optional for
multi-tenant data. A bug in the application layer with RLS is a failed
query; without RLS it is a disclosure across tenants. The cost of
maintaining isolation policies is trivial against that.

**Consequence for the current codebase.** The existing 58 policies are
the primary gate today and carry logic that will move upward. They are
not deleted — they are simplified to isolation, with the richer decisions
relocated to the Workspace and Capability engines (§23, conflict 1).

### The isolation predicate

Nearly every policy reduces to one question: *is the current principal a
live member of the workspace this row belongs to?*

This is answered by a **single security-definer, `STABLE` helper** that
resolves the caller's live workspace memberships once per statement
rather than once per row. That marking is not an optimisation detail; it
is the difference between a policy that scales and one that makes every
sequential scan a correlated subquery (§20).

**Every table carries its workspace directly** — constraint 1 — so the
predicate never joins to find tenancy. A table whose workspace must be
derived by traversing two parents is a table whose policy is slow and
whose tenancy can be got wrong by a later refactor.

## 7 · Access Paths

Three paths reach data. Each is deliberate.

| Path | Who | RLS role | Used for |
|---|---|---|---|
| **Gateway-mediated** | Web, mobile, integrations, public API | Backstop beneath an already-authorised call | Everything that writes, and every read involving capability, scope, bilateral objects or classification |
| **Direct client read** | Web and mobile, for simple workspace-scoped reads | **Primary gate** | Reads where membership alone is the correct answer, and Realtime subscriptions |
| **Elevated** | Background consumers, projection builders, cron | Bypassed — RLS does not apply | Building projections, delivering events, scheduled work |

**The rule governing the second path.** Direct client reads are permitted
**only where membership alone is the complete permission answer.** The
moment a read depends on a capability, a scoped role, a bilateral grant,
or a classification split, it is gateway-mediated. This keeps Rule 11
intact: there is still one permission model, and the direct path is a
subset of it, never an alternative to it.

**The rule governing the third path.** The elevated role is never used in
a user-facing request path — a Protected Decision in
`MASTER_CONTEXT.md` §17 and reaffirmed here. It belongs to background
work that acts on behalf of the platform, never on behalf of a person.
**Intelligence is not elevated**: it acts under a person's authority with
that person's scope (`SYSTEM_ARCHITECTURE.md` §13), which means it uses
the gateway path like any other caller.

## 8 · RLS by Scenario

Philosophy per scenario. No policy bodies.

**Workspace isolation.** The base case, applied to every workspace-scoped
table: live membership in the row's workspace. Everything else is an
addition to this, never a replacement for it.

**Membership.** A member sees their own membership always, and other
memberships in the workspace only where their role permits — otherwise
membership becomes a directory of who works where. Ended memberships stay
visible to workspace administrators as history.

**Scoped access.** A membership narrowed to a location subtree or a set
of properties. RLS carries a *simplified* form — the member sees rows in
their scope — and the authoritative evaluation, including the subtree
resolution and its invalidation, is the Workspace engine's. This is the
clearest case of the backstop philosophy: the policy is correct but
coarse; the engine is correct and precise.

**Temporary access.** Contractor and marketplace-derived access are
ordinary memberships with an expiry (`PLATFORM_DOMAIN_MODEL.md` §8), so
they need no special policy at all — only that the membership helper
treats an expired membership as absent. **Expiry is evaluated at read
time, never by a cleanup job**, so a lapsed grant stops working the
moment it lapses rather than the next time something runs.

**Marketplace access.** A providing workspace sees a request or
engagement it is party to. The engagement is the grant-bearing object,
and the scoped membership it produces carries the access — so marketplace
visibility resolves through the same membership predicate as everything
else.

**Enterprise administration.** An administrator is a member with a
broader role, not a different mechanism. There is no super-user within a
workspace and no cross-workspace administrator role — a person
administering eleven hotels holds eleven memberships, or one membership
in a future workspace group.

**Contractor access.** Covered by temporary access. Worth restating
because it is the case most likely to attract a bespoke mechanism, and a
second way to grant access is one too many.

**Support access.** Operator support is a **time-bounded, audited,
consent-governed membership** in the customer's workspace
(`SYSTEM_ARCHITECTURE.md` §12.3). It is not the elevated role, not a
bypass, and not invisible: it appears in the workspace's own membership
history, and every action under it is audited as an administrative
action. If support cannot see something, the answer is to request access,
not to escalate privilege.

**AI access.** Intelligence reads with **exactly the scope of the person
it is acting for** — no elevated role, no special policy, no exemption.
An assistant that can see what its principal cannot is a privilege
escalation, and the architecture forbids it structurally by giving
Intelligence no path other than the ordinary one.

**Service Record visibility.** The hardest case, and it is solved by
table structure rather than by policy complexity (§11.1): the shared core
and the private annexes are separate tables. The core's policy admits
live members of *either* party — the property's workspace, or the
performing workspace through its permanent grant. Each annex's policy is
ordinary workspace isolation. **No field-level security is required
anywhere**, which is exactly why the frozen architecture split them.

**Document visibility.** Two independent conditions, per constraint 12:
membership in the owning workspace, **or** an explicit sharing state that
reaches the caller. Attachment is never one of the conditions. A document
attached to a shared service record core is visible to both parties only
if its sharing state says so — and that state is defaulted by document
*type* in configuration, never by whoever uploaded it.

**Knowledge visibility.** Workspace Knowledge follows workspace
isolation. The **world graph is readable by everyone** and writable by no
application role — it is platform-scoped curated data, and promotion into
it is a privileged, audited operation (§16), never an ordinary write.

**Audit visibility.** Readable by workspace administrators and by the
operator; **writable by no application role at all.** Audit rows arrive
through a privileged path, and the inability of any user-facing role to
write them is what makes the trail worth having.

## 9 · Roles, Grants and Secrets

**Four role classes**, each with the narrowest grants that let it work:

| Role class | Reaches | Never |
|---|---|---|
| **Anonymous** | Published provider profiles and platform catalogues only | Any workspace-scoped schema |
| **Authenticated** | Workspace-scoped schemas under RLS | `platform`, `analytics_pf`, or write access to append-only tables |
| **Service** (background) | What a specific consumer needs, per consumer | Anything outside its declared job |
| **Operator** | Configuration and platform catalogues | Customer content, except through an audited support membership |

**Grants mirror engine ownership.** The role a given engine's code runs
under has write access to its own schema's tables and **read-only access,
or none, elsewhere.** This is the enforcement §2 exists for: an engine
that tries to write another engine's aggregate fails on a privilege
error, not on a code review.

**Background consumers are not one role.** The projection builder, the
event deliverer, the search indexer and the analytics loader each get
their own service role with their own grants. A single omnipotent
background role is the same problem as an omnipotent user role, delayed.

**Secrets.** No credential, token or key appears in any table, event,
projection, log or audit record. Integration credentials are held as
references resolved at use by the Integration engine's adapter. The AI
provider key never reaches the client bundle — a Protected Decision
inherited unchanged. Anything stored that must be, is stored encrypted
with a key the database does not hold.

---

# Part III — Aggregate Placement

## 10 · Placement Reference

Every aggregate from `DATABASE_ARCHITECTURE.md` §3. Growth is per
workspace unless stated; retention follows the storage classes in that
document's §4.

**Twelve dimensions are required per aggregate; six are in the table
below and six are properties of a group rather than of a row.** Where to
find each:

| Dimension | Where |
|---|---|
| Where it lives | Table below, `Schema` |
| Why there | §2 — schemas follow engine tiers |
| What owns it | `SYSTEM_ARCHITECTURE.md` §3 — the ownership table, mirrored by grants (§9) |
| What may reference it | §5 — referential integrity, including the five deliberate absences |
| How it evolves | Table below, `Class` (§4) |
| Expected growth | Table below |
| Retention | Table below |
| Archival strategy | §21, by storage class |
| Search strategy | §15, by search domain |
| Index strategy | Table below |
| RLS strategy | Table below, elaborated per scenario in §8 |
| Performance considerations | §20, with the hot paths named |

Stating it this way rather than repeating six near-identical paragraphs
per aggregate is deliberate: the six group-level dimensions genuinely are
group-level, and duplicating them per row would create thirty places for
the same decision to drift.

| Aggregate | Schema | Class | Growth | Retention | Index strategy | RLS |
|---|---|---|---|---|---|---|
| Identity | `identity` | Mutable | 100M rows total | Until erasure | Auth linkage, verified attributes | Self only |
| Workspace | `workspace` | Soft-retire | 10M rows total | Archival, never deleted | By owner, jurisdiction, residency | Membership |
| Membership | `workspace` | Append-only history + mutable current | 10–5,000 | Permanent | **By identity, and by workspace** — both directions are hot | Self + role |
| Capability grant | `workspace` | Append-only history + mutable current | Tens | Permanent | By workspace | Membership |
| Property | `property` | Soft-retire | 1–10,000 | Permanent | By workspace, by jurisdiction | Membership via stewardship |
| Stewardship period | `property` | **Append-only** | Few per property | Permanent | By property, by workspace, by period | Membership |
| Location | `property` | Soft-retire | 5–100,000 | Permanent | **Materialised path (§11.2)**, by property | Membership |
| Asset | `property` | Soft-retire | 10–500,000 | Permanent | By location, by type, by workspace | Membership |
| Facet | `property` | Mutable | 1–3 per asset | With asset | By asset, by facet type; declared attributes indexed selectively | Via asset |
| Placement | `property` | **Append-only** | Several per asset | Permanent | By asset and period, by location and period | Via asset |
| Document metadata | `property` | Soft-retire | 10–1,000,000 | Type-dependent | By subject, by validity, by type | Membership **or** sharing |
| Maintenance obligation | `work` | Mutable → closed | 10–100,000/year | Permanent when closed | By asset, by due date, by state | Membership |
| **Service record core** | `work` | Immutable + amendments | 1–500,000 | **Permanent** | By property, by asset, by date; **by performing workspace** | Either party (§11.1) |
| **Service record annex** | `work` | Mutable until complete | One per party | Permanent | By core, by workspace | Own workspace only |
| Workflow definition | `platform` / `work` | Soft-retire, versions immutable | Hundreds | **Never deleted while referenced** | By key and version | Catalogue readable; authored ones by membership |
| Workflow instance | `work` | Mutable state, append-only transitions | Millions concurrent | Permanent | By workspace, by state, by subject | Membership |
| Transition | `work` | **Append-only** | 5–50 per instance | Permanent | By instance and sequence | Via instance |
| Request / quote | `work` | Mutable | High, recency-skewed | Aged out if unaccepted | By workspace, by state, by recency | Membership or party |
| Engagement | `work` | Mutable → complete | Moderate | Permanent | By requesting workspace, by performing workspace | Either party |
| Conversation / message | `work` | Immutable messages | Very high | Permanent | By conversation and time | Participation |
| Workspace Knowledge | `knowledge` | Mutable current + append-only supersessions | 10–5,000 | Permanent | By workspace, by scope | Membership |
| Graph asserted edge | `knowledge` | Append-only | Thousands | Permanent | By source and target, by type | Membership |
| World graph | `knowledge` | Mutable, curated | Millions total | Permanent | By manufacturer, model, part, regulation | **Read-all, write-none** |
| Published memory version | `knowledge` | **Append-only** | Slow | Permanent | By property and time | Membership via stewardship |
| Provider decision | `work` | **Append-only** | Per need | Permanent | By workspace, by provider, by time | Membership |
| Subscription | `commerce` | Mutable | One per workspace | Permanent | By workspace, by state, by renewal | Membership |
| Financial record | `commerce` | **Append-only** | Moderate | **Statutory, 7–10+ years** | By workspace, by period, by counterparty | Membership + payer |
| Audit | `platform` | **Append-only** | Very high | Jurisdictional | By workspace and time, by actor, by subject | Admin read, no write |
| Event | `platform` | **Append-only, partitioned** | **Billions** | Permanent, archived | **By subject and sequence**; by workspace and time | Not client-readable |

**Projections** all live in `derived`, are `hard-delete permitted`, carry
the tenancy of their sources, and are rebuildable per workspace (§14).

**On facet attributes.** Constraint 13 requires facet attributes to be
declared before use. Declared attribute *definitions* are platform-scoped
configuration in `platform`; facet *values* live with the asset in
`property`. Only attributes marked searchable or reportable in their
declaration are indexed — which is precisely why the declaration
requirement exists, and why an open-ended attribute bag would have made
every facet unreachable to search and analytics.

**On workflow definitions in two schemas.** Platform catalogue
definitions are `platform`; customer-authored ones are `work` and
workspace-scoped. The runtime does not distinguish them
(`SYSTEM_ARCHITECTURE.md` §14) — only their placement and visibility
differ.

## 11 · The Difficult Four

### 11.1 · Service Record

**The requirement.** One shared object, two parties, split visibility,
permanent, amendable but never editable — and identified by
`DATABASE_ARCHITECTURE.md` §32 as the highest-risk surface in the
architecture.

**The placement.** Three tables in `work`: the **core**, the **annexes**
(one row per participating workspace), and the **amendments**.

**Why this shape makes the risk manageable.** Because the classification
becomes structural. The frozen architecture's rule — *facts about the
work are shared; commercial and internal context is not* — is expressed
as which table a column lives in, decided once at design time, rather
than as a policy predicate evaluated per read. **There is no field-level
security anywhere in this design**, and there does not need to be. A
classification mistake becomes a schema review question, which is
reviewable, rather than a policy condition, which is not.

**Home partition.** The core carries the **property's workspace**, per
`DATABASE_ARCHITECTURE.md` §17 — retention is longest there, residency
obligations attach to the property, and the property outlives the
business. The performing workspace is a second column on the core, and
its presence *is* the permanent non-revocable grant.

**The index that matters most.** A providing workspace assembling its own
book of work queries by performing workspace across many properties —
the cross-partition read recorded as finding 11 in
`DATABASE_ARCHITECTURE.md` §36. The mitigation is a `derived` projection
keyed by performing workspace, maintained from `ServiceRecordCompleted`,
plus an index on the core by performing workspace and date for the
authoritative path.

**Immutability.** The core is append-only after completion; corrections
are rows in the amendments table with their own author, time and reason.
The current reading is the core plus its amendment chain — assembled in
the application, or served from a projection.

**Erasure.** Technician and approver references are person references
(§11.4), so erasing a person leaves the record complete and the person
unidentifiable within it.

### 11.2 · The Location Tree

**The requirement.** Recursive, unbounded depth, and **subtree
containment answerable as a first-class operation** — constraint 2 —
because it is consulted on scoped access checks, scoped knowledge
resolution, search scoping and roll-up reporting.

**Options considered:**

| Approach | Containment cost | Re-parent cost | Verdict |
|---|---|---|---|
| Parent pointer + recursive CTE | Walks per query — unacceptable on a hot path | Trivial | Rejected |
| Closure table | Excellent | Rewrites many rows | Rejected — re-parenting a warehouse zone is not rare |
| Adjacency + nested sets | Excellent read | Rewrites much of the tree | Rejected |
| **Materialised path (`ltree`)** | **Prefix match on an indexed path** | Rewrites the moved subtree only | **Chosen** |

**Why `ltree`.** Containment becomes a prefix operation against an
indexed path, which is what makes "is this location within that subtree?"
affordable at hospital-campus depth. Re-parenting rewrites the paths of
the moved subtree and nothing else. The parent pointer is retained
alongside as the authoritative structure; the path is a maintained
denormalisation of it, and can be recomputed if it ever disagrees.

**The invalidation obligation.** Constraint 14, and the finding
`SYSTEM_ARCHITECTURE.md` §21 calls the easiest place to implement a
correct architecture incorrectly. Re-parenting emits
`LocationTreeChanged`, which has named consumers: the Workspace engine
invalidates cached scope resolution and request contexts, and the Search
engine re-indexes affected entries. **The path rewrite and the event are
one transaction.** A path rewritten without an event leaves stale scopes
and stale indexes, silently.

### 11.3 · Documents

**Metadata in PostgreSQL, content in Supabase Storage** — the separation
`DATABASE_ARCHITECTURE.md` §15 requires, because metadata is small and
constantly queried while content is large and rarely read.

**Attachment and sharing are separate tables**, per constraint 12.
Attachment says what a document is *about*; sharing says who may *see*
it. Nothing infers one from the other.

**The signed-URL problem — a real weakness, stated rather than hidden.**
Supabase Storage serves private content through time-limited signed URLs.
**A signed URL cannot be revoked before it expires.** So a document
un-shared, or an engagement ended, does not invalidate a URL already
issued.

Mitigations, in order of effect: keep signature lifetimes **short**, so
the exposure window is minutes rather than days; issue URLs **on demand
per view** rather than embedding them in cached payloads; check sharing
state at issue time, so a revocation stops future issuance immediately;
and for documents whose sensitivity warrants it — financial annex
content, compliance evidence — **stream through the application** rather
than issuing a URL at all.

This is a genuine limitation of the storage model rather than a design
error, and it is recorded as such in §23.

**Bucket organisation** follows tenancy rather than document type, so
storage-level policies can mirror the database's isolation predicate, and
so a workspace's content can be exported or relocated as a unit (§22).

### 11.4 · Identity and Erasure

**The requirement.** Constraint 4: personal identifiers separable from
durable records, so erasure never requires rewriting immutable history.

**The shape.** Supabase Auth owns authentication. The `identity` schema
holds the platform's own identity row, carrying the **person reference**
— the UUID every durable record uses. Personal data lives on the identity
row and nowhere else.

**Erasure** redacts the identity row. The person reference remains valid
as a key and resolves to nothing. Events, audit records, service records,
transitions and financial records are untouched, complete, and internally
consistent; the person is simply no longer identifiable within them.

**Two rules this imposes on every migration.** No durable table may
foreign-key to the identity row (§5), or erasure becomes impossible or
destructive. And no durable table may copy personal data — a display name
denormalised into a service record for convenience is a personal-data
leak that erasure cannot reach.

**Deleting an auth user must never cascade.** The auth record and the
identity row are separable, and losing authentication is not losing
identity.

---

# Part IV — Events

## 12 · Event Storage

**Events are rows in `platform`, written in the same transaction as the
change they describe** — constraint 5, and the property that makes a
change without an event impossible.

**This is the outbox pattern, with the event table as the outbox.** There
is no separate message broker in the write path, no dual write, and no
window in which a change exists without its event. Consumers read
forward from the table (§13).

**Why not `NOTIFY`, or a broker, at write time.** `NOTIFY` is not durable
— a consumer that is down misses the notification permanently, which
breaks projection rebuild and audit completeness. A broker in the write
path introduces a dual write, and dual writes fail partially. The
durable table is the correct trade: it costs an insert, and it makes
delivery a recoverable read rather than an unrecoverable push.

### Partitioning — and the conflict it resolves

`DATABASE_ARCHITECTURE.md` treats the workspace as the partition
boundary. **PostgreSQL cannot have ten million partitions** — planning
time degrades badly in the thousands, and DDL becomes unmanageable. This
is a genuine conflict between a logical boundary and a physical one
(§23, conflict 2).

**The resolution:**

> The workspace remains the **logical** partition boundary — the thing
> every row carries, every policy filters on, and every rebuild is scoped
> to. It is **not** one physical partition per workspace.
>
> Events are **hash-partitioned by workspace into a fixed number of
> partitions, each range-partitioned by time.**

This preserves everything the logical boundary is for: co-location of a
workspace's events within one hash partition, tenant-scoped rebuild, and
tenant-scoped archival. It adds what physical partitioning is for: time
ranges detach as whole units for archiving, and old ranges are never
touched by current queries.

**Ordering.** Per subject, not per workspace — constraint 11. A
monotonic per-subject sequence is carried on the row. Cross-subject
ordering is not provided, is not needed, and no consumer may assume it.
This is what keeps a two-hundred-thousand-asset enterprise from
serialising its writes through one ordering point.

**Canonical versus derived events.** Canonical events are facts emitted
by an owning engine and are permanent. Derived events — produced by a
consumer noticing something across canonical events, such as a stalled
workflow or a detected pattern — are **marked as derived and are not
themselves a system of record.** They may be regenerated. Keeping the two
distinguishable prevents a derived signal from being mistaken for a fact
about the business.

**Retention.** Permanent. Ranges older than the hot window are detached
and archived to cold storage (§21), and remain restorable for replay.

**Not client-readable.** No authenticated role reads the events table.
Users see timeline, notifications and audit — all of which are shaped,
scoped views of what events mean.

## 13 · Consumers, Replay and Recovery

**Consumers read forward with a cursor.** Each consumer records its
position per partition. Delivery is at-least-once and every consumer is
idempotent — the property that makes retry safe and makes replay
identical to first delivery.

**Consumers run as background service roles** (§9), one per consumer,
with only the grants that consumer needs.

**Projection rebuild is per workspace and incremental** — constraint 7.
This is not an emergency procedure; it is how read models change. A new
timeline grouping or a revised memory model is a rebuild, not a
migration.

**Rebuild is scoped by hash partition and workspace**, so a single
tenant can be rebuilt without touching the other ten million. A
projection whose rebuild cannot be scoped to one workspace is a design
error, not a capacity problem.

**Failure recovery.** A failed consumer resumes from its cursor. A
poisoned event — one a consumer cannot process — is quarantined with its
position recorded, so one bad event never halts a stream indefinitely;
the quarantine is an operational alert rather than a silent skip. A
corrupted projection is dropped and rebuilt. **Nothing in the write path
is affected by any of this**, because the transaction ended at the event
(`SYSTEM_ARCHITECTURE.md` §5).

**Replay is a first-class capability**, used for rebuilding projections,
backfilling a new consumer, reconstructing an audit view, and reprocessing
after a bug fix. It is why events must mean the same thing forever, and
why a changed meaning is a new event type rather than a redefinition.

---

# Part V — Derived Data

## 14 · Projections Are Tables, Not Materialized Views

**A decision that looks like a detail and is not.**

PostgreSQL materialized views refresh **globally**. Even `CONCURRENTLY`,
a refresh recomputes the entire view. Constraint 7 requires projections
to be rebuildable **per workspace, incrementally**. Those requirements are
incompatible (§23, conflict 4).

**The resolution:**

> **Workspace-scoped projections are ordinary tables in `derived`,
> maintained by event consumers.** Materialized views are used only for
> **platform-scoped analytics**, where a global refresh is exactly what is
> wanted and no tenant scoping applies.

**What this buys.** A single workspace's timeline can be rebuilt in
seconds without touching anyone else's. A projection can lag, be
repaired, be versioned, or be replaced while the old one still serves.
And projection tables carry their sources' tenancy as real columns, so
RLS applies to them exactly as it does to aggregates — which a
materialized view makes awkward and easy to get wrong.

**Regular views** remain useful and are used freely: they are just saved
queries, they respect RLS on their underlying tables, and they cost
nothing to change. They are the right tool for shaping a read without
storing one.

**Every projection table carries** its workspace, its source references,
and the event position it was built to — the last being what makes lag
measurable rather than guessed, and rebuild resumable rather than
restarted.

## 15 · Search

Eight domains (`SYSTEM_ARCHITECTURE.md` §15), all projections, one rule:
**scope is indexed, never post-filtered.**

**Stage one — PostgreSQL full text.** Native text search covers workspace,
property, asset, conversation, document and knowledge search well past
the point where the platform has enough content for anything else to
matter. Its decisive advantage is that **the index lives in the same
database as the permission data**, so scope columns sit beside the text
and filtering happens during retrieval rather than after it. An external
search service would place the index outside the tenancy boundary and
require the scope model to be mirrored into it — the single most likely
route to a cross-tenant disclosure.

**Search rows carry scope as columns** — workspace, and location path
where scoped roles apply — so retrieval filters on indexed values.

**Stage two — vector search, when reasoning needs it.** `pgvector` in the
same database, for semantic retrieval over documents, service records and
knowledge. Same reasoning: the vectors sit inside the tenancy boundary
with their scope columns, so a similarity query is scoped by the same
predicate as a text query.

**Stage three — hybrid.** Text and vector results combined and re-ranked.
Architecturally this changes nothing: both inputs are already scoped, and
combination happens above them.

**Provider and global search are categorically different.** They operate
over *published* and *platform-scoped* data and are therefore the only
indexes readable without workspace membership. A provider workspace's own
properties, assets and internal maintenance are private data that happens
to live in a workspace that also publishes a profile — **nothing enters
public indexes implicitly**, and the publication flag is on the row, not
inferred from the workspace's type.

**Re-indexing is event-driven**, including on the scope-affecting events
`LocationTreeChanged`, `MemberScopeChanged`, `MemberAccessRevoked` and
`StewardshipEnded`.

## 16 · AI Storage

**Workspace Knowledge** is an aggregate in `knowledge` — declared, not
derived — with current state mutable and supersessions append-only, so
that a past decision can be interpreted against the policy in force at
the time. Scope resolution uses the same location path as permissions
(§11.2).

**Property Memory** splits, per `DATABASE_ARCHITECTURE.md` §26: current
memory is a projection in `derived` and may be recomputed freely;
**published memory versions are append-only in `knowledge`** and are
permanent, because an interpretation a customer acted on is part of the
record of why they acted.

**The workspace knowledge graph** is stored as edges in `knowledge`, with
asserted edges append-only and derived edges rebuildable. A graph
traversal is a recursive query bounded by one workspace — **never across
workspaces**, which is what keeps traversal cost bounded by tenant size
rather than by platform size, and is why a dedicated graph engine is not
needed.

**The world graph** is platform-scoped in `knowledge`: manufacturers,
models, parts, compatibility, regulations. Small, read-mostly, readable
by everyone, writable by no application role. It replicates cheaply to
every region (§22).

**Promotion** — the only path from workspace data into the world graph —
is a privileged operation performed by a dedicated service role, and
**every promotion writes an audit record** naming what was promoted, the
aggregate population behind it, and on whose authority. Constraint 15. An
ambient background job that aggregates across tenants and writes
platform-scoped data is prohibited, however well-intentioned.

**Embeddings** (future) live beside their sources with the same tenancy
columns. Workspace content embeddings are workspace-scoped and are
**never** pooled across tenants for retrieval — pooling would make the
promotion rule enforceable only by query discipline, which is exactly the
failure mode the rule exists to prevent. World graph embeddings are
platform-scoped and shared, because their sources already are.

**Conversation history** used as reasoning context is read under the
acting person's scope. **Reasoning artifacts** — assembled contexts,
intermediate outputs, prompts — are treated as **derived and
workspace-scoped**, retained briefly for debugging and evaluation, and
never promoted. They frequently contain a concentrated cross-section of a
workspace's data and must never be pooled for training or analysis across
tenants.

**Learning boundaries, stated as one rule:** the private loop learns
within a workspace; the shared loop learns only from promoted aggregates.
Nothing else crosses.

## 17 · Analytics

**Two schemas, two roles, physically separate** — constraint 10.

`analytics_ws` holds workspace-scoped analytics: business, property and
enterprise reporting. It contains individual detail and is subject to
workspace isolation like any other tenant data.

`analytics_pf` holds platform-scoped analytics: operational, marketplace,
AI and platform. It contains **only promoted aggregates** and no
individual workspace detail whatsoever.

**Why separate schemas rather than separate tables with careful queries.**
Because the failure mode is an ad-hoc analytical query that aggregates
across tenants and lands somewhere it should not. Separate schemas with
separate role grants make that query fail on privileges rather than
succeed quietly. The role that reads `analytics_pf` **cannot see**
workspace detail; the role that reads `analytics_ws` **cannot aggregate**
across tenants.

**Materialized views are appropriate in `analytics_pf`** (§14) — global
refresh is what platform aggregates want. `analytics_ws` uses ordinary
projection tables so that a single customer's reporting can be rebuilt
independently.

**Isolation from transactional load** is the other reason for separation:
a five-year, two-hundred-site enterprise report must never compete with a
customer accepting a quote. Read replicas serve analytics; the primary
serves transactions.

---

# Part VI — Supabase Services

## 18 · Service Roles

| Service | Role in this architecture | Explicitly not used for |
|---|---|---|
| **Database (PostgreSQL)** | Every aggregate, every projection, events, audit, search, knowledge, analytics. The system of record for everything | — |
| **Storage** | Document content, photos, video, exports. Metadata always stays in the database (§11.3) | Anything that must be queried or joined |
| **Authentication** | Authentication only — factors, sessions, federation, future SSO | Identity attributes, which the platform owns (§11.4); anything about permission |
| **Realtime** | Live updates to clients for workspace-scoped rows they may already read | Event delivery to consumers — it is not durable (§12) |
| **Edge Functions** | Gateway-mediated operations, integration adapters, AI calls needing provider keys | Long-running work, and anything requiring transactional participation |
| **Cron** | Scheduled work: due-date evaluation, document expiry, workflow timers, retention sweeps, archival, projection health | Event delivery, which is cursor-driven and continuous |
| **Queues** (future) | Durable async work with retry: notification fan-out, heavy projection rebuild, integration delivery | The event log itself — the events table remains the record |

**On Authentication.** Supabase Auth is an adapter behind the Identity
engine (`SYSTEM_ARCHITECTURE.md` §18), not the identity model.
Everything the platform knows about a person lives in `identity`, keyed
by the person reference. This separation is what makes federated
identity, provider migration and erasure independent problems rather than
one entangled one.

**On Realtime and RLS.** Realtime respects RLS, which makes it safe for
the direct-read path (§7) and only that path. It is never the delivery
mechanism for domain events: it is not durable, a disconnected client
misses messages permanently, and projection correctness cannot depend on
a subscription being live.

**On Edge Functions.** They host the gateway-mediated path — where the
request context is resolved once and passed inward. The AI provider key
lives here and never in a client bundle, a Protected Decision inherited
unchanged. They are stateless and hold no aggregates.

**On Queues.** Marked future because cursor-driven consumers over the
events table cover the current need, and adding a queue before there is
fan-out pressure is infrastructure without a problem. When notification
fan-out to thousands of enterprise members becomes real, a queue is the
right answer — and it changes nothing architecturally, because the events
table remains the record and the queue only carries work.

---

# Part VII — Scale

## 19 · Partitioning

**Partitioned from the start** — retrofitting partitioning onto a large
table is a painful migration, and these tables are known to be enormous:

| Table | Scheme | Why |
|---|---|---|
| **Events** | Hash by workspace, then range by time | Billions of rows; tenant co-location plus detachable time ranges (§12) |
| **Audit** | Range by time | Very high volume, rarely read, archived by age |
| **Messages** | Hash by workspace, then range by time | Highest raw write volume after events |
| **Transitions** | Hash by workspace | High volume, always queried by instance |
| **Service record cores** | Hash by property workspace | Permanent and unbounded; keeps a tenant's history co-located |

**Not partitioned initially**, and the trigger for revisiting stated so
the decision is not re-argued from scratch: assets, locations, documents,
maintenance and marketplace tables are large but bounded per tenant, and
ordinary indexing serves them until a single table passes the point where
index maintenance dominates. That threshold is a measurement, not a
guess.

**The rule.** Partitioning is a physical technique for managing size.
**It is never the tenancy mechanism** — tenancy is a column plus RLS
(§2, §6). Conflating the two is how platforms end up with a partition per
customer and no way to operate.

## 20 · Performance

Designed for 100 million users, 10 million workspaces, billions of
events, millions of service records, and enterprise installations sharing
the platform with households.

**The five things that actually decide whether this works:**

**1 · RLS predicate cost.** The single most likely cause of catastrophic
degradation. A policy that runs a correlated subquery per row turns every
scan quadratic. The membership resolution is therefore a
**security-definer, `STABLE` helper evaluated once per statement**, and
every workspace-scoped table carries its workspace directly so the
predicate is an indexed equality against a resolved set. Any policy that
cannot be expressed this way is a schema problem, not a policy problem.

**2 · Index locality.** UUIDv7 (§3) keeps high-volume inserts at the
right-hand edge of their indexes rather than scattering across them.

**3 · Read/write separation.** Analytics and heavy reporting read from
replicas. The primary serves transactions. This is why §17's separation
is a performance decision as much as a privacy one.

**4 · Connection management.** Ten million workspaces do not imply many
connections, but serverless functions do — a pooler is mandatory, and
transaction-mode pooling constrains what may be assumed about session
state. Nothing in this architecture depends on session state surviving
between statements.

**5 · The skew.** Workspace size spans four orders of magnitude, and
**no uniform per-workspace policy works for both ends.** Large tenants
need their own handling for rebuild, backup, archival and cache
behaviour. This is the operational characteristic most likely to be
underestimated, and it is inherited unchanged from
`DATABASE_ARCHITECTURE.md` §37.

**The hot paths, named so they get attention first:** membership
resolution on every request; subtree containment on every scoped check;
timeline assembly per property; a provider's book of work across
properties (§11.1); and the enterprise obligation roll-up.

## 21 · Archiving and Backups

**Archiving by storage class**, following `DATABASE_ARCHITECTURE.md` §4.
Detached event and audit partitions move to cold storage and remain
restorable for replay. Closed workflow instances, completed engagements
and aged marketplace rows demote from hot storage on a schedule. **A
workspace archived is not a workspace deleted** — its data becomes
unreachable to members and stays referenceable by counterparties holding
engagements, service records or invoices.

**Backups by class, not uniformly.** Historical-class data — events,
audit, service records, financial records, published memory — is the
platform's value proposition and cannot be reconstructed from anything.
Derived-class data can be rebuilt from it. Treating both as equally
precious makes backups too expensive to run often; treating both as
disposable eventually loses the only thing that cannot be replaced.

**A restore that has never been tested is a hypothesis.** Verified
restore on a schedule is a requirement, not a practice — inherited from
`DATABASE_ARCHITECTURE.md` §4 and reaffirmed because this project has
never run one (`MASTER_CONTEXT.md` §4).

**Point-in-time recovery** covers the transactional and operational
classes. Archived partitions are covered by their own copies and are
immutable, so they need no ongoing protection beyond durability.

## 22 · Multi-Region and Sharding

**The honest position.** A Supabase project is a single primary in a
single region, with read replicas elsewhere. **Read replicas provide
latency, not residency** — the data still lives in the primary's
jurisdiction.

Therefore:

> **True data residency requires one project per residency domain.**
> This is a deployment constraint, not an architectural one — but it
> constrains *when* residency guarantees can be sold, and it must not be
> promised before the projects exist.

**What the architecture already gets right for this.** Workspace is the
partition boundary for isolation, ownership, billing, intelligence scope
and residency simultaneously. So a workspace, and everything it owns, can
be placed in a project — the routing decision is per workspace and needs
no data reshaping.

**The genuine cost: cross-project bilateral objects.** A requesting
workspace in one region engaging a provider workspace in another produces
an engagement, a conversation and a service record spanning projects.
**PostgreSQL foreign keys cannot express that**, so referential integrity
across the boundary becomes the application's responsibility (§5, §23
conflict 7). The mitigations the frozen architecture already provides:
each bilateral object has exactly one home, and the other party holds a
reference rather than a copy; and marketplace supply is filtered by
residency compatibility, so an engagement that cannot be lawfully served
across a boundary is never offered.

**Sharding.** PostgreSQL does not shard natively and Supabase does not
offer a sharded topology. The path, in order of preference:

1. **Vertical growth and read replicas** — sufficient for a long time,
   and the correct answer until measurement says otherwise.
2. **Splitting by schema onto separate instances** — analytics first,
   since §17 already isolates it; then `platform` (events, audit), since
   nothing foreign-keys into it.
3. **Workspace-level sharding across projects** — the same mechanism as
   residency (above), applied for capacity rather than law. The
   architecture is ready for it because tenancy is already the partition
   boundary; what it costs is cross-shard bilateral objects, exactly as
   above.

**Nothing here requires redesign.** Each step is a deployment topology
change over an unchanged data model, which is the return on making
workspace the single boundary.

---

# Part VIII — Audit

## 23 · Implementation Audit

A complete audit against `PLATFORM_DOMAIN_MODEL.md`,
`DATABASE_ARCHITECTURE.md` and `SYSTEM_ARCHITECTURE.md`, conducted before
any SQL exists. **Eleven conflicts found. Ten resolved here. One is a
deployment constraint that limits timing, not architecture. None requires
changing a frozen document.**

### Conflict 1 · RLS as primary gate versus context resolved once

**Frozen requirement.** `SYSTEM_ARCHITECTURE.md` §12.1 resolves the
request context once at the gateway. `PLATFORM_DOMAIN_MODEL.md` Rule 11
allows exactly one permission path.

**Supabase reality.** The default model is clients talking to PostgREST
with RLS as the only gate — which would make RLS a second, parallel
permission system encoding capability and scope in policy predicates.

**Resolved (§6, §7).** The application layer is the permission system;
RLS is a hard backstop expressing workspace isolation and membership.
Direct client reads are permitted **only where membership alone is the
complete answer**, which makes that path a subset of the one model rather
than an alternative to it. Everything involving capability, scope,
bilateral grants or classification is gateway-mediated.

### Conflict 2 · Workspace as partition boundary versus PostgreSQL limits

**Frozen requirement.** `DATABASE_ARCHITECTURE.md` §5 makes the workspace
the partition boundary, with ten million of them.

**PostgreSQL reality.** Planning degrades in the thousands of partitions;
ten million is not operable.

**Resolved (§12, §19).** The workspace stays the **logical** boundary —
carried on every row, filtered by every policy, scoping every rebuild —
and is explicitly **not** one physical partition each. High-volume tables
hash-partition by workspace into a fixed count, then range-partition by
time. Tenant co-location, tenant-scoped rebuild and detachable archives
are all preserved.

### Conflict 3 · Business rules in triggers

**Frozen requirement.** `PLATFORM_DOMAIN_MODEL.md` §14.2 places business
rules in versioned workflow definitions, explicitly **not** in
storage-layer triggers.

**Current reality.** The existing schema does the opposite:
`on_quote_accepted`, `on_job_completed`, `on_review_created`,
`on_request_created` and `on_quote_sent` carry the booking state machine
in triggers.

**Resolved (§4).** A distinguishing test is adopted — *does this trigger
make a decision, or refuse an impossibility?* Constraints (immutability
guards, integrity checks, path maintenance) are permitted; decisions
(status transitions, cascading changes, choosing counterparties) move to
workflow definitions. The existing triggers are **legacy that contradicts
the target** and are recorded for the migration milestone (§24), not
silently kept.

### Conflict 4 · Incremental per-workspace rebuild versus materialized views

**Frozen requirement.** Constraint 7: projections rebuildable per
workspace, incrementally.

**PostgreSQL reality.** Materialized views refresh globally, even
concurrently.

**Resolved (§14).** Workspace-scoped projections are ordinary tables in
`derived`, maintained by event consumers. Materialized views are used
only for platform-scoped analytics, where global refresh is what is
wanted. This also lets RLS apply to projections exactly as to aggregates.

### Conflict 5 · Subtree containment on the hot path

**Frozen requirement.** Constraint 2 makes containment a first-class
operation, consulted on every scoped access check.

**PostgreSQL reality.** Recursive CTEs per query are unaffordable at
enterprise depth; closure tables make re-parenting expensive.

**Resolved (§11.2).** Materialised path via `ltree`, indexed for prefix
matching, with the parent pointer retained as authoritative and the path
as a recomputable denormalisation. Re-parenting rewrites only the moved
subtree, in the same transaction as `LocationTreeChanged`.

### Conflict 6 · Erasure versus foreign keys and immutability

**Frozen requirement.** Constraint 4 and `DATABASE_ARCHITECTURE.md` §8:
erasure must never rewrite immutable history.

**PostgreSQL reality.** A foreign key to an identity row makes erasure
either impossible or cascading; either outcome breaks the requirement.

**Resolved (§5, §11.4).** Durable records reference a **person reference**
with **no foreign key** to identity. Erasure redacts the identity row;
the reference remains valid and resolves to nothing. No durable table may
copy personal data, since a denormalised name is a leak erasure cannot
reach.

### Conflict 7 · Bilateral objects across residency domains

**Frozen requirement.** `DATABASE_ARCHITECTURE.md` §6 gives every
bilateral object one home partition plus a grant; §7 attaches residency
to the workspace.

**Supabase reality.** Residency requires separate projects, and foreign
keys do not cross them.

**Resolved as far as it can be (§22).** Each bilateral object has one
home and the counterparty holds a reference, so no data is duplicated;
cross-project referential integrity becomes an application
responsibility; and marketplace supply is filtered by residency
compatibility so unlawful pairings are never offered. **This is the one
conflict that constrains timing** — residency guarantees cannot be sold
before the per-region projects exist — but it changes no frozen decision.

### Conflict 8 · Signed URLs cannot be revoked

**Frozen requirement.** Document sharing is explicit and revocable
(constraint 12, `DATABASE_ARCHITECTURE.md` §15).

**Supabase reality.** Storage serves private content via time-limited
signed URLs, and an issued URL cannot be withdrawn before it expires.

**Resolved (§11.3).** Short lifetimes; issue on demand per view rather
than embedding in cached payloads; sharing checked at issue time so
revocation stops future issuance immediately; and application-streamed
delivery for the most sensitive classes. The residual exposure window is
bounded and stated rather than hidden.

### Conflict 9 · Durable event delivery

**Frozen requirement.** Events are emitted transactionally with their
change and consumed by six services (constraint 5).

**Supabase reality.** Realtime is not durable, and a broker in the write
path would be a dual write.

**Resolved (§12, §13, §18).** The events table **is** the outbox.
Consumers read forward with cursors. Realtime is used only for live
client updates on the direct-read path, never for domain event delivery.

### Conflict 10 · Analytics isolation by discipline versus by structure

**Frozen requirement.** Constraint 10: platform- and workspace-scoped
analytics physically separate, so the dangerous query is impossible
rather than discouraged.

**Risk.** A single analytics area with careful queries relies on
discipline, and analytical queries are written ad hoc.

**Resolved (§2, §17).** Two schemas, two role grants. The role reading
platform analytics cannot see workspace detail; the role reading
workspace analytics cannot aggregate across tenants. Enforcement is a
privilege error, not a review comment.

### Conflict 11 · Reasoning artifacts as an unclassified data class

**Frozen requirement.** `PLATFORM_DOMAIN_MODEL.md` §18.1 forbids
individual property specifics from informing another property; the
promotion rule governs everything crossing a workspace boundary.

**Gap found.** Assembled AI contexts, intermediate outputs and prompts
are not an aggregate, not a projection, and were unclassified — yet they
contain a concentrated cross-section of a workspace's data and are the
most tempting thing to pool for evaluation or training.

**Resolved (§16).** Reasoning artifacts are classified as **derived and
workspace-scoped**, retained briefly, never promoted, and never pooled
across tenants. Embeddings are likewise never pooled for retrieval,
because pooling would make the promotion rule enforceable only by query
discipline.

### What the audit did not find

**No One Engine violations.** No table exists in a consumer variant and
an enterprise variant. Facets, workflow definitions and capability grants
absorbed every variation tested. **Nothing branches on workspace type.**

**No aggregate with two owners.** Schema placement matches the ownership
table in `SYSTEM_ARCHITECTURE.md` §3 exactly, and grants enforce it.

**No new boundary crossings.** The crossing registry remains closed at
four bilateral crossings and four platform-level structures.

**No projection that cannot be rebuilt** per workspace, after conflict 4.

## 24 · What the Migration Milestone Inherits

1. **Schemas before tables.** `identity`, `workspace`, `property`,
   `work`, `knowledge`, `commerce`, `platform`, `derived`,
   `analytics_ws`, `analytics_pf`. Nothing in `public`.
2. **Grants mirror engine ownership** (§9). An engine writing another
   engine's schema must fail on privileges.
3. **UUIDv7, application-generated**, everywhere (§3).
4. **Every workspace-scoped table carries its workspace directly** — no
   derived tenancy.
5. **RLS enabled on every table, without exception**, expressing
   isolation and membership; richer decisions live above (§6).
6. **The membership helper is security-definer and `STABLE`** (§20).
   This is a correctness-of-scale requirement, not a preference.
7. **Mutability class declared per table** (§4), with append-only
   enforced by withheld privileges plus a guard trigger.
8. **No cascading deletes anywhere** (§5).
9. **No foreign key from a durable record to identity** (§11.4).
10. **Partition events, audit, messages, transitions and service record
    cores from the first migration** (§19).
11. **Events written in the same transaction as their change** — a change
    without an event must be impossible (§12).
12. **Location paths via `ltree`**, rewritten in the same transaction as
    `LocationTreeChanged` (§11.2).
13. **Service Record as core, annexes and amendments** — three tables, no
    field-level security (§11.1).
14. **Projections as tables, not materialized views**, except in
    `analytics_pf` (§14).
15. **The legacy decision triggers** — `on_quote_accepted`,
    `on_job_completed`, `on_review_created`, `on_request_created`,
    `on_quote_sent` — **are migration targets, not fixtures** (§23,
    conflict 3). They carry the booking state machine that belongs in
    workflow definitions.

**Anything the migrations cannot express within these constraints is a
finding against this document** — to be raised and recorded as an ADR,
not designed around.

---

Version 1.0 — 2026-08-11 (Milestone 4 — the persistence architecture
implementing `PLATFORM_DOMAIN_MODEL.md`, `DATABASE_ARCHITECTURE.md` and
`SYSTEM_ARCHITECTURE.md`, audited for implementation conflicts in §23)

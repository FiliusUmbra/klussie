# Klussie — Database Architecture

**This document owns:** how the Klussie platform is represented in data —
its aggregates, what each one owns, what is authoritative versus derived,
how tenancy is enforced, how events flow, and what may be retained,
deleted or rebuilt. It is the architectural blueprint every future
migration must satisfy.

It does **not** own: what the platform *is*
([`PLATFORM_DOMAIN_MODEL.md`](./PLATFORM_DOMAIN_MODEL.md), frozen at
Version 1.0 — the source of truth for every concept named here), the
current system ([`ARCHITECTURE.md`](./ARCHITECTURE.md)), or the physical
schema, which belongs to the milestone after this one.

> **No implementation appears here by design.** No SQL, tables, columns,
> indexes, keys, policies, triggers, views, functions or migrations. No
> vendor. This document decides *what must be true of the data*; the next
> milestone decides how to express it. A blueprint that names its
> database engine has stopped being a blueprint.

**Relationship to the Domain Model.** Every concept here traces to
`PLATFORM_DOMAIN_MODEL.md`. Where this document appears to disagree with
it, this document is wrong — the domain model is frozen and this one
serves it. §38 records a full consistency audit against it, including the
three places where faithful implementation required a decision the domain
model deliberately left open.

---

## Table of contents

**Part I — Foundations**
1. [Purpose and Method](#1--purpose-and-method)
2. [Database Principles](#2--database-principles)
3. [Aggregates, Projections and the Rebuild Test](#3--aggregates-projections-and-the-rebuild-test)
4. [Storage Classes](#4--storage-classes)

**Part II — Tenancy and Isolation**
5. [The Tenancy Model](#5--the-tenancy-model)
6. [The Crossing Registry](#6--the-crossing-registry)
7. [Residency, Regions and Global Expansion](#7--residency-regions-and-global-expansion)

**Part III — The Core Aggregates**
8. [Identity](#8--identity)
9. [Workspace](#9--workspace)
10. [Membership](#10--membership)
11. [Capability Grant](#11--capability-grant)
12. [Property and Stewardship](#12--property-and-stewardship)
13. [Location](#13--location)
14. [Asset and Facets](#14--asset-and-facets)
15. [Document](#15--document)
16. [Maintenance](#16--maintenance)
17. [Service Record](#17--service-record)
18. [Workflow](#18--workflow)
19. [Marketplace](#19--marketplace)
20. [Conversation](#20--conversation)
21. [Workspace Knowledge](#21--workspace-knowledge)
22. [Subscription and Billing](#22--subscription-and-billing)

**Part IV — The Event Backbone**
23. [Events](#23--events)
24. [Projections and Read Models](#24--projections-and-read-models)

**Part V — Derived Intelligence**
25. [Timeline](#25--timeline)
26. [Property Memory](#26--property-memory)
27. [Knowledge Graph and World Graph](#27--knowledge-graph-and-world-graph)
28. [Digital Twin](#28--digital-twin)
29. [Provider Intelligence](#29--provider-intelligence)

**Part VI — Platform Services**
30. [Search](#30--search)
31. [Analytics](#31--analytics)
32. [Notifications](#32--notifications)
33. [Audit](#33--audit)

**Part VII — Behaviour and Growth**
34. [The Capability Engine in Data](#34--the-capability-engine-in-data)
35. [Future-Proofing Demonstration](#35--future-proofing-demonstration)

**Part VIII — Review and Closing**
36. [Design Review at Scale](#36--design-review-at-scale)
37. [Residual Risks](#37--residual-risks)
38. [Consistency Audit](#38--consistency-audit)
39. [What the Schema Milestone Inherits](#39--what-the-schema-milestone-inherits)

---

# Part I — Foundations

## 1 · Purpose and Method

The domain model describes a platform. This document decides how that
platform is held as data such that it can still be true in ten years,
across many countries, for both a household with one boiler and a
hospital group with two hundred thousand assets.

**The method is deliberate and is worth stating, because it determines
everything downstream.** For each concept in the domain model, three
questions are answered in order:

1. **Is it authoritative or derived?** Does something write it directly,
   or is it computed from things that are written elsewhere? This is the
   single most consequential question in the document, and §3 gives it a
   testable answer.
2. **Who owns it?** Exactly one owner, one lifecycle, one transactional
   boundary. Ambiguity here is the origin of most long-lived data
   problems.
3. **What may happen to it?** Mutability, isolation, deletion, retention
   — decided once, at design time, rather than discovered during a legal
   request.

**What this document is guarding against.** Three specific failures, each
of which has killed platforms of this shape before:

- **Duplicated ownership.** The same fact authoritative in two places,
  diverging silently. Guarded by §3 and Principle 9.
- **Tenancy leaks.** Data reachable across a boundary it should not
  cross, usually through a derived structure — a search index, a report,
  an assistant — rather than through direct access. Guarded by Part II.
- **Structural forks.** A second implementation of an existing concept
  arriving under a new name because extending the first looked harder.
  Guarded by §34.

## 2 · Database Principles

Thirteen principles. Each traces to the domain model, and each is meant
to be quotable in review.

**1 · Single Source of Truth.** Every fact is authoritative in exactly one
place. Every other appearance is a derivation that names its source and
can be regenerated from it.

**2 · Event-First, Not Event-Sourced.** Every meaningful change emits an
immutable event as part of the same transaction that made it. Aggregates
still hold their own current state authoritatively — the platform does
*not* reconstruct current state by replaying history. §23 explains why
this distinction matters enormously at scale and why the stricter form
was rejected.

**3 · Append-Only Where Appropriate.** Events, audit records, workflow
transitions, service record amendments and stewardship periods are
append-only. Correction is a new record that supersedes, never an
overwrite.

**4 · Immutable History.** Anything that may later be evidence — a
completed service record, a certificate, an approval, a transition, a
financial movement — is immutable once complete. What was true at the
time stays retrievable, including when the interpretation of it changes.

**5 · Derived Projections.** Timeline, memory, twin, graph, search,
analytics, provider intelligence and notification feeds are projections.
They are rebuildable, never authoritative, and never written to directly
by a user action.

**6 · State Derived Where Possible.** Where current state is a function
of a history that must be kept anyway, the history is authoritative and
the state is a maintained convenience. A workflow instance's current
stage is derived from its transitions; an asset's current location is
derived from its placements.

**7 · Capability-Driven Behaviour.** Capabilities change what may be
written and read. They never change who owns a concept and never
introduce a parallel representation of one (§34).

**8 · Workspace Isolation.** Every record carries the workspace it
belongs to. Isolation is a property of the data, not of the query that
happens to be asked.

**9 · No Duplicated Data Ownership.** Two workspaces may both *see* a
record; only one arrangement may *own* its lifecycle. Where two parties
have legitimate interests, the record is split into a shared core and
per-party private annexes rather than copied (§17).

**10 · Knowledge Over Duplication.** When two things are related, the
relationship is recorded once and traversed, rather than denormalised
into both sides as a stored fact that can drift.

**11 · Explicit Lifecycle Ownership.** Every aggregate names what creates
it, what may change it, what ends it, and what happens to it afterwards.
"Nobody decided" is not an acceptable answer for any record that outlives
a session.

**12 · Historical Integrity Over Convenience.** Where retention and
tidiness conflict, retention wins. Where retention and a legal erasure
obligation conflict, §8 and §37 describe how both are honoured without
either being quietly abandoned.

**13 · One Engine.** There is one representation of each concept.
Personal, Professional and Business workspaces differ in which
capabilities they hold and which facets they populate — never in which
aggregates they use.

## 3 · Aggregates, Projections and the Rebuild Test

**An aggregate** is a consistency and ownership boundary: a cluster of
data with one owner, one lifecycle, and one transactional guarantee.
Aggregates are the system of record. They are written by user and system
actions, and they are the only things that may be.

**A projection** is a derived structure computed from aggregates and
events. Projections are optimised for reading, may be inconsistent for a
bounded period, and may be discarded and rebuilt.

**The Rebuild Test** decides which is which, and it is the sharpest tool
in this document:

> **If every projection were deleted, could the platform reconstruct all
> of them from aggregates and events alone, with nothing lost that
> anyone relies on?**
>
> If yes, the classification is correct. If something would be lost, that
> thing is not a projection — it is an aggregate wearing a projection's
> clothes, and it needs an owner, a lifecycle and a retention policy.

Applying the test honestly is what produced the classification below, and
it caught two mistakes — Property Memory versions and Provider
Intelligence overrides — both recorded in §36.

| Concept | Classification | Notes |
|---|---|---|
| Identity | **Aggregate** | The root of everything |
| Workspace | **Aggregate** | The tenancy boundary |
| Membership | **Aggregate** | Where permission is evaluated |
| Capability Grant | **Aggregate** | What the workspace may do |
| Property, Stewardship | **Aggregate** | Stewardship periods append-only |
| Location | **Aggregate** | Recursive tree |
| Asset, Placement | **Aggregate** | Placements append-only |
| Document | **Aggregate** | Metadata; content is a separate class |
| Maintenance | **Aggregate** | Plans and obligations |
| Service Record | **Aggregate** | Shared core + private annexes (§17) |
| Workflow Definition | **Aggregate** | Immutable once published |
| Workflow Instance | **Aggregate** | Transitions append-only; stage derived |
| Marketplace request, quote, engagement | **Aggregate** | |
| Conversation, Message | **Aggregate** | Original permanently immutable; translations derived |
| Workspace Knowledge | **Aggregate** | Declared and confirmed rules |
| Subscription, Billing | **Aggregate** | Financial records immutable |
| Event | **Aggregate**, append-only | The factual record |
| Audit | **Aggregate**, append-only | Not derived — see §33 |
| World Graph asserted facts | **Aggregate** | Curated, platform-owned |
| Timeline | *Projection* | From events |
| Property Memory (current) | *Projection* | From timeline |
| Property Memory (published versions) | **Aggregate**, append-only | §36 finding 1 |
| Digital Twin | *Projection* | Logical composition (§28) |
| Workspace Knowledge Graph | *Projection* | From aggregates |
| World Graph inferred edges | *Projection* | From aggregation |
| Provider Intelligence scoring | *Projection* | From records + knowledge |
| Provider decisions and overrides | **Aggregate** | §36 finding 2 |
| Search indexes | *Projection* | All eight domains |
| Analytics | *Projection* | All six kinds |
| Notification feed | *Projection* | Delivery receipts are aggregate |

**Why this classification is the load-bearing decision.** It determines
what must be backed up, what may be lost, what must be transactionally
correct, what may lag, what is subject to erasure, and what a migration
must preserve. Every later section is downstream of this table.

## 4 · Storage Classes

Not all data has the same obligations. Six classes, each with its own
consistency, retention and access expectations. **A storage class is a
contract, not a technology** — several classes may share infrastructure,
and none names one here.

### Transactional

**Purpose.** The authoritative record of things happening right now, where
correctness matters more than anything else.

**Characteristics.** Strong consistency. Immediate read-after-write.
Small records, high contention, low latency. Every write emits an event.

**Retention.** Indefinite while the aggregate is live; then archived per
its own rule, never silently dropped.

**Examples.** Workspace, membership, capability grant, property,
location, asset, maintenance, marketplace request and quote, workflow
instance, subscription.

**Why it exists.** Because a booking that half-happened, a permission
that half-changed, or a payment that half-recorded is worse than an
outage. This class buys correctness with capacity.

### Operational

**Purpose.** High-volume working data supporting active use, where
throughput matters more than immediate global consistency.

**Characteristics.** Very high write rates, mostly recent-data access,
naturally partitionable, tolerant of small delays in propagation.

**Retention.** Hot for an active window, then demoted to Historical.

**Examples.** Messages, notification delivery state, workflow
transitions, sensor and telemetry observations, session-scale activity.

**Why it exists.** Because the volume of operational chatter is orders of
magnitude greater than the volume of decisions, and forcing both through
the same guarantees makes the platform pay transactional cost for data
that does not need it.

### Historical

**Purpose.** The permanent record. Append-only, immutable, read rarely
and read seriously.

**Characteristics.** Write-once. Never updated. Grows without bound.
Access is infrequent but must be complete and provable.

**Retention.** Longest of: the property's life, the business's life, and
the jurisdiction's statutory minimum. Deletion only under a lawful
erasure obligation, and then by redaction rather than removal (§8).

**Examples.** Events, audit records, completed service records, invoices
and financial movements, certificates, published memory versions,
stewardship periods, workflow instance histories.

**Why it exists.** Because this is the class the entire value proposition
rests on. `PROPERTY_MEMORY.md` promises understanding earned over a
decade; that promise is a retention guarantee before it is anything else.

### Knowledge

**Purpose.** Structured understanding — declared policy, curated world
facts, and the relationships that connect everything.

**Characteristics.** Low volume relative to everything else, read very
heavily, updated deliberately, and highly connected. Read-mostly.

**Retention.** Current version live; superseded versions retained,
because knowing what the policy *was* is required to interpret decisions
made under it.

**Examples.** Workspace Knowledge rules, world graph facts (manufacturers,
models, parts, compatibility, regulations), workspace graph relationships.

**Why it exists.** Because knowledge has an access pattern shared with
nothing else: small, hot, deeply traversed, and consulted on nearly every
intelligent operation. Treating it as ordinary transactional data makes
every recommendation expensive.

### Analytical

**Purpose.** Aggregated questions over large populations.

**Characteristics.** Large scans, column-oriented access, no requirement
for immediate freshness, no user-facing transactional guarantees.

**Retention.** Aggregates retained long; underlying detail per its own
class. Platform-level analytics retain no individual-level detail at all
(§31).

**Examples.** All six analytics domains in §31.

**Why it exists.** Because a facilities manager asking for five years of
cost across two hundred sites and a customer accepting a quote must never
compete for the same resources. This class is as much an isolation
boundary as a performance one.

### Derived

**Purpose.** Everything computed for reading — projections that exist to
make queries fast or possible.

**Characteristics.** Rebuildable by definition. Eventually consistent.
Never authoritative. May be versioned, sharded or discarded freely.

**Retention.** None guaranteed. Anything in this class that *cannot* be
discarded has been misclassified and must be promoted (the Rebuild Test,
§3).

**Examples.** Timeline, current memory, twin composition, search indexes,
notification feeds, provider scores, graph inferred edges.

**Why it exists.** Because separating "what is true" from "what is fast
to read" is what allows read models to be changed, re-shaped and
re-optimised for a decade without ever risking the record.

### Recovery obligations by class

A storage class is a contract, and the contract must say what happens
after a failure. Stating this here rather than leaving it to operations
is deliberate: **recoverability is a property of the data model, not of
the runbook.** If a class's recovery expectation cannot be met by its
design, that is an architecture finding, not an operational one.

| Class | Loss tolerance | Recovery expectation |
|---|---|---|
| **Transactional** | None. Any loss is a correctness failure | Point-in-time recovery; a lost write is unacceptable |
| **Operational** | Minimal; bounded recent loss survivable | Point-in-time recovery; brief recent loss degrades experience, not correctness |
| **Historical** | **None, ever** | Multiple independent copies; verified restore. This class *is* the platform's value proposition |
| **Knowledge** | None for declared rules; inferred content rebuildable | Point-in-time recovery for declared and curated content |
| **Analytical** | Full loss survivable | Rebuild from Historical and Operational sources |
| **Derived** | Full loss survivable by definition | Rebuild from aggregates and events, per workspace, incrementally |

**The line that matters** runs between Historical and Derived. Everything
below Knowledge in that table can be reconstructed; nothing above it can.
A backup strategy that treats all data as equally precious will be too
expensive to run often enough, and one that treats it as equally
disposable will eventually lose the only thing the platform cannot
replace — which is why the classification in §3 is upstream of the
recovery policy rather than a separate concern.

**A restore that has never been tested is a hypothesis.** For Historical
class in particular, the ability to restore must be verified on a
schedule, not assumed.

---

# Part II — Tenancy and Isolation

## 5 · The Tenancy Model

The domain model makes the workspace the boundary for six concerns at
once (§2 there). In data, that resolves to one rule:

> **Every record carries the workspace it belongs to, and that workspace
> is part of its identity — not an attribute that a query may forget to
> filter on.**

**Why carried rather than inferred.** A record whose tenancy must be
derived by joining through two other records is a record whose tenancy
can be got wrong under refactoring, and whose access check is expensive
in exactly the hot paths that matter. Carrying it is redundant in the
formal sense and correct in every other sense.

**Tenancy is the partition boundary.** This is the deliberate coincidence
the whole architecture depends on. Because isolation, ownership, billing,
intelligence scope and residency all share one boundary, that boundary
can also be the physical distribution boundary — which is what makes ten
million workspaces a distribution problem rather than a design problem.

**Three tenancy levels exist, and only three:**

| Level | Scope | Examples | Rule |
|---|---|---|---|
| **Workspace-scoped** | One workspace | Almost everything | The default. Anything not explicitly listed below is here. |
| **Identity-scoped** | One person, across their workspaces | Identity, credentials, the notification inbox (§32) | Contains no workspace *content* — only references to it, filtered by live membership. |
| **Platform-scoped** | Everyone | World graph facts, workflow definition catalogue, jurisdiction rules, platform analytics | Contains no workspace-specific data. Ever. |

A record that does not fit one of these three is a design error, not a
new level.

**Isolation must hold through derived structures.** The domain model's
Rule 11 requires permission evaluation with no second path. In data terms
this means every projection carries the tenancy of its sources — a search
index entry, a report row, a graph edge, a notification, a cached memory
statement. **Post-filtering a result set by permission is prohibited**:
it is slow at scale, and the failure mode of a missed filter is a
disclosure rather than an error.

## 6 · The Crossing Registry

Some data legitimately crosses the workspace boundary. The domain model
(Rule 12) requires every crossing to be explicit, scoped and bounded.
This document makes that enforceable by keeping a **closed registry**:

> **These are the only crossings that exist. Adding one is an
> architectural decision requiring an ADR, not a design detail.**

Crossings come in two kinds, and conflating them is a mistake the domain
model's §32 warns about:

### Bilateral crossings — two named workspaces

A specific object visible to exactly two workspaces because both are
party to it. **Each has exactly one home partition** and the other side
sees it through a recorded grant.

| Crossing | Home partition | Other party sees | Bounded by |
|---|---|---|---|
| **Marketplace engagement** | The engagement itself, homed with the requesting workspace | Scope of work, location, relevant assets | The engagement's lifecycle |
| **Conversation** | The engagement or subject it is bound to | Their own participation and the shared thread | Participation |
| **Service Record** | The property's workspace (§17) | The performing workspace, permanently | Neither — permanent for both |
| **Shared stewardship** *(future)* | The property | Co-stewards, per agreement | The stewardship period |

**Why a single home partition matters.** At ten million workspaces the
partition boundary is physical. An object with two homes is either
duplicated — violating Principle 9 — or requires distributed transactions
on the hot path. One home plus a grant gives one owner, one write path,
and one truth, with the second party reading across a recorded, revocable
relationship.

### Platform-level structures — aggregate over many

Structures that exist above all workspaces and contain nothing specific
to any of them.

| Structure | Contains | Guarded by |
|---|---|---|
| **World graph** | Manufacturers, models, parts, compatibility, regulations, general failure patterns | The promotion rule |
| **Platform analytics** | Population aggregates only | The promotion rule |
| **Workflow definition catalogue** | Process templates | Contains no workspace data |
| **Jurisdiction rules** | Tax, statutory, regulatory configuration | Contains no workspace data |

**The promotion rule**, taken verbatim in effect from the domain model
§19.2, governs anything moving from a workspace into a platform-level
structure:

> A fact may leave a workspace **only if it remains true once every
> reference to its origin is removed.**

"This model's bearings commonly fail around year seven" survives. "The
pump at this address failed" does not. Promotion is a one-way,
irreversible, aggregate-only operation, and it is the only path by which
workspace-derived information reaches platform scope.

**Promotion is an operation, not a pipeline.** A rule with no gate is a
convention, and conventions are what get eroded by deadline pressure. So:

> **Every promotion is an explicit, recorded, audited operation** (§33),
> naming what was promoted, the aggregate population it was derived from,
> and who or what authorised it. There is no ambient path from workspace
> data into platform scope — a job that quietly aggregates across tenants
> and writes a platform-level structure is prohibited, however
> well-intentioned.

This makes the platform's strongest privacy guarantee reviewable after
the fact, which is the only form of guarantee that survives ten years of
staff turnover.

**Temporary access** — contractor access, marketplace-derived access — is
not a crossing of this kind at all. It is an ordinary membership with a
scope and an expiry (domain model §8), and therefore lives entirely
inside the workspace-scoped level. This is worth stating because
modelling it as a crossing would create a parallel access mechanism, and
two ways to gain access is one too many.

## 7 · Residency, Regions and Global Expansion

**Residency attaches to the workspace.** Because the workspace is the
partition boundary, a workspace can be placed in a region, and everything
workspace-scoped follows it. This is the return on the domain model's
decision to unify six concerns into one boundary.

**Two jurisdictions, per the domain model §25, and they serve different
purposes in data:**

- **Workspace jurisdiction** governs the commercial and legal frame —
  currency, tax, invoice content, payout rails, verification. It travels
  with the workspace.
- **Property jurisdiction** governs obligations about the physical thing
  — inspection regimes, permitted works, compliance schedules. It travels
  with the property, which may be in a different country from its
  steward.

Both are recorded; neither is derived from the other; and jurisdiction
rules themselves are platform-scoped configuration, so adding a country
adds data rather than code.

**The hard case: cross-region bilateral objects.** A workspace resident in
one region engaging a provider workspace resident in another produces an
engagement, a conversation and a service record spanning two residency
domains. This is a genuine architectural problem and is addressed rather
than hidden:

1. **Bilateral objects are homed by the rule in §6**, which for service
   records means the property's workspace — so property history stays in
   the property's residency domain, which is the one with legal
   obligations attached to it.
2. **The other party holds a reference and a permitted view**, not a
   copy. What crosses is what the grant allows.
3. **Where a residency regime forbids even that view**, the engagement
   itself is not permitted. Marketplace supply is therefore filtered by
   residency compatibility, which is a matching input rather than a
   special case.

**How expansion works in practice.** A new country is: a jurisdiction
record, its tax and statutory rules, its workflow definitions, its asset
and document taxonomies, and locale content. **No structural change, and
no code, is contemplated by this architecture for a new market.** That is
the test §25 of the domain model sets, and it is met by keeping every one
of those things as platform-scoped configuration data.

---

# Part III — The Core Aggregates

Each aggregate below follows the same template: why it exists, who owns
its lifecycle, what may change, what it relates to, how it is isolated,
what happens on deletion, how long it is kept, how it scales, and what
was traded away.

## 8 · Identity

**Why it exists.** One permanent representation per person, carrying
nothing about what they do or own (domain model §4). It is the only
identity-scoped aggregate that holds personal data.

**Ownership and lifecycle.** Created by registration or by accepting an
invitation. Owned by the person. Ended only by erasure, never by
inactivity.

**Mutability.** Mutable in its attributes — name, language, contact
channels, preferences. Its identifier is permanent and never reused.

**Relationships.** To workspaces only through memberships. There is no
direct path from an identity to any workspace content, which is what
makes permission evaluation tractable and what makes §32's inbox the only
place the two meet.

**Isolation.** Identity-scoped. An identity's presence in one workspace is
never discoverable from another.

**Deletion and retention — the hardest question in the document.** A
person has a legal right to erasure; the platform has a legal and
practical obligation to retain financial records, evidence, and other
workspaces' legitimate history. Both are honoured by one decision made
here:

> **Personal identifying data is separated from the durable record.**
> Everything durable — events, audit, service records, invoices, workflow
> transitions — refers to a person by a stable internal reference, never
> by their personal details. Erasure removes or redacts the identity
> aggregate; the durable record keeps a reference that no longer resolves
> to a person.

The history remains complete and internally consistent; the person
becomes unidentifiable within it. This satisfies erasure without
rewriting immutable history, and it is why Principle 12 can promise both.

**Scale.** 100 million identities is a large but unremarkable
identity-scoped dataset: small records, read on every request, changed
rarely. It is the most cacheable thing in the platform.

**Trade-off.** Separating identity from the durable record means nearly
every historical query that wants to display a name must resolve it
separately, and some will resolve to nothing after an erasure. That
display cost is accepted; the alternative is either unlawful retention or
destroyed history.

## 9 · Workspace

**Why it exists.** The context in which all work happens and the boundary
for isolation, permission, billing, intelligence, marketplace
participation and residency (domain model §5).

**Ownership and lifecycle.** Created by an identity or by provisioning.
Owned by its owner-role members. Ends by archival, never by deletion —
see below.

**Mutability.** Name, branding, jurisdiction, residency and settings are
mutable. Its identifier and its creation are not. **Type is mutable and
carries no behaviour** — changing it changes a label and, if the operator
chooses, offers a preset; it never changes structure (Principle 13).

**Relationships.** Parent to nearly everything. Referenced by every
workspace-scoped record.

**Isolation.** It *is* the isolation boundary.

**Deletion and retention.** A workspace is **archived, never deleted**.
Its data becomes inaccessible to members and remains referenceable by
counterparties who legitimately hold engagements, service records,
invoices or reviews involving it. This is the only answer that respects
both the ending party and the parties who transacted with them, and it
leaves the domain model's open question (§30 there) open rather than
foreclosing it.

**Scale.** Ten million workspaces with an extremely long tail: most hold
one property and a handful of records; a few hold hundreds of thousands.
**This skew is the defining scale characteristic of the platform** and is
treated explicitly in §36.

**Trade-off.** Archival rather than deletion means data the customer
believes is gone is retained in a restricted form. This must be stated
plainly in the product, and it is the correct trade because the
alternative destroys other parties' records.

## 10 · Membership

**Why it exists.** The link between identity and workspace, and the only
place access is decided (domain model §7).

**Ownership and lifecycle.** Owned by the workspace. Created by
invitation, request, domain verification, directory sync, or a
marketplace engagement's grant. Ends by revocation, expiry, or the
workspace's archival.

**Mutability.** Role, scope and state are mutable. **Every change is
recorded append-only**, because "who had access to what, when" is an
audit question that will be asked years later — by an enterprise
customer, an auditor, or an investigation.

**Relationships.** Identity to workspace; optionally narrowed to a scope
— a set of properties or a location subtree.

**Isolation.** Workspace-scoped, and visible to the member it concerns.

**Deletion and retention.** Ended memberships are retained as history.
Removing the record of past access would defeat the purpose of having
recorded it.

**Scale.** The hottest read in the platform: consulted on effectively
every request. Small, slow-changing, highly cacheable — with the
important caveat that revocation must propagate promptly, which bounds
how long any cache may be trusted. §36 addresses this.

**Trade-off.** Scoped membership makes access evaluation hierarchical
rather than flat — it depends on the location tree (§13), and a scope
must be re-evaluated when that tree changes. Accepted: whole-workspace
access closes the enterprise market permanently.

## 11 · Capability Grant

**Why it exists.** What a workspace may do (domain model §6). The first
of the two gates.

**Ownership and lifecycle.** Owned by the platform on behalf of the
workspace. Created by subscription, trial, negotiation or operator
action. Ends by lapse, downgrade or withdrawal.

**Mutability.** Grants are added and withdrawn; **the history of grants
is append-only**, because interpreting a past decision requires knowing
what the workspace could do at the time.

**Relationships.** Workspace to capability. Capabilities declare
dependencies, and the grant resolution honours them.

**Isolation.** Workspace-scoped. The capability *catalogue* is
platform-scoped configuration.

**Deletion and retention.** Withdrawal removes behaviour and never data
(domain model §6.10). Records produced under a capability remain readable
and exportable after it lapses. This is a hard rule and it constrains
every capability-gated feature: **no feature may store its data such that
losing the capability makes the data unreachable.**

**Scale.** Tiny — tens of grants per workspace, changing rarely. Resolved
once per request context alongside membership and cached with it.

**Trade-off.** Capability resolution is a dependency on nearly every
operation. Because it is small and slow-changing this is cheap, but it is
a genuine coupling and is named as such in §36.

## 12 · Property and Stewardship

**Why it exists.** The thing that accumulates value and outlives the
arrangements that manage it (domain model §9).

**The critical decision: stewardship is a period, not an attribute.** A
property is not owned by a workspace as a child record. It is stewarded
by a workspace **for a period with a beginning and possibly an end**, and
those periods are append-only.

This one decision delivers several requirements at once:

- The property lifecycle survives a change of steward, as the domain
  model's two clocks require.
- The timeline can attach to the property (§25) while access remains
  answerable, because "who could see this, when" is a function of
  stewardship periods.
- A previous steward neither retroactively loses their own record of
  their period nor gains visibility of what came after.
- Portfolios moving between managing agents, and future shared
  stewardship, are expressible without redesign.

**Ownership and lifecycle.** The property aggregate is owned by its
current steward for the duration of the period. The property's identity
is permanent.

**Mutability.** Attributes mutable; jurisdiction mutable only by
correction; stewardship history append-only.

**Isolation.** Workspace-scoped **via the current stewardship period**,
which is a dynamic boundary — the one place in the architecture where
tenancy is not a static stamp. §36 treats the consequences.

**Deletion and retention.** A property is never deleted while any
historical record references it. A steward ending their period ends their
access, not the property.

**Scale.** Tens of millions of properties. Small records, deeply
referenced.

**Trade-off.** Dynamic tenancy for properties is more complex than a
static stamp and is the single most subtle thing in this document. It is
required by the frozen domain model and cannot be simplified away.

## 13 · Location

**Why it exists.** Space within a property, nesting recursively to
whatever depth the customer's world requires (domain model §10).

**Ownership and lifecycle.** Owned by the property. Created and
reorganised by members with permission.

**Mutability.** Fully mutable, including re-parenting. **Re-parenting is
the operation that makes this aggregate difficult**, because scoped
permissions (§10) and historical records both reference positions in the
tree.

**Relationships.** Parent to child locations and to assets. Referenced by
scoped memberships, service records and maintenance.

**Isolation.** Workspace-scoped, inheriting the property's stewardship.

**Deletion and retention.** A location referenced by history is retired,
not removed — a room that no longer exists still hosted work that
happened.

**Scale and the requirement this places on the schema.** A household has
five locations; a hospital campus may have a hundred thousand across six
levels. The architecture requires one primitive of the schema milestone
that cannot be an afterthought:

> **Subtree containment must be answerable as a first-class operation.**
> "Is this location within that subtree?" is asked on every scoped access
> check, every search, and every roll-up report. A design that answers it
> by walking parents at query time will not survive enterprise depth.

**Trade-off.** Free-depth trees permit nonsense and make containment
queries structurally harder. Accepted: fixed depth cannot express a
warehouse and burdens a household.

## 14 · Asset and Facets

**Why it exists.** The anchor of maintenance history and prediction — the
thing whose identity must persist across moves, repairs and
reinterpretation (domain model §11).

**Placement is a period, not a field.** As with stewardship: an asset's
relationship to a location is a **time-bounded placement**, appended
rather than overwritten. A forklift moving between zones keeps one
identity and one history, and "what was in this room last winter?" stays
answerable — an ordinary question in insurance, compliance and incident
investigation.

**Facets: how one aggregate serves a dishwasher and a production line.**
This is the mechanism that makes Principle 13 real rather than
aspirational.

> **An asset has a core identity shared by every asset in the platform,
> plus zero or more typed facets that carry domain-specific attributes.**

A vehicle facet carries registration, odometer and usage-based service
intervals. An HVAC facet carries refrigerant type and inspection regime.
A compliance facet carries statutory obligations. A connected facet
carries telemetry association.

**The rules that keep facets from becoming a fork:**

1. A facet **extends** an asset. It never replaces or shadows one.
2. A facet may be added to any asset the customer considers appropriate.
   Facets are not gated by workspace type.
3. **Capabilities gate whether a facet's behaviour is available, never
   whether the asset exists.** A workspace losing Fleet Management keeps
   its vehicles and its history; it loses the fleet behaviour.
4. No facet may hold a fact that belongs on the core — identity, type,
   placement, condition, lifecycle dates.
5. A new facet is additive. It never requires touching existing assets.
6. **A facet's attributes are declared, not free-form.** Every facet type
   has a declared set of attributes with declared meanings, held as
   platform-scoped configuration.

**Why rule 6 exists, and why it is not a detail.** The tempting shortcut
is to let a facet carry an open-ended bag of attributes, which makes new
verticals trivial to add. It also makes them permanently unsearchable,
unreportable and invisible to the intelligence — nothing can index,
aggregate or reason over attributes whose existence and meaning are
unknown. At a hundred thousand assets per enterprise workspace this is
not a nuisance; it is the difference between a queryable asset base and
an archive.

Declared attributes keep facets extensible — adding one is configuration,
not code — while keeping every asset in the platform reachable by search
(§30), analytics (§31) and the knowledge graph (§27). **Extensibility
without declaration is not extensibility; it is an opt-out from the rest
of the platform.**

**Why this instead of one wide representation, or one per asset kind.**
One wide representation collapses under the union of every industry's
attributes. One representation per kind is a fork by another name, and it
breaks every cross-asset question — search, reporting, memory, the graph
— that the platform depends on. Facets keep one identity and one set of
relationships while allowing unbounded domain specialisation.

**Assets nest.** A production line contains machines; a machine contains
a motor. Same recursion as locations, same containment requirement.

**Isolation.** Workspace-scoped via the property.

**Deletion and retention.** Assets are retired, never deleted, while
history references them. Disposal is a lifecycle state; a replaced boiler
remains linked to its successor.

**Scale.** The largest core aggregate — an enterprise may hold hundreds
of thousands per workspace, and the platform tens of billions in
aggregate. Naturally partitioned by workspace.

**Trade-off.** Facets add indirection: answering "everything about this
asset" means assembling core plus facets. Accepted, because the
alternative is either an unusable core or a fractured one.

## 15 · Document

**Why it exists.** Evidence that outlives what it was attached to, needed
from more than one direction (domain model §12).

**The architectural point: metadata and content are separate concerns.**
Document *metadata* — type, validity period, issuer, subjects,
authorship — is small, queried constantly, and belongs with the model.
Document *content* is large, queried rarely, and belongs in a content
class of its own. Conflating them makes every metadata query pay for
bytes nobody asked for.

**Multi-subject by design.** A document attaches to any number of
subjects — property, location, asset, maintenance, service record,
engagement, workspace. A single-parent model forces duplication and
guarantees the copy found is the wrong one.

**Attachment is not a visibility grant.** This distinction is essential
and was nearly lost. A document attached to a shared Service Record core
(§17) does **not** thereby become visible to both parties; a document
attached to an asset does not become visible to a contractor with access
to that asset.

> **Every document has exactly one owning workspace and an explicit
> sharing state. Attachment says what a document is *about*. Sharing says
> who may *see* it. The two are set independently.**

Without this rule, a firm attaching its internal costing sheet to a
service record for its own convenience would disclose it to the customer
— a silent, one-way, unrecoverable leak. Documents whose sharing is
intended are shared explicitly, and certificates issued as part of shared
core content are shared by their document *type*, so the decision is made
once in configuration rather than per upload by whoever is holding the
phone.

**Validity is structural, not decorative.** A certificate with an expiry
is actionable; a file is not. Validity periods make compliance,
warranty-aware routing and expiry notifications possible, and they are
part of the aggregate rather than parsed from content.

**Mutability.** Metadata mutable; content immutable — a reissued
certificate is a new version, not an edit. Version history is retained,
because "what did the certificate say at the time of the inspection?" is
a real question.

**Isolation.** Workspace-scoped, with documents attached to a service
record following that record's visibility rules (§17).

**Deletion and retention.** Documents that are evidence follow Historical
retention. Documents that are convenience may be deleted by their owner.
The distinction is carried by document type, so it is decided by
configuration rather than by a user's judgement in the moment.

**Scale.** The largest data volume in the platform by an order of
magnitude, and the least frequently accessed — which is precisely why the
metadata/content split is not optional.

**Trade-off.** Two-part storage means a document is never atomically
complete in one place, and orphaned content must be reconciled. Accepted
as the standard cost of the standard pattern.

## 16 · Maintenance

**Why it exists.** What is due, overdue and predicted — the
forward-looking half of the platform's value (domain model §13.1).

**Ownership and lifecycle.** Owned by the workspace, anchored to an asset
or location. Created manually, by schedule, by compliance obligation, or
by prediction.

**The distinction that matters in data:** a maintenance *obligation*
(something is due) is authoritative and belongs to this aggregate. A
maintenance *prediction* (something is becoming due) is derived from
memory and belongs in the Derived class. Conflating them would make a
guess indistinguishable from a duty — the same fact-versus-interpretation
line the domain model draws everywhere.

**Relationships.** Asset or location; produces workflow instances;
resolved by service records; feeds notifications.

**Isolation.** Workspace-scoped.

**Deletion and retention.** Completed obligations are retained
permanently — a schedule adhered to is compliance evidence. Cancelled
ones retain their cancellation and its reason.

**Scale.** Tens of thousands per enterprise workspace per year;
generated schedules dominate the volume.

**Trade-off.** Generated obligations can outpace real activity, producing
noise. This is a product-tuning problem rather than an architectural one,
but it lands in the data as volume.

## 17 · Service Record

The most consequential aggregate in the document, and the one the domain
model's §32 flagged as the most safety-critical detail for this milestone.

**Why it exists.** The permanent record of work performed — one shared
object belonging to both the property's history and the performing
workspace's operational history (domain model §13.2).

### The shared ownership model

The requirement is contradictory on its face: one object, two owners.
Resolved by separating **three boundaries that are usually the same
thing**, and which must not be here.

| Boundary | Answer |
|---|---|
| **Authorship** — who may write what | Split by section. The performing workspace authors the work; the property's workspace authors its approval and its own annotations. Neither may write the other's. |
| **Visibility** — who may read what | Split by classification: shared core, and two private annexes. |
| **Lifecycle** — who may end it | **Neither.** Once complete, a service record is immutable and permanent, and no party may delete it. |

**The structure this produces:**

> A Service Record is a **shared core** plus a **private annex per
> participating workspace**. The core holds facts about the work. Each
> annex holds that party's own commercial and internal context. The core
> is one record with one home partition; the annexes are ordinary
> workspace-scoped records.

**Classification, taken from domain model §13.2 and binding:**

| Shared core — both parties | Performing workspace annex | Property workspace annex |
|---|---|---|
| Diagnosis, symptoms, cause | Internal cost and margin | Internal approvals and budget context |
| Work performed, dates, duration | Supplier actually used and their price | Its own annotations |
| Technicians present | Internal scheduling notes | Its planning context |
| Labour and travel time | Commentary marked internal | Private assessments |
| Materials, quantities, part numbers | | |
| Manufacturer information | | |
| Measurements | | |
| Before/after photos and video | | |
| Documents and certificates issued | | |
| Warranties arising | | |
| Customer approval | | |
| Agreed price | | |
| Future recommendations, AI summary | | |

**The governing rule, restated because it must survive every future
feature:** *facts about the work are shared; commercial and internal
context is not.* A part number is a fact about the building. The margin
on that part is a fact about the business. **Supplier information is
split** — the manufacturer of a part is a fact about the building; which
distributor the firm bought it from at what price is a fact about the
business.

### Home partition and why it is the property's workspace

The core is homed with **the property's workspace**. Three reasons, in
order of weight:

1. **Retention is longest there.** The record must survive the performing
   business ending. Homing it with the business would put the property's
   permanent history inside an aggregate that can be archived.
2. **Residency obligations attach to the property** (§7). Property
   history should sit in the property's residency domain.
3. **The property is the thing that persists.** Stewards change; the
   building does not.

The performing workspace holds a permanent, non-revocable grant to the
core — the one grant in the architecture that does not expire, because a
business's record of work it performed cannot be taken away by a customer
ending a relationship.

**What happens to the annexes when things end.** Annexes are ordinary
workspace-scoped records and follow their own workspace, which produces
the right outcomes without any special rule:

| Event | Core | Performing annex | Property annex |
|---|---|---|---|
| Performing business closes | Unaffected — homed elsewhere | Archived with that workspace; unreadable, not destroyed | Unaffected |
| Property changes steward | Unaffected — follows the property | Unaffected | **Stays with the previous steward** |
| Customer ends the relationship | Unaffected | Grant persists — it is non-revocable | Unaffected |

The middle row is the consequential one: a previous steward's private
commercial context — what they paid, what they approved, what they
privately assessed — does **not** transfer to a new steward. Only the
shared core does, which is exactly the material the domain model intends
a property's history to consist of. This keeps the transfer question the
domain model left open (§30 there) genuinely open, because widening it
later would be a policy decision about the core, not a rescue of data
that had already been given away.

### Views

Both parties read the same core and derive different things from it. The
customer view aggregates by asset, location, property and year, and feeds
timeline, memory, twin, warranty and compliance. The professional view
aggregates by technician, period, service type and customer, and feeds
operational analytics, quoting accuracy and reputation. **Neither view is
stored as a separate record** — they are projections over one core, which
is Principle 9 in its most important application.

### Permanence and amendment

Completed records are immutable. Corrections are **amendments** carrying
their own author, time and reason, appended to the record. The current
reading of a record is the core plus its amendment chain.

This is not fastidiousness: a service history that can be quietly edited
is worthless as evidence, and it will be asked to be evidence — in
warranty claims, insurance claims, compliance audits, disputes and sales.

### Future support, without redesign

- **Warranty.** Warranties arising are already core content with validity
  periods (§15). A claim references the record; nothing new is needed.
- **Insurance.** A claim is a workflow (§18) over existing evidence,
  producing its own records and referencing these.
- **Analytics.** Both views are already projections; adding a question
  adds a projection.
- **AI learning.** The core is the richest input to memory and the graph,
  and the promotion rule (§6) governs what may generalise.

**Deletion and retention.** Never deleted. Retained for the longest of:
the property's life, the performing business's statutory obligations, and
the jurisdiction's minimum. Personal identifiers within it are subject to
§8's separation, so erasure of a person does not destroy the record of
the work.

**Scale.** The highest-volume Historical aggregate. Partitioned by
property workspace; the performing workspace reads across its grants,
which §36 addresses as a genuine query-pattern concern.

**Trade-off, stated honestly.** Two parties with legitimate differing
interests in one record means every visibility rule must be deliberate,
and a mistake exposes a business's cost base to its customer or a
household's private notes to a contractor. This is the highest-risk
surface in the architecture. It is accepted because two records that
disagree is a worse failure that cannot be repaired later.

## 18 · Workflow

**Why it exists.** Every process is configuration, not code. This is
where the platform's business rules live (domain model §14.2).

**Two aggregates, deliberately separate:**

**Workflow Definition** — platform-scoped or workspace-scoped
configuration describing stages, permitted transitions, who may perform
each, what evidence is required, timing expectations, notifications and
events. **Immutable once published.** A change produces a new version.

**Workflow Instance** — one workspace-scoped run of a definition.
References the **exact definition version** it started under, permanently.

**Why versioning is non-negotiable.** A workflow changed today must not
retroactively alter a claim that started last month. The process a piece
of work was governed by is part of the record of that work, and for
compliance workflows it is part of the evidence. This means published
definitions can never be deleted while any instance references them —
which makes definitions Historical-class data even though they look like
configuration.

**State is derived; transitions are authoritative.** An instance's
transition log is append-only and is the truth. Its current stage is a
maintained convenience derived from that log (Principle 6). This gives
audit, debugging and intelligence a complete picture for free, and it
means a corrupted stage can be recomputed rather than guessed.

**Long-running instances.** Workflows may be open for years — a
preventive schedule, a warranty period, a compliance cycle. The
architecture treats an open instance as ordinary Transactional data and
its accumulated transitions as Operational demoting to Historical. There
is no assumption anywhere that a process completes quickly.

**Capability-aware.** A definition declares the capabilities it requires;
a workspace sees only definitions it can run. The engine is unchanged —
the catalogue available is smaller.

**Jurisdiction-aware.** A Belgian statutory inspection and a Dutch one are
two definitions, not two code paths. Launching a country adds
definitions.

**Future workflow editor.** Because definitions are data with versions
and validation, a customer-facing editor is a product surface over
existing structure rather than a new subsystem. Customer-authored
definitions are workspace-scoped; the platform catalogue remains
platform-scoped; the engine does not distinguish them.

**Isolation.** Instances are workspace-scoped. Definitions are
platform-scoped or workspace-scoped and contain no workspace *content*
either way.

**Deletion and retention.** Instances are retained with their transition
history. Definitions are never deleted while referenced; they are
deprecated, which prevents new instances without disturbing old ones.

**Scale.** Millions of concurrent instances; transitions are the dominant
write volume after messages and events. Naturally partitioned by
workspace.

**Trade-off.** Interpreted process is less predictable than fixed code: a
badly authored definition can deadlock, and "why is this stuck?" is
harder to answer. The transition log is the mitigation, which is why it
is authoritative rather than incidental.

## 19 · Marketplace

**Why it exists.** The mechanism by which one workspace obtains work from
another (domain model §14.3) — one of several execution strategies, not
the platform's entry point.

**Three aggregates:** the **request** (what is needed, owned by the
requesting workspace), the **quote** (an offer, owned by the offering
workspace), and the **engagement** (the commitment, a bilateral object
homed with the requesting workspace).

**The engagement is the access-granting object.** Accepting a quote
creates an engagement, which creates a scoped, time-bounded membership
(§10) for the performing workspace over exactly the locations and assets
the work concerns. This is the domain model's §8 mechanism, not a
parallel one — which is why "temporary contractor access" needs no
separate design.

**Execution strategies that are not the marketplace.** The domain model
enumerates eleven strategies, most earning the platform nothing. In data
this matters more than it might appear:

> **A need resolved by warranty, DIY, internal team or watch-and-wait
> produces the same maintenance record and the same service record as one
> resolved by the marketplace.** Only the marketplace aggregates are
> absent.

The platform therefore records outcomes it earns nothing from, which
domain model §14.1 requires — a platform that only remembers what it was
paid for has a hole in its memory exactly where its most trust-building
advice lives.

**Reputation attaches to the performing workspace**, computed from
service records and reviews. It is a projection, rebuildable, and never a
stored score that can drift from the records supporting it.

**Isolation.** Requests and quotes are workspace-scoped. Engagements are
bilateral per §6.

**Deletion and retention.** Engagements and their financial consequences
are permanent. Unaccepted requests and declined quotes may be aged out
after a retention window — they are the only marketplace data that may
be.

**Scale.** High volume, strongly time-skewed toward recent data.

**Trade-off.** Homing engagements with the requesting workspace means a
provider's own book of work is assembled by reading across grants rather
than from one partition. This is a real query-pattern cost and is
addressed in §36.

## 20 · Conversation

**Why it exists.** Communication bound to a subject, so that what was
decided is part of the record (domain model §15).

**Ownership and lifecycle.** Owned by the subject it is bound to — an
engagement, an asset, a maintenance item, a property, or the workspace.
Bilateral conversations are homed with their subject.

**Messages are immutable.** The original text and its original language
are permanent. **Translations are derived** — a rendering of the original,
cached, rebuildable, and never a substitute for it. Getting this the
wrong way round loses evidence.

**Isolation.** Participants see the thread and exactly the context their
grant allows — not each other's workspaces.

**Deletion and retention.** Messages within an engagement are retained
with the engagement. A participant leaving does not remove their prior
messages; authorship is redacted under §8's separation if erasure
applies.

**Scale.** The highest raw write volume in the platform after events and
telemetry. Operational class, demoting to Historical.

**Trade-off.** Immutable messages mean regretted messages persist. This
is the correct trade for a record that may be evidence in a dispute, and
the product must make people aware of it rather than the architecture
softening it.

## 21 · Workspace Knowledge

**Why it exists.** How a workspace wants things done — binding policy
belonging to the workspace, distinct from memory which belongs to the
property (domain model §18.2).

**Why it is an aggregate and not a projection.** Because it is
*declared*, not derived. A stated budget threshold has no upstream source
to be recomputed from. Inferred-and-confirmed rules become aggregate on
confirmation; unconfirmed observations remain in the Derived class and
may never be enforced.

**Scoped, with precedence.** A rule may apply to the whole workspace, a
property, a location subtree, or an asset class. More specific wins; ties
are surfaced as conflicts rather than silently resolved. This makes scope
resolution a real operation that depends on the location tree — the same
containment requirement as §13.

**Versioned.** Superseded rules are retained, because interpreting a past
decision requires knowing the policy in force at the time. Knowledge is
therefore Knowledge-class for its current state and Historical for its
supersessions.

**Isolation.** Workspace-scoped. Knowledge never generalises to the world
graph — it is policy, not fact, and the promotion rule would reject it
anyway.

**Deletion and retention.** Rules are retired, not deleted.

**Scale.** Small — hundreds to low thousands of rules even for large
enterprises — but consulted on nearly every intelligent operation, which
is why it is Knowledge class rather than Transactional.

**Trade-off.** Stated knowledge decays and the platform will follow a
stale rule faithfully into a bad outcome. Review dates and
override-frequency detection are mitigations; neither is a solution, and
the domain model records this as open.

## 22 · Subscription and Billing

**Why it exists.** The commercial wrapper around a capability bundle
(domain model §24).

**Two aggregates.** The **subscription** — mutable, workspace-scoped,
granting capabilities. The **financial record** — invoices, charges,
payments, payouts — **immutable and permanent**, because financial
history is statutory evidence in every jurisdiction the platform will
enter.

**Subscriptions grant capabilities; they do not gate data.** A lapsed
subscription withdraws capability grants (§11), and §11's rule applies:
behaviour is removed, data is not.

**Multi-currency and multi-jurisdiction from the start.** Every financial
record carries its currency and the jurisdiction whose rules governed it,
at the time it was created. Retrofitting this is among the most painful
migrations in commercial software, and it costs nothing now.

**Future consolidated billing.** Workspace groups (domain model §5) will
require one commercial relationship across many workspaces. The
architecture keeps this open by making the payer a reference rather than
an assumption — a subscription's paying party need not be the workspace
itself.

**Isolation.** Workspace-scoped, with financial records additionally
visible to the paying party where these differ.

**Deletion and retention.** Never deleted. Statutory retention, typically
seven to ten years minimum and longer in several target markets.

**Scale.** Modest volume, disproportionate correctness requirements.

**Trade-off.** Immutable financial records mean corrections are
credit-and-reissue rather than edits. This is standard practice and
non-negotiable.

---

# Part IV — The Event Backbone

## 23 · Events

**Why it exists.** Six services need to know what happened — timeline,
notifications, analytics, audit, search and knowledge. Either every
feature updates six things, or every feature states one fact and the six
derive themselves (domain model §16).

### Event-first, not event-sourced — and why

This is one of the most important decisions in the document, because the
two are easily conflated and their scaling properties differ enormously.

| | Event-sourced | **Event-first (chosen)** |
|---|---|---|
| Current state | Reconstructed by replaying events | Held authoritatively by the aggregate |
| Event's role | The only truth | An immutable factual record, emitted with the change |
| Reading current state | Replay or snapshot | Direct |
| Rebuild cost | Grows without bound | Bounded — only projections rebuild |
| Schema evolution | Every old event must stay interpretable to reconstruct state | Old events must stay interpretable to *consumers*, a weaker requirement |

**Full event sourcing was considered and rejected.** At 100 million users
and a decade of history, reconstructing an enterprise workspace's current
state from its complete event history is an operation whose cost grows
forever and whose correctness depends on every historical event version
remaining perfectly interpretable. Snapshotting mitigates it and
reintroduces the authoritative-state problem it was meant to remove.

Event-first keeps every benefit that motivated events — one factual
record, six derived consumers, complete history, replayable projections —
without making the read path depend on history. **The events remain
complete and immutable; they are simply not the only truth.**

### What makes an event trustworthy

Per the domain model, and binding here: a statement of fact in the past
tense; immutable once emitted; carrying its workspace, actor, subject and
time; emitted **within the same transaction as the change it describes**,
so a change without an event is impossible; and meaning the same thing
forever.

**Canonical events** are a versioned, platform-scoped contract. A new
event type is additive. An existing type's meaning never changes — a new
version is a new type, and both remain interpretable for as long as
consumers exist.

**Consumers derive; they never write back.** Timeline, notifications,
analytics, audit, search, knowledge and read models all read the event
stream. None of them writes to an aggregate as a consequence, because a
consumer that writes back creates a cycle in which no one can say what
caused what.

**Ordering — and the guarantee is deliberately narrow.** The intuitive
choice is total ordering within a workspace. **That was rejected**: a
workspace with two hundred thousand assets and hundreds of concurrent
actors would have every write serialised through one ordering point, and
the platform's largest and most valuable customers would be its slowest.

The guarantee is therefore:

> **Events are totally ordered per subject** — per asset, per workflow
> instance, per engagement, per conversation. A workspace's stream is a
> merge of its subjects' streams, and carries **no** total order across
> them.

This is the ordering that actually carries meaning: what happened to
*this* boiler, in order, is a real question; whether a boiler event
preceded an unrelated invoice event elsewhere in the same enterprise is
not. Consumers must never depend on cross-subject ordering, and any
projection that does is a design error rather than a reason to strengthen
the guarantee.

**Causality where it genuinely spans subjects** — a quote acceptance that
opens a conversation and grants access — is expressed by events carrying
an explicit causal reference, not by relying on arrival order.

**Idempotency is mandatory.** At-least-once delivery is the only honest
assumption at this scale, so every consumer must produce the same result
when an event is delivered twice.

**Isolation.** Every event carries its workspace. Platform-scoped
consumers may only aggregate under the promotion rule (§6).

**Deletion and retention.** Historical class, retained indefinitely.
Personal identifiers follow §8's separation, so erasure never requires
deleting or rewriting an event.

**Scale.** The highest-volume aggregate in the platform. Naturally
partitioned by workspace and time; the workspace partition is what makes
this tractable at ten million tenants.

**Trade-off.** Event schemas are long-lived public contracts, and
modelling a fact well enough that it is still meaningful in a decade is
real recurring discipline. This is the price of everything in Part V.

## 24 · Projections and Read Models

**Why they exist.** Aggregates are shaped for correct writing.
Projections are shaped for the questions actually asked — and those
questions change far more often than the facts do.

**Rules that keep projections honest:**

1. **A projection names its sources** and can be rebuilt from them alone.
2. **A projection is never written by a user action.** If a user can
   change it directly, it is an aggregate.
3. **A projection carries the tenancy of its sources.** No projection may
   widen visibility (§5).
4. **A projection may lag**, and every consumer must tolerate that. Where
   lag is unacceptable — an access decision, a financial check — read the
   aggregate.
5. **A projection may be dropped and rebuilt** at any time, which is what
   makes changing read models a routine operation for a decade rather
   than a migration each time.

**Rebuild is a first-class capability, not an emergency procedure.**
Changing how the timeline groups events, or what the memory considers,
must be a rebuild rather than a data migration. At ten million workspaces
this must be incremental and per-workspace — a global rebuild is not
available, and any projection whose rebuild cannot be scoped to one
workspace is a design error.

---

# Part V — Derived Intelligence

## 25 · Timeline

**What it is.** The chronological record of what has happened to a
property, location or asset — derived from events, never maintained
separately (domain model §17).

**Classification.** Projection, Derived class.

**The ownership subtlety.** The domain model says the timeline follows the
*property*, not the workspace. Since properties are stewarded for
periods (§12), the timeline's access boundary is dynamic:

> A timeline is keyed by property. Access is evaluated through
> stewardship periods: **a workspace may read the segment of a property's
> timeline that falls within its own stewardship period.**

This preserves both requirements without contradiction. The property
keeps one continuous history; a steward sees their own period; a previous
steward neither loses their record nor gains sight of what came after;
and the domain model's open question about transfer on sale stays open,
because widening a steward's window is a policy change rather than a
redesign.

**Retention.** The timeline itself may be rebuilt at will; the events
beneath it are permanent.

**Scale.** Read constantly, per property. Naturally bounded by property
rather than workspace, which keeps even an enterprise's individual
property timelines small.

**Trade-off.** Segment-scoped access means a full-property view requires
combining segments the current steward may not see all of. Correct, and
occasionally surprising to users, who must be told what they are not
seeing rather than shown a gap.

## 26 · Property Memory

**What it is.** The platform's understanding of a specific property —
interpretation, always revisable, never the system of record (domain
model §18.1).

**Classification — and a correction the Rebuild Test forced.** Memory is
derived from the timeline, so it looks like a pure projection. But the
domain model requires it to be **versioned and traceable**, and a pure
projection loses its history the moment it is rebuilt. So:

> **Current memory is a projection.** It may be recomputed at any time.
>
> **Published memory versions are an aggregate**, append-only and
> Historical: what the platform believed, when it believed it, and which
> facts supported it.

Without this split, rebuilding a projection would silently destroy the
record of what the platform told a customer last year — which matters
when a customer acted on it. This was found during review and is recorded
as §36 finding 1.

**Isolation.** Workspace-scoped through the property's stewardship.
Generalisation to the world graph only under the promotion rule (§6).

**Retention.** Current memory: none guaranteed. Published versions:
permanent.

**Scale.** One evolving interpretation per property, plus a version
history that grows slowly. Small relative to events.

**Trade-off.** Retaining published versions costs storage and creates an
obligation to explain superseded conclusions. Accepted: an interpretation
the customer acted on is part of the record of why they acted.

## 27 · Knowledge Graph and World Graph

**What it is.** Understanding held as connections between things rather
than records about things (domain model §19.2). The most demanding
structure in this document.

### Two tiers, three classifications

| Tier | Content | Classification |
|---|---|---|
| **Workspace graph — derived edges** | Relationships implied by aggregates: this asset is in this location, was serviced by this provider, is documented by this certificate | *Projection* |
| **Workspace graph — asserted edges** | Relationships a human stated that no aggregate implies: these two assets are functionally dependent; this provider is excluded | **Aggregate** |
| **World graph** | Manufacturers, models, parts, compatibility, regulations, general failure patterns | **Aggregate**, platform-scoped, curated |
| **World graph — inferred edges** | Patterns derived by aggregation across workspaces | *Projection* |

**Asserted and inferred stay permanently distinguishable.** An asserted
edge is a fact someone stated. An inferred edge carries confidence and is
revisable. This is the same fact-versus-interpretation line drawn
everywhere else, and it exists so the platform never presents its own
inference as an established fact.

### Why this structure scales

The obvious fear is a single global graph traversed across ten million
tenants. **That structure does not exist here**, and its absence is
deliberate:

- **The workspace graph never spans workspaces.** Traversal is bounded by
  one tenant — thousands of nodes for a household, millions for a large
  enterprise, but never global.
- **The world graph is small, read-mostly, and shared.** Manufacturers,
  models, parts and regulations number in the millions, not the billions,
  and change slowly. It replicates to every region cheaply.
- **A query touches one workspace graph plus the world graph.** Never two
  workspace graphs. There is no query in the platform that legitimately
  traverses from one tenant's asset to another tenant's asset.

**The promotion rule is the only path between tiers** (§6), it is
one-way, and it operates on aggregates rather than individual facts.

**Retention.** Workspace derived edges: rebuildable. Asserted edges and
world graph: permanent, versioned.

**Trade-off.** A graph degrades quietly — a missing edge produces a worse
recommendation, not an error — so quality problems are hard to detect.
Over-connection is equally real: relating everything to everything
produces noise indistinguishable from insight. Both are ongoing
operational concerns rather than one-time design ones.

## 28 · Digital Twin

**What it is.** The platform's evolving representation of a real property
— property, locations, assets, documents, maintenance, service records,
events, timeline, memory, knowledge and relationships, as one thing
(domain model §9.2).

**Classification: the twin is a logical composition, not a stored
object.** This is a deliberate and important decision.

> **The Digital Twin is not materialised.** It is the name for the
> composition of aggregates and projections that already exist. Nothing
> is stored *as* a twin.

**Why.** Materialising ten million twins would duplicate nearly every
aggregate in the platform into a second representation that must be kept
in sync — a direct violation of Principle 1 and Principle 9, and an
enormous ongoing cost for a structure whose parts are each already
optimally shaped for their own access patterns.

**What may be materialised** is narrow and specific: small summary
projections where a composition is expensive and frequently read — a
property's current condition summary, an asset count by type, an
outstanding-obligation roll-up. These are ordinary Derived projections
that name their sources, not a twin.

**Why naming it still matters.** Because it is the stated attachment
point for future technology (§35). IoT, BIM, floor plans, building
automation and energy monitoring each attach to the twin's *parts* —
observations to assets, spatial attributes to locations, actions to
assets — and the twin is what makes it obvious that they attach to
something that already exists rather than requiring something new.

**Trade-off.** An unmaterialised twin means "show me everything about
this property" is an assembly rather than a fetch. Accepted: the
alternative duplicates the platform.

## 29 · Provider Intelligence

**What it is.** Reasoned selection over every supply source — internal
teams, contracted providers, trusted providers, manufacturer networks,
marketplace supply and future external directories (domain model §14.4).

**Classification — and a second correction from the Rebuild Test.**
Scoring is derived from service records, knowledge, documents and
availability. But two things are not:

> **Provider scores are a projection.** Rebuildable at any time.
>
> **Provider decisions, recommendations shown, and customer overrides are
> an aggregate**, append-only and Historical.

A recommendation the customer acted on, and an override they made, are
facts about what happened — not interpretations to be recomputed.
Recording them is also the only way to detect stale Workspace Knowledge
(the domain model's open question about decay) and the only way to
resolve a dispute about why a provider was chosen. Recorded as §36
finding 2.

**Explainability is a data requirement, not a feature.** The domain model
requires a recommendation to be explainable. That means the *inputs* to a
recommendation — which records, which rules, which certifications — are
captured with the decision, because recomputing an explanation later
against changed data produces a different explanation, which is worse
than none.

**Isolation.** Scoring for a workspace uses that workspace's records and
knowledge plus platform-scoped world facts and the provider's own
published profile. **It never reads another customer's service records.**
Cross-customer provider quality reaches it only as promoted aggregates
(§6), which is what keeps reputation from becoming a leak.

**Trade-off.** The liquidity conflict the domain model records as open —
optimising per customer starves new supply — is not resolved by the data
architecture. What the architecture provides is the record needed to
resolve it deliberately: decisions and overrides are captured, so the
effect of any selection policy is measurable rather than assumed.

---

# Part VI — Platform Services

## 30 · Search

**All search is projection.** Eight domains, one engine, one rule.

| Domain | Scope | Sources |
|---|---|---|
| **Workspace search** | One workspace, everything in it | All workspace aggregates |
| **Property search** | Properties a member may see | Property, location, stewardship |
| **Asset search** | Assets, including facets | Asset, facets, placements |
| **Conversation search** | Threads the member participates in | Messages, originals and translations |
| **Document search** | Documents and their content | Metadata and extracted content |
| **Knowledge search** | Rules and policies in force | Workspace Knowledge, versioned |
| **Provider search** | Published supply | Provider profiles, published only |
| **Global search** | Platform-scoped facts | World graph, catalogues |

**The rule that governs all of them:**

> **Scope is indexed, never post-filtered.** Every indexed item carries
> its workspace and, where scoped roles apply, its position in the
> location tree. Filtering happens as part of retrieval.

Post-filtering fails twice: it is slow, because it retrieves what it will
discard, and its failure mode is disclosure rather than error. At this
scale that is unacceptable.

**Two domains are categorically different and must not be blended.**
Provider search and global search operate over *published* and
*platform-scoped* data. A provider workspace's own properties, assets and
internal maintenance are private data that happens to live in a workspace
that also publishes a public profile. Nothing enters public indexes
implicitly.

**Rebuild is routine.** Indexes are Derived class and rebuilt
per-workspace, incrementally, as a normal operation.

**Trade-off.** Indexing scope means re-indexing when scope changes —
re-parenting a location subtree, revoking a membership. This is real work
and it is the correct trade against the alternative.

## 31 · Analytics

**Six domains, deliberately separate.** They are not separated because
their questions differ — questions can share infrastructure — but because
their **privacy boundaries, retention obligations, consistency
requirements and consumers differ**, and each of those differences is a
reason on its own.

| Domain | Scope | Contains individual detail? | Consumer |
|---|---|---|---|
| **Operational** | Platform health, throughput, errors | No customer data | The operator |
| **Business** | One workspace's own performance | Yes — its own | That workspace |
| **Marketplace** | Supply, demand, liquidity, conversion | Aggregate only | The operator |
| **Property** | Asset and building behaviour over time | Yes — within the workspace | That workspace, and memory |
| **AI** | Prediction accuracy, recommendation outcomes | Aggregate + own-workspace | The operator, and the learning loop |
| **Enterprise** | Cross-site, cross-period customer reporting | Yes — its own, at depth | That customer |

**Why separation is architectural rather than organisational:**

1. **Privacy boundaries differ absolutely.** Business, Property and
   Enterprise analytics are workspace-scoped and may hold individual
   detail. Marketplace and AI analytics are platform-scoped and may hold
   **only** promoted aggregates. Merging them would put the promotion
   rule at the mercy of a query.
2. **Retention obligations differ.** Enterprise reporting may be
   contractually retained for years; operational metrics are worthless
   after weeks.
3. **Failure tolerance differs.** Operational analytics going down is an
   inconvenience. Enterprise reporting being wrong is a contractual
   breach.
4. **Load profiles differ.** A five-year, two-hundred-site enterprise
   report and a real-time liquidity dashboard have nothing in common
   except the word "analytics."

**Isolation is the point.** A single analytics store spanning all six is
the most likely place for a tenancy leak in the entire architecture,
because analytical queries are written ad hoc and aggregation looks safe
until it is not. Keeping platform-scoped and workspace-scoped analytics
physically separate makes the dangerous query impossible to write rather
than merely discouraged.

**Trade-off.** Six domains mean some duplicated pipeline work and some
questions that are awkward to ask across domains — deliberately so, since
those are exactly the questions that cross the boundary.

## 32 · Notifications

**The tension.** Notifications *belong to* workspaces but are *delivered
to* an identity (domain model §20). A person must not have to switch
workspaces to discover something needs them.

**The resolution in data:**

> **Notification records are workspace-scoped.** The **inbox is an
> identity-scoped projection** over the notifications of every workspace
> where that identity holds a live membership, each item labelled with
> its workspace.

**Why this is not a crossing.** The inbox contains only what the identity
is already entitled to see, filtered by live membership at read time.
Revoking a membership removes its items. It is a convenience projection
over existing entitlements, not a widening of them — which is why §6's
registry does not list it.

**Delivery receipts are an aggregate.** Whether something was delivered,
seen and acted upon is a fact, not a derivation, and escalation depends
on it.

**Preferences are per-membership**, not per-identity and not
per-workspace — a person may want everything from their business and only
urgent matters from their home.

**Scale.** The fan-out concern is real: one workspace event can notify
thousands of members in a large enterprise. The architecture keeps
notification generation workspace-scoped and the inbox a read-time
composition, so fan-out is bounded by workspace membership rather than
platform size.

**Trade-off.** A read-time composition across a person's workspaces costs
more per read than a materialised per-person inbox. Accepted, because a
materialised inbox would hold copies of workspace data outside the
workspace boundary — exactly the leak this design avoids.

## 33 · Audit

**Why it exists.** Who did what, in which workspace, when, and under what
authority (domain model §23). Enterprise procurement requires it;
regulated industries cannot buy without it.

**Audit is an aggregate, not a projection — and this is deliberate.** It
looks derivable from events, and it must not be, for three reasons:

1. **Audit records things events do not.** A denied access attempt, a
   failed authentication, a permission check that refused — these are not
   domain facts about the business, and they do not belong in the event
   stream that timelines and memory consume.
2. **Audit must be independently trustworthy.** A record derived from
   another record inherits its weaknesses. Auditors ask what the audit
   trail says, not what it was computed from.
3. **Different retention and different access.** Audit is retained by
   jurisdictional obligation and is visible to administrators and
   regulators, not to ordinary members.

**Append-only, permanent, never edited.** What must be captured: every
permission and membership change, every access grant and revocation,
every capability change, every commercial change, every export or
erasure, every administrative action, and **every action taken by the
platform's intelligence on a person's behalf**, marked as
machine-originated.

**Isolation.** Workspace-scoped, with platform-level administrative
actions in a platform-scoped audit domain.

**Trade-off.** A separate audit path means two things record overlapping
information, which looks like duplication. It is not: they record
different facts for different consumers under different guarantees, and
collapsing them would compromise both.

---

# Part VII — Behaviour and Growth

## 34 · The Capability Engine in Data

The domain model's Principle 1 says a workspace is defined by its
capabilities, not its type. This section says exactly what that means for
data, because it is where One Engine is most easily lost.

**The governing rule:**

> **A capability may gate behaviour and may add optional facets to an
> existing aggregate. It may never create a parallel aggregate for a
> concept that already exists, and it may never change who owns one.**

**What a capability may do:**

- **Gate writes.** Without Procurement, no approval steps may be created.
- **Gate reads.** Without Analytics, reporting projections are not built
  or served for that workspace.
- **Add a facet.** Fleet Management adds a vehicle facet to Asset (§14).
  Compliance adds an obligation facet to Maintenance.
- **Add workflow definitions** to the catalogue available to that
  workspace (§18).
- **Add projections.** A capability may introduce read models; it may not
  introduce a second source of truth.

**What a capability may never do:**

- Create a second representation of an existing concept. There is no
  "enterprise asset" or "commercial property."
- Change an aggregate's owner or isolation boundary.
- Make existing data unreachable when withdrawn (§11).
- Be checked in place of a permission. **Both gates always apply** —
  capability answers whether the behaviour exists in this workspace;
  permission answers whether this member may perform it.

**Why this preserves One Engine at the data layer.** Because there is
nowhere to put a fork. A requirement that seems to need a parallel
structure is either a facet on an existing aggregate, a workflow
definition, a projection, or a genuine gap in the domain model requiring
an ADR. The absence of a fourth option is the whole mechanism.

**Capability resolution is part of the request context**, alongside
identity, workspace and membership. It is resolved once, cached with that
context, and consulted without further lookups — which is what keeps a
gate on every operation from becoming a cost on every operation.

**The coupling this creates, named rather than hidden.** The request
context is the hottest cached structure in the platform, and it depends
on four things with very different change rates:

| Component | Changes | Invalidation |
|---|---|---|
| Identity | Rarely | Cheap |
| Capability grants | Rarely | Cheap |
| Membership role and state | Occasionally | **Must be prompt — this is a revocation path** |
| Membership *scope*, when expressed as a location subtree | Whenever the location tree is re-parented | **Indirect, and easily missed** |

The fourth row is the subtle one. A scoped membership means "these
locations," and re-parenting a location subtree silently changes what
that scope covers. A cached context computed before the move is wrong
afterwards, and nothing about the membership record itself has changed to
signal it.

**The rule this imposes:** a location tree change is a **scope-affecting
event** that must invalidate dependent contexts and trigger re-indexing
(§30), exactly as a membership change does. Treating tree edits as
ordinary content changes is the mistake this section exists to prevent,
and it is recorded as a residual risk in §37 because it depends on
discipline in a place where the connection is not obvious.

## 35 · Future-Proofing Demonstration

The test: can each of these be added **without redesigning the
database**? Each row states what it actually is in this architecture.

| Future capability | What it is here | New aggregates? |
|---|---|---|
| **IoT** | Observations attached to assets, arriving as events; a connected facet on Asset | None — new event types, one facet |
| **Building Automation** | Assets that accept actions; actions are events under a member's authority; a workflow definition per automated process | None |
| **Smart Home** | Building Automation with a Personal preset and consumer language | None |
| **Energy Management** | Sensor observations aggregated at location and property level, interpreted by memory | None — a projection |
| **Insurance** | A claim is a workflow over existing evidence; policies are documents with validity | None |
| **ERP integration** | Event subscription outward, reference data inward | None |
| **Accounting integration** | Billing and financial records exposed through integration | None |
| **Fleet** | A vehicle facet on Asset with usage-based obligations | None — one facet |
| **Compliance** | Obligation facets on Maintenance, validity on Documents, statutory workflow definitions | None |
| **Municipality** | Facility management at civic scale; jurisdiction-specific taxonomies and definitions | None |
| **White Label** | Branding, taxonomy and terminology as workspace and platform configuration | None |
| **Public APIs** | Read and write against existing aggregates, gated by capability and permission | None |

**Not one requires a new aggregate.** Each is a facet, a workflow
definition, a new event type, a projection, or configuration. That is the
test the Capability Engine exists to pass, and passing it here — before
any of them is built — is the point of doing this milestone before the
schema.

**The honest caveat.** "No new aggregates" is not "no work." Each of
these needs facets designed, event types defined, workflows authored and
projections built. The claim is narrower and more valuable: **none of
them requires changing what already exists.**

---

# Part VIII — Review and Closing

## 36 · Design Review at Scale

A full adversarial review was performed against a target of 100 million
users, 10 million workspaces, multi-region deployment, consumer and
enterprise workloads, AI-first operation, and continuous expansion over
ten years. The brief was to find weaknesses rather than to defend
decisions.

**Eleven findings. Nine were corrected in this document; two are
recorded as residual risks in §37.**

### Finding 1 · Property Memory versions would be destroyed by rebuild

**Severity: high. Corrected.** Memory was classified as a pure
projection, but the domain model requires it to be versioned and
traceable. Rebuilding a projection destroys its history — so the record
of what the platform told a customer last year, and which they may have
acted on, would vanish on any recomputation. **Correction:** current
memory is a projection; published memory versions are an append-only
Historical aggregate (§26).

### Finding 2 · Provider decisions and overrides were not recorded

**Severity: high. Corrected.** Provider Intelligence was classified
entirely as a projection. But a recommendation shown, a decision taken
and a customer override are facts about what happened, not
interpretations. Without them, disputes are unresolvable, the domain
model's stale-knowledge detection is impossible, and no selection policy
can be measured. **Correction:** scores remain a projection; decisions,
recommendations shown, and overrides are an append-only aggregate (§29).

### Finding 3 · Bilateral objects had no defined home partition

**Severity: high. Corrected.** Service records, engagements and
conversations belong to two workspaces. At ten million tenants the
partition boundary is physical, so an object with two homes is either
duplicated — violating Principle 9 — or requires distributed transactions
on the hot path. **Correction:** the Crossing Registry (§6) assigns every
bilateral object exactly one home partition plus a recorded grant for the
other party. Service records are homed with the property's workspace, for
the retention and residency reasons in §17.

### Finding 4 · Timeline ownership contradicted the tenancy model

**Severity: high. Corrected.** The domain model requires the timeline to
follow the property, not the workspace; the tenancy model requires every
record to carry a workspace. Properties can change steward, so the
boundary is dynamic. **Correction:** stewardship periods are first-class
and append-only (§12), and timeline access is evaluated per segment
against them (§25). This resolves the contradiction without amending the
frozen domain model and keeps its open question about transfer open.

### Finding 5 · Erasure obligations conflicted with immutable history

**Severity: high. Corrected.** Events, audit records, service records and
invoices are immutable and permanent; a person has a legal right to
erasure. Both cannot hold if personal data lives inside those records.
**Correction:** personal identifying data is separated from the durable
record, which refers to people by stable internal reference (§8). Erasure
redacts the identity aggregate; history stays complete and internally
consistent, and the person becomes unidentifiable within it.

### Finding 6 · Event sourcing would not survive the scale

**Severity: high. Corrected.** "Event-first architecture" is easily read
as event sourcing. Reconstructing an enterprise workspace's state from a
decade of events is an operation whose cost grows without bound and whose
correctness depends on every historical event version staying perfectly
interpretable. **Correction:** the architecture is explicitly
**event-first, not event-sourced** (§23). Aggregates hold current state;
events are an immutable factual record emitted transactionally. Every
benefit that motivated events is retained; the read path never depends on
history.

### Finding 7 · The Digital Twin risked being materialised

**Severity: medium. Corrected.** Naming the twin as a first-class concept
invites storing it. Materialising ten million twins would duplicate
nearly every aggregate into a second synchronised representation —
violating Principles 1 and 9 at enormous cost. **Correction:** the twin
is explicitly a logical composition, never stored (§28). Only narrow
summary projections may be materialised, and they are ordinary
projections that name their sources.

### Finding 8 · Search would have leaked through post-filtering

**Severity: high. Corrected.** Search indexes are the most common route
by which a permission model is bypassed, because indexes are built once
and queried by everyone, and post-filtering looks adequate until a filter
is missed. **Correction:** scope is indexed, never post-filtered (§30).
Every indexed item carries its workspace and its position in the location
tree.

### Finding 9 · Analytics was the most likely tenancy leak

**Severity: high. Corrected.** A single analytics store spanning all
domains puts the promotion rule at the mercy of whichever ad-hoc query
someone writes. **Correction:** platform-scoped and workspace-scoped
analytics are kept physically separate (§31), making the dangerous query
impossible to write rather than merely discouraged.

### Finding 10 · Location subtree containment was assumed, not required

**Severity: medium. Corrected.** Scoped permissions, scoped knowledge,
search scoping and roll-up reporting all depend on answering "is this
location within that subtree?" — on the hot path. A design that walks
parents at query time will not survive enterprise depth. **Correction:**
§13 states subtree containment as an explicit first-class requirement
passed to the schema milestone, rather than leaving it to be discovered.

### Finding 11 · Provider query pattern runs against the partitioning

**Severity: medium. Accepted with mitigation, recorded in §37.** Homing
engagements and service records with the requesting or property workspace
means a provider assembling their own book of work reads across many
partitions rather than one. This is a real cost for exactly the users who
use the platform most intensively. Mitigation: a provider-side projection
over their grants, which is Derived class and rebuildable. The
alternative — homing with the provider — was rejected because it puts
property history inside an aggregate that can be archived when a business
closes.

### Second review round

A second pass was run against the corrected document, on the principle
that the first round's fixes are themselves new design and deserve the
same scrutiny. **Seven further findings, all corrected.**

### Finding 12 · Per-workspace event ordering was a serialisation bottleneck

**Severity: high. Corrected.** The first draft guaranteed total event
ordering within a workspace. At two hundred thousand assets and hundreds
of concurrent actors, that serialises every write in the workspace
through one ordering point — making the platform's largest and most
valuable customers its slowest. **Correction:** events are totally
ordered **per subject** (per asset, workflow instance, engagement,
conversation); a workspace stream is a merge with no cross-subject order
(§23). Causality spanning subjects is carried explicitly by the events
rather than inferred from arrival order.

### Finding 13 · Document attachment implied visibility

**Severity: high. Corrected.** Documents attach to many subjects,
including the shared Service Record core. Nothing stated that attaching a
document did not share it — so a firm attaching its internal costing
sheet to a service record for its own convenience would have disclosed it
to the customer, silently and irreversibly. **Correction:** attachment
and sharing are independent (§15). Every document has one owning
workspace and an explicit sharing state; shared-by-default applies to
document *types* set in configuration, never to individual uploads.

### Finding 14 · Facet attributes were undeclared

**Severity: high. Corrected.** Facets were specified as typed extensions
without requiring their attributes to be declared. Open-ended attributes
make new verticals trivial to add and permanently unsearchable,
unreportable and invisible to the intelligence. **Correction:** facet
attributes are declared as platform-scoped configuration (§14, rule 6).
Extensibility without declaration is an opt-out from search, analytics
and the graph rather than a form of flexibility.

### Finding 15 · The promotion rule had no enforcement point

**Severity: high. Corrected.** The rule governing what may leave a
workspace was stated as a principle with no gate — which makes it a
convention, and conventions erode under deadline pressure.
**Correction:** promotion is an explicit, recorded, audited operation
naming what was promoted, from which population, on whose authority
(§6). Ambient cross-tenant aggregation jobs writing platform-level
structures are prohibited outright.

### Finding 16 · Location re-parenting silently invalidated cached scope

**Severity: high. Corrected.** Scoped memberships mean "these locations."
Re-parenting a location subtree changes what a scope covers **without any
change to the membership record** — so a cached request context, and
every search index entry carrying tree position, becomes wrong with
nothing to signal it. **Correction:** a location tree change is a
scope-affecting event that invalidates dependent contexts and triggers
re-indexing, exactly as a membership change does (§34, §13).

### Finding 17 · Recovery expectations were unstated

**Severity: medium. Corrected.** Storage classes defined consistency and
retention but not what happens after a failure — leaving the most
important distinction in the platform (what can be rebuilt versus what
can never be replaced) to be discovered during an incident.
**Correction:** recovery obligations are stated per class (§4), with the
line between Historical and Derived called out explicitly, and verified
restore required for Historical.

### Finding 18 · Service Record annex fate was undefined

**Severity: medium. Corrected.** The core's permanence was specified; the
annexes' behaviour on business closure and stewardship transfer was not,
leaving open whether a previous steward's private commercial context
transfers with the property. **Correction:** annexes follow their own
workspace (§17). A previous steward's private context stays with them;
only the shared core follows the property — which is precisely the
material the domain model intends a property's history to be.

### What the review did not find

No violations of the One Engine Principle were found in either round. The
facet mechanism (§14) and the capability rules (§34) were tested against
fleet, compliance, IoT, white-label and municipality requirements and
none produced a parallel structure. No aggregate has two owners after
Finding 3. No projection is unrebuildable after Findings 1 and 2. No
platform-level crossing was added beyond the two the domain model already
records.

**Review status: closed.** A third pass produced no findings of
architectural significance. Remaining concerns are operational or
depend on discipline rather than structure, and are recorded in §37.

## 37 · Residual Risks

Named because an architecture that lists only its strengths cannot be
evaluated.

**1 · Workspace size skew is extreme.** Most of ten million workspaces
hold one property and a few dozen records; a handful hold hundreds of
thousands of assets and millions of records. Any per-workspace strategy —
partitioning, rebuild, caching, backup — must handle four orders of
magnitude of variation. This is the defining operational characteristic
of the platform and it will require deliberate handling of large tenants
rather than a uniform policy.

**2 · Provider cross-partition reads** (Finding 11). Mitigated by a
projection, but the mitigation adds a structure that must stay correct as
grants change.

**3 · Membership and capability caching versus prompt revocation.** Both
are consulted on nearly every request and both must be cached to be
affordable. Revocation must propagate quickly, and the window between
revocation and propagation is a real exposure that must be bounded
explicitly rather than left to cache expiry defaults.

**4 · Cross-region bilateral objects.** §7 gives a rule, but a genuinely
global marketplace will produce engagements spanning residency regimes
that no rule satisfies cleanly. The likely practical outcome is
residency-compatible matching, which constrains the marketplace before it
constrains the architecture.

**5 · Two platform-level structures already cross the workspace
boundary** — world graph and platform analytics — as the domain model's
§32 notes. This document adds none. A third should be treated as a
significant decision.

**6 · Knowledge decay has no detection mechanism.** The architecture
records overrides (Finding 2), which makes detection *possible*. Nobody
has designed it.

**7 · Event contract discipline is a permanent tax.** Every event type is
a decade-long commitment. This will be got wrong at least once, and the
recovery path — a new type, both retained — must be accepted as normal
rather than treated as failure.

**8 · Location re-parenting is a scope-affecting operation that does not
look like one** (Finding 16). The architecture states the requirement,
but the connection between "someone reorganised the building" and "access
scopes and search indexes must be recomputed" is not obvious to whoever
implements the tree edit. This is the most likely place for a correct
architecture to be implemented incorrectly.

**9 · Document sharing depends on configuration being right** (Finding
13). Attachment and sharing are now independent, but the safety of the
default rests on document *types* being classified correctly in
configuration. A type misclassified as shared discloses every document of
that type, retroactively.

**10 · Declared facet attributes trade flexibility for reachability**
(Finding 14). Adding a vertical now requires declaring its attributes
before its data can exist, which is slower than an open-ended bag and
will feel like friction at exactly the moment someone is trying to close
a deal. The friction is the point, and it will be argued against.

## 38 · Consistency Audit

Full audit against `PLATFORM_DOMAIN_MODEL.md` Version 1.0. **No
contradictions found.** Three places required a decision the domain model
deliberately left open; each is recorded below, and each keeps the open
question open.

| Domain model requirement | Where satisfied | Notes |
|---|---|---|
| P1 Capability — no branching on type | §34 | Facets and gates; type carries no behaviour (§9) |
| P2 One Engine | §34, §14, §35 | Tested against twelve future capabilities |
| P3 One Identity | §8 | One aggregate; erasure by separation |
| P4 Context over Roles | §10 | Permission at membership, append-only history |
| P5 Workspace | §5 | Every record carries it |
| P6 Property | §12 | Stewardship as periods |
| P7 Location | §13 | Recursive; containment required explicitly |
| P8 Asset | §14 | Facets; placements as periods |
| P9 Marketplace between workspaces | §19, §6 | Bilateral with one home partition |
| P10 Intelligence before Marketplace | §19 | Non-marketplace strategies produce the same records |
| P11 Outcome Over Activity | §19 | Outcomes earning nothing are recorded |
| P12 AI | §27, §29 | Graph tiers; bounded reach via capability and permission |
| P13 Subscription | §22 | Workspace-scoped; grants capabilities |
| P14 Mirror Test | §14, §35 | One asset engine from dishwasher to production line |
| Rule 1 · capability not type | §34 | |
| Rule 2 · two gates | §34, §11 | Both always apply |
| Rule 3 · withdrawal removes behaviour not data | §11 | Binding on every capability-gated feature |
| Rule 8 · recursive physical model | §13, §14 | Both nest |
| Rule 10 · everything belongs to a workspace | §5, §6 | Three levels; crossings enumerated |
| Rule 11 · one permission path | §5, §30 | No post-filtering |
| Rule 12 · crossings explicit and bounded | §6 | Closed registry |
| Rule 14 · Service Record one shared object | §17 | Core plus annexes |
| Rule 15 · workflows versioned configuration | §18 | Instances pin their version |
| Rule 16 · facts and interpretations separate | §3, §26, §27 | Asserted versus inferred throughout |
| Rule 17 · events single source of what happened | §23 | Event-first |
| Rule 18 · memory to property, knowledge to workspace | §26, §21 | |
| Rule 19 · knowledge binding | §21 | Aggregate, not projection |
| Rule 20 · promotion rule | §6, §27 | One-way, aggregate-only |
| Rule 21 · intelligence acts under authority | §29, §33 | Decisions recorded; audited as machine-originated |

**Three decisions taken where the domain model left the question open.**
Each was necessary to make the model implementable, and none forecloses
the domain model's eventual answer:

1. **Timeline access under changing stewardship** (§25). The domain model
   says the timeline follows the property and leaves transfer-on-sale
   open. This document scopes access to stewardship periods, which is the
   narrowest interpretation. Widening it later — if memory is decided to
   transfer with a house — is a policy change, not a redesign.
2. **Workspace ending** (§9). The domain model records the tension
   between erasure and other parties' legitimate references without
   resolving it. This document chooses **archival, never deletion**, plus
   §8's identifier separation, which honours both obligations without
   deciding the philosophical question.
3. **Service Record home partition** (§17). The domain model requires one
   shared object without saying where it lives. This document homes it
   with the property's workspace, on retention and residency grounds. The
   performing workspace's permanent grant preserves the domain model's
   requirement that a business's record of its own work cannot be taken
   away.

**One clarification recorded, not a contradiction.** The domain model
§32 counts the world graph and platform analytics as the two
platform-level structures crossing the workspace boundary. This document
introduces the identity-scoped notification inbox (§32 here), which is
*not* a third crossing: it composes only what an identity is already
entitled to see, filtered by live membership at read time. It is
classified as identity-scoped in §5 rather than as a crossing in §6, and
the distinction is deliberate.

## 39 · What the Schema Milestone Inherits

The next milestone designs the physical schema. It inherits these
non-negotiables:

1. **Every record carries its workspace.** Tenancy is data, not query
   discipline.
2. **Subtree containment is a first-class operation** for locations and
   nested assets (§13).
3. **Service Record visibility is core-plus-annexes** with the
   classification in §17 — the highest-risk surface in the architecture.
4. **Personal identifiers are separable from durable records** (§8).
   Erasure must never require rewriting history.
5. **Events are emitted in the same transaction as the change they
   describe.** A change without an event must be impossible.
6. **Append-only means append-only** for events, audit, transitions,
   amendments, stewardship periods, placements, membership changes,
   capability grants, published memory versions and provider decisions.
7. **Projections are rebuildable per workspace, incrementally.** A
   projection requiring a global rebuild is a design error.
8. **Workflow instances pin their definition version** permanently.
9. **No capability may create a parallel representation** of an existing
   concept (§34).
10. **Platform-scoped and workspace-scoped analytics stay physically
    separate** (§31).
11. **Events are ordered per subject, not per workspace** (§23). No
    projection may depend on cross-subject ordering.
12. **Document attachment never implies sharing** (§15). Sharing is
    explicit, and defaults come from document type configuration.
13. **Facet attributes are declared before use** (§14). No open-ended
    attribute bags.
14. **Location tree changes invalidate scopes and indexes** (§34). A
    re-parent is a scope-affecting event, not a content edit.
15. **Promotion to platform scope is an audited operation** (§6). No
    ambient cross-tenant aggregation.

Anything the schema cannot express within these constraints is a finding
against this document — to be raised and recorded as an ADR, not designed
around.

---

Version 1.0 — 2026-08-11 (Milestone 2 — the data architecture
implementing `PLATFORM_DOMAIN_MODEL.md` Version 1.0, reviewed at
100M-user scale in §36 and audited for consistency in §38)

# ADR-0019: The canonical platform Event Envelope

**Status:** Accepted
**Date:** 2026-08-12
**Related:** `../architecture/PLATFORM_DOMAIN_MODEL.md` §16,
`../architecture/DATABASE_ARCHITECTURE.md` §23,
`../architecture/SYSTEM_ARCHITECTURE.md` §5 §12.1,
`../architecture/SUPABASE_ARCHITECTURE.md` §12 §19 §24,
[ADR-0004](0004-domain-events-via-security-definer-rpc.md) (legacy
mechanism, not superseded)

## Context

An external architecture review conducted before Epic 01 raised one P0
finding: **the event envelope was under-specified, and Epic 01 creates
the events table.**

The frozen documents commit to events as the platform's spine —
`PLATFORM_DOMAIN_MODEL.md` §16 requires an event to carry *"its
workspace, its actor, its subject and its time"*, and
`DATABASE_ARCHITECTURE.md` §23 calls canonical events *"a versioned,
platform-scoped contract"* whose meaning must survive a decade. Six
derived services consume that stream.

Four fields are not enough to run it. There was no request-scoped
identifier for tracing one action through an asynchronous fan-out, no
explicit parent reference, no schema version, and no named ordering
field.

**Why this was P0 rather than deferred work.** Epic 01 WP 01.04 creates
`platform.events` — hash-partitioned by workspace, range-partitioned by
time, expected to hold billions of rows, and explicitly designed never to
be rewritten. Adding an envelope column afterwards means rewriting every
partition of the one table built on the assumption that it never would
be. Every other review finding gets no more expensive with time. This one
gets orders of magnitude more expensive the day Epic 01 ships.

## Decision

**Adopt a canonical Event Envelope carried by every domain event,
identical across every engine, immutable once written.**

**Eleven concepts, thirteen columns.** `actor` and `subject` are each
composite — an actor is a *kind* plus a *reference*, a subject is a
*type* plus an *identity* — and splitting them is what makes "what did
the intelligence do?" and "what happened to this asset?" answerable
without parsing. The architecture documents count columns (thirteen);
this ADR counts concepts where it discusses them and columns in the table
below. Both numbers describe the same envelope.

### The membership rule

> **A field belongs in the envelope if and only if a consumer needs it
> without knowing what the event type means.**

Everything else is payload. This rule decides every field below and is
the test for any future proposal. Routing, ordering, tracing, tenancy,
retention and replay are all performed by infrastructure that must never
parse a payload to do its job.

### The fields

| Field | Type | Purpose |
|---|---|---|
| `event_id` | UUIDv7 | Identity; the idempotency key every consumer deduplicates on |
| `event_type` | text | Dispatch. `<engine>.<aggregate>.<past-participle>` |
| `event_version` | smallint | Additive payload revisions |
| `workspace_id` | uuid, **not null** | Tenancy; hash partition key |
| `actor_type` | enum | `person` · `system` · `integration` · `intelligence` |
| `actor_ref` | uuid/text | Person reference or system identifier. **No foreign key** |
| `subject_type` | text | What the event is about |
| `subject_id` | uuid | Which one |
| `subject_sequence` | bigint | Gapless order within a subject |
| `occurred_at` | timestamptz | When it became true; range partition key |
| `correlation_id` | UUIDv7 | Everything caused by one originating action |
| `causation_id` | uuid, nullable | The direct parent |
| `is_derived` | boolean, **not null** | Canonical fact, or regenerable inference |

Ten were specified in the reviewed envelope; `is_derived` resolves the
open question below.

### Additive versions and semantic types

`DATABASE_ARCHITECTURE.md` §23 states *"a new version is a new type."*
That rule governs **meaning** and is preserved exactly. `event_version`
governs **shape**:

- **Additive change** — a new optional field, every existing consumer
  still correct without modification. Increment `event_version`.
- **Semantic change** — the event means something different, or an
  existing field changes interpretation. **Mint a new `event_type`.** The
  old type keeps its meaning forever.

Both are needed. Without the rule, meaning drifts silently and consumers
of a five-year-old event are quietly wrong. Without the field, adding one
optional attribute forces a type rename and a dual-write migration across
every consumer — a cost so high that teams instead overload existing
fields, which is how meaning drifts anyway.

### `correlation_id` and `causation_id`

They answer different questions and neither substitutes for the other.

**`correlation_id` answers "what did this action cause?"** It is
generated once, at the API Gateway — already the single place a request
context is resolved (`SYSTEM_ARCHITECTURE.md` §12.1) — and propagated
unchanged through every command and into every resulting event,
**including events emitted by consumers reacting to earlier events.** One
customer accepting a quote produces events from Marketplace, Workspace,
Conversation, Service Record, Notification and Analytics. Without a
shared identifier, no one can group them after the fact, and the
platform's default posture is asynchronous fan-out (§5).

**`causation_id` answers "what caused this one?"** It records the direct
parent, giving the tree its edges rather than only its membership.
Correlation without causation tells you a hundred events belong together
but not which produced which — inadequate for debugging a cascade.
`DATABASE_ARCHITECTURE.md` already requires *"an explicit causal
reference"* for causality spanning subjects; this names it.

### Immutability

**Every envelope field is immutable once written.** Events are
append-only Historical-class data; `PLATFORM_DOMAIN_MODEL.md` §16 already
requires it. The envelope adds a sharper reason: **six derived services
compute from these fields.** A mutable `occurred_at` silently reorders a
timeline; a mutable `workspace_id` moves a fact between tenants; a
mutable `correlation_id` breaks a trace already followed. Mutability
would mean derived state disagreeing with its source and no way to tell
which was wrong.

### Why these live outside payloads

Three reasons, in increasing order of consequence.

**Bootstrapping.** `event_version` tells a consumer how to read the
payload. Inside the payload, it cannot be read without already knowing
how to read it.

**Infrastructure must not parse domain content.** Partitioning uses
`workspace_id` and `occurred_at`; retention uses `occurred_at`;
deduplication uses `event_id`; tracing uses `correlation_id`. Storage and
delivery must do their work without understanding what a quote is.

**Cross-cutting guarantees cannot be enforced per type.** Tenancy
isolation, ordering and idempotency apply to every event uniformly.
Placed in payloads they would be re-declared per type, and any type that
forgot one would breach a platform guarantee invisibly.

### Subject ordering is an engine invariant, not a database invariant

`subject_sequence` is assigned by the owning engine, inside the
transaction that writes the aggregate, as the subject's current maximum
plus one. It is **gapless**, which is what lets a consumer receiving 7
after 5 know it lost one.

**It cannot be enforced by a database constraint here, and that must be
stated rather than assumed.** PostgreSQL requires a unique constraint on
a partitioned table to include every partition key column.
`platform.events` is partitioned by `workspace_id` **and** `occurred_at`.
A unique constraint including `occurred_at` would permit the same
`subject_sequence` twice in two time partitions — precisely what it
exists to forbid.

So uniqueness and gaplessness are **engine-enforced invariants**. This is
weaker than a constraint, and a reviewer who assumes otherwise will build
on a guarantee the database is not making.

**Gaplessness costs concurrency, deliberately.** Deriving the next value
in-transaction serialises concurrent writes *to the same subject*. That
is the intended trade: it is per-subject, not per-workspace — precisely
the bottleneck `DATABASE_ARCHITECTURE.md` §23 rejected. A gap-tolerant
sequence would be faster and would forfeit loss detection, which is the
only reason the field exists.

## Resolved: how derived events are identified

`DATABASE_ARCHITECTURE.md` §23 distinguishes **canonical** events —
facts emitted by an owning engine, permanent — from **derived** events,
produced by a consumer noticing something across canonical events, which
*"may be regenerated"* and are *"not themselves a system of record."* It
required them to be *"marked as derived"* without saying how.

**Option A — namespace convention.** Encode it in `event_type`, for
example a `derived.` prefix. Costs nothing and is visible in the name.

**Option B — an explicit envelope field.** One boolean.

**Decision: B.** `is_derived boolean not null`.

**It follows from the membership rule.** A consumer must know whether an
event is a regenerable inference *before* knowing what its type means,
because the two are handled differently in the operation that matters
most: **on a projection rebuild, canonical events are replayed and
derived events must be regenerated, not replayed.** Replaying a derived
event duplicates an inference the rebuild is about to make again. Under
Option A that filter is a string-prefix match — fragile in exactly the
operation you least want to be fragile.

**And it is the simpler long-term answer**, which was the deciding
criterion. Option A is simpler today: no column, no migration. But it
overloads a string that already carries engine, aggregate and verb; it
can only be enforced by discipline and code review; and every consumer,
every rebuild routine and every retention policy must re-implement the
same parse. **Conventions decay under delivery pressure. Columns do
not.** One byte on a partitioned table is not a cost worth trading a
structural guarantee for.

## Consequences

**Makes easier**

- One action's full effect is traceable across six asynchronous
  consumers — the primitive observability requires, available from the
  first event rather than retrofitted.
- Cascades are debuggable: causation gives the tree its edges.
- Payloads can grow additively without a type rename and a dual-write
  migration.
- Consumers detect loss rather than silently skipping it.
- Rebuild can distinguish what to replay from what to regenerate,
  structurally.
- Infrastructure partitions, retains and deduplicates without parsing
  domain content.

**Makes harder**

- Thirteen fields is a larger permanent contract than four. Every one is
  a decade-long commitment.
- Gapless sequencing serialises writes to a single subject.
- A guarantee the database does not enforce depends on engine
  discipline, and will be assumed to be a constraint by someone who did
  not read this.
- Every emitter must propagate `correlation_id` faithfully, including
  consumers emitting derived events. One engine that drops it produces a
  trace with a hole.

**Rules out**

- Emitting a domain event without a workspace. Platform-scoped actions
  are Audit records (`SYSTEM_ARCHITECTURE.md` §10.4), not domain events.
- Mutating any envelope field after emission.
- Changing an event type's meaning under a version increment.
- Identifying derived events by naming convention.
- Reusing ADR-0004's `emit_domain_event(p_event_type, p_payload)`
  signature for `platform.events`. That RPC governs the legacy
  `public.domain_events` table, which Epic 01 leaves untouched; ADR-0004
  is neither superseded nor extended.

**Scope.** This ADR completes Platform Architecture Version 1.0 rather
than superseding it. It changes no aggregate, engine, payload or
capability, and adds no concept beyond the envelope itself.

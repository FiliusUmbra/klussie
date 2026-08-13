# ADR-0021: One audit table with a nullable workspace, not two tables

**Status:** Proposed — implemented in Epic 01 WP 01.05 against an empty
table, and freely revisable until `platform.audit_records` carries data
**Date:** 2026-08-13
**Related:** `../architecture/DATABASE_ARCHITECTURE.md` §23 §33,
`../architecture/SYSTEM_ARCHITECTURE.md` §10.4,
`../architecture/SUPABASE_ARCHITECTURE.md` §8 §10 §19,
[ADR-0019](0019-canonical-platform-event-envelope.md),
`../IMPLEMENTATION_ROADMAP.md` §12 (WP 01.05)

## Context

`DATABASE_ARCHITECTURE.md` §33 states audit's isolation in one sentence:

> **Isolation.** Workspace-scoped, with platform-level administrative
> actions in a platform-scoped audit domain.

**"Domain" is genuinely ambiguous between a column value and a separate
table**, and the two readings produce different schemas that are
expensive to convert between afterwards. The question has to be answered
by WP 01.05, because that package creates the table.

It is not an idle distinction. §23 makes audit the *only* home for
workspace-less facts:

> There are no workspace-less domain events. Platform-scoped actions —
> fact promotion, catalogue changes, operator configuration — are Audit
> records (§33), not domain events. This keeps the tenancy field
> non-nullable, which a nullable one would quietly destroy.

So the architecture deliberately pushed nullable tenancy *out* of
`platform.events` and *into* audit. Audit must accept both kinds of
record. The only question is whether they share a table.

### The two readings

**A · Two tables** — `platform.audit_records` carrying a non-nullable
workspace, and a separate platform-scoped audit table with no workspace
column at all.

Its appeal is the same argument §2 makes for splitting `analytics_ws`
from `analytics_pf`: separate tables with separate grants make the
dangerous query impossible to write rather than merely discouraged. It
also keeps the tenancy column non-nullable everywhere, which §23 clearly
values.

**B · One table, nullable workspace** — null means the action was
platform-scoped.

### Why the analytics precedent does not transfer

The analytics split exists to stop **cross-tenant aggregation**: the
danger is a query that reads many workspaces' detail at once, and
separate grants remove the ability to write one.

Audit's danger is the opposite shape. **An auditor's core question spans
both kinds of record**: *everything this operator did* includes their
platform configuration changes and their actions inside a customer's
workspace, and *everything that happened to this workspace* includes
platform-level administrative actions taken against it. Under reading A
every such question is a `UNION` across two tables with different
columns — and the moment that union is the normal case, the split has
stopped isolating anything and started costing correctness. A query
someone forgets to union is a trail with a hole in it, which is the one
defect an audit trail may not have.

The grant argument also does not survive contact: **no application role
writes audit at all** (`SUPABASE_ARCHITECTURE.md` §8), so there is no
write privilege to separate. Read access is administrator and operator
only, and both legitimately read both kinds.

## Decision

**One table, `platform.audit_records`, with a nullable `workspace_id`
where null means the action was platform-scoped.**

Range-partitioned by time only, per `SUPABASE_ARCHITECTURE.md` §19 —
**not** hash-partitioned by workspace as events are, because a nullable
partition key would put every platform-scoped record in one place and
because audit is queried by time and by actor far more than by tenant.

The record carries what §33 and §10.4 require it to answer — *who did
what, in which workspace, when, under what authority, and what happened*:

| Column | Why it is here |
|---|---|
| `audit_id`, `occurred_at` | Identity and time; `occurred_at` is the partition key |
| `workspace_id`, **nullable** | This decision. Null is platform scope |
| `actor_type`, `actor_ref` | Who. Reuses `platform.actor_type`, so `intelligence` **is** §33's "marked as machine-originated" rather than a second mechanism for the same fact |
| `action` | What was attempted |
| `subject_type`, `subject_id` | What it was done to |
| `outcome` | **Permitted or denied.** §10.4 requires recording denied attempts, "which no domain event captures" — this is the column that makes audit irreducible to the event stream |
| `authority` | Under what authority — §33's fourth question, and the one that makes a decision explainable after the fact |
| `correlation_id` | Ties a record to the originating action, sharing ADR-0019's identifier so an audit entry and its events are one trace |
| `detail` | Everything else |

**Null is the platform scope, and nothing else.** It never means "not
recorded" or "unknown". A record whose workspace could not be determined
is a defect in the caller, not a null.

**This ADR is Proposed**, on the same terms as
[ADR-0020](0020-events-partitioning-parameters.md): implemented against
an empty table, where changing it is `drop table` and a re-run. **That
window closes when the first audit record is written**, which is the epic
that builds the audit write path — not this one.

## Consequences

**Makes easier**

- "Everything this actor did" and "everything that happened to this
  workspace" are each one query, with no union anyone can forget.
- One append-only guard, one partition scheme, one retention policy, one
  export path — audit is exported for customers' own compliance systems
  (§10.4), and one shape means one exporter.
- Denied attempts sit beside permitted ones, so the trail reads as a
  sequence rather than as two files to interleave by hand.

**Makes harder**

- Tenancy is nullable on a table that is workspace-scoped most of the
  time, and §23 is explicit that nullable tenancy "quietly destroys" the
  guarantee. Here that risk is carried deliberately and confined to one
  table — but every reader of audit must know that null is a scope and
  not an omission, and every writer must resist using it as a default.
- RLS for audit must handle the null case explicitly. A workspace
  isolation predicate written without thinking about it will either hide
  every platform-scoped record from the operator or, worse, show them to
  everyone.

**Rules out**

- A separate platform-scoped audit table. If one is ever introduced, this
  ADR is superseded rather than quietly supplemented.
- Deriving audit from the event stream — unchanged from §33, and the
  `outcome` column is why: a denied attempt produces no domain event to
  derive from.
- Using null `workspace_id` to mean anything other than platform scope.

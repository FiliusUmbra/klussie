# ADR-0031: The background-consumer pattern is a per-hash-partition pg_cron cursor loop over the parent event table, quarantining per-event and never blocking a partition

**Status:** Accepted — governs every future background event consumer
(Timeline, Notifications, Search, Analytics, and any later processor)
**Date:** 2026-08-20
**Related:** `../architecture/SUPABASE_ARCHITECTURE.md` §9, §12, §13,
`../operations/ROLES.md` §2.2, `../../supabase/migrations/0021_events.sql`,
`0024_consumer_cursors.sql`, `0102_timeline_twin_access.sql`,
`0162_engagement_access_grant_consumer.sql`, [ADR-0020](0020-events-partitioning-parameters.md)

## Context

`SUPABASE_ARCHITECTURE.md` §13 states the contract in prose: "Consumers
read forward with a cursor. Each consumer records its position per
partition. Delivery is at-least-once and every consumer is idempotent...
A poisoned event... is quarantined with its position recorded, so one
bad event never halts a stream indefinitely." §9: "Background consumers
are not one role... each get their own service role with their own
grants." Epic 01 built the tables this describes —
`platform.consumer_cursors`, `platform.consumer_quarantine`
(`0024_consumer_cursors.sql`) — and said outright, in its own header:
"Nothing runs against these tables yet. No consumer is wired to
anything real."

That remained true through Epic 20 (Search) and Epic 21 (Analytics):
both built real consumer roles and real read paths, but neither
actually polls `platform.events` on a schedule — they were granted
`EXECUTE` on `platform.emit_event()` to *write* new events, not built
to *read* the stream. **No background event consumer has ever existed
in this codebase.** `MASTER_CONTEXT.md` §12 names this gap explicitly.
WP 2.4 (`SLICE_2_MARKETPLACE_TRANSACTION_ACTIVATION.md`) needed to
build the first one — a Workspace-owned consumer of
`marketplace.engagement.created`, creating the scoped access grant
`DATABASE_ARCHITECTURE.md` §19 describes — and that document's own
words: "this work package's first job is deciding what that mechanism
actually is... before the consumer logic itself can be written."

Per explicit direction, that mechanism question was resolved as the
natural completion of infrastructure that already exists —
`platform.events`, consumer cursors, quarantine, `pg_cron`
(`0020_extensions.sql`), event-driven architecture — not a new
framework, and not business logic inside triggers. This ADR records
the shape that resolution actually took, building
`0162_engagement_access_grant_consumer.sql`, so the next consumer
copies a decision instead of re-deriving one.

### What was genuinely open, and how each was resolved

**1 · How does a consumer read one hash partition at a time?**
`ADR-0020` fixed eight hash partitions, each range-sub-partitioned by
year. The first draft queried each hash partition's own physical table
directly (`platform.events_w0` .. `events_w7`) — the most literal
reading of "one cursor per partition." It failed live: a `GRANT` and
an RLS policy on the partitioned *parent* do not inherit to a query
naming a *child* partition table directly, only to one against the
parent. `satisfies_hash_partition(regclass, modulus, remainder,
partkey_value)` resolves this — querying `platform.events` itself, with
that predicate, prunes to exactly one physical partition and needs no
privilege beyond what the parent already grants.

**2 · Is the cursor scoped to one event type, or to a position in the
whole stream?** Resolved positionally, deliberately. A consumer reads
the next batch of events *of any type* after its cursor in a
partition, and dispatches internally — one event type triggers real
work, every other type is a no-op skip that still advances the cursor.
A cursor pre-filtered to one event type would mean a second concern
the *same* consumer picks up later (§ below) needs its own separate
cursor and cannot share a read position with the first. §13's own
language — "records its position... in the stream" — describes a
position, not a subscription filter.

**3 · Does a consumer get its own service role, even when its one real
write crosses into another engine's schema?** Yes, and the crossing is
never direct. `klussie_consumer_workspace` (the fifth consumer role,
following `klussie_consumer_projection`/`_delivery`/`_search`/
`_analytics`) holds real, direct grants on its own bookkeeping —
`platform.consumer_cursors`, `platform.consumer_quarantine`,
`platform.events` (`SELECT` only) — and **no privilege whatsoever** on
`workspace.memberships`, the table its one real write touches. That
write goes through `workspace.grant_engagement_access()`, a narrow
`SECURITY DEFINER` delegate owned by `postgres`, `REVOKE`d from every
application role, `GRANT EXECUTE`d to the consumer role alone — the
identical boundary `platform.emit_event()` already crosses for every
engine that is not `klussie_engine_platform`.

**4 · Where does an ID come from inside a consumer, given
`platform.uuid_v7_at()` is reachable by no application role?** Inside
the `SECURITY DEFINER` delegate, never inside the consumer loop. The
loop is deliberately `SECURITY INVOKER` — it runs as the consumer role,
with only that role's own narrow grants, which is the entire point of
giving each consumer "its own service role with their own grants." A
call to `uuid_v7_at()` from inside the loop runs as the consumer role
too, and fails. Minting ids inside the `SECURITY DEFINER` delegate
costs nothing: the nested call runs as the delegate's owner
(`postgres`), the same way `workspace.resolve_owner_person_ref()`
already relies on being reached only through privileged callers.

**5 · A background-work table (`consumer_cursors`/`consumer_quarantine`)
enables RLS with no policy — is that the deny, or a bug?** It is a bug,
found live by this exact consumer's own diagnostic, and it is the
identical class of defect `0102_timeline_twin_access.sql` already found
and fixed for `platform.events` itself: a table-level `GRANT` on a
table with RLS enabled and *no applicable policy* is dead code,
regardless of how correct the grant is. `0024`'s own reasoning —
"these are background-work tables and no client role reaches them" —
is true for `anon`/`authenticated`/`service_role` and was silently
assumed to extend to the very consumer roles the same migration grants
`SELECT`/`INSERT`/`UPDATE` to. It never did, for any of the four
original consumer roles, because nothing had ever run as one of them
until this consumer did. Every future consumer inherits the fix
(`0162`'s own policies), not the gap.

**6 · How does a background job actually run under a least-privilege
role, on this hosting platform specifically?** Verified directly
against this project rather than assumed from general `pg_cron` docs.
`cron.schedule_in_database(..., username => 'role')` requires real
PostgreSQL superuser; Supabase's own `postgres` role on this project is
not one (`must be superuser to create a job for another role`).
`SET ROLE` from inside the job body (scheduled the ordinary way, which
always runs as whoever called `cron.schedule` — `postgres`) *also*
failed at first: `postgres`'s membership in a role it creates carries
`ADMIN OPTION` but not the `SET` option PostgreSQL 16 separated out,
and `pg_cron`'s background worker enforces this identically to an
interactive session. `GRANT role TO postgres WITH SET TRUE` — a role
extending its own membership option on a role it already administers —
resolves it, confirmed against a real scheduled job firing under the
downgraded role before this pattern was written down.

## Decision

**Every future background event consumer in this platform is built to
this shape:**

1. **One dedicated `klussie_consumer_*` service role per consumer**
   (`SUPABASE_ARCHITECTURE.md` §9), holding: `USAGE` on `platform`;
   direct `SELECT`/`INSERT`/`UPDATE` on `platform.consumer_cursors` and
   `platform.consumer_quarantine`; direct `SELECT` on `platform.events`
   (table grant *and* RLS policy membership — both are required,
   neither implies the other); `USAGE` on any schema whose
   `SECURITY DEFINER` delegate it calls; and `EXECUTE` on that delegate
   alone. **No direct privilege on the aggregate table the consumer's
   real work writes to, ever** — that crossing always goes through a
   narrow `SECURITY DEFINER` delegate, owned by `postgres`, revoked
   from every application role, granted `EXECUTE` to the one consumer
   role that needs it.

2. **The read loop is `SECURITY INVOKER`, queries the *parent*
   `platform.events` table, and prunes to one hash partition with
   `satisfies_hash_partition('platform.events'::regclass, 8,
   partition_index, workspace_id)`** — never a child partition table
   by name. Position within a partition is `(occurred_at, event_id) >
   (cursor.last_occurred_at, cursor.last_event_id)`, with a missing
   cursor row and a cursor row holding a null position both meaning
   "read from the beginning" (`0024`'s own distinction).

3. **The read is positional, not type-filtered.** A consumer reads the
   next batch of events of any type and dispatches internally on
   `event_type`; every type it does not handle is a silent skip that
   still advances the cursor. This is what lets a later concern (e.g.
   this consumer's own eventual `marketplace.engagement.completed`/
   `.cancelled` revocation handling — not built yet, see
   `0162`'s own header) share the identical cursor and role rather than
   requiring a second one.

4. **Each event is processed inside its own exception block.** A
   failure inserts (or upserts, on retry) a row into
   `platform.consumer_quarantine` keyed by `(consumer_name, event_id)`,
   and the cursor still advances past it — one poisoned event never
   halts the partition (§13). Any privileged id-minting
   (`platform.uuid_v7_at()`) or aggregate-table write happens inside
   the `SECURITY DEFINER` delegate the loop calls, never inside the
   loop itself.

5. **Scheduled via `pg_cron`, `SET ROLE <consumer role>` inside the job
   body, `RESET ROLE` at the end** — never
   `cron.schedule_in_database`'s `username` parameter, which this
   hosting platform's `postgres` role cannot use for any role but
   itself. The migration that creates a new consumer role also runs
   `GRANT <role> TO postgres WITH SET TRUE`, immediately after
   `CREATE ROLE`, so the schedule can downgrade.

6. **Idempotency is a real constraint the delegate enforces, not a
   property merely claimed.** At-least-once delivery means the same
   event may be processed more than once; the delegate checks for its
   own prior effect (here: `granting_engagement_id` already present)
   before doing anything, backed by a real unique constraint as the
   hard case a race would otherwise slip through.

**What each new consumer decides for itself, not fixed by this ADR:**
its own role name and grants, its own dispatch table of event types it
cares about, its own delegate function(s) and what they write, its own
skip conditions, and whatever safety-net expiries or bounds its own
domain needs. This ADR fixes the *mechanism* — the shape every future
consumer inherits without re-deriving — not the business logic any one
consumer runs.

## Consequences

**Makes easier**

- A future Timeline, Notifications, Search, or Analytics consumer is a
  new role, a new delegate, and a new dispatch branch — not a new
  reading mechanism, a new privilege-crossing pattern, or a new
  scheduling investigation. The six open questions above are closed
  once, here, rather than once per consumer.
- `platform.consumer_cursors`/`consumer_quarantine`'s RLS gap is fixed
  for all five consumer roles that exist today, not merely the one
  that found it — every future consumer role added to those two
  policies' `TO` lists inherits working bookkeeping from its first
  migration.
- A poisoned event is a `platform.consumer_quarantine` row an operator
  can see and act on (`ROLES.md` §2.3), not a silently stuck consumer
  or a crashed cron job.

**Makes harder**

- A consumer whose read pattern is *not* naturally expressible as "the
  next batch of events, of any type, in one hash partition" (for
  example, one that genuinely needs strict cross-partition ordering)
  does not fit this shape and needs its own ADR, not a workaround
  bolted onto this one.
- Every new consumer role is one more entry in `ROLES.md` §2.2's table
  and one more `GRANT ... WITH SET TRUE` to `postgres` — a small,
  fixed, per-consumer cost this ADR accepts deliberately rather than
  inventing a single shared "background" role that would reintroduce
  exactly the omnipotent-role problem §9 exists to prevent.

**Rules out**

- Business logic inside a trigger on `platform.events` or on any
  aggregate table, as a substitute for a real consumer — the explicit
  instruction this pattern was built under, and consistent with §4's
  own "a trigger refuses an impossibility, it does not make a
  decision."
- A second, parallel consumer framework (a queue, a webhook receiver, an
  external scheduler) for any future background processor this
  platform builds, unless a future ADR states a concrete reason this
  shape cannot serve it.
- Any consumer role holding a direct table grant on an aggregate table
  it does not own — the crossing is always a named, narrow
  `SECURITY DEFINER` delegate, never a broadened role grant.

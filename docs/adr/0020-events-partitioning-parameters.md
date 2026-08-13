# ADR-0020: Eight hash partitions, yearly time ranges, and a default range partition

**Status:** Proposed — implemented in Epic 01 WP 01.04 against an empty
table, and freely revisable until `platform.events` carries data
**Date:** 2026-08-12
**Related:** `../architecture/SUPABASE_ARCHITECTURE.md` §12 §19 §21 §23
(conflict 2), `../architecture/DATABASE_ARCHITECTURE.md` §5 §23,
[ADR-0019](0019-canonical-platform-event-envelope.md),
`../IMPLEMENTATION_ROADMAP.md` §12 (WP 01.04)

## Context

`SUPABASE_ARCHITECTURE.md` §12 resolves the conflict between a logical
partition boundary of ten million workspaces and PostgreSQL's real limits
by hash-partitioning events by workspace **"into a fixed number of
partitions, each range-partitioned by time."**

**It does not say what that number is, how wide a time range is, or what
happens to a row that falls outside every defined range.** Those three
are left to implementation, and WP 01.04 is where implementation arrives.
They are recorded here rather than decided in passing because they meet
all three of `README.md`'s tests: the first is awkward to reverse once
the table is large, a future contributor could plausibly change any of
them without knowing why, and all three set the pattern for the four
other tables §19 partitions the same way — messages, transitions, service
record cores, and audit's time ranges.

### The three questions, and their real alternatives

**1 · How many hash partitions.** The candidates were 4, 8, 16 and 64.

The instinct is that more partitions means more headroom, which is the
wrong model here. **Hash partitioning is not what controls the size of a
leaf in this design** — the time sub-partition does. A hash partition's
job is co-locating one workspace's events, allowing maintenance and
`VACUUM` to proceed in parallel, and letting the planner prune by
workspace. Size management belongs to the time dimension, which is also
the dimension §21 detaches and archives.

That reframes the trade. Leaf count is the product of both dimensions, so
every additional hash partition multiplies the DDL, the planning cost and
the operational surface across every time range that will ever exist. 64
hash partitions with monthly ranges is 768 leaves per year for a table
that today has no rows.

**2 · How wide a time range.** Monthly or yearly, principally.

This one is **not** expensive to reverse, and saying so is half the
decision: range partitions are created per period, so a future period can
be monthly even though 2026 was yearly, without touching a single
existing row. The right choice is therefore the one that costs least now
and defers the rest.

**3 · What happens outside every range.** A `DEFAULT` partition, or no
default and a failed insert.

This is the one with a business consequence rather than an operational
one. Events are written **in the same transaction as the change they
describe** (§12, constraint 5). An insert that fails because nobody
created next year's partition does not fail an event — **it fails the
customer's booking**, and it does so at midnight on the first of the
month, which is when nobody is looking.

The counter-argument is real: rows in a default partition make a later
`ATTACH` of a range covering them fail, so a default is a trap that
springs later rather than now.

## Decision

**Eight hash partitions, yearly range sub-partitions, and a `DEFAULT`
range partition beneath every hash partition.**

Concretely, for `platform.events`:

- `partition by hash (workspace_id)` with `modulus 8`.
- Each hash partition is `partition by range (occurred_at)`.
- Ranges for 2026 and 2027 created now, plus one `DEFAULT` per hash
  partition. Twenty-four leaves in total.

**And one operational commitment that makes the default safe rather than
a trap:** a default partition holding any row is a **defect**, checked by
`supabase/diagnostics/VERIFY_EVENTS.sql`. It means ranges were not
created ahead of time. The default exists to keep a customer's
transaction from failing while that is fixed — not as a place for events
to live.

**Eight, specifically.** It divides evenly, gives real parallelism for
maintenance, and keeps the leaf count at eight per period rather than
sixteen or sixty-four. If it proves too few, PostgreSQL allows hash
partitions of differing moduli to coexist: detach one modulus-8
partition, attach two modulus-16 partitions covering the same hash space,
and move that partition's rows. **That is one-eighth of the table at a
time, not a full rewrite** — which is what makes 8 a defensible starting
point rather than an irreversible bet.

**Yearly, specifically.** It is the cheapest choice now and forecloses
nothing, because granularity is chosen per period. When volume makes
monthly archival worthwhile, 2028 can be monthly while 2026 stays yearly.

**This ADR is Proposed rather than Accepted**, and the distinction is
load-bearing: it is implemented against an empty table in a staging
environment. Changing the modulus while `platform.events` has no rows is
`drop table` and a re-run — minutes, no data, no migration. Changing it
after the table carries production events is the expensive operation this
ADR exists to make deliberate. **The window in which this is free closes
when the first event is written, which is Epic 09 at the earliest.**

## Consequences

**Makes easier**

- Leaf count stays proportionate: 8 per period, ~24 objects for the first
  two years, against 768 per year under 64 × monthly.
- A workspace's events stay physically co-located, which is what tenant-
  scoped rebuild and tenant-scoped archival (§12) depend on.
- Time ranges detach as whole units for archiving (§21), independent of
  the hash dimension.
- A partition-creation lapse degrades to a check failure in a diagnostic
  rather than to a failed customer transaction.
- Granularity can tighten later without migrating anything already
  written.

**Makes harder**

- Eight hash partitions is a real ceiling on parallel maintenance. At
  billions of rows a single hash partition is hundreds of millions of
  rows, subdivided by time — acceptable, but it is the number to revisit
  first if maintenance windows become the constraint.
- A default partition with rows in it blocks attaching a range that would
  have covered them. This is why its emptiness is checked rather than
  assumed.
- Someone must create next year's partitions before next year. Until the
  epic that schedules it arrives, that is a human obligation with a
  diagnostic behind it, and the diagnostic is the only thing that will
  notice.

**Rules out**

- One partition per workspace, in any form — §19's rule that partitioning
  is never the tenancy mechanism.
- Changing the modulus silently. It is recorded here, and any change
  supersedes this ADR.
- Treating a populated default partition as normal.

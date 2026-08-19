# ADR-0028: Stewardship is a mutable current pointer plus an append-only log of closed periods

**Status:** **Accepted** 2026-08-16
**Date:** 2026-08-16
**Related:** `../architecture/DATABASE_ARCHITECTURE.md` §4 (Storage Classes),
§12 (Property and Stewardship), `../architecture/SYSTEM_ARCHITECTURE.md`
§7.1, `../architecture/PLATFORM_DOMAIN_MODEL.md` §9,
`../IMPLEMENTATION_ROADMAP.md` §15 (WP 05.01),
[0026](0026-membership-helper-lives-in-public.md)

## Context

`DATABASE_ARCHITECTURE.md` §12 states stewardship's shape in one sentence:

> **The critical decision: stewardship is a period, not an attribute.** A
> property is not owned by a workspace as a child record. It is
> stewarded by a workspace **for a period with a beginning and possibly
> an end**, and those periods are append-only.

Read on its own, this describes one structure: a `stewardship_periods`
table, each row a period, `ended_at` null while open. WP 05.01 building
that literally hits a contradiction the moment it asks what "append-only"
means for the still-open row.

**§4's Storage Classes table answers the question, and it doesn't put
stewardship in one class.** Its Transactional examples list includes
*"property"*; its Historical examples list includes *"stewardship
periods,"* named separately. Historical's own definition: **"Write-once.
Never updated."** A row that starts with `ended_at = null` and later has
that column set is, by definition, updated — the closing write is not
optional, since a period that never records when it ended is not the
period the domain model describes.

So the two sections of the same frozen document, read together, do not
describe one mutable-with-one-exception table. They describe the same
shape Epic 03 already built for membership: a **current, mutable**
record (Transactional — where "property" sits) and a **permanent,
append-only** log of what is now finished (Historical — where
"stewardship periods" sits). `workspace.memberships` (current) and
`workspace.membership_history` (append-only, migration 0030) are exactly
this pattern already, for the identical reason: a live relationship
needs to change in place, and a permanent record of change needs a
guarantee "in place" cannot give it.

### The real alternatives

**A · One `stewardship_periods` table, `ended_at` nullable, updated once
to close.** The most literal reading of §12's own sentence. Rejected: it
contradicts §4's classification of "stewardship periods" as Historical,
"never updated," in terms — not a stretched reading, the table's own two
words. Building it this way would ship the exact contradiction this ADR
exists to resolve, under the section that was supposed to prevent it.

**B · A single append-only `stewardship_periods` table where "opening" a
period is not itself a row — only closings are ever written, and the
current steward is derived by "the property with no closed period
covering right now, most recently opened."** Rejected: it makes "who
stewards this property right now" a query with no direct answer for the
common case (a property whose stewardship has never changed, which is
every property this epic backfills) — there is no opening row to find.
It also fails DATABASE_ARCHITECTURE.md §5's tenancy rule directly:
"every record carries the workspace it belongs to… not an attribute that
a query may forget to filter on." A derived absence is not a carried
attribute.

**C · Current pointer on `property.properties`, closed periods in
`property.stewardship_periods`. Chosen.**

## Decision

**`property.properties` carries `steward_workspace_id` and
`steward_since` — a plain, mutable pointer to the current steward,
exactly as direct and exactly as indexed as every other `workspace_id`
column in the schema, with one documented difference: it changes when
stewardship transfers, which is what `DATABASE_ARCHITECTURE.md` §12
means by "the one place in the architecture where tenancy is not a
static stamp." `property.stewardship_periods` holds only *closed*
periods — `began_at` and `ended_at` both set at the moment of insert,
never touched again. WP 05.01, this epic's only "add" package, ships
empty: nothing has ever transferred, so nothing has ever closed.**

Concretely, the future stewardship-transfer operation this epic does not
build (§15's scope note: no gated action exists yet) does two things in
one transaction:

1. Insert into `stewardship_periods` — `(property_id, workspace_id: the
   OLD steward, began_at: the property's own steward_since, ended_at:
   now())`. Complete on arrival; never updated again.
2. Update `property.properties` — `steward_workspace_id` and
   `steward_since` to the new steward, now.

**The isolation predicate needs no new resolver.** `property.properties`
carries its current tenant the same way every Epic 03 table does — a
plain `workspace_id`-shaped column — so the RLS policy WP 05.05 adds is
`steward_workspace_id in (select workspace_id from
api.current_workspace_memberships())`, reusing the membership helper
migration 0031 already built rather than adding a property-specific one.
This removes what was drafted as WP 05.02 (a dedicated `current_
stewardships()` resolver) from the roadmap's decomposition — it would
have re-derived, through a join, exactly what a plain column already
answers directly.

## Consequences

**Makes easier**

- WP 05.01 has no contradiction to design around, and no open question
  about what "append-only" permits.
- The isolation predicate is a direct column check, not a join — cheaper
  than Epic 03's membership predicate, not more expensive, despite
  stewardship being the "dynamic" case §12 calls out as hardest.
- Epic 05's decomposition shrinks by one package (§15 updated to fold
  the dropped resolver into WP 05.01).
- `property.stewardship_periods` is trivially, literally append-only —
  the same guard trigger `workspace.membership_history` already uses
  (migration 0030) applies unchanged.

**Makes harder**

- **Two objects now answer "who stewards this property," and they must
  never disagree.** `property.properties.steward_workspace_id` is the
  live answer; `stewardship_periods` is the history of every previous
  answer. The transfer operation (not built in this epic) must write
  both in one transaction, or the current pointer and the historical
  record can drift — the same discipline Epic 03 already requires
  between `workspace.memberships` and `workspace.membership_history`,
  extended here rather than invented.
- A property's *current* stewardship duration (`steward_since` to now)
  is not itself a row in the append-only log until it closes — reading
  "how long has this steward held it" requires combining the current
  pointer with the closed-period history, not one table alone.

**Rules out**

- Treating `stewardship_periods` rows as ever mutable, including the
  still-open case — there is no still-open case in this table anymore.
- A dedicated `property`-schema membership-style resolver duplicating
  `api.current_workspace_memberships()`.
- Deriving "current steward" from the absence of a closing row (rejected
  alternative B) anywhere in this platform.

## What this does not resolve

**Shared and overlapping stewardship** (`PLATFORM_DOMAIN_MODEL.md` §9,
explicitly future). A single mutable `steward_workspace_id` column
assumes exactly one current steward. The domain model already names
shared stewardship as a future extension requiring its own design; this
ADR does not attempt it, and widening `property.properties` to many
concurrent stewards is that future epic's decision, not a corridor this
one closes.

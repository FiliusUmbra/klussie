# ADR-0025: Pre-engagement marketplace visibility and public professional profiles survive Epic 03 unchanged

**Status:** **Proposed** — required before Work Package 03.10
**Date:** 2026-08-13
**Related:** `../architecture/SUPABASE_ARCHITECTURE.md` §6 §7 §8 §23
(conflict 1), `../architecture/PLATFORM_DOMAIN_MODEL.md` §7 §8 Rule 11,
`../architecture/DATABASE_ARCHITECTURE.md` §5 §6,
`../IMPLEMENTATION_ROADMAP.md` §14 (WP 03.10), §10 (Epic 12),
[0012](0012-one-tap-booking-commits-the-customer-not-the-professional.md),
[0024](0024-request-context-resolved-in-the-database.md)

## Context

Work Package 03.10 reads, in full:

> **03.10 · Reshape RLS policies to isolation and membership.** The 58
> existing policies simplify; richer logic moves to the engine
> (`SUPABASE_ARCHITECTURE.md` §23 conflict 1).

Two classes of existing policy cannot be reshaped that way, and both are
load-bearing for the live product.

### Class 1 — the professional's request feed

`SUPABASE_ARCHITECTURE.md` §8 states how marketplace access works:

> **Marketplace access.** A providing workspace sees a request or
> engagement **it is party to**. The engagement is the grant-bearing
> object, and the scoped membership it produces carries the access — so
> marketplace visibility resolves through the same membership predicate
> as everything else.

`PLATFORM_DOMAIN_MODEL.md` §8 agrees: marketplace-derived access is an
ordinary membership with a scope and an expiry, created when an
engagement is accepted.

The current product does something the frozen documents do not describe.
`0001_init.sql:455`:

```
create policy "pros can view matching requests"
  on public.service_requests for select
```

admitting any professional who offers the request's service — plus
`pro_matches_request()` (`0004_trustlocal_features.sql:9`) and the
matching insert policy on `quotes` (`0001_init.sql:486`).

**A professional browsing open requests is party to nothing.** After
WP 03.06, those rows belong to customers' Personal Workspaces, in which
that professional holds no membership and will not hold one until they
quote and are accepted. The engagement that §8 says carries the access is
Epic 12's aggregate, produced by Epic 09's workflow engine. Neither
exists, and the roadmap defends that sequencing deliberately (§5:
"Workflow (09) precedes Marketplace (12)").

So there is a class of legitimate read that is neither workspace-isolated
nor membership-derived, and **Epic 03 has no vocabulary for it.**

### Class 2 — the professional's public profile

`public.pro_profiles`, `public.pro_stats` and `public.reviews` are
`for select to anon, authenticated using (true)`. A professional's name,
bio, rating and reviews are visible to signed-out visitors, which is what
makes a marketplace a marketplace.

After WP 03.06 those rows belong to Professional Workspaces. They are
therefore workspace-scoped data deliberately readable by everyone —
and `DATABASE_ARCHITECTURE.md` §5 permits exactly three tenancy levels,
adding that "a record that does not fit one of these three is a design
error, not a new level."

The record fits: it is workspace-scoped. What has no vocabulary is its
*visibility*, which no membership predicate can express.

### What this means for WP 03.10 as written

**The 58 policies do not simplify in this epic.** Simplifying the request
and quote policies to workspace isolation removes the professional's
feed — the mechanism by which every quote in the product comes to exist.
Simplifying the public-profile policies removes professional discovery.
Either would be a catastrophic regression delivered under the heading of
architectural compliance.

### The real alternatives

**A · Create the memberships.** Grant every professional a scoped
membership in every workspace holding a request they match.

Rejected. It is N professionals × M requests of membership rows,
recreated on every catalogue change, and it makes "membership" mean
"might be interested in" — destroying the concept `PLATFORM_DOMAIN_MODEL.md`
§7 makes every access decision depend on. A membership that means nothing
is worse than no membership.

**B · Add a fourth tenancy level for published data.** Rejected: it
contradicts `DATABASE_ARCHITECTURE.md` §5 in terms, and it would be
introduced to describe two legacy policies rather than a modelled need.
If professional publication deserves structure, that structure belongs to
Epic 12 or Epic 18, designed against the marketplace they build — not
inferred in Epic 03 from a policy written in migration `0001`.

**C · Bring engagements forward into Epic 03.** Rejected: it reverses the
roadmap's own defended sequencing, and it makes the pivot epic unbounded.

**D · Leave both classes exactly as they are, and narrow WP 03.10 to
adding the isolation backstop.**

## Decision

**Pre-engagement marketplace visibility and public professional
publication survive Epic 03 unchanged. WP 03.10 adds workspace isolation;
it removes no existing policy.**

This is a deliberate shortcut in roadmap Rule 10's sense, and it carries
the removal trigger that rule requires.

**1 · What WP 03.10 does.** It adds a workspace isolation predicate to
the workspace-scoped tables, as the backstop `SUPABASE_ARCHITECTURE.md`
§6 describes. It deletes nothing. The policy count goes up in this epic,
not down.

**2 · The exceptions are enumerated, in the migration, by name** — so
that a later reader can tell a deliberate exception from an oversight:

| Exception | Objects | Why it cannot be membership |
|---|---|---|
| **Pre-engagement discovery** | `"pros can view matching requests"`, `"pros can send quotes on matching requests"`, `pro_matches_request()` | No engagement exists yet, so no scoped membership exists to carry the access (§8) |
| **Professional publication** | `"pro profiles are publicly viewable"`, `"pro stats are publicly viewable"`, `"reviews are publicly viewable"` | Visibility to `anon` cannot be expressed by any membership predicate |

The catalogue tables — `categories`, `services` and their translations —
are **not** exceptions. They are platform-scoped configuration under §5
and are correctly world-readable. They are named here only so the
distinction between "platform-scoped" and "workspace-scoped but
published" stays visible.

**3 · The added policies are permissive, never restrictive.** PostgreSQL
`OR`-combines permissive policies, so adding an isolation policy widens
nothing and narrows nothing on a table that already has one. Stated
explicitly because a `restrictive` policy would silently break the feed,
and it is the single mistake this decision is most likely to be
implemented as.

**4 · Removal trigger: Epic 12 (Marketplace Engine).** When engagements
exist and produce the scoped, expiring memberships §8 describes, the
Class 1 exceptions are replaced by the membership predicate and deleted.
Epic 12's definition already carries the work — "requests, quotes,
engagements migrated onto the new schema and driven by workflow
definitions rather than triggers"; this ADR is the record of what it must
also remove, and of the fact that Epic 03 left it deliberately.

Class 2 has no removal trigger, because it may not need removing.
Whether a public professional profile is best modelled as a published
workspace record or as a platform-scoped projection is a real question,
and it belongs to Epic 12 or Epic 18. This ADR records only that Epic 03
does not answer it.

## Consequences

**Makes easier**

- WP 03.10 becomes implementable and **cannot regress the product**,
  which is the property roadmap §2 makes non-negotiable for every
  package.
- Epic 12 inherits a written statement of what it must replace, rather
  than discovering it by reading migration `0001` and guessing whether
  the policy was deliberate.
- The isolation backstop lands on every workspace-scoped table now,
  which is the defence-in-depth §6 wants, without waiting nine epics for
  the marketplace model.

**Makes harder**

- **The policy surface grows before it shrinks.** The roadmap promised
  simplification; this epic delivers addition. Anyone auditing progress
  against §14's wording will find WP 03.10 did the opposite of what it
  says.
- **Two access models coexist on `service_requests` and `quotes` for
  nine epics**, and a reviewer must know which applies to the read in
  front of them. This is exactly the "two ways to gain access" that
  `PLATFORM_DOMAIN_MODEL.md` §8 warns is one too many — accepted here
  because the alternative is deleting the product's core mechanism, and
  bounded by a named trigger rather than by intention.
- **Rule 11 — one permission path — is not achieved for the marketplace
  tables in this epic.** It is achieved for every other workspace-scoped
  table. That partial result must be stated in Epic 03's completion
  record rather than reported as a clean gate.

**Rules out**

- Deleting or narrowing the six named policies before Epic 12.
- A fourth tenancy level.
- Any `restrictive` policy added by WP 03.10.
- Modelling pre-engagement visibility as a membership, now or later.

## What this does not resolve

**Directed requests.** [ADR-0012](0012-one-tap-booking-commits-the-customer-not-the-professional.md)
introduced one-tap booking, and `0013_directed_requests.sql` gives a
request a directed professional. A directed request is closer to a
bilateral relationship than an open one, and might have been expressible
as a membership. It is not treated separately here: it rides on the same
`service_requests` policies as an open request, and separating it would
be designing part of Epic 12's model in Epic 03.

**Storage policies.** `service_request_photos` and the `avatars`,
`portfolio` and item-photo buckets carry their own `storage.objects`
policies keyed on the owner's UID in the path's first segment
(`0007`, `0016`). They are not RLS on a workspace-scoped table and are
outside WP 03.10's scope. Whether object paths should carry a workspace
is Epic 08's question.

**The `api` schema (ADR-0026) does not affect this ADR.** Every table and
function named here — `service_requests`, `quotes`, `pro_profiles`,
`pro_stats`, `reviews`, `pro_matches_request()` — is pre-existing
application surface that stays in `public`, not an engine contract. None
of it delegates into an engine, so none of it belongs in `api`, now or
under this ADR's removal trigger.

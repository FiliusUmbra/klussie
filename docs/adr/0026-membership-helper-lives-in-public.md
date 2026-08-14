# ADR-0026: The membership helper is a SECURITY DEFINER function in a dedicated `api` schema

**Status:** **Accepted** 2026-08-14 — revised from the originally proposed
placement in `public` after an architecture feasibility study found
Supabase supports a dedicated exposed contract schema natively (see
"As revised" below), with one further correction to the delegate's shape
found during WP 03.02 implementation and recorded under "As implemented"
below
**Date:** 2026-08-13
**Related:** `../architecture/SUPABASE_ARCHITECTURE.md` §2 §6 §9 §10 §20
§24.1, `../architecture/PLATFORM_DOMAIN_MODEL.md` Principle 9,
`../IMPLEMENTATION_ROADMAP.md` §14 (WP 03.02), §15 (risk 5),
`../operations/ROLES.md`,
[0004](0004-domain-events-via-security-definer-rpc.md),
[0023](0023-identity-display-resolution-versus-row-visibility.md),
[0024](0024-request-context-resolved-in-the-database.md)

## Context

`SUPABASE_ARCHITECTURE.md` §6 specifies one object that nearly every
policy in the platform depends on:

> Nearly every policy reduces to one question: *is the current principal
> a live member of the workspace this row belongs to?*
>
> This is answered by a **single security-definer, `STABLE` helper** that
> resolves the caller's live workspace memberships once per statement
> rather than once per row.

§20 names it the platform's first performance concern and the roadmap's
risk register makes it risk 5. Work Package 03.02 builds it.

**Where it lives is not a free choice, and the reason is mechanical.**

An RLS policy's expression is evaluated with **the invoking role's**
privileges. A policy on `public.service_requests` whose predicate calls
`workspace.is_member(...)` requires the calling role — `authenticated` —
to hold `USAGE` on schema `workspace` and `EXECUTE` on the function.
`SECURITY DEFINER` does not help with this: it changes the privileges the
function *body* runs with, not the privileges required to *call* it.

Epic 01 revoked precisely that (`0019_grants.sql:173–189`), for a stated
reason:

> **NOT YET:** `authenticated` will reach the six workspace-scoped tiers
> and `derived`, under RLS, on the direct-read path (§7) — but only per
> table, and only where membership alone is the complete permission
> answer. A schema-wide grant now would decide that for every future
> table in advance, which is precisely the decision §7 reserves per
> table.

So the helper either lives somewhere `authenticated` can already call, or
Epic 01's posture gets its first exception — and whichever is chosen sets
the pattern for the Property, Work, Knowledge and Commerce engines' RLS
helpers, each of which will hit this identically.

### The real alternatives

**A · In `workspace`, with a narrow grant.** Grant `authenticated` `USAGE`
on schema `workspace` plus `EXECUTE` on this one function, and nothing
else.

Genuinely defensible, and narrower than it first sounds: `USAGE` on a
schema grants the ability to reference objects in it, not to read them —
no table grant is implied, and `SELECT` on `workspace.memberships` stays
revoked. The engine's own object stays in the engine's own schema, which
is what §2's ownership model is for.

Rejected on two grounds. It makes `workspace` the first engine schema any
client role may enter, and the value of Epic 01's posture is that the
answer to "may a client reach an engine schema" is *no* without
qualification — a rule with one exception is a rule with a precedent, and
five more engines are queued behind this one. And it is a decision §7
reserves per table, spent here on a function rather than a table, which
is a category the grant model does not currently distinguish.

**B · In `public`, `SECURITY DEFINER`, reusing the existing pattern
without a new schema.** The function reads `workspace.memberships` under
its owner's privileges; `authenticated` calls it in a schema PostgREST
and RLS already reach.

This is the pattern this repository has used twice, both times for the
same reason: ADR-0004's `emit_domain_event()`, and ADR-0023 as
implemented — `current_identity()` and `resolve_identity_display()`,
which exist in `public` precisely because `identity` cannot be exposed to
a client and a migration cannot expose it.

Rejected on reflection, after this ADR's own "makes harder" section
conceded the cost without acting on it. `SUPABASE_ARCHITECTURE.md` §2 and
§24.1 do not say `public` should hold little; they say, respectively,
*"`public` itself holds nothing"* and *"Nothing in `public`."*
Reusing the pattern is the smaller change, but it is the option that
keeps migrating the platform's engine contracts — three functions after
Epic 02, five after this one, more with every engine — into the one
schema the architecture requires to hold nothing. A pattern is not a
schema: the *pattern* (a `SECURITY DEFINER` delegate somewhere PostgREST
exposes) is worth keeping; the *location* is not.

**C · Duplicate membership into a `public` table.** Policies read it
directly with no function call at all — the fastest possible predicate.

Rejected. It duplicates an aggregate, against
`PLATFORM_DOMAIN_MODEL.md` Principle 9 and the one-source-of-truth rule,
and the duplicate needs a consistency mechanism, which would be a trigger
— which is where business rules must not live
(`SUPABASE_ARCHITECTURE.md` §23 conflict 3). A denormalisation whose
correctness depends on a trigger is the thing Epic 09 exists to remove,
introduced in Epic 03.

**D · In a dedicated `api` schema, `SECURITY DEFINER`, delegating to
logic that stays in `workspace`. Chosen.**

An architecture feasibility study (2026-08-13) established that Supabase
supports this natively and that it changes nothing else: Data API
exposure is a dashboard setting (Project Settings → Data API → Exposed
schemas) that accepts any schema, not only `public`; `supabase-js` calls
an exposed schema via `db.schema` at client construction or `.schema()`
per call; and RLS, `SECURITY DEFINER`, `STABLE`, Realtime and the
existing auth flow are each unaffected by which exposed schema a function
lives in — Realtime in particular subscribes through the replication
publication and per-table grants, entirely independent of the PostgREST
exposed-schema list. The one operational cost is the same one already
paid for `identity`: `pgrst.db_schemas` is not set on the `authenticator`
role on this project, so a migration cannot expose a schema — the
dashboard step is manual, once per environment, and does not block CI.

Chosen over B because it resolves the accretion problem B only names, at
the cost of one dashboard step Epic 02 already established the shape of.
Chosen over A for the same reason A was rejected — see above — but
locates the *contract*, not the *predicate logic*, outside `workspace`:
the logic stays where A wanted it (in the engine's own schema, reachable
by nothing client-facing), and only a thin delegate is exposed.

## Decision

**The membership predicate lives in `workspace`, unreachable by any
client role. A thin `SECURITY DEFINER`, `STABLE` delegate in a dedicated
`api` schema is what RLS policies and client callers actually reference.
No client role is granted anything on the `workspace` schema.**

Concretely, WP 03.02 builds:

- **`workspace.current_memberships()`** — the caller's live memberships,
  resolved once per statement. `STABLE`, `set search_path = ''`. Not
  `SECURITY DEFINER` and granted to nobody: its only caller is the
  delegate below, which reaches it under the migration runner's
  privileges. This is the Workspace engine's own logic, and it stays in
  the Workspace engine's own schema — exactly what §2's ownership model
  requires and what Option A could not deliver without opening
  `workspace` to `authenticated`.
- **`api.is_workspace_member(uuid)`** — the isolation predicate §6
  describes: a `SECURITY DEFINER`, `STABLE` shim whose entire body is one
  call into `workspace.current_memberships()`. This is what RLS policies
  reference, and what `authenticated` is granted `EXECUTE` on.

**Why the split, rather than one function in `api`.** The isolation
predicate is not the same class of object as `emit_domain_event()` or
`resolve_identity_display()`. Those are engine operations invoked by
application code and replaceable one caller at a time. This is the
substrate of RLS — referenced by every policy on every workspace-scoped
table, permanently. Putting its *logic* in `api` would still migrate the
platform's tenancy enforcement into a schema the client can enter, and
would still put every later engine's predicate logic somewhere other than
the engine that owns it. With the split, `api` holds one relocatable line
per engine; moving the whole contract surface later costs rewriting
shims, not predicates.

With the properties each of the three prior migrations in this pattern
established:

1. **`STABLE`, not `VOLATILE`.** This is the whole performance decision
   (§6, §20): `STABLE` permits evaluation once per statement, `VOLATILE`
   forces once per row, and the second turns every sequential scan into a
   correlated subquery. WP 03.02's acceptance requires *evidence* of
   once-per-statement, not the marking alone.
2. **`set search_path = ''`, every reference schema-qualified.** The trap
   migrations `0023` and `0026` both hit — `extract` and `coalesce` are
   syntax, not schema-qualifiable functions. Applies to both the delegate
   and the logic it calls.
3. **Expiry evaluated in the predicate, never by a cleanup job.** §8:
   "a lapsed grant stops working the moment it lapses rather than the
   next time something runs." An expired or ended membership is absent,
   and this is the property that makes contractor and marketplace-derived
   access safe later.
4. **Explicit revokes, by name — verified rather than assumed.** Epic 02
   surprise 4 found that Supabase ships `alter default privileges in
   schema public grant all on functions to anon, authenticated,
   service_role`, so a new function in `public` was granted to `anon`
   **by name** and survived `revoke ... from public` untouched. Two
   `SECURITY DEFINER` resolvers were anonymously callable until an
   explicit revoke was added. Supabase's own guidance for a custom schema
   is to grant these privileges by hand rather than inheriting them,
   which suggests `api` does not start with the same default-open
   behaviour `public` did — but this ADR does not trust that difference
   unverified. `revoke all on function api.is_workspace_member(uuid) from
   public, anon, service_role;` then `grant execute ... to authenticated;`
   is written explicitly regardless, and WP 03.02's diagnostics probe that
   `anon` cannot call it, the same way Epic 02's probe discipline found
   the two anonymous callers in the first place.

**`workspace.current_memberships()` and `api.is_workspace_member(uuid)`
together are the Workspace engine's isolation contract, not
general-purpose helpers.** The logic function's name says `workspace`
because it belongs there; the delegate's name says `is_workspace_member`
because that is the question a policy is asking, not because of where it
lives. A future contributor looking for the membership predicate finds
the logic in the engine that owns it, and the one thing every RLS policy
actually calls in the schema the client can reach.

## Consequences

**Makes easier**

- Epic 01's grant posture stays literally true and needs no exception:
  no client role reaches `workspace`, exactly as none reaches `platform`
  or `identity`. `VERIFY_*` diagnostics can assert that as an invariant
  across all six engine schemas rather than as a list with holes in it.
- Every later engine's RLS helper has a decided pattern, which is most of
  the value here — Property, Work, Knowledge and Commerce each face this
  identically and now face it once: logic in the owning engine's schema,
  a thin delegate in `api`.
- The function is testable through the harness Epics 01 and 02 built, and
  is exercised by the same probe discipline that found two anonymously
  callable resolvers.
- **`public` stops accumulating engine contracts as of this ADR.** Every
  contract from here forward has a named home that is not the schema
  `SUPABASE_ARCHITECTURE.md` §2 and §24.1 require to hold nothing. Epic
  02's two resolvers and `emit_domain_event()` are not relocated by this
  decision — they remain in `public` under ADR-0023 and ADR-0004, both
  Accepted and Implemented — but nothing new joins them there.

**Makes harder**

- **A `SECURITY DEFINER` function reading every membership row is now
  load-bearing for tenant isolation, and its grants are the whole of the
  protection.** ADR-0023 flagged this property for the identity
  resolvers; it now applies to the object §20 calls the hottest in the
  platform. The blast radius of a wrong grant here is cross-tenant
  disclosure. Unchanged by the move from `public` to `api` — the
  property belongs to the function, not to its schema.
- A reviewer reading a policy sees an `api` function and must know it
  delegates to logic owned by the Workspace engine, not that it *is* the
  Workspace engine. The split (logic in `workspace`, delegate in `api`)
  is one more indirection than a single function in one schema would be.
- **One extra hop on the platform's hottest path.** `STABLE` on both
  functions permits the planner to still evaluate once per statement, but
  WP 03.02's performance evidence (ADR-0024, decision part 2) must be
  gathered against `api.is_workspace_member`, the object RLS policies
  actually call — not against `workspace.current_memberships` in
  isolation, which would prove nothing about what a policy pays.
- Exposing `api` is a manual dashboard step no migration can perform —
  the same constraint already documented for why `identity` cannot be
  exposed (migration `0028`'s finding). It must be done once per
  environment before WP 03.02's migration can be exercised there.

**Rules out**

- RLS policies referencing `workspace.*` objects directly.
- Granting any client role `USAGE` on an engine schema, including
  `workspace`.
- Duplicating membership state into `public` or `api` as a table.
- A second membership predicate anywhere — including one written for
  convenience inside a later engine's policy.
- Engine logic — as opposed to a thin delegate — living in `api`. `api`
  holds contracts, not implementations.

## What this does not resolve

**Scope.** The helper answers membership, not scope. §8 is explicit that
RLS carries "a *simplified* form — the member sees rows in their scope —
and the authoritative evaluation, including the subtree resolution and
its invalidation, is the Workspace engine's." There is no location tree
until Epic 06, and no consumer workspace uses scope. The helper returns
the scope recorded on the membership; nothing resolves it yet.

**Whether `api` stays bounded across five more engines.** This ADR
decides where the contract goes, and gives it a schema whose only content
is meant to be delegates. It does not guarantee that discipline holds for
Property, Work, Knowledge and Commerce — only that, unlike `public`, `api`
started with that as its stated purpose rather than acquiring it by
accretion. Whether it stays that way is a question for the epic that next
adds to it.

**Whether Epic 02's existing functions should also move.** `current_identity()`,
`resolve_identity_display()` and `emit_domain_event()` fit the same shape
this ADR gives new contracts, and moving them into `api` would be
consistent with it. This ADR does not do that: it decides placement for
new engine contracts beginning with WP 03.02, not a retrofit of Epic 01
and Epic 02's already-Accepted work. Relocating them, if ever done, is a
decision made against ADR-0023 and ADR-0004 directly.

## As revised

This ADR was originally proposed with the membership helper placed in
`public`, reusing ADR-0004's and ADR-0023's pattern without a new schema.
Before acceptance, an architecture feasibility study examined a dedicated
`api` schema as an alternative and found it fully supported by Supabase
with no effect on RLS, `SECURITY DEFINER`, `STABLE`, Realtime, or the
existing auth flow — only one manual, per-environment dashboard step,
already known from `identity`'s exposure question. The original
alternatives list is preserved above as Options A–C with B's rejection
now stated; Option D is what this ADR adopts. No part of the mechanical
reasoning that ruled out placing the predicate logic itself in a
client-reachable schema changed — only where the delegate sits.

## As implemented (WP 03.02)

**The substance is unchanged; the delegate's shape is not.** The Decision
section above names `api.is_workspace_member(uuid)` — a scalar function
taking a workspace id and returning boolean. Building it against
ADR-0024's own acceptance requirement — *"evidence of once-per-statement,
not the marking alone"* — found that shape cannot meet it.

`STABLE` permits the planner to evaluate a function once per statement
rather than once per row **only when its argument does not vary per
row**. Current Supabase/Postgres guidance is explicit on this point:
*"STABLE functions may be evaluated once per query rather than once per
row — but only if the planner can prove the value is constant within the
query… Functions marked as stable still need to be wrapped in a subquery
in order for Postgres to properly cache the result."*
([Supabase — RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv))
Used the natural way in a policy —

```sql
using (api.is_workspace_member(workspace_id))
```

— the argument is **the scanned row's own column**, different on every
row. `STABLE` does not make Postgres cache across different arguments; it
is re-invoked per row, re-running the join against
`workspace.current_memberships()` every time — the exact "correlated
subquery per row" failure `SUPABASE_ARCHITECTURE.md` §20 names as the
platform's most likely catastrophic degradation. Building it as specified
would have shipped the failure mode this ADR chain exists to prevent,
under the marking that was supposed to prevent it.

**What is built instead: `api.current_workspace_memberships()`** — the
same delegate shape as before (`SECURITY DEFINER`, `STABLE`,
`set search_path = ''`, calling straight into `workspace.current_memberships()`),
but **parameterless**, set-returning, and depending on nothing but
`auth.uid()` — which *is* constant for the whole statement. Used as an
uncorrelated subquery:

```sql
using (workspace_id in (select m.workspace_id from api.current_workspace_memberships() m))
```

the planner can recognise the subquery as independent of the outer row
and evaluate it once, which is the property this ADR was always meant to
deliver. `api.is_workspace_member(uuid)` is not built — a second function
that invites the exact call pattern just ruled out is a hazard, not a
convenience, and every RLS policy from WP 03.10 onward is written against
`api.current_workspace_memberships()` directly.

This changes function names, not architecture: the logic still lives in
`workspace.current_memberships()`, reachable by nothing client-facing;
the delegate is still a thin `SECURITY DEFINER` shim in `api`; no client
role is granted anything on `workspace`. WP 03.02's performance evidence
is gathered against the `IN (subquery)` usage above, not against a
standalone call to either function — that is the shape every real caller
will use.

# ADR-0029: RPC/API routes are the default client-access pattern for the new engines; direct PostgREST reads are the named exception

**Status:** Proposed — governs every read/write path built from Platform
Activation Slice 1 onward; free to revise until the first Slice 1 client
code lands
**Date:** 2026-08-19
**Related:** `../adr/0024-request-context-resolved-in-the-database.md`,
`../operations/ROLES.md` §7, `../architecture/SYSTEM_ARCHITECTURE.md`
§12.1, `../../implementation/PLATFORM_ACTIVATION_PROGRAMME.md` §3,
`../../implementation/SLICE_0_ACTIVATION_INFRASTRUCTURE.md` WP 0.1

## Context

Twenty-two epics are complete, tested against staging, and reachable by
**nobody** — `authenticated` holds zero grants on any of the six
workspace-scoped schemas except where an individual epic opened one
table's read path (`docs/operations/ROLES.md` §2.4: "opened per table,
by the epic that ships it"). Platform Activation's first user-facing
slice needs a real answer to *how the client reaches a new engine at
all*, and every later slice inherits whatever is decided here — this is
exactly the kind of decision `implementation/templates/ADR_WORKFLOW.md`
requires an ADR for: expensive to reverse once dozens of screens are
built against it, and a pattern every future contributor is expected to
follow without re-litigating it per screen.

### The two real alternatives

**A · Direct PostgREST reads**, under per-table `authenticated` grants,
exactly as `ROLES.md` §7 rule 3 already permits ("opened per table,
never per schema... only where membership alone is the complete
permission answer"). The client queries `property.locations` or
`work.engagements` directly; Postgres RLS is the only thing standing
between a request and a cross-tenant read.

**B · RPC/API routes.** The client calls a contract function — either a
Postgres `SECURITY DEFINER` function invoked via `supabase.rpc()` (the
pattern Epic 07/08 already established:
`supabase.schema("api").rpc("my_assets", ...)`,
`src/lib/householdItems.js`), or a Vercel serverless route
(`api/*.js`) matching the AI Gateway's own shape
(`api/_lib/aiGateway.js`). Either way, the function or route enforces
capability and permission itself, rather than relying on a grant plus a
policy to do it implicitly.

### Why the two are not equivalent risk

RLS policies exist for every engine already built — written, and
structurally tested — but `MASTER_CONTEXT.md` §12's standing P0 is that
**not one of them has been exercised against a live client, ever**. A
policy that has only ever been read, never queried against by a real
authenticated session with a real membership, is an unverified claim
wearing the shape of a guarantee. Option A would make that unverified
claim the *sole* boundary in production the first time any Slice 1
screen ships.

Option B does not remove the need to eventually verify RLS — capability
and permission checks written into a function are still checks that can
be wrong. What it changes is the failure mode: a missing or wrong check
inside a function fails the specific call that exercises it, loudly, in
a way this session's own diagnostic discipline is built to catch before
trust is placed in it (the same style as every `VERIFY_*.sql` written
this session). A missing RLS clause fails silently, by construction —
the query simply returns fewer or more rows than it should, with
nothing about the response shape signalling that anything went wrong.

This is the same reasoning ADR-0024 already applied to *where* context
gets resolved ("in the database until a gateway exists"); this ADR
applies it specifically to *how the client reaches an engine's data*,
which ADR-0024 did not itself decide.

## Decision

**RPC/API routes are the default for every new client-facing read or
write path from Platform Activation Slice 1 onward.** A function
(Postgres `SECURITY DEFINER`, called via `supabase.rpc()`, or a Vercel
route under `api/*.js`) is written per operation, and it — not a bare
table grant — is what enforces capability and permission.

**Direct PostgREST reads remain permitted, narrowly**, only when all
three are true:

1. The read is a single table, not a join or aggregation the RLS policy
   would need to reason about across tables.
2. The table's RLS policy has already been verified against a live
   client for at least one real account — not merely diagnosed against
   staging via `psql`, but actually exercised through the application.
3. The read genuinely needs nothing beyond "does this membership grant
   visibility of this row" — no additional capability check, no
   cross-engine business rule.

Epic 07's `fetchHouseholdItems()` → `api.my_assets()` and Epic 08's two
document read switches already satisfy this bar and are **not**
required to be rewritten as a Vercel route — they stand as the
precedent this exception is written to preserve, not to expand from.

**A missing function or route is the correct default failure**, in
preference to a missing grant. Where a Slice needs a read this ADR's
exception doesn't cover, the answer is to write the function, not to
widen the exception.

## Consequences

**Makes easier**

- Every Platform Activation screen's data layer has one shape to
  review, rather than a screen-by-screen judgement call between "grant
  a table" and "write a function."
- A capability or permission defect fails the specific call that
  exercises it, discoverable the same way this session's diagnostic
  sweep found every real bug it found — by running something and
  watching it fail, not by auditing a policy file for what it forgot.
- Slice 1 onward can cite one ADR instead of a paragraph in a
  (superseded) planning document — this ADR exists specifically so that
  citation is possible.

**Makes harder**

- More functions to write than tables to grant — a real, ongoing cost
  every Activation Slice pays, not a one-time setup cost.
- The exception in this decision (direct reads, narrowly) requires
  judgement to apply correctly per table; a future contributor could
  plausibly widen it past what's intended without realizing they're
  doing so. The three-part test above exists to make that judgement
  checkable rather than a feeling.

**Rules out**

- Opening a table-wide `authenticated` grant on any of the six
  workspace-scoped schemas as a first step for a new screen — every
  such grant must be justified against this ADR's exception, not
  assumed as the default path `ROLES.md` §7 rule 3 already permitted in
  principle.
- Treating an RLS policy's existence as sufficient verification on its
  own — the standing P0 (live verification) is not superseded by this
  ADR; it is a precondition for the exception clause, stated explicitly
  as condition 2 above.

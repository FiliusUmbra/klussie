# ADR-0024: Request context is resolved in the database until a gateway exists

**Status:** **Accepted** 2026-08-14
**Date:** 2026-08-13
**Related:** `../architecture/SYSTEM_ARCHITECTURE.md` §12.1,
`../architecture/SUPABASE_ARCHITECTURE.md` §6 §7 §20 §23 (conflict 1),
`../architecture/PLATFORM_DOMAIN_MODEL.md` Rule 11,
`../IMPLEMENTATION_ROADMAP.md` §14 (WP 03.09),
[0004](0004-domain-events-via-security-definer-rpc.md),
[0023](0023-identity-display-resolution-versus-row-visibility.md),
[0026](0026-membership-helper-lives-in-public.md)

## Context

`SYSTEM_ARCHITECTURE.md` §12.1 is unambiguous about where request context
comes from:

> **Responsibilities.** Terminating external requests. Authenticating via
> Identity. **Resolving the request context once** — identity, workspace,
> membership, scope, capabilities — and passing it immutably inward.

and states the rule it exists to protect:

> Context is resolved **once per request** and passed inward as an
> immutable value. Engines do not re-resolve it and do not call Capability
> or Workspace per operation.

Work Package 03.09 is "Resolve request context once at the gateway."

**There is no gateway.** This is not a gap in the implementation; it is
the shape of the product as built:

| Surface | Reality |
|---|---|
| Reads and writes | The Vite SPA calls PostgREST directly. Twenty-one distinct tables across `src/lib` |
| Realtime | Three client-held subscriptions — `messages.js:103`, `messages.js:121`, `requests.js:199` |
| Server endpoints | Exactly two: `api/ai-intake.js` and `api/translate-message.js`. `verifyAuth` in `api/_lib/auth.js` has no other caller |

So `SUPABASE_ARCHITECTURE.md` §7's three access paths exist in this
codebase as two: the direct client read path, and the elevated background
path. **The gateway-mediated path has no traffic on it at all.**

§6 and §7 already resolved the tension between RLS-as-only-gate and
context-resolved-once, and the resolution assumes a gateway is there for
the remainder:

> The application layer is the permission system. RLS is a hard backstop
> that assumes the application is already correct and refuses to rely on
> it.

**What §6 does not say is what "the application layer" means when, for
most reads, there is nothing between the client and the database.** That
is the question this ADR answers, and answering it in passing inside
WP 03.09 would set the pattern for every engine that follows.

### The real alternatives

**A · Build the gateway in Epic 03.** Route the twenty-one table reads
through new server endpoints, resolve context there, pass it inward.

Rejected on three grounds, each sufficient. It is a rewrite of every data
path in the product, against roadmap Rule 7 ("extend before rewriting")
and §6's 1–3 hour package sizing — it would make Epic 03 both the
highest-risk and the largest epic in the roadmap. It cannot cover
Realtime: `SUPABASE_ARCHITECTURE.md` §7 puts Realtime subscriptions on
the direct client path precisely because a subscription is not a request
and has no gateway to pass through. And it would be built with no read in
the product that currently requires it — §7's test for gateway mediation
is a read depending on a capability, a scoped role, a bilateral grant or
a classification split, and Epic 03 introduces none of those. ADR-0010
rejected exactly this shape of speculative structure, for exactly this
reason, and that judgement has not aged badly.

**B · Resolve client-side.** The client fetches its own context once,
holds it, and passes an active workspace into every query; RLS backstops
it.

Rejected. The client's claim about its own context becomes an input to
access decisions, which is a second permission path and a direct
violation of `PLATFORM_DOMAIN_MODEL.md` Rule 11. RLS would then be the
only real gate — the posture §23 conflict 1 exists to reject — with the
client-side context as decoration that a reviewer could mistake for
enforcement. The worst property here is not that it is wrong; it is that
it looks right.

**C · Resolve in the database.** A `STABLE`, `SECURITY DEFINER` resolver
evaluated once per statement, called by RLS policies and by the workspace
engine's client-facing contract in a dedicated exposed schema.

## Decision

**Request context is resolved in the database, once per statement, by the
Workspace engine's own resolver. The gateway is deferred to the epic that
first has a read requiring it.**

Three parts:

1. **The resolver is the application layer for the direct-read path.**
   Epic 02 established the *pattern* for when client code cannot reach an
   engine's schema: a `SECURITY DEFINER` delegate somewhere PostgREST
   exposes (ADR-0023 as implemented, following ADR-0004). Epic 03 inherits
   the pattern and does not reuse its location — ADR-0026 places the
   Workspace engine's client-facing contract in a dedicated `api` schema
   rather than `public`, and decides the placement and grants in detail.

2. **"Once per request" becomes "once per statement", and this ADR says
   so rather than claiming otherwise.** `STABLE` guarantees a single
   evaluation within one statement. A screen making four queries resolves
   context four times. That is weaker than §12.1 specifies, it is the
   strongest guarantee available without a gateway, and it is the
   property WP 03.02's performance evidence must actually demonstrate —
   once per statement, not once per row, which is the failure mode §20
   names as the most likely cause of catastrophic degradation.

3. **The removal trigger.** The first read that genuinely requires
   capability resolution, scoped-role evaluation against the location
   tree, or a classification split is gateway-mediated, and **the epic
   that introduces that read builds the gateway.** On the current
   sequence that is Epic 04 (Capability) at the earliest and Epic 06
   (Location) for scope. This is the removal trigger roadmap Rule 10
   requires of any deliberate shortcut, and it is a condition on the
   platform rather than a date.

**A future gateway calls this resolver; it does not become a second
one.** When the gateway is built, the resolver stays where it is and
gains a caller. Two resolvers would reintroduce the parallel-path problem
this ADR is avoiding.

**This is a placement decision, not the Gateway.** ADR-0026 gives the
workspace engine's client-facing contract a dedicated `api` schema rather
than `public`. `api` does not authenticate, rate-limit, version, dispatch,
or originate `correlation_id` — the responsibilities
`SYSTEM_ARCHITECTURE.md` §12.1 and §19 assign to the API Gateway. It is
reached by PostgREST exactly as `public` is, under the same direct-read
posture §7 describes. Building it does not discharge this ADR's removal
trigger, and a future reader finding both should not conclude that it
has.

## Consequences

**Makes easier**

- WP 03.09 becomes implementable inside Epic 03, at its stated size,
  without touching a read path that works.
- One object answers "who is this, in which workspace, with what
  membership" for both RLS policies and RPC callers. There is one place
  to test, one place to profile, and one place to change.
- Realtime keeps working. A subscription and a query resolve context the
  same way, because the resolution is beneath both of them.
- Cache invalidation on membership change — which §12.1 calls a
  first-order concern — is trivially correct, because there is no cache
  to invalidate. A revoked membership stops working on the next
  statement.

**Makes harder**

- **The performance property §12.1 was buying is not obtained.** Resolving
  per statement rather than per request means a request pays for context
  as many times as it issues queries. This is the cost, it is not
  hypothetical, and it is why the resolver must be `STABLE` and indexed
  on both directions of membership (`SUPABASE_ARCHITECTURE.md` §10).
- Two things now called "context" will exist once a gateway is built —
  the per-request immutable value §12.1 describes, and the per-statement
  resolution beneath it. Whoever builds the gateway must make the first
  derive from the second rather than duplicate it.
- The Workspace engine's contract is reachable only as SQL. A JavaScript
  module wrapping it is dead code until a server caller exists — the
  finding Epic 02 WP 02.07 made about `api/_lib/identity.js`, and the way
  WP 03.08 is most likely to go wrong.

**Rules out**

- Client-supplied workspace context as an authority for any access
  decision, permanently.
- Building the API Gateway inside Epic 03.
- A second context resolver, in the gateway or anywhere else.

## What this does not resolve

**Capabilities.** §12.1 names capabilities as part of the resolved
context. There is no Capability engine (Epic 04) and no capability to
resolve. The resolver returns identity, workspace, membership and the
scope recorded on the membership; the capability set joins it in Epic 04,
which is also the earliest point the gateway question can return.

**Scope evaluation.** The resolver returns the scope *recorded on the
membership*. Resolving that scope against a location subtree —
`SYSTEM_ARCHITECTURE.md` §6.2's dependency on the Location engine — has
no tree to resolve against until Epic 06. Consumer workspaces, which is
all of them today, never use scope.

**The reads membership does not answer.** Marketplace discovery and
public professional profiles are reads where membership alone is *not*
the complete answer, so §7 would make them gateway-mediated. They are not,
because there is no gateway. [ADR-0025](0025-marketplace-visibility-survives-epic-03.md)
records what happens to them instead.

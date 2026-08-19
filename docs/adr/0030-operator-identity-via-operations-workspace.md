# ADR-0030: Operator identity is a membership in a real, internal Operations Workspace — not a new access mechanism

**Status:** Proposed — governs Platform Activation Slice 0 WP 0.3
onward; free to revise until the first real membership is seeded
**Date:** 2026-08-19
**Related:** `../architecture/PLATFORM_DOMAIN_MODEL.md` §2, §6.2, §7,
§8, `../architecture/SYSTEM_ARCHITECTURE.md` §12.3,
`../operations/ROLES.md` §2.3, `../../implementation/ROADMAP_C_PLATFORM_OPERATIONS.md`
§4 §10, `../../implementation/SLICE_0_ACTIVATION_INFRASTRUCTURE.md` §3

## Context

`SYSTEM_ARCHITECTURE.md` §12.3 names an Administration Engine and states
its boundary precisely — "owns no customer data whatsoever... support
access to a customer workspace is a time-bounded, audited,
consent-governed membership, the same mechanism as contractor access,
not a parallel one." No migration has ever created it, and no operator
has ever logged in: `klussie_operator` (`ROLES.md` §2.3) is a `NOLOGIN`
group role, like every engine role — meant to be assumed by a
`SECURITY DEFINER` function, never connected to directly. Nothing about
*how a real person becomes an operator* has been decided.

`ROADMAP_C_PLATFORM_OPERATIONS.md` named three options and endorsed
none of them, deferring the decision to an ADR explicitly (§4, §10).
This is that ADR.

### The real alternatives

**A · A boolean/flag on the existing identity**, checked by a separate
admin route (`ROADMAP_C` §4's second option: "a separate Vercel-
protected admin route reusing Identity"). The person's existing login
works; a flag (`is_operator`, an environment-variable allowlist, or
similar) gates a parallel set of routes.

**B · A wholly separate internal tool**, outside this platform's own
authentication and data model entirely.

**C · An internal Operations Workspace.** A real workspace
(`workspace.workspaces`), holding a new capability, with real people as
real members (`workspace.memberships`) — an operator authenticates
exactly as any other person, and gains a *second membership* the same
way anyone gains a second workspace.

### Why A and B were rejected

**Option A creates a second permission-evaluation path.** `PLATFORM_DOMAIN_MODEL.md`
§28 rule 11 states this platform's own governing constraint plainly:
"Permissions are evaluated at the membership, always, with no second
path." A boolean flag checked outside the membership model is precisely
the second path that rule forbids — not a stylistic preference, the
specific failure mode §7's "single evaluation point" requirement exists
to prevent. It would also mean two places to audit instead of one, and
two chances to get revocation wrong — the exact cost §8 names for
rejecting a parallel "external access" concept in favour of reusing
ordinary membership.

**Option B is explicitly named as the least consistent choice already**
in `ROADMAP_C` §10, and this ADR does not find new grounds to revisit
that. It would duplicate identity, duplicate audit, and produce exactly
the "two systems that happen to share a color palette" `GUIDANCE_SYSTEM.md`
§A.6 warns against in a different context — here applied to security
posture rather than voice.

### The tension Option C raises, and how it resolves

`PLATFORM_DOMAIN_MODEL.md` §6.2 requires every capability be
*"describable to a customer... if a capability cannot be explained to
the person paying for it, it is too fine-grained."* A `platform_operations`
capability has no paying customer, by design — nobody will ever buy it.

Read narrowly, this could be taken as a reason to reject Option C. It
is not: §6.2's rule is stated inside a section (§6) whose own header
and every worked example concern *product* capabilities — the ones
that appear in `§6.7`'s catalogue and `§6.8`'s preset table, sold
through `§24`'s subscription tiers. `§12.3` already describes
Administration as structurally different from every other engine in
the platform ("owns no customer data whatsoever") — it is the one
engine in the whole map whose entire purpose is internal. This ADR
resolves the tension by stating explicitly what §6.2 leaves implicit:
**a capability used solely to gate the platform's own operator tooling,
never granted to any customer-facing plan or preset, is a legitimate,
narrow exception to §6.2's describability rule** — not a violation of
it, because §6.2's rule is answering "would a customer understand what
they're buying," a question this capability was never going to be
asked.

This exception is deliberately narrow: it applies to exactly the
capability this ADR creates, not as a general licence for future
non-customer-facing capabilities to skip §6.2 without their own
stated reasoning.

## Decision

**Stand up one real workspace as the Operations Workspace**, using the
platform's existing membership machinery unmodified:

```
workspace.workspaces
  type: 'business'   -- the closest existing preset; type is a label
                      -- only (Principle 1), not a branch, so no new
                      -- check-constraint value is added for this
  name: 'Klussie Operations'

platform.capabilities
  + platform_operations   -- new capability, held only by this one
                           -- workspace, never referenced in any plan's
                           -- capability_keys

workspace.memberships
  role: free text, unconstrained (workspace.workspaces.role already
        has no check constraint — 'Administrator', 'Support', etc.
        require no schema change)
```

**Why `type = 'business'` rather than a new fourth type value.**
`workspace.workspaces.type` is a three-value check constraint
(`'personal' | 'professional' | 'business'`). Extending it for one
internal workspace would touch a table every other engine already
depends on, for a distinction the column is explicitly documented as
not carrying ("type is a preset name and a label for humans — nothing
more," §6.1). Reusing `'business'` costs no migration to a shared table
and is more consistent with what `type` is actually for than adding a
value would be.

**An operator's access to a *customer's* workspace remains exactly what
§8/§12.3 already specify** — a separate, time-boxed, scoped, audited
membership grant, requested explicitly, never implied by Operations
Workspace membership. This ADR governs only how a person becomes *an
operator at all*; it does not change, and does not need to change, how
an operator subsequently reaches a customer's data.

**The first membership is seeded by migration, by hand** — there is no
self-service path to becoming an operator, deliberately. Every
subsequent operator is added the same way an enterprise customer's
employee is invited (§8, direct invitation), reusing existing machinery
rather than building onboarding for a small internal team.

**Every `SECURITY DEFINER` function built for Administration checks the
caller's real, active Operations Workspace membership before doing
anything privileged** — no function trusts `klussie_operator` role
membership alone as proof of anything about *who* is calling, exactly
as no engine function today trusts its own engine role as proof of
caller identity.

## Consequences

**Makes easier**

- One identity, one login, for a person who is both a customer and an
  operator — Principle 3 is honoured by construction, not worked
  around.
- Support access to a customer workspace is *literally* the same
  mechanism as contractor access, because it now is one — no special
  case in the access-grant code path for "an operator is asking."
- Zero new schema beyond one capability row and workspace conventions
  already in place. The cheapest possible answer and the
  architecturally consistent answer are the same answer here.
- Every operator action is auditable through the same audit mechanism
  every other membership-authorized action already uses — `§12.3`'s own
  trust guarantee becomes checkable rather than merely stated.

**Makes harder**

- The Operations Workspace's own permission model (which role can do
  what) must be designed with the same care as any customer-facing
  role table (`§7`) — this is real, if small, design work this ADR
  creates rather than avoids.
- A workspace-shaped mental model for "who can operate the platform" is
  slightly less direct than a flag would have been, for anyone reading
  the schema for the first time without this ADR's context — mitigated
  by this document existing and being cited from the schema's own
  comments.

**Rules out**

- Any future "is this user an admin" boolean anywhere outside the
  membership model — if one is ever proposed, it is a violation of this
  ADR and of `§28` rule 11, not a shortcut.
- Extending `workspace.workspaces.type`'s check constraint for this
  purpose. If a future, unrelated need genuinely requires a fourth
  workspace type, that is a separate decision on its own merits, not
  retroactively justified by this one.
- Treating `platform_operations` as a precedent for skipping `§6.2`
  generally — the exception is stated narrowly, for this one capability,
  for the stated reason.

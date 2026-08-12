# ADR-0014: The Capability Model is the platform's organising concept

**Status:** Implemented (domain model; no application code yet)
**Date:** 2026-08-11
**Related:** `0013-workspace-centred-platform-domain-model.md` (extends,
does not supersede), `../architecture/PLATFORM_DOMAIN_MODEL.md` §6,
`../MASTER_CONTEXT.md`

## Context

ADR-0013 established the workspace-centred domain model and stated that
workspace type selects default capabilities and never determines
behaviour directly. That was correct but under-specified: it appeared as
one rule inside a section about workspace types, which left capabilities
looking like an implementation detail of typing rather than the thing
typing is a convenience for.

Review of the model against ten-year growth found that this ordering is
backwards, and that the weaker framing would not survive contact with
delivery pressure. The specific failure mode: with capabilities presented
as secondary, the first genuinely awkward enterprise requirement invites
a workspace-type branch "just this once," and platform fragmentation
begins there — not as a decision anyone makes, but as an accumulation of
locally reasonable ones.

Two further gaps were identified at the same time:

- **Property Memory is insufficient on its own.** It models what is true
  about a property. It cannot express how an organisation wants things
  done — preferred providers, budget thresholds, approval rules,
  permitted working hours, safety procedures. Without that, the
  intelligence is permanently new: it can know everything about a
  building and still recommend a supplier the customer sacked last year.
- **Provider selection was modelled as a marketplace function.** That
  makes the marketplace the entry point for every need, which is the
  marketplace ceiling the platform reframe (`PLATFORM_DOMAIN_MODEL.md`
  §1) exists to escape, and it makes the platform structurally unable to
  conclude "this is under warranty, you need nobody."

Alternatives considered for the capability question:

1. **Leave capabilities as a rule inside the workspace-type section.**
   Least churn. Rejected: the rule is only as strong as its prominence,
   and this rule is the one holding the platform together.
2. **Drop workspace types entirely, leaving only capabilities.** Purest.
   Rejected: types carry genuine meaning for humans — customers, pricing,
   onboarding and support all need a word for "a workspace like this one."
   Removing the vocabulary does not remove the need for it.
3. **Promote capabilities to the organising concept; demote types to
   presets.** Chosen.

## Decision

**A workspace is defined by the capabilities enabled for it, not by its
type.** Personal, Professional and Business become named default
capability bundles — presets — with no structural standing.

Recorded as **Platform Principle 1**, placed ahead of all previously
recorded principles, with the principle count going from eleven to
thirteen. `PLATFORM_DOMAIN_MODEL.md` §6 becomes a dedicated Capability
Engine chapter covering capability anatomy, the argument against type
branching, the catalogue, presets, evolution and withdrawal.

The substantive commitments:

- **No behaviour anywhere in the platform may branch on workspace type.**
- **Capability and permission are two independent gates, and both must
  pass.** Capability answers "is this behaviour available in this
  workspace at all?"; permission answers "may this member do it?" No
  feature may check only one.
- **Capabilities are coarse, durable and customer-describable**, and are
  distinct from feature flags, which are engineering rollout mechanisms
  and temporary.
- **Capabilities declare dependencies**, which the engine resolves.
- **Withdrawing a capability removes behaviour, never data.**
- **New products are new capabilities.** Energy monitoring, IoT, building
  automation, insurance, ERP and accounting integration, facility
  management and municipality management are each a capability or a
  preset over the existing model — never a new architecture.
- **A subscription is a commercial wrapper around a capability bundle**,
  which makes pricing and packaging product work rather than engineering
  work.

Three further concepts are added as first-class, each recorded as or
supported by a principle:

- **Workspace Knowledge** (§18.2) — how a workspace wants things done,
  belonging to the workspace, distinct from Property Memory which belongs
  to the property. Knowledge is *binding* on the platform, not a signal
  to be weighed. Memory is interpretation and always revisable.
- **Provider Intelligence** (§14.3) — provider selection as a reasoned
  judgement across all supply sources: internal teams, contracted
  providers, trusted providers, manufacturer networks, marketplace supply
  and future external directories. **The marketplace becomes one source
  among many.**
- **The six-stage intelligence lifecycle** (§19.2) — Observe →
  Understand → Plan → Recommend → Execute → Learn, closing back into
  memory and knowledge. Recommend is a human gate and is not optional;
  delegated execution is a customer-granted capability, never a default.

And a new principle governing their relationship, **Principle 10,
Intelligence Before Marketplace:** users describe outcomes, the
intelligence determines execution, and marketplace selection is one
execution mechanism rather than the starting point.

## Consequences

**Makes easier**

- New verticals, markets, tiers and products become configuration. The
  platform experiences expansion as a new preset, not an architectural
  event.
- Pricing and packaging move out of engineering entirely.
- Testing collapses from "every feature against every type" to "every
  feature with its capability present and absent" — two states,
  regardless of how many presets exist.
- Customers who do not fit a category stop being special cases.
- The intelligence can produce the answer that earns no commission —
  warranty claims, "wait and watch," internal dispatch — which is what
  makes it worth asking next time.
- Enterprise sales stop requiring a category change for a single
  capability.

**Makes harder**

- Local readability drops: a feature's code no longer reveals which
  workspaces receive it.
- Capability granularity is a permanent judgement call with no correct
  answer, and the boundary against configuration settings is genuinely
  unclear (`PLATFORM_DOMAIN_MODEL.md` §30).
- The dependency graph between capabilities can tangle as the catalogue
  grows.
- Two gates instead of one means every feature has two ways to be wrong,
  and checking only the permission gate is the likely error.
- Provider Intelligence introduces a real, unresolved conflict between
  individual customer outcome and marketplace liquidity (§30). It is
  named rather than solved.

**Rules out**

- Any conditional on workspace type, anywhere, for any reason.
- A capability that only some workspace types may hold.
- Treating a stated Workspace Knowledge rule as advisory, or routing
  around it.
- Silently promoting an inferred pattern into a binding policy.
- The marketplace as the entry point for expressing a need.
- Destroying data when a capability lapses.

**Relationship to ADR-0013.** This ADR extends ADR-0013 and does not
supersede it. Every decision in ADR-0013 — one identity, unlimited
workspaces, permissions on membership, the shared physical model,
workspace-to-workspace marketplace, events as the spine,
workspace-scoped subscriptions — stands unchanged. What changes is the
*ordering*: ADR-0013 recorded that type does not determine behaviour;
this ADR makes the capability the organising concept the platform is
built around, and reduces type to a preset name.

ADR-0013 stated that the Platform Principles are amended only by an ADR
that explicitly supersedes it. This is that ADR, and the amendment is the
addition of Principles 1 (Capability) and 10 (Intelligence Before
Marketplace), with the remainder renumbered accordingly. ADR-0013's text
is left intact per the convention in `README.md` that an ADR records a
point-in-time decision and is never rewritten.

**Cost already incurred.** Unchanged from ADR-0013 and now larger in
scope: the current application has no capability concept, no workspace
concept, no Workspace Knowledge, and a marketplace that is the entry
point rather than an execution route. The governing rule remains
`PLATFORM_DOMAIN_MODEL.md` §29 — the model may be complete while the
implementation is partial, but nothing may be built that contradicts the
model. The migration path belongs to `DATABASE_ARCHITECTURE.md` and to a
roadmap decision, not to this ADR.

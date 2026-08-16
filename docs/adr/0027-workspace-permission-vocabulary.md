# ADR-0027: The Workspace Permission Vocabulary

**Status:** **Accepted** 2026-08-14
**Date:** 2026-08-14
**Related:** `../architecture/PLATFORM_DOMAIN_MODEL.md` §7, §8,
`../architecture/SYSTEM_ARCHITECTURE.md` §6.2, §19,
`../IMPLEMENTATION_ROADMAP.md` §14 (WP 03.08),
[0014](0014-capability-model-as-the-platform-organising-concept.md)
(extends, does not amend — see "Relationship to ADR-0014" below),
[0026](0026-membership-helper-lives-in-public.md)

## Context

WP 03.08, "Add the workspace engine contract," reads in full: *"Resolve
context, decide permission, explain a decision."* Deciding a permission
needs a vocabulary of permissions to decide among, and none exists.
`PLATFORM_DOMAIN_MODEL.md` §7 states the shape that vocabulary must have
but does not enumerate it:

> The role names differ by context because the humans using them differ
> — a household does not want to be told it has "administrators" — but
> **the underlying permission grammar is identical.**

That sentence is the whole of what §7 commits to structurally: one
grammar, expressed through different role names per workspace-type
preset. §7's own table gives five qualitative *shapes* ("everything,
including ending the workspace"; "read only, often scoped") rather than
a concrete, checkable list — enough to design a role from, not enough to
write `decide_permission()` against.

### Why this is a separate vocabulary from capabilities, not a second draft of one

`ADR-0014` and `PLATFORM_DOMAIN_MODEL.md` §6.2 make this a structural
requirement, not a style choice:

> **Capability and permission are two independent gates, and both must
> pass.** The capability answers *"is this behaviour available in this
> workspace at all?"* The permission (§7) answers *"may this member, in
> this workspace, with this role and scope, do it?"* … no feature may
> check only one.

An architecture feasibility exercise preceding this ADR drafted a
formalization of the existing capability catalogue
(`PLATFORM_DOMAIN_MODEL.md` §6.7) and, separately and only after being
corrected on scope, drafted this vocabulary. The correction matters
enough to record: the two must never collapse into one list, or the
two-gate rule becomes unenforceable by construction — a single vocabulary
cannot answer two independent questions.

### Why this vocabulary is narrow, not platform-wide

`SYSTEM_ARCHITECTURE.md` §6.2 states what the Workspace engine owns:

> **Owns.** Workspace aggregate. Membership aggregate, including roles,
> scopes, states and expiry… **Permission evaluation lives here and
> nowhere else.** No engine implements its own access logic.

This says the Workspace engine is the single *evaluator* for every
permission decision platform-wide. It does not say the Workspace engine
*names* every permission every future engine will ever check. A
permission like "create a service request" belongs to the Work tier,
decided when that tier is built, evaluated through the same mechanism
this ADR establishes — not invented here, ahead of the engine it
describes. Naming those permissions now would be designing Epics 09–14
from inside Epic 03.

## Decision

**Twelve permissions, three groups, one grammar, mapped onto the
`workspace.memberships` table WP 03.01 already built.**

### The grammar

> `<resource>.[qualifier.]<verb>` — verb always the final segment, always
> one short word, drawn from a small, closed, reusable set: `view`,
> `edit`, `rename`, `archive`, `invite`, `approve`, `revoke`, `manage`.

Two resources at this layer: `workspace` (lifecycle) and `membership`
(who has access, and what they can see about who else does).

### The vocabulary

**`workspace.*` — lifecycle**

| Key | Decides |
|---|---|
| `workspace.rename` | Changing the workspace's name or visual identity (§5) |
| `workspace.settings.edit` | Jurisdiction, residency, other workspace-level configuration (§5, §25) |
| `workspace.archive` | Ending the workspace (§9: archived, never deleted) |

**`membership.*` — granting, changing, ending access**

| Key | Decides |
|---|---|
| `membership.invite` | Direct invitation of a new member (§8) |
| `membership.join.approve` | Approving a request-to-join — §8's second route, named for the frozen term "Request to join" |
| `membership.role.edit` | Changing another member's role |
| `membership.scope.edit` | Narrowing or widening another member's scope (§7) |
| `membership.revoke` | Ending another member's access |
| `membership.approval.manage` | Configuring the workspace's join policy — open / approval-required / domain-verified (§8) |

**`membership.*` — visibility**

| Key | Decides |
|---|---|
| `membership.own.view` | Seeing one's own membership — granted to every role, every workspace, always (§7: "A member sees their own membership always") |
| `membership.roster.view` | Seeing other members' memberships |
| `membership.history.view` | Seeing ended memberships as history (§8: "administrators") |

`membership.own.view` is listed rather than hardcoded as an implicit
exception, because §7's explainability requirement (below) means even an
always-granted decision must be traceable to a stated permission, not an
unstated assumption baked into the evaluator.

### Role → permission mapping, per preset

Roles bundle these twelve keys; the keys themselves never change across
presets — this is what "the underlying permission grammar is identical"
means, made concrete.

**Personal**

| Role | Grants |
|---|---|
| Owner | all twelve |
| Household member | `workspace.rename`, `membership.own.view`, `membership.roster.view` |
| Guest | `membership.own.view` |

**Professional**

| Role | Grants |
|---|---|
| Owner | all twelve |
| Manager | `workspace.rename`, `membership.own.view`, `membership.roster.view` |
| Employee | `membership.own.view` |
| Contractor | `membership.own.view` |

**Business**

| Role | Grants |
|---|---|
| Administrator | all twelve |
| Manager | `workspace.rename`, `membership.own.view`, `membership.roster.view` |
| Team member | `membership.own.view` |
| Auditor / Viewer | `membership.own.view`, `membership.roster.view`, `membership.history.view` |
| External provider | `membership.own.view` |

**The one judgement call in these tables, stated rather than hidden.**
§7's shape for Household member/Manager/Manager is *"everything
operational; no commercial or membership control."*
`workspace.settings.edit` (jurisdiction, residency) reads as
commercial-adjacent and is withheld from this shape;
`workspace.archive` ends the workspace and is withheld from every role
but the top one, regardless of shape. `workspace.rename` is
presentational rather than commercial, so it is granted here — the
frozen text does not settle this precisely, and a reviewer could
reasonably move it. This is the one place this ADR asks for explicit
sign-off rather than claiming a citation it does not have.

**What Employee/Team member/Contractor/External provider mostly do is
correctly almost nothing in this vocabulary.** §7's shape for them —
*"perform and record work"* and *"time-boxed, scope-limited"* — names
actions in the Work tier that no engine owns permissions for yet. That
these roles reduce to `membership.own.view` and nothing else here is the
scoping boundary working as designed, not a gap.

### Explainability

Every decision names the membership consulted, the role it carried, and
the permission key evaluated — satisfying §7's third property:

> For any decision, the platform must be able to say *why* — which
> membership, which role, which grant.

### Roles stay unconstrained in the schema

`workspace.memberships.role` (WP 03.01) has no check constraint,
reasoned there as: *"role vocabulary… is not closed"* — §7 names custom
roles composing permissions as a stated future direction. This ADR
depends on that decision rather than revisiting it.

**Implementation recommendation, not decided here:** the role →
permission mapping should live as *data* — `(context, role_name) →
permission_key[]` — not branching logic, per `PLATFORM_DOMAIN_MODEL.md`
§28 Rule 7: *"Configuration over branching… roles… are data."* This is
what lets a future custom role compose an arbitrary bundle of these
twelve keys with no schema change and no deploy. Where that table lives,
and its exact shape, is WP 03.08's own implementation decision.

### The real alternatives

**A · One combined vocabulary for capabilities and permissions.**
Rejected outright — ADR-0014 and §6.2 require two independent gates; a
single vocabulary cannot answer two independent questions, and the
architecture is explicit that conflating them "produces security bugs."

**B · A platform-wide permission catalogue, covering every engine now.**
Rejected. Every business-action permission for Property, Work, Knowledge
and Commerce would be invented ahead of the engine it describes,
contradicting `SYSTEM_ARCHITECTURE.md` §2's ownership model (one owner
per aggregate, and permission logic follows ownership) and the roadmap's
own just-in-time decomposition principle (§1: work packages are written
"when the ground they stand on is real").

**C · Twelve permissions, scoped to what the Workspace engine itself
owns. Chosen.**

## Consequences

**Makes easier**

- WP 03.08 has a concrete vocabulary to implement `decide_permission()`
  against, sized to the package roadmap §6 requires (1–3 hours).
- Every later engine inherits a stated grammar (`resource.qualifier.verb`,
  an eight-word closed verb set) rather than inventing its own naming
  convention independently — Property, Work, Knowledge and Commerce each
  face "name our permissions" once, with a pattern already proven.
- Custom roles (§7's stated future) are a data change under this design,
  not a schema change.

**Makes harder**

- Twelve permissions is deliberately incomplete as a *platform*
  permission system — it answers nothing about what an Employee may do
  to a service request, and a reader expecting a full catalogue will not
  find one here. That absence is intentional and is restated in "What
  this does not resolve" below so it is not mistaken for an oversight.
- The `workspace.rename` judgement call (above) is real interpretation
  of a qualitative frozen description, not a citation — a future
  reviewer could reasonably reach a different answer and will need to
  know this was a call, not a fact.

**Rules out**

- A permission key that also functions as a capability key, or vice
  versa.
- Hardcoded `if (role === …)` branching for any of these twelve
  decisions — the roadmap's own Rule 7 and this ADR's own recommendation
  both point at data.
- Any other engine defining its own membership-management or
  workspace-lifecycle permission — those stay Workspace-engine-owned,
  permanently, per §6.2's ownership statement.

## Relationship to ADR-0014

**This ADR does not amend ADR-0014 and does not touch the capability
catalogue.** It sits beside it: ADR-0014 governs the first gate
(capability), this ADR governs the second (permission), and the two-gate
rule that requires both is unchanged by either. No capability key is
referenced anywhere above; no permission key resembles a capability key
in the vocabulary formalized alongside this ADR's drafting.

## What this does not resolve

**Permissions for every other engine.** Property, Work, Knowledge and
Commerce each need their own vocabulary, following this grammar, decided
when that engine's epic is planned — not before.

**Scope resolution against a location tree.** `membership.scope.edit`
names the *permission to change* a membership's scope; resolving what a
scope actually restricts depends on the Location engine (Epic 06) and
is unbuilt. The permission is real; its enforcement is partial until
then, exactly as ADR-0026 already states for the membership helper's
`scope` column.

**The `workspace.rename` judgement call**, named above, not settled.

## As implemented (WP 03.08)

**Built exactly as decided, with the naming refined once before
implementation** — the twelve keys above are the refined form (e.g.
`membership.scope.edit`, `membership.approval.manage`), not the initial
draft's more verbose `membership.manage.change_scope` /
`membership.manage.configure_approval_mode`. The refinement changed
surface naming only; every grammar rule, role mapping and scoping
boundary in this ADR held unchanged through implementation.

**Four objects**, following the split ADR-0026 established:

- `workspace.role_permissions` — the vocabulary as configuration, keyed
  naturally by `(workspace_type, role_name, permission_key)`, no
  surrogate identifier. `permission_key` is constrained to exactly the
  twelve keys above; `role_name` is deliberately unconstrained, matching
  `workspace.memberships.role`'s own posture (migration 0030).
- `workspace.resolve_context(workspace_id)` — "resolve context": the
  caller's own membership in one workspace. Not `SECURITY DEFINER`,
  granted to nobody.
- `workspace.decide_permission(workspace_id, permission_key)` — "decide
  permission" and "explain a decision" together: always exactly one row,
  including when the caller holds no membership at all — deny-by-default
  expressed as data (`granted = false`, `membership_id`/`role` null),
  not an absent row a caller would have to interpret.
- `api.resolve_workspace_context()` / `api.decide_permission()` — thin
  `SECURITY DEFINER` delegates, the only objects `authenticated` can
  reach.

**One clarification added during implementation, not a deviation.**
`decide_permission` takes arguments (`workspace_id`, `permission_key`),
which could look like it repeats the finding that changed
`api.current_workspace_memberships()`'s shape (ADR-0026 "As
implemented"): a function whose argument varies per row cannot achieve
once-per-statement RLS evaluation. It does not apply here, and the
migration's own header says why: `decide_permission` is a point query,
called once by something asking "may I do this one thing" — never
embedded in an RLS policy's per-row predicate, which is what the earlier
finding was specifically about. The two are different usage shapes, not
a contradiction.

**Verified on staging**, `klussie-staging` (`mxcuxnvjfnktwjcmkqqk`):
grant posture (no client role reaches the engine logic or the raw table;
only `authenticated` reaches the two delegates); the seed matches this
ADR's tables exactly — 53 rows, the three top roles holding all twelve,
`membership.own.view` held by all twelve roles; and a real behavioural
proof — a synthetic Household member membership correctly granted
`workspace.rename`, correctly denied `workspace.archive`, both decisions
naming the membership and role that produced them, and a caller with no
membership at all correctly denied with null explanation rather than an
invented one.

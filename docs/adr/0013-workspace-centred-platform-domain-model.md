# ADR-0013: Adopt a workspace-centred platform domain model

**Status:** Implemented (domain model; no application code yet)
**Date:** 2026-08-11
**Related:** `../architecture/PLATFORM_DOMAIN_MODEL.md`,
`../architecture/ARCHITECTURE.md`, `../MASTER_CONTEXT.md` §6,
`../product/PROPERTY_MEMORY.md`, future `../architecture/DATABASE_ARCHITECTURE.md`

## Context

Klussie was built as a home-services marketplace. Its identity model
follows the shape almost every marketplace starts with: a person has a
profile, and a person may additionally "become a pro," which attaches a
professional profile to that same person. Role is therefore an attribute
of the human being.

That shape works until any of the following is required, all of which the
stated ten-year ambition requires:

- **A professional who is also a homeowner.** Under the current model the
  same person's private property history and their commercial identity
  live on one account with no boundary between them.
- **An organisation as a customer.** Hotels, warehouses, schools,
  hospitals and municipalities are named targets. An organisation is not
  a person, cannot authenticate, and has employees whose access must be
  granted, scoped and revoked without touching those employees as
  individuals.
- **An employee acting on an employer's behalf.** Their access must end
  when their employment does, and their private data must never be
  visible to their employer.
- **Legal and commercial facts.** Contracts, invoices, tax registration,
  insurance and payouts belong to legal entities, not to human beings. A
  person may direct several companies and be employed by another.
- **Data isolation, subscriptions, AI context and jurisdiction.** Each
  needs a boundary. Under the current model there is no boundary
  available except the person.

The alternatives genuinely considered:

1. **Keep role on the account, add an organisation concept later.** The
   conventional path. It is also the migration that most consumer
   products fail to complete, because it must be performed underneath
   every row and every access decision written on the assumption that one
   user owns everything — and it becomes urgent exactly when the first
   enterprise customer is trying to buy.
2. **Separate consumer and enterprise products sharing some services.**
   Fast to start. It permanently doubles the cost of every capability,
   splits the professional supply pool, and makes the natural growth path
   (sole trader → firm → company with sites) a migration and a churn risk
   at each step.
3. **Workspace-centred model** — one permanent identity per person,
   unlimited workspaces, permissions on membership. More concept up front,
   imposed on a majority of users who will never need it.

## Decision

Adopt the workspace-centred model, specified in full in
`../architecture/PLATFORM_DOMAIN_MODEL.md`, which becomes the
highest-level architectural document in the repository.

In short:

- A person has exactly **one identity**, permanently. It carries no role,
  no reputation, no property and no subscription.
- A person may hold **unlimited workspace memberships**. Users switch
  workspace context; they never switch identity, and are never asked to
  classify themselves.
- **Every object belongs to a workspace and every action occurs within
  one.** The workspace is deliberately the same boundary for data
  isolation, permission evaluation, commercial relationship, AI context,
  marketplace participation and jurisdiction.
- **Workspace type (Personal / Professional / Business) selects default
  capabilities and never determines behaviour directly.** No code branches
  on type.
- **Marketplace interactions occur between workspaces**, which makes
  consumer, business and professional-to-professional transactions one
  mechanism.
- The physical model — **Property → Location → Asset**, with locations and
  assets nesting recursively — is shared by every workspace type. A
  kitchen and a machine hall are both Locations; a dishwasher and a
  forklift are both Assets.
- **Events are the spine.** Timeline, notifications, analytics, audit,
  search and (through timeline) Property Memory are derived from events
  rather than separately maintained.
- **Subscriptions belong to workspaces**, never to people.

The eleven Platform Principles recorded at the head of
`PLATFORM_DOMAIN_MODEL.md` are constraints; they are amended only by an
ADR that explicitly supersedes this one.

## Consequences

**Makes easier**

- Enterprise becomes reachable without a second product or a tenancy
  retrofit — the boundary exists from the beginning, while there is
  little data behind it.
- The professional-who-is-also-a-homeowner case stops being a conflict
  and becomes the ordinary case.
- Data residency and jurisdictional variation become properties of a
  workspace rather than a rearrangement of the platform.
- AI context inherits the permission boundary exactly, so the assistant
  can never become a route around access control.
- One capability improves every customer segment at once.

**Makes harder**

- Every query, permission check and context assembly carries the
  workspace dimension, including for the majority of users with exactly
  one workspace. The concept must be invisible in the product while being
  unavoidable in the code.
- Legitimate cross-workspace features — the marketplace, shared
  stewardship, group reporting — each need an explicit designed
  mechanism. There is no ad-hoc crossing.
- Recursive location and asset trees are harder to query, index and
  constrain than fixed hierarchies. This cost lands on
  `DATABASE_ARCHITECTURE.md`.
- Event schemas become long-lived contracts requiring real modelling
  discipline.
- Serving a hospital and a household with one engine creates permanent
  pressure toward the hospital, because the hospital pays more and asks
  louder. Only product discipline holds this off.

**Rules out**

- Role as an attribute of a person.
- Any second identity for the same human being.
- Parallel consumer and enterprise implementations of any capability.
- Behaviour that branches on workspace type.
- Separate concepts for residential and commercial space, or for
  domestic and industrial equipment.
- Onboarding that asks a person whether they are a homeowner, a
  professional or a business.

**Cost already incurred, stated honestly.** The current application does
not implement this model. Belgium-specific behaviour is embedded in the
product, the catalog taxonomy is hardcoded seed data, identity carries
role, and there is no workspace concept anywhere. Adopting this model
means the existing schema and application are a partial and diverging
implementation of it. The governing rule is in
`PLATFORM_DOMAIN_MODEL.md` §29: **the model may be complete while the
implementation is partial, but nothing may be built that contradicts the
model.** The migration path itself is deliberately not decided here —
it belongs to `DATABASE_ARCHITECTURE.md` and to a roadmap decision,
not to the document that defines the target.

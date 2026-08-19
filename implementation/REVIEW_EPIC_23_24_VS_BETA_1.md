# Architectural Review — Epic 23/24 vs. Beta 1

**This document owns:** a one-time architectural review answering one
question — has Platform Operations / Platform Activation changed the
"Not Scheduled" status of Epic 23 (Enterprise Features) and Epic 24
(Integration Engine) in `docs/IMPLEMENTATION_ROADMAP.md`? It does not
propose implementation. **No code, migration, or ADR was written to
produce this review** — every claim below was checked against the
actual schema, the actual completed epics, and the actual roadmap
documents, per the same discipline this session has used throughout.

**Status.** Final recommendation. No action items follow from this
document directly — see §8.

**What was read to produce it.** `docs/IMPLEMENTATION_ROADMAP.md`
(Epic 23/24's own definitions, §10, and the full epic sequence
surrounding them), `PLATFORM_ACTIVATION_PROGRAMME.md`,
`PLATFORM_DOMAIN_MODEL.md` (§5, §6, §7, §8, §12.2, §14.2, §22, §24,
§25), `SYSTEM_ARCHITECTURE.md` §12.2, `MASTER_CONTEXT.md`, the ADR
index (no ADR touches either epic), every `implementation/epic-01`
through `epic-22` directory's presence and `COMPLETION.md` cross-
references (none names a forward dependency on Epic 23 or 24), and
direct inspection of the live schema for the specific mechanisms Epic
23/24 would extend — `workspace.memberships.scope`, the membership
helper (`0031_membership_helper.sql`), the capability dependency graph,
and `src/lib/auth.jsx`'s existing OAuth support.

---

## 1 · Executive Summary

**Neither Epic 23 nor Epic 24 has become a Beta 1 prerequisite.**
Platform Operations and the Platform Activation Programme did not
change this — if anything, building them out in detail *sharpened* why
the original "demand-gated" call was correct, because it forced a
concrete check of every mechanism Epic 23/24 would extend against what
Beta 1's own Slices 0–5 actually need.

**Every one of the eight named sub-features across both epics falls
into Category C or D.** None is Category A. One — scoped roles at
depth — is the closest to Category B and is examined in the most
detail below precisely because it's the one worth being sure about,
not because it turned out to be required.

**No functionality moves from Epic 23/24 into the Platform Activation
Programme.** §4 states this explicitly, as instructed. The Programme's
existing placement of these capabilities — folded into Slice 9,
demand-gated, unchanged from `MASTER_CONTEXT.md`'s own prior stance —
is correct and is left as written.

**One clarification worth recording, because it's the kind of
confusion this review exists to prevent:** Slice 0's own recommended
client-read strategy ("RPC/API routes") is an **internal implementation
pattern** (Vercel serverless functions, the same shape the AI Gateway
already uses) and has no relationship to the **API Access capability**
in §6.7 (programmatic access sold to enterprise customers). Building
Slice 0 does not consume, require, or partially implement Epic 24.

---

## 2 · Review of Epic 23 — Enterprise Features

Roadmap definition, verbatim: *"Scoped roles at depth, approval
workflows, compliance obligations, enterprise reporting, workspace
groups."* Five features, reviewed individually.

### 2.1 · Scoped roles at depth

**Category C**, with the most caveats of any item in this review — read
in full before treating this as a simple deferral.

**What actually exists today, checked directly.** The mechanism is
*structurally* present and *functionally* inert. `workspace.memberships.scope`
(a `jsonb` column, added in Epic 03) is selected and returned by the
membership helper (`0031_membership_helper.sql`), but nothing anywhere
in the codebase evaluates it against a location subtree. §7 of the
domain model states this was accepted deliberately: "Consumer
workspaces will never use it. Enterprise workspaces cannot function
without it" — but *evaluating* a scope (checking whether a member's
grant actually covers the location being accessed) is the missing
piece, not merely a UI for setting one.

- **Why this category.** Real enforcement — checking a member's scope
  against a location subtree on every access decision — is genuinely
  unbuilt work, not a configuration gap. It matters when a workspace
  has enough locations that "whole workspace or nothing" stops being
  acceptable: a hotel chain's Antwerp site manager who must not see
  Brussels. No Beta 1 persona reaches that scale — Roadmap A's own
  landlord example (§3.3, three flats) explicitly describes scope as
  invisible at that size, expressed as a single "guest, one property
  only" toggle, which is achievable today without subtree enforcement
  at all (a guest membership can simply omit access to the other two
  properties' rows via the ordinary membership-to-property relationship,
  no `scope` column evaluation required).
- **Which completed engines depend on it.** None. Workspace (Epic 03)
  created the column and never built its evaluation; no later epic
  references it.
- **Which Product Experience depends on it.** Roadmap C names it as
  "mattering more" for Professional-tier multi-site firms (§6) and
  Roadmap C's own support-access flow uses the word "scoped" — but, per
  the check below, that usage does not require subtree evaluation.
- **Does Platform Operations depend on it?** **This is the one place
  the review looked hardest, because it's the one place a "yes" would
  have been a real finding.** Slice 0's own design (`SLICE_0_ACTIVATION_INFRASTRUCTURE.md`
  §3.1) uses **role names** (Administrator, Support) to separate
  operator permissions inside the Operations Workspace, not location
  subtree scope. Support access to a *customer's* workspace (§8, §12.3)
  is a **whole-workspace, time-boxed membership** — "scoped" in the
  sense of "scoped to this one workspace, not the operator's other
  access," which every membership already provides by construction, not
  in the sense of "scoped to a subtree within it." A support agent
  helping a Beta-1-era customer with one property does not need subtree
  enforcement to do so safely. **Conclusion: no, Platform Operations
  does not depend on subtree-level scope enforcement for Beta 1.**
- **Will the customer ever notice its absence?** Not at Beta 1's scale.
  A multi-property landlord or a growing firm will, eventually — which
  is exactly why this is Category C rather than D.
- **Does delaying it create architectural debt?** **Yes, one real
  instance worth naming plainly:** if any Beta-1-adjacent screen (a
  household-guest invitation toggle, an operator support-access button)
  is built to *look* like it offers scoping without the enforcement
  behind it, that is a trust-breaking bug waiting to happen, not
  debt in the ordinary sense. The recommendation is narrow and
  concrete: **any UI built before this enforcement exists must offer
  only whole-workspace or no-access, never a scope picker that appears
  to work but silently doesn't enforce anything.** This is a design
  constraint on Slices 0–6, not a reason to pull Epic 23 forward.

### 2.2 · Approval workflows

**Category C.**

- **Why this category.** This is the Procurement capability (§6.7) plus
  the "Enterprise approval" workflow definition (§14.2's table) —
  granted only to Business/Enterprise presets (§6.8's table), and named
  explicitly in Roadmap A §7 as something "a Business-as-customer
  workspace additionally experiences... once Procurement is granted,"
  outside the core journeys every Beta-1 persona uses.
- **Which completed engines depend on it.** None. The Workflow Engine
  (Epic 09) already supports arbitrary versioned definitions — an
  approval workflow is a *definition an operator would author* (Slice 8
  of the Programme, Catalogue), not new engine capability. This is the
  clearest example across both epics of a feature that is genuinely
  "configuration, not code" already, per §14.2's own rule 3: no engine
  work is blocked, only the definition-authoring tool (itself Slice 8,
  already correctly sequenced post-Beta-1).
- **Which Product Experience depends on it.** Roadmap A §7 only, and
  only for the Business-as-customer case explicitly scoped to Slice 6.
- **Does Platform Operations depend on it?** No.
- **Will the customer ever notice its absence?** Not a Beta 1 customer.
  A school or hospital procuring at scale would, immediately — which is
  precisely the real-enterprise-customer trigger Epic 23 was designed
  to wait for.
- **Architectural debt from delaying?** None identified. The Workflow
  Engine's own design (versioned definitions, no hardcoded processes)
  means adding this later costs a definition and a Catalogue-tool
  interaction, not a schema change.

### 2.3 · Compliance obligations

**Category C for the Compliance/Advanced Compliance *capability*; the
underlying primitives are already Category A-adjacent — already
built, already usable.** This distinction matters enough to state
before the category verdict.

- **Why this category.** "Compliance obligations" as a formal,
  capability-gated bundle (statutory inspections, evidence chains,
  regulator-facing reporting for Advanced Compliance) is Business/
  Enterprise-tier only (§6.8). But the two engines it would be *built
  from* — Document validity periods (§12, Epic 08, **complete**) and
  Maintenance obligations (§13.1, Epic 10, **complete**) — are not
  gated behind the Compliance capability at all; they're baseline
  engine behaviour every workspace already has access to. A
  professional's own insurance certificate expiring, or a customer's
  boiler-service obligation coming due, needs *only* the Document and
  Maintenance engines already built — not Epic 23.
- **Which completed engines depend on it.** None depend on it; Document
  and Maintenance are already functionally sufficient for Beta-1-scale
  certification/warranty tracking (Roadmap A §4's own worked example —
  a warranty threshold nudge — is built entirely on Epic 08's
  `warranty_expires_on` column, sitting unused today, with zero Epic 23
  involvement).
- **Which Product Experience depends on it.** Roadmap C §3.3 (Trust &
  Safety's certification-review queue) and Roadmap B §2 (a
  professional's own compliance documents) both use *document
  validity*, not the *Compliance capability* — confirmed by re-reading
  both roadmaps' own capability tables, which list Compliance/Advanced
  Compliance as Business-preset rows separate from the base Document
  row they actually depend on.
- **Does Platform Operations depend on it?** No — Trust & Safety's
  certification queue (Slice 5, inside Beta 1) needs Document validity
  only, already available.
- **Will the customer ever notice its absence?** A household or sole
  trader, no. A regulated Business/Enterprise customer needing
  statutory-inspection evidence chains, yes — and that customer doesn't
  exist yet.
- **Architectural debt from delaying?** None — the dependency graph
  already proves this (Compliance's own two declared dependency edges,
  `compliance->asset_management` and `compliance->document_intelligence`,
  are both satisfied by already-complete engines, so granting the
  capability later is additive, not a redesign).

### 2.4 · Enterprise reporting

**Category C.**

- **Why this category.** §22's own text names this precisely:
  "customer-defined reporting, which enterprises will require and
  which is a capability rather than a structural change" — the Analytics
  Engine (Epic 21, **complete**) already exists and already separates
  workspace-level and platform-level analytics correctly; what's absent
  is letting an enterprise customer *author their own report shape*,
  which no Beta-1 persona needs.
- **Which completed engines depend on it.** None — Analytics is
  complete and sufficient for Beta 1's own needs, including the
  Programme's own Activation Ratio dashboard (§4 of the Programme),
  which is a bespoke *internal* view built by Platform Operations
  directly, not an instance of customer-defined reporting.
- **Which Product Experience depends on it.** None of the three, at
  Beta 1 scale.
- **Does Platform Operations depend on it?** No — worth stating
  explicitly since it's the most plausible place a "yes" could have
  hidden: the Overview/Marketplace dashboards (Roadmap C §3.1/§3.4) are
  operator-authored views over the platform-tier Analytics tables,
  built directly, not a case of *customers* defining *their own*
  reports.
- **Will the customer ever notice its absence?** Not at Beta 1.
- **Architectural debt from delaying?** None — Analytics' own two-schema
  separation (§22) was designed exactly so this could be added later
  without restructuring anything.

### 2.5 · Workspace groups

**Category C — and the most clearly deferred of all five**, because the
domain model states its own deferral reasoning directly rather than
this review inferring it: §5 says plainly, *"It is deliberately not in
the initial model, because a group is only meaningful once
multi-workspace enterprises exist, and introducing it early would put a
second, mostly-empty boundary into every access decision."*

- **Which completed engines depend on it.** None — `workspace.workspaces`
  has no group column, no group table exists, and no epic references
  one.
- **Which Product Experience depends on it.** None. Roadmap C's own
  Marketplace/Overview screens operate per-workspace; nothing in any of
  the three roadmaps assumes a group umbrella.
- **Does Platform Operations depend on it?** No.
- **Will the customer ever notice its absence?** Only a genuine
  multi-workspace enterprise (the hotel-chain example the domain model
  itself uses) — and per §5's own words, the concept isn't even
  meaningful before that customer exists.
- **Architectural debt from delaying?** None — this is the one item
  where the frozen architecture itself already made this exact call, in
  writing, before this review started.

---

## 3 · Review of Epic 24 — Integration Engine

Roadmap definition, verbatim: *"Adapters, outbound event subscription,
inbound data as commands through the normal gates."* Three features.

### 3.1 · Adapters (ERP, IoT, external system connectors)

**Category C for "a real customer's ERP," Category D for the more
speculative examples (IoT/building-automation/smart-home) the domain
model itself names as "how it evolves" rather than as designed
today.**

- **Which completed engines depend on it.** None — `SYSTEM_ARCHITECTURE.md`
  §12.2 is explicit that the Integration Engine "owns no domain data...
  every ingested fact becomes a command to the engine that owns the
  concept," meaning it's a *front door*, not infrastructure any other
  engine's own contract depends on. No schema exists for it at all
  (confirmed — no migration references an `integration` schema or
  adapter registry).
- **Which Product Experience depends on it.** None. All three roadmaps
  place API Access/Enterprise Integrations only in Slice 9
  ("Extension & Global"), the explicitly demand-gated tier.
- **Does Platform Operations depend on it?** No.
- **Will the customer ever notice its absence?** Not a Beta 1 customer
  — a household or a sole trader has no ERP to connect.
- **Architectural debt from delaying?** None.

### 3.2 · Outbound event subscription

**Category C.**

- **Why this category.** §16's own "how it evolves" names this as a
  genuine future capability that "comes almost free once events are
  genuinely the spine" — a statement about *ease*, not about *urgency*.
  No Beta-1 persona has an external system to subscribe.
- **Which completed engines depend on it.** None — every engine already
  emits events correctly (per this session's own extensive verification
  work); subscription is a consumer of that stream, not a precondition
  for it existing.
- **Product Experience / Platform Operations dependency.** None.
- **Architectural debt from delaying?** None — explicitly named in the
  architecture as *cheap* to add later precisely because events are
  already the spine.

### 3.3 · Inbound data as commands through the normal gates

**Category C, with one important clarification that could otherwise be
mistaken for a Category A finding.**

A real payment provider (audit §2.1, needed for Roadmap B's Payments
capability and Roadmap C's billing operations) will eventually need a
**webhook** — Stripe or similar calling back into the platform to
confirm a payment. It would be easy to read this as "Epic 24's inbound-
commands mechanism is therefore a Beta 1 dependency." **It is not:**

- A payment-provider webhook is narrow, single-purpose, and belongs to
  the **Billing Engine's own remaining scope** (already named and
  already tracked as blocked on a business decision, not an engineering
  gap) — a dedicated endpoint validating one provider's signature and
  calling one Billing contract function.
- Epic 24's Integration Engine is the **general-purpose** mechanism —
  an adapter registry, connection-health management, and a contract
  covering arbitrary future external systems. Building one narrow
  webhook handler for one payment provider does not require, and should
  not be built as, an instance of that general machinery.
- **This distinction is the review's clearest example of "do not move
  functionality because it might be useful."** The temptation to fold
  "well, we'll need *some* inbound-webhook handling eventually" into
  Epic 24 is exactly the reasoning this review was instructed to
  reject unless it's a genuine dependency — and it is not one here.

---

## 4 · Recommended changes to Platform Activation

**None.** Every feature reviewed in §2 and §3 lands in Category C or D.
The Programme's existing text (`PLATFORM_ACTIVATION_PROGRAMME.md` §5,
Slice 9) already places API Access, Enterprise Integrations, Federated
Identity, jurisdiction expansion and White Label together as
"demand-gated, matching `MASTER_CONTEXT.md`'s existing stance" — correct
as written, and this review found no reason to add scoped roles,
approval workflows, compliance obligations, enterprise reporting, or
workspace groups to any earlier slice either.

**Epic 23 and Epic 24 remain untouched, exactly as `IMPLEMENTATION_ROADMAP.md`
§10 already states them: "Not scheduled."**

**One documentation-only note worth making, not a Programme change:**
§2.1's finding (scoped-role enforcement is inert, not merely
unbuilt-UI) is real information the Programme's own Slice 0/6 work
should carry forward as a constraint, not as new scope — captured here
as a recommendation, not applied to the Programme document by this
review.

---

## 5 · Dependency graph

**Unchanged from `PLATFORM_ACTIVATION_PROGRAMME.md` §2/§5.** Stated
here to make the "no change" finding checkable rather than merely
asserted:

```
Beta 1 (Slices 0–5)
  └── depends on: Foundation/Physical/Work/Intelligence/Service/
                   Commercial tier engines (Epics 01–22), all complete
  └── does NOT depend on: Epic 23 (any of its 5 features)
  └── does NOT depend on: Epic 24 (any of its 3 features)

Slice 6 (Depth, post-Beta-1)
  └── may eventually want scoped-role enforcement (§2.1) once a
      multi-property/multi-site persona is real — not required to start

Slice 8 (Catalogue, post-Beta-1)
  └── is where "approval workflows" (§2.2) would actually be authored,
      once Procurement is granted to a real customer — the Workflow
      Engine that runs them already exists

Slice 9 (Extension & Global, demand-gated)
  └── absorbs Epic 23's remaining features (compliance obligations,
      enterprise reporting, workspace groups) and all of Epic 24 —
      exactly where the Programme already placed them
```

No arrow points from Epic 23/24 into Slices 0–5. This is the graph the
review set out to check, and it holds.

---

## 6 · Recommended execution order

Unchanged from the Programme's own §5. Explicitly: **do not schedule
any Epic 23/24 work packages before or during Slices 0–5.** The first
point at which any reviewed feature becomes worth scheduling is:

1. Slice 8 (Catalogue authoring tools) — if a real Business/Enterprise
   customer requests Procurement approval workflows, author the
   definition then, using tooling already scoped.
2. Slice 9 (Extension & Global) — everything else in §2/§3, triggered
   by an actual customer requirement, per Epic 23/24's own original
   "Not scheduled" reasoning, unchanged.

---

## 7 · Beta 1 readiness impact

**None — Beta 1 readiness is unaffected by this review.** No blocker
was found, no hidden prerequisite surfaced. The one finding with any
bearing on near-term work is §2.1's constraint (never build a scoping
UI that doesn't enforce), which is a guardrail on how Slices 0–6 are
built, not a new item added to Beta 1's scope or timeline.

---

## 8 · Final recommendation

**Epic 23 and Epic 24 should remain untouched.** Both stay exactly as
`IMPLEMENTATION_ROADMAP.md` already states them — "Not scheduled,"
built when a real customer's actual requirements demand each specific
feature, not before. The Platform Activation Programme's own treatment
of this territory (Slice 9, demand-gated) required no correction.

This review's value is not in changing a plan — it's in having actually
checked, feature by feature, against the real schema and the real
completed engines, rather than trusting the "demand-gated" label to
still be true after Platform Operations was designed. It is still true.
The one place that check earned its keep is §2.1: scoped-role
enforcement is not merely undone, it's actively inert code sitting in
the membership helper today, and the honest guardrail that finding
produces — never present a scope control that doesn't work — is worth
more to Beta 1's trustworthiness than either building Epic 23 early or
ignoring the column silently would have been.

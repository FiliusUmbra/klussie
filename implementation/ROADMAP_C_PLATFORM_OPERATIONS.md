# Roadmap C — Platform Operations (Admin)

**This document owns:** the product experience roadmap for the people who
run Klussie itself — support, trust & safety, marketplace operations,
platform configuration, and the operator's own view of platform health.
It does not own any customer- or professional-facing surface
(`ROADMAP_A_CUSTOMER_EXPERIENCE.md`, `ROADMAP_B_PROFESSIONAL_EXPERIENCE.md`).

**Status.** Planning, and genuinely greenfield. Unlike Roadmaps A and B,
which re-point largely-existing screens at real engines, **almost
nothing in this roadmap exists today** — not the schema, not the client,
not even an operator login. `SYSTEM_ARCHITECTURE.md` §12.3 names an
Administration Engine and states its boundaries; no migration has ever
created it. This roadmap is written from that architectural intent
outward, not from any existing implementation.

**This document is a detail reference, not a build schedule** — its
journeys, screens and permission design stand, but its own "Phase
C1/C2…" sequencing is superseded by the Activation Slices in
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, which schedule this roadmap's work *together with* Roadmap A's and
Roadmap B's — Platform Operations is never the last experience
considered for a given capability, and treating this document as an
independent backlog would silently reintroduce exactly that mistake.
Read that document first.

**The instruction this document takes most seriously:** *treat the Admin
Platform as a first-class product, not a collection of maintenance
screens.* Every section below is written against that bar — an operator
dashboard is not "a table with filters," a support tool is not "a raw
SQL client with a UI skin," and a configuration screen is not "an admin
page that edits rows nobody else sees." The people who use this product
run the business through it every day; it deserves the same design
discipline as the customer canvas.

---

## 1 · Who this experience is for

Applying the same Mirror Test discipline this whole platform is built on,
now to the *operator* rather than the customer:

| Operator persona | What they need from this product |
|---|---|
| **Support** | Find a workspace fast, understand its state at a glance, get time-boxed access to help — without ever "just querying the database" |
| **Trust & Safety** | A queue of reports and disputes, evidence attached, a decision trail — not a spreadsheet |
| **Marketplace operations** | Is supply meeting demand, where, and why not — liquidity as a real, watched number, not a hope |
| **Platform configuration** | Capabilities, plans, taxonomies, jurisdictions, workflow definitions — the actual knobs `PRODUCT_CONSTITUTION.md` Rule 2/3 promise exist |
| **Founder/single-maintainer today** | All of the above, worn simultaneously — which is exactly why this must be one coherent product and not five disconnected internal tools accreted over time |

**The architectural boundary that makes this safe to build as a
first-class product rather than a liability:** per §12.3, Administration
**owns no customer data whatsoever**. Every action it takes against a
workspace is a command to the engine that owns that data, audited like
any other caller, through the same time-boxed, consent-governed
membership mechanism a contractor uses (§8). This roadmap does not
propose a "god view" — it proposes a well-designed front end for a
deliberately constrained back end, and that constraint is the whole
reason this can be trusted with production data at all.

---

## 2 · Capability map — what this product owns and operates

Two different tables, because Admin has two distinct jobs: **operating**
the platform (every capability below, from the outside) and **owning**
the platform's own configuration (a narrower list, unique to this
roadmap).

### 2.1 · Cross-cutting operational surfaces

| Concern | What the operator does | Backing engine(s) | Built today |
|---|---|---|---|
| Workspace lookup & support access | Find any workspace; request scoped, time-boxed, audited access | Workspace, Audit | Not built |
| Trust & Safety | Triage reports, verify certifications, resolve disputes | `public.reports` (legacy, real data already), Marketplace | Legacy table exists; no admin UI anywhere |
| Marketplace health | Liquidity, funnel, match quality, response times | Analytics (platform tier), Provider Intelligence | Analytics engine built, zero wiring; no dashboard |
| Notification delivery health | Is the one-inbox promise actually being kept | Notification | Engine built, zero wiring |
| Search index health | Is public/private search actually current | Search | Engine built, zero wiring |
| Audit review | Who did what, when, under what authority | Audit | Engine built (write path only — §12 of `MASTER_CONTEXT.md`: "the audit write path was unallocated," now partially closed); no viewer |
| Subscription & billing operations | Plan changes, trial management, payment provider ops once it exists | Subscription, Billing | Subscription engine built, zero wiring; Billing/Payments not implemented at all (audit §2.1) |
| Feature rollout | Phased release of new capabilities | Capability (grant/withdraw), platform config | Mechanism exists (`workspace.grant_capability()`); no operator-facing rollout tool |

### 2.2 · Platform configuration (Administration owns this outright, per §12.3)

| What's configured | Why it must be Admin, not a migration | Built today |
|---|---|---|
| **Capability catalogue** (operator view) | New capabilities are the platform's normal mode of growth (§6.9) — this must eventually be authorable, not hand-migrated forever | `platform.capabilities` real, 27 rows seeded; no operator UI |
| **Plan definitions** | Pricing/packaging is explicitly "product work, not engineering work" (§24) | `platform.plans` real, 5 tiers seeded; no operator UI |
| **Jurisdiction rules** | "Launching a country requires configuration, not code" (§25) — today's Belgium-specific behaviour fails this test | No schema at all yet |
| **Taxonomies** (categories, services, asset types, location types) | Named tech debt today: "categories/services hardcoded seed data... adding a service needs a deploy" | Hardcoded in legacy seed data; real taxonomy-as-configuration not built |
| **Workflow definition catalogue** | "Every process is a workflow definition held as configuration" (§14.2) — someone authors these | Workflow engine real; no authoring UI, definitions currently seeded by migration only |
| **Feature rollout state** | Distinct from a capability (permanent, commercial) — an engineering rollout switch, temporary | Not built |

---

## 3 · Information architecture & navigation

This is genuinely new IA — there is no legacy admin app to evolve from.
Designed around the five operator jobs in §1, not around database
tables.

```
┌──────────────────────────────────────────────┐
│  Klussie Operations                    [you]  │
├──────────┬─────────────────────────────────────┤
│ Overview │   Platform health at a glance        │
│ Workspaces│  Find, inspect, support-access       │
│ Trust &  │   Reports queue, verification,        │
│ Safety   │   disputes                            │
│ Marketplace│ Liquidity, matching, funnel          │
│ Catalogue│   Capabilities, plans, taxonomies,     │
│          │   jurisdictions, workflows             │
│ Billing  │   Subscriptions, plan changes,         │
│          │   payments ops (once real)             │
│ Audit    │   The immutable record, searchable     │
└──────────┴─────────────────────────────────────┘
```

Seven destinations, each a real product surface, not a menu of raw
tables. Every destination below is described as a *product*, with the
interaction model stated explicitly — this is where "first-class
product" is either honoured or reduced to a promise.

### 3.1 · Overview

The operator's front door, deliberately shaped like a mission control
board, not a report. Answers, at a glance, without a click: how many
workspaces are active today, is the marketplace funnel healthy
(requests → quotes → bookings → completions, each stage's conversion,
per §22's funnel metric), is anything in the notification/search
pipeline falling behind, and — because this is a single-maintainer
project today — a single "needs attention" list surfacing exactly what
the Trust & Safety queue and any degraded pipeline are, so the operator
never has to visit every tab just to know nothing is wrong.

### 3.2 · Workspaces

A real search-and-inspect tool: search by name, owner, property address,
or ID; the result opens a workspace's own operator-facing profile —
capabilities held, subscription tier, membership list, property count,
recent activity, all read-only by default. **Requesting access is a
distinct, deliberate action** — a button that starts the same
time-boxed, scoped, consent-governed membership flow a contractor uses
(§8, §12.3), never an implicit "admin can already see everything."
The reason a stated purpose, an expiry, and (where the workspace's own
settings require it) the customer's own consent, are all part of this
flow, not an afterthought: this is the mechanism that makes the whole
Administration Engine trustworthy, and it deserves to be the most
carefully designed screen in this roadmap, not the most rushed.

### 3.3 · Trust & Safety

A real triage queue, not a table of `reports` rows. Each report opens
into a case view: the reporter, the reported workspace or person,
evidence (photos, messages, the relevant Service Record), a decision
history, and the actions available — warn, suspend a capability
(§6.10: suspension removes behaviour, never destroys the underlying
record), escalate, or close with no action. Certification verification
(today's `is_certified` flag, currently unverifiable by anyone) belongs
here too: a document-review queue once Document Intelligence exists,
turning a boolean nobody can check into an evidenced, auditable
decision.

### 3.4 · Marketplace

The liquidity dashboard `PRODUCT_CONSTITUTION.md`'s own KPI table
implies but nothing today measures: supply density by category and
region, unmet demand (requests that found no match), Provider
Intelligence's own explainability surfaced *to the operator* — if a
recommendation must be able to explain itself to a customer (§14.4),
the operator needs the same explanation at the aggregate level, to
notice when the selection function is starving new supply (§14.4's own
named, unresolved tension). This screen is where that tension becomes
watchable rather than theoretical.

### 3.5 · Catalogue

The configuration home for §2.2's table. Deliberately not one giant form
— five sub-sections (Capabilities, Plans, Taxonomies, Jurisdictions,
Workflows), each with its own editor shaped for what it configures:
capabilities and plans as dependency-aware builders (the same dependency
graph §6.7/§6.2's engine already enforces, made visible and editable
rather than only enforced silently); taxonomies as a tree editor
matching the recursive Location/Asset model (§10, §11) they configure;
workflow definitions as a real stage-and-transition editor, since §14.2
requires every definition be versioned and validated before activation —
an operator authoring a workflow by hand in a migration file today is
exactly the "code, not configuration" failure §25's jurisdiction test
warns against, generalized to process.

### 3.6 · Billing

Where subscriptions are managed (upgrade, downgrade, trial extension —
every action going through `workspace.grant_capability()`/
`withdraw_capability()` exactly as the customer-initiated path does,
never a privileged shortcut) and, once a real payment provider exists,
where payment operations live: failed payments, disputes, payout
review. Scoped deliberately small until Payments is real (audit §2.1) —
this section should ship its subscription-management half well before
its payment-operations half exists to build.

### 3.7 · Audit

A real viewer over `platform.audit_records` — searchable by actor,
workspace, action type and time range, exportable (§23's own stated
future: "export for a customer's own compliance systems," and the
operator needs the same capability for its own regulatory obligations).
Every action taken *anywhere else in this roadmap* — a support access
grant, a capability withdrawal, a plan change — must appear here,
because §12.3's own trust guarantee ("every action it takes is audited
as an administrative action") is only real if this screen exists to
prove it.

---

## 4 · Onboarding journey (for operators)

A genuinely new design problem — `GUIDANCE_SYSTEM.md`'s companion
architecture is written for customers and professionals discovering a
consumer product, not for a small, trusted internal team learning an
operations console. This roadmap proposes a **lighter-weight, role-aware
walkthrough** rather than reusing the Signal → Relevance → Delivery →
Memory loop verbatim:

1. **First login** — a short, one-time tour of the seven destinations
   (§3), framed as "what each tab is for," not a feature tour.
2. **First support-access request** — a Tier-A-equivalent guided moment
   the first time an operator requests access to a workspace, walking
   through why a reason and expiry are required — this is the one
   moment in this roadmap worth a genuine coachmark, because getting it
   wrong the first time sets a bad precedent for every time after.
3. **Everything else** — ordinary product discoverability (tooltips,
   empty states that explain themselves), not a guidance system. An
   operations console that nags its own operators has the wrong tone
   for who's using it.

**A real open question this roadmap does not resolve:** who *is* an
operator, technically? No `klussie_operator`-backed login exists today —
this needs its own authentication decision (a separate Vercel-protected
route, a capability-gated internal workspace, or a genuinely separate
app) before any of §3's screens can be built. Flagged in §10.

---

## 5 · Core operator journeys

### 5.1 · A customer reports a professional

Report arrives (legacy `reports` table, real today) → appears in the
Trust & Safety queue (§3.3) → operator reviews evidence, including the
relevant Service Record if one exists → decision recorded, with reasons,
in the case view → if action is taken against the professional's
workspace, it is a capability withdrawal or membership suspension, not a
row deleted anywhere — §6.10's rule ("withdrawing a capability removes
behaviour, never data") applies exactly as much to an enforcement action
as to a downgrade → the decision and every step are in the Audit trail
(§3.7) without the operator having to do anything extra to put it there,
because the actions themselves emit the events.

### 5.2 · Support needs to see inside a customer's workspace

Support search (§3.2) → workspace found → **request access**, stating a
reason and an expiry → (if the workspace's approval mode requires it,
§8) the customer is notified and can decline → access granted as a
real, scoped, time-boxed membership → support does whatever the customer
asked for help with, inside the *same product a customer would use*
(this roadmap does not propose a separate "admin view" of a workspace's
own data — support sees exactly what the member they're impersonating
would see, scoped by that membership, because a parallel omniscient view
is precisely the kind of second access path §7's "single evaluation
point" rule forbids) → access expires automatically, no manual
revocation step to forget.

### 5.3 · A new country launches

Jurisdiction rules configured (§3.5) — currency, tax treatment, invoice
requirements, licence-verification requirements — as data, not a
deploy. Taxonomies (categories, services, asset/location types) checked
or extended for the new market. This journey is the operational proof
of §25's own test: "launching in a new country should require
configuration and translation, not code." If this journey ever requires
an engineer, this roadmap has failed its own design goal.

### 5.4 · A new capability ships

An engineering team ships a new capability's engine (as every epic in
`MASTER_CONTEXT.md` has). The Administration Engine's operator adds it
to the catalogue (§3.5), decides which existing plans it belongs to
(dependency-checked automatically against §6.2's declared dependencies),
and — via feature rollout (§2.1's table) — grants it to a pilot cohort
of workspaces before it reaches the general plan population. This is
the concrete mechanism behind §6.9's "capability evolution... expected
to be unremarkable."

### 5.5 · Watching marketplace health day to day

The Overview (§3.1) and Marketplace (§3.4) screens are checked daily by
whoever is running the business — this is the journey that turns
"marketplace liquidity" from a principle in `PRODUCT_CONSTITUTION.md`
into a number someone actually watches and can act on (route more
outreach to an underserved category, notice a matching regression
before customers complain about it).

---

## 6 · Permissions, as designed here (not merely as experienced)

Unlike Roadmaps A and B, where permissions are pre-existing platform
concepts (§7) simply reflected in the UI, this roadmap must *design* the
operator permission model, because none of the following exists yet:

- **Operator roles, plural, not one omniscient "admin."** Support,
  Trust & Safety, and platform configuration are different jobs with
  different blast radii — Support should never be able to edit the
  capability catalogue; Catalogue editors should never need workspace
  support-access by default. §7's own "custom roles for enterprises,
  composing permissions rather than picking a preset" is the right
  model to borrow here, applied internally.
- **Every operator permission is still evaluated at a single point**
  (§7 rule 11) — there is no second, parallel authorization path for
  internal tools, ever, even though it would be the easy shortcut for
  a single-maintainer team to reach for.
- **The support-access mechanism (§5.2) is itself the permission
  model for customer data** — an operator's *own* role only ever
  determines whether they may *request* that access, never whether
  they may skip requesting it.

---

## 7 · Workflows this roadmap authors (rather than participates in)

Per §14.2, this is the one roadmap where workflow *definitions* are
authored, not merely experienced:

- **Inspection** (no fault to fix, produces a certificate) — authored
  here per-jurisdiction, experienced in Roadmap A/B.
- **Insurance claim** — documentation-first, assessor stage; the
  assessor role itself may be an operator-adjacent role or a genuinely
  external party, an open question for §10.
- **Enterprise approval** — thresholds and delegation rules are
  configured per-customer here (or, more precisely, this roadmap
  builds the tool a Business/Enterprise customer's own administrator
  uses — see the open question in §10).

---

## 8 · Screen inventory and build phases

Because almost nothing here exists, phases are sequenced by *what
Beta 1 operationally requires* rather than by capability elegance —
see `ROADMAP_SEQUENCING.md` for the cross-roadmap view; this section
states Roadmap C's own internal order.

**Phase C1 — Operator identity and the audit viewer.**
Before anything else: decide and build how an operator authenticates
(§4's open question), and ship the Audit viewer (§3.7) — every other
phase produces audit events worth nothing if nobody can read them yet.
Minimal Overview screen alongside it.

**Phase C2 — Workspace lookup and support access.**
§3.2 in full, including the consent-governed access-request flow. This
is the single highest-priority screen for operating Beta 1 responsibly —
Roadmaps A and B cannot go to real users without it.

**Phase C3 — Trust & Safety.**
§3.3, starting from the legacy `reports` table (real data today) and
growing into full evidence/decision tooling as Service Records and
Document verification come online.

**Phase C4 — Marketplace health.**
§3.4/§3.1's funnel view, once Analytics engine wiring exists (shared
dependency with the Analytics half of Roadmaps A/B).

**Phase C5 — Catalogue.**
§3.5, starting with the lowest-risk sub-section (taxonomies — closes
named tech debt directly) and building toward workflow definition
authoring, the most complex single screen in this entire document.

**Phase C6 — Billing operations.**
§3.6, subscription-management half first, payment-operations half only
once a real provider exists.

---

## 9 · Success metrics

Admin's KPIs are operational, not the customer-facing eight in
`MASTER_CONTEXT.md` §14 — but every phase still owes Rule 10 a reason:

| Phase | What it proves / protects |
|---|---|
| C1 | Every administrative action becomes provably auditable — a prerequisite for enterprise trust (§23), not a nice-to-have |
| C2 | Time-to-resolve a support request; zero instances of "admin just queried the database" |
| C3 | Time-to-resolve a trust & safety report; proportion of `is_certified` claims actually evidenced |
| C4 | Marketplace Liquidity becomes a watched, actionable number instead of an unmeasured principle |
| C5 | Time to launch a new taxonomy entry, plan, or jurisdiction rule — the direct measure of §25's "configuration, not code" test |
| C6 | Time to resolve a billing dispute once payments are real |

---

## 10 · Dependencies and open questions

- **No operator authentication mechanism exists.** This blocks Phase C1
  entirely and must be resolved first — options include a
  capability-gated internal workspace type (consistent with "one
  engine," but stretches the workspace concept toward something it
  wasn't designed for), a separate Vercel-protected admin route reusing
  Identity, or (least consistent with this platform's own architecture)
  a wholly separate internal tool. Recommend resolving this with an ADR
  before Phase C1 starts, not deciding it implicitly through
  implementation.
- **Payments blocks Phase C6's second half** exactly as it blocks
  Roadmap B's payout journey — same root cause, tracked once.
- **The Administration Engine itself has zero schema.** Every phase in
  this roadmap requires new migrations under `platform.*` (or a new
  schema of its own) before any screen can be built — this roadmap is
  the one place across all three where UX design and backend
  engineering must be scoped together from the start, not sequenced UX-
  then-backend as Roadmaps A/B mostly can be.
- **Open question:** does a Business/Enterprise *customer's own*
  administrator (configuring their workspace's approval rules, inviting
  their own team) belong in this roadmap or in Roadmap A/B as an
  "advanced settings" surface? Current recommendation: **Roadmap A/B** —
  it is workspace self-service, capability-gated like everything else in
  those roadmaps, and routing it through the operator product would
  quietly turn Administration into the "god engine" §12.3 explicitly
  forbids it from becoming. This roadmap's "Enterprise approval" row in
  §7 is about *authoring the workflow definition itself*, not about a
  customer configuring their own instance of it.
- **Open question:** insurance/claims assessment (§7) may need a fourth
  actor type (an assessor, possibly external to both the platform's
  workspaces and its operator team) that no part of the current domain
  model names. Worth a real product decision, not a default answer,
  before Phase C-adjacent work on Insurance claim workflows begins.

# Roadmap B — Professional Experience

**This document owns:** the product experience roadmap for every
workspace acting as a *supplier* of work — Professional workspaces (sole
traders and small firms) and any workspace's provider posture more
generally. It does not own the procuring side of the same workspaces
(`ROADMAP_A_CUSTOMER_EXPERIENCE.md` — a plumbing firm is a customer of the
platform for its own van and premises, a provider for its jobs, and this
document owns only the second half) or operator tooling
(`ROADMAP_C_PLATFORM_OPERATIONS.md`).

**Status.** Planning. **This document is a detail reference, not a build
schedule** — its journeys, screens, permission tables and capability map
stand, but its own "Phase B1/B2…" sequencing is superseded by the
Activation Slices in
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, which schedule this roadmap's work *together with* Roadmap A's and
Roadmap C's — never independently. Read that document first.

**Relationship to the frozen architecture.** Grounded in the same
research pass as Roadmap A — `PLATFORM_DOMAIN_MODEL.md` in full,
`SYSTEM_ARCHITECTURE.md`'s engine map, the capability catalogue, and the
current `src/pro/` implementation. Where this document simplifies, the
frozen documents are authoritative.

---

## 1 · Who this experience is for

| Provider | What "professional" means for them |
|---|---|
| A sole-trader plumber (Belgium's flexi-job regime, §25) | Professional workspace, one person, informal |
| A small electrical firm, three employees | Professional workspace, Team Collaboration enabled |
| A plumbing firm that also subcontracts overflow to another firm | Professional-to-professional marketplace transaction (§14.3's table, row 3) — same mechanism as being hired directly |
| A facilities contractor serving a hotel chain under a framework agreement | Professional workspace, Contracted-provider execution strategy rather than open marketplace (§14.4) |

**The load-bearing fact this roadmap is built on:** reputation belongs to
the *workspace*, never to the person (§14.3). An employee leaving does
not take the firm's record; a sole trader restructuring starts fresh.
Every screen in this roadmap that shows a rating, a review count, or a
job history must be unambiguous about which workspace it belongs to —
this is not a display nicety, it is the platform's own commercial
promise to the business.

---

## 2 · Capability map — what surfaces here, and how

| Capability | What the professional sees | Backing engine(s) | Client wiring today |
|---|---|---|---|
| **Marketplace Provider** | Leads, quoting, the job pipeline | Marketplace | Legacy tables (`service_requests`/`quotes` filtered to the pro); real engine unwired |
| **Portfolio & Reputation** | Public profile, published work, testimonials, rating | Marketplace (reputation), Property/Document (portfolio media) | Partially real (`ProProfile.jsx`, `PortfolioItemSheet.jsx`, `AddTestimonialSheet.jsx` — legacy schema) |
| **Scheduling** | Calendar, availability, dispatch | Not yet a named client surface anywhere | Fully unwired — no engine-backed scheduling exists in the client at all |
| **Billing** | Issuing invoices | Billing | Display-only demo invoice, no real terms/tax handling |
| **Payments** | Getting paid | Billing/Commerce | Not implemented — blocked on a real provider (audit §2.1) |
| **Fleet Management** | Vehicles as assets, usage-based service intervals | Asset (with fleet-specific attributes) | Unwired; this is the Asset engine applied to the firm's own vans — Mirror Test in practice |
| **CRM** | Client history, notes, repeat-business tracking | Marketplace/Conversation history, workspace-scoped | Unwired — today's "Jobs" list is a flat history, not relationship-aware |
| **Team Collaboration** | Employees, assignment, internal discussion | Workspace (membership + roles) | Structurally ready (Epic 03); no client UI for a Professional-preset team |
| **Procurement** *(Business preset)* | Approval chains for the firm's own purchases | Workflow | Unwired; only relevant once a Professional workspace grows into Business |
| **Compliance / Advanced Compliance** *(Business preset)* | Certifications, insurance documents, expiry tracking | Document (validity), Maintenance (obligations) | Unwired — this is also how the platform proves a provider's insurance/licence to a customer (§14.4's compliance signal) |
| **Analytics** *(Business preset)* | Conversion, response time, technician performance | Analytics | Built, zero wiring |
| **Notifications** | Leads, messages, schedule changes | Notification | Not built |
| **Workflow Automation** *(Enterprise)* | Auto-dispatch within stated bounds | Workflow | Unwired; explicitly never a default per §19.4 — always an opt-in delegation |

The professional's own premises, vans and tools also make it a customer
of **Property Management** and **Asset Management** — those screens are
Roadmap A's, reused unmodified here rather than rebuilt (§6.6: two
implementations for one need is exactly the fragmentation this
architecture forbids).

---

## 3 · Information architecture & navigation

### 3.1 · What exists today

Four tabs (`src/pro/ProApp.jsx`): **Dashboard**, **Jobs**, **Messages**,
**Profile**. The shape is sound and this roadmap keeps it — the changes
are in what each tab is backed by and one new tab this roadmap proposes
adding.

### 3.2 · What changes

| Tab | Today | Becomes |
|---|---|---|
| **Dashboard** | Leads list, quote action | The real-time view of the intelligence-driven pipeline: leads (Provider Intelligence match reasoning visible, not just a raw list — §14.4's "it must be able to explain itself" applies to what the pro sees too, not only the customer), today's schedule (once Scheduling exists), and a compact Analytics summary once that capability is granted |
| **Jobs** | Sent/booked/completed lists over legacy tables | Sourced from `work.engagements` and Service Records (§13.2). Gains a genuine Service Record editor — diagnosis, work performed, parts, evidence, the aftermath — replacing today's flat "mark complete" action with the structured record the whole platform's downstream value depends on |
| **Messages** | Unchanged shape, legacy data | Conversation engine, same as Roadmap A §3.2 — one engine, two experiences of it |
| **Profile** | Public profile editor, portfolio, testimonials | Splits into **Public Profile** (portfolio, reputation — what a customer sees) and **Business Settings** (team, billing, compliance documents, subscription/plan) — the same Identity/Workspace split as Roadmap A §3.2, applied to the provider side |

**One new tab this roadmap proposes: My Business.** Fleet, tools,
premises, team, and compliance documents in one place — the professional
workspace experiencing Property/Asset/Document/Team Collaboration for
*itself*, not for a customer's property. Justification: burying "my
firm's own van's service history" inside "Jobs" (which is about work for
others) would be exactly the kind of concept-blending §27 warns against
for workspace switching, applied at the tab level instead. This is the
one place this roadmap departs from "reuse Roadmap A's screens
unmodified" — the *components* are reused (the same Location tree, the
same Asset list), but they need their own destination because their
subject is the firm itself, not a client's property, and conflating the
two in one tab would make "whose home is this describing?" ambiguous —
the same ambiguity §27 forbids for cross-workspace confusion, now
avoided within one workspace's two postures.

### 3.3 · CRM as a lens, not a destination

CRM (§6.7) is presented as a filtered, relationship-aware view *inside*
Jobs (a client's full history, repeat-business flag, notes) rather than
a sixth tab — consistent with keeping the tab bar small and matching how
Analytics (§22) is a lens over existing data rather than a new data
model.

---

## 4 · Onboarding journey

**Already real:** "Become a Pro" (`BecomeProSheet.jsx`) is Layer 2.1 in
`GUIDANCE_SYSTEM.md` §A.8 — a working, unforced flow, reachable at any
time from the segmented role toggle. This roadmap's onboarding work
extends it, not replaces it.

| New moment | Signal | Tier | Notes |
|---|---|---|---|
| First portfolio item published | Portfolio entry created | Tier A | Extends Layer 4's table |
| First quote sent through the real Marketplace engine | Quote created via `work.quotes` | Tier A | Marks the cutover from legacy quoting, once it happens (Roadmap-B-Phase-B2 below) |
| First Service Record completed with full structure | A record with diagnosis + parts + evidence, not just "marked done" | Tier A | This is the highest-value habit this roadmap needs to build — see §5.5 |
| Second employee joins the workspace | Membership count crosses one on a Professional workspace | Tier A | Layer 3, already speced |
| Compliance document nearing expiry | Time-based | Tier B, always | Same mechanism as Roadmap A's warranty nudge (§A.5) — one signal type, two audiences |
| Subscription tier upgrade eligible (e.g. team size outgrowing Professional) | Inferred, never automatic | Tier B, offer only | Never auto-upgrades — Workspace Knowledge and billing changes are never silent (§18.2, §24) |

**A genuinely new onboarding problem this roadmap must solve that
`GUIDANCE_SYSTEM.md` does not yet cover:** teaching a professional to
write a *good* Service Record without making it feel like paperwork.
§13.2's own trade-off names this directly — "the platform's value
depends on records being written, which means the cost of writing them
is an architectural concern, not a UI detail." The onboarding answer is
progressive detail (§13.2): a first job produces a four-field record by
default; the AI Gateway proposes structure from a photo and a sentence;
mandatory fields exist only where Compliance genuinely requires them.

---

## 5 · Core user journeys

### 5.1 · Receiving and quoting a lead

Intent/Diagnosis are the customer's (Roadmap A §5.1); this journey picks
up at **Execution**, from the provider's chair. A lead arrives carrying
real context — the asset, its history, the property's accumulated
understanding (§14.3: "requests carry context, and that is the
platform's structural advantage") — not a bare description. The
Dashboard surfaces *why* this lead was matched to this workspace
(§14.4's explainability requirement), which today's flat lead list does
not attempt at all.

### 5.2 · Performing the work and closing the loop

Execution → Outcome. The Service Record is authored here, by the
professional, because "they were there" (§13.2's authorship rule).
Two-perspective visibility (§13.2's table) must be built into the editor
itself, not bolted on: facts about the work are shared with the
customer by default; margin, internal cost and supplier pricing are
private by construction, not by a checkbox someone can get wrong.

### 5.3 · Building trust with a new customer, cold

No shared history exists yet. Provider Intelligence's sixth source —
marketplace supply, ranked on certification, compliance-document
validity, availability and reputation (§14.4's table) — is what this
journey depends on. The professional's job here is making that
trustworthy at a glance: Portfolio & Reputation screens must show real,
specific work (`EXPERIENCE_VISION.md` §9's photography direction
applies as much to a pro's own portfolio as to platform marketing) —
never generic stock imagery, never claimed signals with no evidence
behind them (Rule 9, `PRODUCT_CONSTITUTION.md`).

### 5.4 · Running the firm, not just the jobs

Team Collaboration + My Business (§3.2) is where a Professional
workspace starts behaving like the Business preset it will eventually
become — assigning a job to a specific employee, tracking a van's own
service due date, seeing which technician's jobs get repeat bookings
(the CRM lens). This journey is the natural on-ramp from Professional to
Business tier (§24), and the UI should make that growth path visible
rather than requiring a support conversation to discover it.

### 5.5 · The Service Record habit (the journey the whole platform depends on)

Named separately because §13.2 is explicit that everything downstream —
Property Memory, Provider Intelligence, warranty tracking, compliance
evidence — is only as good as what gets written here. The product
target: **a four-field record must never feel like failure**, and a
two-hundred-field statutory inspection must never feel like the norm.
Progressive disclosure, AI-proposed structure, and mandatory fields
gated strictly by Compliance capability (never by ambient pressure to
"do it properly") are the design constraints, not suggestions.

---

## 6 · Permissions and roles, as experienced

| Role (Professional preset, §7) | What it looks like on screen |
|---|---|
| **Owner** | Everything, including ending the workspace, commercial settings, team management |
| **Manager** | Everything operational; no commercial or membership control — can quote, complete jobs, assign work; cannot change the plan or invite a new employee |
| **Employee** | Perform and record work; cannot alter commercial settings — sees their own assigned jobs primarily, the firm's full history if Team Collaboration's visibility is configured open |
| **Contractor** | Time-boxed, scope-limited (§8) — a specialist brought in for one job, sees only that engagement's conversation and the relevant asset, nothing else of the firm's book |

**Scoped roles matter here more than in Roadmap A** even at Professional
scale: a firm with two sites (a shop and a workshop) may want an
employee scoped to one. The UI should offer this as a per-invitation
choice, present but not foregrounded — most Professional workspaces
never touch it, exactly as §7 predicts.

---

## 7 · Workflows surfaced in this experience

The professional is the primary *author* of workflow transitions,
though never the author of workflow *definitions* (that's Roadmap C):

- **Residential repair** — the default, informal, most common shape.
- **Commercial maintenance** — scheduled, assigned, evidence expected,
  reported: the shape a Business-preset provider's own jobs take.
- **Warranty claim** — the professional's role is eligibility
  confirmation and manufacturer liaison, distinct from the customer's
  role of raising it.
- **Emergency response** — compressed, escalating; this is where
  Scheduling and Notification both become load-bearing rather than
  convenient, since a missed emergency lead is the platform's worst
  failure mode (named risk, `MASTER_CONTEXT.md` §13: "no notifications
  outside an open tab — drop-off risk between AI intake and a pro's
  response").
- **Enterprise approval** — only once the provider itself holds
  Procurement (rare — most providers sell into approval chains, few run
  their own); included for completeness, not a near-term build target.

---

## 8 · Screen inventory and build phases

**Phase B1 — My Business.**
New tab (§3.2). Reuses Roadmap A's Location/Asset/Document components
against the workspace's own property. This can ship *before* the
marketplace cutover below — it has no dependency on Marketplace engine
wiring at all, which makes it a low-risk, high-clarity early win.

**Phase B2 — Marketplace cutover (paired with Roadmap A Phase A2).**
`ProDashboard.jsx`, `ProJobs.jsx`, `SendQuoteSheet.jsx` move from
legacy tables to `work.*`. This is one cutover, experienced from both
sides of the same transaction — it must ship as one piece of work, not
staggered per role, or the two sides of a live conversation would be
reading two different data models mid-transaction.

**Phase B3 — Service Record editor.**
The structured record (§5.5), replacing "mark complete." This is the
highest-leverage single screen in this entire roadmap — everything in
Part V of the domain model (Timeline, Memory, Knowledge, Intelligence)
is starved without it.

**Phase B4 — Portfolio & Reputation onto the real engine.**
Today's legacy portfolio screens re-pointed at the real Marketplace
reputation model; no visible change to the professional, a real one
underneath (reputation genuinely tied to the workspace's aggregate
Service Record history, not a hand-computed trust score).

**Phase B5 — Team Collaboration.**
Employee invitations, scoped roles, assignment. Depends on Workspace
membership UI existing (shared build with Roadmap A Phase A5).

**Phase B6 — Business-tier capabilities.**
Fleet Management depth, Compliance documents, CRM lens, Analytics
dashboard, Scheduling. Each capability-gated, each additive.

---

## 9 · Success metrics

| Phase | Primary KPI moved |
|---|---|
| B1 | Retention (professional) — a firm with its own record in the platform has a reason to stay independent of lead volume |
| B2 | Professional response time, Average booking completion |
| B3 | First-time fix rate (indirectly, via better next-visit context), Professional retention |
| B4 | Marketplace Liquidity (better-presented supply converts more demand) |
| B5–B6 | Professional retention, NPS |

---

## 10 · Dependencies and open questions

- **Shares Phase B2 with Roadmap A Phase A2** — this is the single
  largest cross-roadmap coupling in the whole plan and must be sequenced
  as one unit; see `ROADMAP_SEQUENCING.md` §2.
- **Payments (audit §2.1) blocks real payouts.** Everything else in this
  roadmap — leads, quoting, Service Records, reputation — functions
  without it; only the "getting paid through the platform" half is
  blocked, and should be scoped out of Beta 1 accordingly.
- **Scheduling has no engine at all yet** — not merely unwired like
  everything else in this table, but genuinely undesigned in the
  domain model beyond being named as a capability. This is real,
  unscoped work and should be flagged to whoever owns the architecture
  before Phase B6 is scheduled in earnest.
- **Open question:** should "My Business" (§3.2) be its own tab, as
  proposed, or a section inside Profile/Business Settings? The tab
  proposal trades a slightly busier tab bar for avoiding the "whose
  property is this" ambiguity named in §3.2. Worth validating with a
  real professional user before committing either way.

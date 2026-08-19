# Roadmap A — Customer Experience

**This document owns:** the product experience roadmap for every workspace
acting as a *consumer* of work — Personal workspaces (the overwhelming
majority) and any Business workspace using the platform to procure rather
than provide (a hotel booking an HVAC contractor is a customer in exactly
this sense). It does not own the professional/provider side (`ROADMAP_B_PROFESSIONAL_EXPERIENCE.md`),
operator tooling (`ROADMAP_C_PLATFORM_OPERATIONS.md`), or the frozen
architecture itself (`../docs/architecture/PLATFORM_DOMAIN_MODEL.md`,
authoritative wherever this document simplifies for narrative purposes).

**Status.** Planning. No implementation authorized by this document
alone. **This document is a detail reference, not a build schedule** —
its journeys, screens, permission tables and capability map stand, but
its own "Phase A1/A2…" sequencing is superseded by the Activation Slices
in [`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, which schedule this roadmap's work *together with* Roadmap B's and
Roadmap C's — never independently. Read that document first.

**How this was produced.** By reading the full frozen domain model (all 32
sections), the system architecture's 24-engine map, the capability
catalogue and its dependency graph, every existing product-experience
document (`EXPERIENCE_VISION.md`, `HOME_OPERATING_SYSTEM.md`,
`GUIDANCE_SYSTEM.md`), and the actual state of `src/` — not written from
the architecture alone. Nothing here contradicts a frozen document;
where this roadmap and a frozen document appear to disagree, the frozen
document wins and this one is wrong.

---

## 1 · Who this experience is for

Every Personal workspace, without exception, plus any Business workspace
in its *procuring* posture. Applying the Mirror Test (§26) to the
customer role specifically:

| Customer | What "customer" means for them |
|---|---|
| A homeowner with a leaking tap | The obvious case — Personal workspace, one property |
| A landlord with three rented flats | Personal or Business workspace, several properties, tenants who never log in |
| A plumbing firm's own office manager | The firm's Professional workspace, acting as customer for its own premises (Mirror Test: a plumbing firm has a van and an office, and is a customer of the platform even when it receives no marketplace work) |
| A hotel's facilities manager booking an outside contractor | Business workspace, procuring posture, same Marketplace Consumer capability as the homeowner |
| A school arranging boiler servicing | Business workspace, heavier on Compliance and Procurement, same underlying journey |

**The product consequence:** Roadmap A is not "the consumer app" in
contrast to "the business app." It is the experience of *holding
property and needing things done to it*, and a Business workspace uses
the same screens for that half of its life that a household does — it
simply also holds capabilities (Compliance, Procurement, Analytics) a
household never enables. Nothing in this roadmap branches on workspace
type (Rule 1, §28).

---

## 2 · Capability map — what surfaces here, and how

Every capability below is already defined in `PLATFORM_DOMAIN_MODEL.md`
§6.7 and already has a live database engine (§3 of this doc lists build
status). This table is the bridge from "a capability exists" to "here is
where a customer meets it."

| Capability | What the customer sees | Backing engine(s) | Client wiring today |
|---|---|---|---|
| **Property Management** | "My Home" — the property, its locations, room by room | Property, Location | Legacy-only (`household_items` proxy); real engine unwired |
| **Asset Management** | Registered things — appliances, systems, the boiler | Asset | Legacy-only (`household_items`); real engine unwired |
| **Property Memory** | "What I know about your house" — patterns, timeline, predictions | Knowledge (memory half), Timeline | Client-side derivation only (`homeTimeline.js`, no schema) |
| **Marketplace Consumer** | Requesting work, receiving quotes, booking | Marketplace, Conversation | Legacy tables (`service_requests`, `quotes`); real engine unwired |
| **Notifications** | The one inbox, every workspace, one stream | Notification | Not built at all — named platform risk (MASTER_CONTEXT §13) |
| **Maintenance Planning** *(Premium Home)* | What's due, what's overdue | Maintenance | Unwired |
| **Preventive Maintenance** *(Premium Home)* | Schedules generated, not entered | Maintenance | Unwired |
| **Document Intelligence** *(Premium Home)* | Upload a warranty, get structured facts back | Document | Unwired |
| **AI Premium** *(Premium Home)* | Proactive nudges, deeper reasoning | Intelligence | Unwired — AI Gateway exists but not routed through workspace context |
| **Team Collaboration** *(light form)* | A household member with their own login | Workspace (membership) | Structurally ready (Epic 03); no UI |
| **Billing** *(as payer)* | Invoices received, payment history | Billing | Legacy display-only invoice, no real integration |
| **Payments** *(as payer)* | Paying a professional | Billing/Commerce | Not implemented — audit §2.1, blocked on a real provider |
| **Analytics** *(light)* | "What did I spend on my home this year" | Analytics | Built, zero wiring, illustrative rows only |

Two capabilities are deliberately **not** primary in this roadmap because
they belong to the workspace's *other* posture: **Marketplace Provider**
and **Portfolio & Reputation** live in Roadmap B, even for a Business
workspace that also procures — the same workspace can hold both, and the
UI must make which posture is active unambiguous (§27, Workspace
Switching), never blend them into one screen.

---

## 3 · Information architecture & navigation

### 3.1 · What exists today

Four tabs (`src/customer/CustomerApp.jsx`): **Home** (the conversational
canvas, ADR-0007/0008), **Requests**, **Messages**, **Profile**. This
shape is right and should not be discarded — `EXPERIENCE_VISION.md`'s
"ask less, trust more" IA already won the argument against a
category-grid home. The work is deepening what "Home" and "Profile"
*contain*, not replacing the tab structure.

### 3.2 · What changes

| Tab | Today | Becomes |
|---|---|---|
| **Home** | Conversational intent capture + "My Home"/"My Items" panels over `household_items` | Unchanged at the surface — same canvas, same six states (Rest → Problem → Understanding → Trust → Professional → Booking → Relief per `EXPERIENCE_VISION.md` §4). Underneath, intent capture writes into the real Marketplace/Property engines instead of legacy tables (§8) |
| **My Home** *(inside Home, not a new tab)* | `household_items` list, client-derived timeline | Property Memory made real: Locations (room by room, recursive per §10), Assets nested under them, Documents attached, Maintenance due/overdue, a real Timeline derived from `platform.events` instead of client-side inference. This is `HOME_OPERATING_SYSTEM.md` §2's five groups (The home itself · Systems · History · People · Documents), now backed by schema for all five, not just two |
| **Requests** | `service_requests`/`quotes` list | Marketplace Consumer's real engagement list — same list shape, sourced from `work.requests`/`work.quotes`/`work.engagements` once the live cutover (Epic 12's deliberately-deferred step) happens |
| **Messages** | Conversation list over legacy `conversations`/`messages` | Unchanged in shape; sourced from the Conversation engine. Gains: language-pair-aware translation already real, structured moments (a quote, a schedule change) becoming both readable and machine-usable per §15 |
| **Profile** | Account fields, become-a-pro entry | Splits conceptually into **Identity** (name, language, channels — unchanged) and **Workspace** (properties, subscription/plan, notification preferences, and — only if `workspaceMemberships.length >= 2` — the switcher, already built in Epic 03). A single-workspace customer never sees the word "workspace" (§27's own design requirement, already honoured by `AppShell.jsx`) |

**One new surface, not a new tab:** a single notification inbox
(`§20`), reachable from a bell icon in the top bar rather than a fifth
tab — consistent with "the person has one inbox; the platform keeps the
boundaries," and with keeping the tab bar at four, which
`EXPERIENCE_VISION.md` already established as the right number for "ask
less."

### 3.3 · Multi-property navigation

A landlord with three flats does not get three copies of the app. "My
Home" becomes a property switcher *within* the tab — a light-weight
selector above the location tree, not the heavyweight workspace switcher
(§27 already draws this exact distinction: switching workspace changes
*everything*; switching property within a workspace changes only which
property's twin is showing). This is new UI, but it is a small
addition, not a new IA.

---

## 4 · Onboarding journey

This roadmap does not redesign onboarding — `GUIDANCE_SYSTEM.md` already
owns a thorough, considered spec (Part A, the permanent companion
architecture; Part B, the Bootstrap Curve). This section states how
Roadmap A's new surfaces plug into that existing system, not a
replacement for it.

**Already shipped, this session:** the forced classification question
(`RoleSelectionScreen`) is gone. Every account now lands directly in its
Personal Workspace — exactly the flow `PLATFORM_DOMAIN_MODEL.md` §27 and
`GUIDANCE_SYSTEM.md` both require ("create an account, get a Personal
Workspace, become a pro later"). This roadmap's onboarding work starts
from that corrected foundation, not from the old forced choice.

**What's new, and how it fits the existing Signal → Relevance → Delivery
→ Memory loop (§A.2):**

| New capability surfacing | Signal | Tier (§A.3) | Notes |
|---|---|---|---|
| First real Location created | Location added under a property for the first time | Tier A (foundational, first-time) | Extends Layer 4's existing table (`GUIDANCE_SYSTEM.md` §17.4) — same mechanism, one more row |
| First Asset registered | Asset created (photo recognition, inferred-from-work, or manual) | Tier A | Distinguish machine-proposed from confirmed at the UI level per §11 — never show a guess as a fact |
| First Document with a validity period | Document uploaded with an expiry | Tier A first time; **Tier B thereafter** for every subsequent expiry warning | This is `GUIDANCE_SYSTEM.md` §17.4.1's own worked example — already speced in detail, reuse it directly rather than redesigning |
| Warranty/service-life threshold crossed | Time-based, no user action | Tier B, always | §A.5's own temporal-signal category — `property.assets.warranty_expires_on` already exists in schema (migration 0048), sitting unused; this is its first real consumer |
| Second household member joins | Membership count on a Personal workspace crosses one | Tier A | Layer 3 in `GUIDANCE_SYSTEM.md`, already speced |
| Notification inbox first populated | First cross-workspace notification arrives | Tier A, once | New — not yet in `GUIDANCE_SYSTEM.md`'s table; add it there when Notification ships, don't invent a parallel mechanism here |

**One correction this roadmap should feed back into `GUIDANCE_SYSTEM.md`:**
its Layer 1 table (§A.8) still lists "role selected" as a signal —
stale now that the classification question is gone. A small doc fix,
not a design change; flagged here so it isn't lost.

---

## 5 · Core user journeys

Every journey below is one instance of the Execution Model's six stages
(§14.1: Intent → Diagnosis → Plan → Execution → Outcome → Learning). Named
per-journey so the roadmap's screens have somewhere concrete to attach
to; the underlying loop is one loop, not six.

### 5.1 · First booking (new customer, no history)

1. **Intent** — spoken, typed or photographed, on the Home canvas (unchanged, already real).
2. **Diagnosis** — AI Gateway reasoning, today over the request text alone; *becomes* reasoning over the Digital Twin once Property Management is real — a returning customer's second leak is diagnosed with the boiler's age and history already known, not from a blank slate.
3. **Plan/Execution strategy** — today jumps straight to Marketplace; **should** first check Warranty (a document with validity, §12) and DIY guidance where the AI Gateway's own confidence supports it, per §14.1's own table — most rows of that table earn the platform nothing, deliberately. This is the single highest-leverage change this roadmap proposes to the existing booking flow: **the platform must be structurally capable of saying "you don't need anyone, this is under warranty"** before Provider Intelligence is trusted to recommend anyone at all.
4. **Execution: Provider Intelligence** — today a bare SQL match function (`pro_matches_request()`, no ranking/geo, named tech debt). Becomes real Provider Intelligence (§14.4) once the engine is wired: trusted-provider history first, then marketplace supply — never marketplace-first for a returning customer.
5. **Outcome** — a Service Record is created (§13.2), authored by the professional, visible to the customer as "what happened," not as an invoice line item.
6. **Learning** — feeds Property Memory (this asset's pattern) and proposes Workspace Knowledge ("always use this firm?") — never silently promoted to policy; the customer confirms or declines.

### 5.2 · Returning customer, known property

Same six stages, but Diagnosis and Plan now draw on real accumulated
Property Memory and Workspace Knowledge (§18) — this is the entire
argument of `HOME_OPERATING_SYSTEM.md` §5's "Year 3" row made concrete:
"Peter has done four jobs... Klussie feels like it knows the house."
The UI difference from 5.1 is almost entirely in what the AI already
knows, not in new screens — the existing canvas already accommodates
this (`EXPERIENCE_VISION.md`'s trust framework already reserves space for
"you've used Peter three times").

### 5.3 · Preventive maintenance (Premium Home)

A schedule generates a maintenance record (not requested by the
customer) → surfaces as a Tier B ambient nudge, never a scrim → customer
either books it through the marketplace, marks it done themselves, or
defers → whichever happens, a Service Record still gets produced (§13.1:
"a decision to defer" is itself a recorded outcome). New screen: a
maintenance calendar/list inside My Home, not a new tab.

### 5.4 · Multi-property landlord

Same journeys as 5.1–5.3, run per-property, with the property switcher
from §3.3 as the only new navigational concept. Workspace Knowledge at
this scale starts to matter ("never that firm again," applied across all
three flats) — the UI should let a rule be declared once and apply
workspace-wide, not per-property, matching §18.2's own scoping model.

### 5.5 · The "no marketplace needed" journey (deliberately not a funnel)

Warranty claim, DIY guidance, insurance referral, "watch and wait." Each
must be a **first-class outcome the product can present with as much
warmth as a booking confirmation** — not a dead end, not a smaller
version of the booking screen. `EXPERIENCE_VISION.md`'s "Relief" state
already has the right emotional target; this roadmap's job is making
sure Relief is reachable via five different execution strategies, not
one.

---

## 6 · Permissions and roles, as experienced

| Role (Personal preset, §7) | What it looks like on screen |
|---|---|
| **Owner** | Full access — every property, every setting, invites others |
| **Household member** | Everything operational (book work, message pros, view the twin); no commercial settings (subscription, payment method) and no membership control |
| **Guest** | Read-only, typically scoped to one property — a family member checking on a holiday home |

**What the customer never sees:** capability/permission as two separate
gates (§6.2) is an engineering distinction, not a UI concept. A
household member without Team Collaboration held on the workspace simply
never sees an "invite" button — the capability gate is invisible, and the
permission gate (their own role) is expressed only in what's absent, not
in an error message.

**Scoped roles are invisible at Personal scale** (§7's own trade-off) —
a household never authors a scope, it only ever exists as "this is a
guest, they see the holiday home only," expressed as a single toggle
during invitation, not a permission matrix.

---

## 7 · Workflows surfaced in this experience

Per §14.2's table, this roadmap's customer mostly *participates in*
workflows authored elsewhere (Roadmap C owns authoring), and experiences
exactly three shapes directly:

- **Residential repair** — short, informal, the default and only shape
  most Personal-preset customers ever see.
- **Warranty claim** — eligibility check surfaced *before* a booking is
  even offered (§5.1 above); evidence-heavy only in the sense of "attach
  the receipt," never a form.
- **Preventive maintenance** — recurring, tolerant of rescheduling, the
  only workflow a customer can be inside without having asked for it.

A Business-as-customer workspace (the hotel, the school) additionally
experiences **Emergency response** and, once Procurement is granted,
**Enterprise approval** — same screens, gated purely by capability, never
by a "you're a business" branch anywhere in the code.

---

## 8 · Screen inventory and build phases

Ordered by what each phase needs from the backend (already built, per
`MASTER_CONTEXT.md` §2) versus what it needs from the client (net-new).
This section states scope; `ROADMAP_SEQUENCING.md` states order across
all three roadmaps.

**Phase A1 — My Home becomes real.**
Reuse: `MyHomePanel.jsx`, `MyItemsPanel.jsx`, `homeTimeline.js`'s
presentation logic. Replace their data source from `household_items` to
`property.*`/`work.*` reads (a per-table client-read grant per engine,
§7 of `ROLES.md` — "opened per table, by the epic that ships it"). New:
a Location tree component (recursive, §10), a Document list with
validity badges, a Maintenance due/overdue list. This phase alone makes
four of §2's capabilities real for the first time in any client.

**Phase A2 — Marketplace cutover.**
The live booking flow moves from legacy tables onto `work.requests`
/`work.quotes`/`work.engagements` — the step Epic 12 named and
deliberately deferred. `ServiceSheet.jsx`, `RequestsList.jsx`,
`RequestDetailSheet.jsx` keep their shape; their data layer (`src/lib/requests.js`)
is rewritten underneath. This is where Warranty-before-Marketplace (§5.1
step 3) gets built.

**Phase A3 — Notification inbox.**
Genuinely new: the Notification engine has zero client wiring anywhere.
One new screen (the inbox), one new top-bar affordance (the bell), and
per-membership preferences inside Workspace settings.

**Phase A4 — Premium Home capabilities.**
Maintenance Planning, Preventive Maintenance, Document Intelligence, AI
Premium — each gated behind the Premium Home tier (§24's table), each
additive to Phase A1's screens rather than new destinations.

**Phase A5 — Team Collaboration (light) + multi-property.**
Household member invitations, the property switcher (§3.3), scoped
guest access.

---

## 9 · Success metrics

Tied directly to `PRODUCT_CONSTITUTION.md` §14 KPIs, per Rule 10 — no
phase above ships without one of these attached:

| Phase | Primary KPI moved |
|---|---|
| A1 | Retention (a property with real history is a reason to stay) |
| A2 | Time to first booking, Average booking completion |
| A3 | Professional response time (indirectly — customers stop missing replies) |
| A4 | Retention, NPS |
| A5 | Retention (household accounts with a second member churn less) |

---

## 10 · Dependencies and open questions

- **Blocks on the standing P0** (`MASTER_CONTEXT.md` §12): no read switch
  in this roadmap can be trusted until the live-verification sweep for
  the relevant engine has actually run against staging.
- **Blocks on a client-read strategy decision**, cross-cutting all three
  roadmaps — direct PostgREST reads under per-table grants (§7,
  `ROLES.md`), versus RPC/API-route calls through `api/*.js` matching
  ADR-0024's "request context resolved in the database." This is not
  this roadmap's decision to make alone; see `ROADMAP_SEQUENCING.md` §3.
- **Payments (§2.1 of the pre-launch audit)** blocks the real half of
  the Billing/Payments row in §2's table — invoices can display before
  a real payment provider exists; paying cannot.
- **Open question, not resolved here:** does a Business-as-customer
  workspace's Procurement/approval UI live inside this roadmap's screens
  (same screens, capability-gated) or does its complexity earn it a
  dedicated surface? Current answer, per §6.6's fragmentation test:
  same screens, gated — revisit only if a real customer proves it wrong.

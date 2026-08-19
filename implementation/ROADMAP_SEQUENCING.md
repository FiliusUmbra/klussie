# Product Experience — Sequencing Recommendation

> **Superseded by [`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md).**
> This document treated the three roadmaps as three coordinated but
> separately-sequenced build plans (Phase 1/2/3... per roadmap, with
> dependency arrows between them). That shape was corrected: there are
> not three applications to sequence against each other, there is one
> platform activated through three experiences at once. Retained here as
> history, exactly as `docs/EXECUTION_ROADMAP.md` is retained after
> `docs/IMPLEMENTATION_ROADMAP.md` superseded it. **Do not schedule work
> from this document — use the Activation Slices in
> `PLATFORM_ACTIVATION_PROGRAMME.md` §5 instead.**

**This document owns:** the recommended build order across
`ROADMAP_A_CUSTOMER_EXPERIENCE.md`, `ROADMAP_B_PROFESSIONAL_EXPERIENCE.md`
and `ROADMAP_C_PLATFORM_OPERATIONS.md` — what ships first, what depends
on what, and what "Beta 1" means concretely. It does not re-argue any
roadmap's own scope; it only sequences across them.

**How this was produced.** By reading the three roadmaps above against
the actual current state of the platform (`MASTER_CONTEXT.md` §2/§3/§12,
`docs/operations/ROLES.md`, and the live `src/` tree) — not by
reasoning about the roadmaps in the abstract.

---

## 1 · The one fact that shapes everything below

**Every one of the 22 completed epics is built and tested against a
staging database; none has a client that reads or writes it.** The live
product today (`src/customer/`, `src/pro/`, `src/home/`) runs entirely
on the pre-platform legacy tables (`public.profiles`, `service_requests`,
`quotes`, `conversations`, `messages`, `household_items`, `reviews`).
The new engines — Property, Location, Asset, Document, Maintenance,
Service Record, Workflow, Marketplace, Conversation, Knowledge,
Intelligence, Notification, Search, Analytics, Subscription, Billing —
exist in Postgres, with contracts and RLS policies, and are reachable by
**nobody**, because `authenticated` holds zero grants on any of the six
workspace-scoped schemas (`docs/operations/ROLES.md` §2.4) except where
an individual epic has opened one table's read path.

This means "Product Experience" is not a UI reskin of a working backend
— it is the first time any of this architecture meets a real user, at
all. Every phase below inherits that risk, and the sequencing is built
to spend it deliberately rather than all at once.

---

## 2 · Cross-roadmap dependencies

```
                    ┌─────────────────────────┐
                    │  C1 · Operator identity  │
                    │      + Audit viewer      │
                    └────────────┬─────────────┘
                                 │ required before any
                                 │ real user data exists
                                 ▼
                    ┌─────────────────────────┐
                    │  C2 · Workspace lookup    │
                    │      + support access     │
                    └────────────┬─────────────┘
                                 │ required before Beta 1
                                 │ goes to real users
        ┌────────────────────────┼────────────────────────┐
        ▼                                                  ▼
┌───────────────────┐                          ┌───────────────────┐
│ A1 · My Home        │                          │ B1 · My Business    │
│ becomes real        │                          │ (no cross-dep)      │
│ (no cross-dep)      │                          └───────────────────┘
└─────────┬──────────┘
          │
          │        ┌──────────────────────────────────────────┐
          └───────►│ A2 + B2 · Marketplace cutover              │
                    │ ONE unit of work — both sides of the same  │
                    │ live transaction, must ship together       │
                    └────────────────┬─────────────────────────┘
                                     │
                    ┌────────────────┴─────────────────┐
                    ▼                                   ▼
          ┌───────────────────┐             ┌───────────────────┐
          │ B3 · Service Record │             │ C3 · Trust & Safety │
          │ editor               │────feeds──►│ (evidence needs     │
          └───────────────────┘             │  real records)       │
                                              └───────────────────┘
                    │
                    ▼
          ┌───────────────────┐
          │ A3 · Notifications   │◄── shared engine with B's
          │                       │    lead/message alerts
          └───────────────────┘
```

**The one dependency every roadmap author must respect:** Roadmap A's
Phase A2 and Roadmap B's Phase B2 are **the same cutover**, described
from each side. Sequencing them separately would mean a live booking
where the customer's app reads `work.requests` while the professional's
app still reads `service_requests` — a live transaction split across two
data models. This is a correctness constraint, not a scheduling
preference.

---

## 3 · The one decision that must be made before Phase 1 starts

Neither roadmap decides, on its own, **how the client reaches the new
engines at all.** Two real options, and this document takes a position
because leaving it open blocks every phase below equally:

| Option | What it means | Trade-off |
|---|---|---|
| **Direct PostgREST reads** under per-table `authenticated` grants (`ROLES.md` §7: "opened per table, by the epic that ships it") | Client queries `property.locations` etc. directly, RLS-enforced | Fastest to build per screen; means RLS policies — written but never run against a live client (`MASTER_CONTEXT.md`'s standing P0) — become the *only* thing standing between a bug and a cross-tenant leak, in production, on day one |
| **RPC/API routes** wrapping `SECURITY DEFINER` functions, matching ADR-0024 ("request context resolved in the database") and the existing `api/_lib` pattern the AI Gateway already uses | Client calls a contract function; the function enforces capability + permission itself | Slower to build per screen (a function per operation, not a grant per table); each function is independently testable exactly like every diagnostic already written this session, and a defect fails loud (a missing grant/function) rather than silently (a missing RLS clause) |

**Recommendation: RPC/API routes, as the default; direct reads only for
genuinely simple, low-risk, already-diagnostic-verified read paths**
(the pattern Epic 07's `fetchHouseholdItems` and Epic 08's document
reads already established, on legacy tables). This matches the
platform's own stated preference (ADR-0024) and this session's own
operating discipline — every fix this session shipped was verified
against real staging data before being trusted; a bare RLS grant with
no live-client precedent yet is exactly the kind of unverified surface
this whole session has been closing, not opening. **This decision
belongs to whoever owns `SUPABASE_ARCHITECTURE.md`/`DATABASE_ARCHITECTURE.md`
formally — it is recorded here as a recommendation for Phase 1
planning, not as an amendment to a frozen document.**

---

## 4 · What "Beta 1" means

Not defined anywhere in the existing docs (`docs/` has no prior "Beta 1"
reference) — this document proposes the definition, because a sequencing
recommendation is meaningless without a target to sequence toward.

**Beta 1 is the first release where a real customer and a real
professional can complete one full loop — intent through Service
Record — entirely on the new architecture, with the operational
minimum required to run it responsibly.** Concretely:

- A customer can describe a problem, see it diagnosed against a real
  (if still thin) Property Memory, get matched, and book.
- A professional can receive that lead with real context, quote, do the
  work, and write a real Service Record.
- Support can find that customer's workspace and get scoped, audited
  access if something goes wrong.
- A report against either party has somewhere real to go.

**Beta 1 explicitly does not require:** Payments (invoices can display;
paying through the platform cannot, until audit §2.1 is resolved —
outside this document's authority to schedule), Premium Home
capabilities, Business/Enterprise tier depth, or Admin's Catalogue/
Billing sections beyond what Phase C1–C3 already cover.

---

## 5 · Recommended phase order

Ordered by the four factors the user's own instruction named —
dependencies, user value, operational readiness, Beta 1 objectives —
weighted in that order, because a phase with high user value but an
unmet dependency cannot actually ship.

### Phase 0 — Decide, don't build (days, not weeks)

- The client-read strategy (§3 above), formally.
- The operator authentication mechanism (Roadmap C §4/§10's open
  question) — Phase C1 cannot start without it.
- Confirm the standing P0 (live verification sweep, `MASTER_CONTEXT.md`
  §12) is closed for every engine this sequencing touches in Phase 1
  before that engine's read path ships — not a one-time gate, a
  per-engine one.

### Phase 1 — Operational floor + lowest-risk wins (parallel tracks)

Run concurrently, since neither blocks the other:

- **C1** — Operator identity + Audit viewer. *Must* land before any
  other phase puts real user data behind a new read path, because
  every subsequent phase's actions need to be auditable from day one,
  not retrofitted.
- **A1** — My Home becomes real. Highest user value per unit of risk in
  the entire plan: it touches only Property/Location/Asset/Document/
  Maintenance (read-heavy, no live transaction to keep in sync across
  two sides), and it is where `HOME_OPERATING_SYSTEM.md`'s multi-year
  vision starts being true rather than aspirational.
- **B1** — My Business. Same low-risk shape as A1, reuses the same
  components, no cross-roadmap coupling.

### Phase 2 — The core loop (sequential, must follow Phase 1)

- **C2** — Workspace lookup + support access. Gates everything after it
  that touches real customer/professional data at volume — this is the
  operational-readiness requirement Beta 1 cannot ship without.
- **A2 + B2** — Marketplace cutover, as one unit (§2's diagram). The
  single riskiest phase in the plan — it replaces the live booking flow
  under real transactions — and therefore the one phase this document
  most strongly recommends *not* compressing or parallelizing away.
- **B3** — Service Record editor, immediately following B2, since a
  cutover marketplace with no real Service Record capture would produce
  engagements with nothing to show for them.

### Phase 3 — Close the Beta 1 loop

- **C3** — Trust & Safety, now that B3 produces real Service Records for
  evidence.
- **A3** — Notifications. Shared engine with B's lead/message alerts;
  building it once here serves both roadmaps' remaining phases.

**Beta 1 ships at the end of Phase 3.**

### Phase 4 — Depth (post-Beta-1, order within the phase is genuinely
flexible and should follow real usage data rather than this document's
guess)

- A4 (Premium Home capabilities), B4–B5 (reputation onto the real
  engine, Team Collaboration), C4 (Marketplace health dashboard).

### Phase 5 — Commercial completion

- Payments integration (a business decision, not scheduled here) unlocks
  A/B's Payments capability and C6's payment-operations half together,
  since all three were named as blocked on the same root cause
  throughout the three roadmaps.

### Phase 6 — Business/Enterprise + Admin as a complete product

- A5, B6 (Business-tier depth), C5 (Catalogue — the highest-complexity
  screen in the whole plan, deliberately last because it benefits most
  from real operational experience accumulated in Phases 1–5).

### Phase 7 — Extension and global

- API Access, Enterprise Integrations, Federated Identity, Jurisdiction
  expansion (C3's journey in Roadmap C §5.3), White Label. Explicitly
  demand-gated — matches `MASTER_CONTEXT.md`'s own existing stance on
  Epics 23–24 ("Not scheduled... demand-gated on a real customer
  requiring them"), extended here to the client-experience layer of the
  same capabilities.

---

## 6 · What this sequencing deliberately does not resolve

- **Exact team sizing or calendar time per phase** — this is a
  dependency and value ordering, not an estimate; the roadmaps
  themselves are silent on effort for the same reason `IMPLEMENTATION_ROADMAP.md`
  scopes epics without dates.
- **The client-read-strategy decision's final owner** — recommended in
  §3, decided by whoever holds authority over the frozen architecture
  documents, not by this planning pass.
- **The operator-identity mechanism's final shape** — flagged as an ADR
  candidate in Roadmap C, not resolved here.
- **Whether Beta 1's definition (§4) matches the business's actual
  go-to-market plan** — this document proposes a definition grounded in
  what the architecture and the three roadmaps can support; it is not a
  substitute for a real product/business decision about what "Beta 1"
  is supposed to prove to the market.

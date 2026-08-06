# Klussie — The Home Operating System

**This document owns:** the long-term product vision for what happens
*after* a job is booked — "My Home" information architecture, the home
memory model, the AI companion roadmap, and how this maps onto the
13-phase roadmap's Phase 13. It does not own the conversational-homepage
spec that precedes it (`EXPERIENCE_VISION.md`) or the underlying product
philosophy this vision sits on top of (`PROPERTY_MEMORY.md`).

> Transcribed into the repository from a conversation-only artifact
> (`home-os-vision.html`, published 2026-08-06). Not a redesign of the
> approved conversational homepage — an evolution beyond it. The
> one-canvas conversation (`HOMEPAGE_DIRECTION.md`) stays exactly as
> approved; everything below is what makes someone open Klussie again
> next year, not just today.

## 1 · Home Operating System Vision

The receipt is not the end of the relationship. Klussie today solves the
problem in front of someone. This is the shape of what it becomes once it
starts remembering: not a platform people visit when something breaks,
but the place they keep the truth about their home.

> People don't want a plumber. They want the problem gone — and after
> that, they want to stop thinking about it. Klussie should deliver both.

| Horizon | What Klussie does |
|---|---|
| **Today** | Solve the problem in front of me — the approved one-canvas experience, unchanged. |
| **This month** | Help me maintain what I already fixed — a service reminder, a warranty worth knowing about. |
| **This year** | Help me take care of everything I own — a home Klussie actually knows, not a blank account. |

This isn't a new idea competing for roadmap space. It's the product
design for a phase already approved in principle — **Phase 13, "AI
Home,"** in `ROADMAP.md` (home-asset tracking: boiler, roof, solar,
garden). Everything below turns that phase from a name into a real spec.

## 2 · "My Home" — Information Architecture

Not a new screen. The Profile tab, grown up. No new tab — no unnecessary
navigation, no new complexity. My Home is what today's Profile becomes
once there's something real to hold. Five groups, not fifteen loose
facts:

- **The home itself** — rooms, paint, flooring *(new)*
- **Systems** — heating, roof, appliances *(new)*
- **History** — jobs, repairs *(already real — every completed request,
  quote, and review already in the database)*
- **People** — trusted pros *(already real)*
- **Documents** — invoices, warranties, manuals *(new)*

**History and People aren't hypothetical.** Every completed request,
quote, and review already sitting in the database is a home event. My
Home's job in those two groups is surfacing what's real, not collecting
anything new.

**The home itself, Systems, and Documents are genuinely new.** No schema
exists yet for rooms, appliances, or warranty documents — this is real,
unscoped work, not a UI layer over existing tables.

## 3 · Home Memory Model

Klussie already has a memory. It just isn't telling anyone. A completed
job, a quote, a review — every one of these rows already records
something that happened to someone's home. Home Memory doesn't invent a
new pipeline; it reframes data that already exists as what it actually
is: the story of a house.

**The loop:** an event happens (a job completes) → it's remembered and
*explained* ("because Peter fixed your leak") → it informs a future
suggestion (never a surprise, always opt-in) → which leads to new events.

**The rule:** never intrusive, never a surprise, always explain why
something is remembered — the same "Trust Through Transparency" principle
already written into `docs/design/DESIGN_SYSTEM.md`, applied here to
memory specifically: the user should always be able to answer "why does
Klussie know that?"

## 4 · AI Companion Roadmap

Understands today. Remembers next. Proactive last — and only carefully.

| Stage | What it does | Example |
|---|---|---|
| **Today** — real | Understands a described problem, structures it, matches a professional | "Supply-line leak · Plumbing · Urgent" |
| **Near-term** | Recalls home context when relevant, still only when asked | "You've used Peter three times." |
| **Long-term** | Proactively surfaces what's worth knowing — dismissible, low-frequency, opt-in | "Your boiler was serviced 11 months ago." / "The warranty on your washing machine expires soon." |

**Proactive needs real infrastructure that doesn't exist yet.** There's
no notification system in the product today — already a named gap in
`MASTER_CONTEXT.md`'s risk list (§13). "Eventually proactive" is a real,
separate workstream, not a natural extension of the AI Gateway alone.

The line that keeps this a companion and not a nag: it offers, never
interrupts. Every proactive nudge is something the user can dismiss in
one tap and never see the same way twice.

## 5 · Long-Term User Journey

The same person, three years later:

| When | What happens |
|---|---|
| Day 1 | A kitchen sink leaks. Klussie understands it, matches Peter, books him. First data point. |
| Month 6 | The boiler needs servicing. Klussie already knows the home's rough age and layout from the first job — the request takes seconds, not a fresh start. |
| Year 1 | My Home has real substance: two completed jobs, one trusted pro, a warranty on file. Klussie gently notes the boiler is due again. |
| Year 3 | Peter has done four jobs. He doesn't feel like a marketplace match anymore — he feels like the family's plumber. Klussie feels like it knows the house. |

## 6 · Trust Evolution Framework

Trust compounds. It isn't a number that resets on every visit. What
trust is built from grows at each stage: **Day 1** (rating, verified
badge) → **Month 1** (+ first completed job) → **Year 1** (+ recurring
pro, home history) → **Year 3** (+ years of records).

**Two inputs stay flagged, not claimed.** Insurance verification and
response-time tracking aren't backed by real data yet (the same honest
gap named in `EXPERIENCE_VISION.md` §8) — this framework doesn't get to
lean on them until they're real. Rating alone was already ruled out as
the whole story; it doesn't get replaced by a different single number.

## 7 · Product Roadmap — 1 / 3 / 5 Years

Not a new roadmap — the existing one (`ROADMAP.md`), given a timescale.
This adds no new phases, just the horizon each group of phases
realistically lands in.

- **Year 1** — Foundation + Business: Security, Core, Design System,
  Testing, Payments, Marketplace Engine, Trust & Safety.
- **Year 3** — Scale + early Platform: Performance, Engagement, AI v2,
  Intelligence Platform. Home Memory becomes real here.
- **Year 5** — Platform, realized: Platform API, White Label, and Phase
  13 AI Home as a complete, not conceptual, product.

This document is the design spec for the Year 5 band; nothing here asks
the roadmap's sequence to change.

## 8 · Long-Term Competitive Advantage

What a competitor starting today can't copy on day one:

- **A data moat that compounds** — a multi-year home history is
  genuinely hard to replicate from a cold start; every year Klussie is
  used, the gap to a new entrant widens, not narrows.
- **Retention as the real metric** — recurring professional relationships
  are the actual mechanism behind two KPIs already in
  `PRODUCT_CONSTITUTION.md`: professional retention above 80%, customer
  retention above 60%.
- **Prevention beats emergency** — proactive maintenance reduces costly
  emergency repairs for the homeowner — real consumer value, not a growth
  trick. Consistent with Rule 9, trust beats growth.
- **Platform API gets a real asset to sell** — Phase 11's
  insurance/real-estate integrations trade on verified home history — far
  more valuable once that history is real than when it was just
  marketplace matching.

---

Eight sections, one thread: the relationship doesn't end at the receipt.
No code, no homepage changes — this document's approval gives
`ROADMAP.md`'s Phase 13 its real spec.

---

Version 1.0 — 2026-08-06 (transcribed into the repository from the
conversation-only artifact)

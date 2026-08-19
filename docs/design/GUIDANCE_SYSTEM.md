# The Guidance System — Klussie's Permanent Companion

**This document owns:** the design of Klussie's guidance system in
full — not a bounded first-time tour, but the permanent capability that
notices, for as long as an account exists, when a real moment has made
something worth explaining, and says so once, gently, in one voice. It
does not own component APIs (`COMPONENT_LIBRARY.md`), token values
(`DESIGN_TOKENS.md`), motion primitives (`ANIMATION_GUIDELINES.md`) or
voice rules (`COPY_GUIDELINES.md`) — it applies all four to one system.

**Status: Planned.** Nothing below is built.

**Revision note (v4) — the correction that produced this document.**
Everything through the previous revision was designed as "onboarding":
bounded, first-time, with a beginning and an end. That framing was wrong,
named as wrong directly: *"Build the Guidance System, not the
onboarding."* This isn't a rename. Onboarding has a graduation; a
companion doesn't. What follows is split into two parts that were not
previously separated because the distinction didn't exist yet:

- **Part A (new)** — the system itself: the loop every single piece of
  guidance runs through, forever, from someone's first day to their tenth
  year. This is the actual deliverable this revision adds.
- **Part B (unchanged in content, reframed in place)** — everything
  designed across the three prior revisions (the "home before Klussie"
  opening, the four layers, every screen's copy). None of it was wrong.
  It was simply mis-scoped as the whole system when it is, and always
  was, that system's **Bootstrap Curve** — the densest, most front-loaded
  sequence of signals the system will ever produce, because most of what
  a new relationship needs clusters in its first weeks. Part A explains
  why that's true rather than assuming it.

**Related:** `UX_PATTERNS.md` (Onboarding), `PRODUCT_CONSTITUTION.md`
Rule 1 ("AI before forms"), ADR-0007/ADR-0008, `ACCESSIBILITY.md`,
`MASTER_CONTEXT.md` §2. Formerly `docs/design/ONBOARDING_EXPERIENCE.md`
— that file now redirects here.

---

# Part A — The Guidance System

## A.0 · Taking the correction seriously, not just applying it

The words matter because of what they change, not because "Guidance
System" sounds bigger. A tour ends — by design, it has to, or it stops
being a tour. A companion doesn't end, and if it's built like something
that does (a fixed sequence, a completion flag, a "you're done" screen),
it will eventually run out of things to say and go quiet for years,
right up until the day it should have said something and didn't — a
warranty that lapsed silently, a second team member who joined a
workspace with nobody ever explaining what that means. Part B's Layers
1–4 already hinted at this (Layer 4's whole premise was "wait for the
real trigger"), but they were still framed as *stages of onboarding*,
implicitly finishable. This document removes that implication
structurally, not just in name: there is no "onboarding complete" state
anywhere below. There is only ever the next signal.

## A.1 · The one question, held above everything else

Every piece of guidance this system will ever show, for as long as an
account exists, is required to answer one question before it's allowed
to appear:

> **What does this person need to understand right now to feel more
> confident?**

Not "what haven't we told them yet." Not "does this feature exist and
have a coachmark written for it." If a moment doesn't make someone more
confident than they were a second ago, the system says nothing — silence
is always the correct default, and every mechanism in Part A exists to
make silence the common case, not the exception.

## A.2 · The core loop: Signal → Relevance → Delivery → Memory

Four stages, in this order, without exception, for every guidance moment
the system will ever produce — from Layer 1's very first coachmark to a
nudge shown a decade into the relationship.

**1 · Signal.** A real thing changed. Not a screen rendering — an event:
an account was created, a role was granted, a workspace gained a second
member, an item was added, a document was uploaded, a quote arrived, a
warranty crosses a threshold, an account has gone quiet for ninety days,
a professional's fifth team member joined. Every signal names a real
event in the real system; nothing here is invented for the guidance
system's own sake (Part B's own restraint, generalized: no coachmark
for a control that doesn't exist yet applies exactly as much to no
signal for an event that doesn't exist yet).

**2 · Relevance.** A signal firing does not mean guidance shows. Before
anything is displayed: has this exact guidance already been shown *and
understood*? Is the account mid-task right now — never interrupt a real
action in progress, ever, at any point in the relationship, not just
during Part B's bootstrap. Has the account already demonstrated mastery
of the underlying control through confident, repeated real use, even if
the formal trigger technically hasn't fired through this system before
(§A.4)? Is another guidance moment already queued or visible — never
stack two, this lifetime-wide, not just within one session.

**3 · Delivery.** How it's shown — and, new to this revision, *how much
weight it's shown with* (§A.3). Not every one of the thousands of
signals an account produces over years deserves the same visual
ceremony a first-ever coachmark does.

**4 · Memory.** What gets recorded is richer than "seen": *introduced*,
*understood* (the real control was actually pressed), *dismissed without
acting*, or *mastered* (inferred from real, confident, repeated use) —
each producing different future behavior (§A.4). A boolean is not
expressive enough for a relationship measured in years.

**A signal can be true retroactively, and that still counts.** Every
example so far has been a fresh transition — a thing that just changed.
But a system designed after the product it guides will always launch
into accounts for whom some conditions are already true: every pro
backfilled in Epic 03 already has two real memberships today, before any
of this exists. Treating "the transition already happened, in the past,
before the system did" as *never firing* would permanently strand every
existing account with a control nobody ever explained. The correct
reading of Signal 1 (§A.2 above) is **"this account now has a state the
system has never yet observed for it"** — which a genuine transition and
a pre-existing condition both satisfy identically the first time the
system checks. §17.4.5 is where this actually matters in practice.

## A.3 · Delivery vocabulary — two tiers, not one

Part B used exactly one delivery mechanism throughout — the Spotlight
Coachmark — because a bootstrap sequence is short and every moment in it
is foundational, worth a full takeover. A permanent companion cannot use
a full-screen scrim-and-cutout for a small, recurring signal for years
without becoming exactly the "childish, gimmicky, overwhelming"
experience ruled out from the very first brief. Two tiers, reused by
every layer in Part B without any of them changing shape:

**Tier A — Spotlight Coachmark** *(the existing mechanism, unchanged —
Appendix A).* Full scrim, one real cutout, press-the-real-control-to-
advance, no Next button. Reserved for signals that are: genuinely the
first time ever, foundational (they change how someone understands a
*class* of the product, not one control), and meaningful only if an
action is actually taken. Layer 1, Layer 2, and Layer 3's first-time
moments qualify. Most of Layer 4's original table qualifies too — a
first document, a first room, a first quote are each a first encounter
with an entire capability, not a routine event.

**Tier B — Ambient Nudge** *(new).* A small, quiet marker that appears
near the relevant real control without dimming anything else, without
requiring a press to clear, without blocking any other action — a soft
badge or a one-line note the account can act on, dismiss, or simply
let fade after being seen. Reserved for: recurring or seasonal signals,
reactive "you might be stuck" offers, reactivation after dormancy, and
anything where missing it once is a minor cost and repeating a full
takeover would be a major one. **This is where §A.5's temporal signals
belong, always** — a warranty crossing a threshold is real and worth
surfacing, but it is not worth a scrim.

**The refinement this revision makes to Part B's own Layer 4:** the
original table (§17.4) is all one-time, foundational "first X" events —
those stay Tier A, correctly. The *new* signals this revision adds
(§A.5 — warranty windows, anniversaries, dormancy) are a genuinely
different kind of signal: recurring, lower-stakes, ongoing for the life
of the account. They are Tier B by definition, not a downgrade of Tier A
— a different tool for a different job, chosen once and never reasoned
about per-instance.

## A.4 · The confidence model

Per (account, guidance item), three states, and only three:

- **Unmet** — the signal hasn't fired for this account yet. Nothing
  shown, nothing recorded.
- **Introduced** — shown once (Tier A or B). Not yet confidently used.
- **Mastered** — the real control has been used successfully, without
  hesitation, enough times that continuing to explain it would be
  condescending rather than helpful. Once Mastered, that guidance item
  is **permanently suppressed** for this account — including if some new
  "first time" event would nominally re-trigger it (a returning,
  long-time user does not get treated like day one just because a
  formal trigger fires again).

**A fourth, reactive path, not a state but a separate signal source:**
the system may also notice someone appears *stuck* — the same screen
opened several times without the obvious next action ever being taken —
and offer, gently, once, never as a diagnosis: *"Wil ik het nog eens
laten zien?"* (Want me to show you again?) — never *"You seem
confused,"* never framed as a correction. Declining this offer is not
recorded as a negative signal against the account; it simply doesn't
re-offer for a long, generous cooldown.

## A.5 · Temporal signals — what actually makes this a lifetime system

The category Part B never had at all: signals that fire from the
**passage of time against real data**, not from something the account
just did.

- **Warranty and service-life windows.** `property.assets` already has
  real, populated-someday columns for exactly this —
  `warranty_expires_on` and `expected_service_life_months` (migration
  `0048`) — sitting unused today. The Guidance System is the first
  designed consumer of data that already exists in the schema: *"De
  garantie op je koelkast loopt binnenkort af — tik om te bekijken."*
  (Your fridge's warranty is about to expire — tap to view.) Tier B,
  always — informative, skippable, never demands a response. Once Epic
  08 (Document Engine) ships, a document's own validity period
  supersedes this column as the source for this exact signal — worked
  through in full, including the Tier A moment that precedes it, in
  §17.4.1.
- **Anniversary moments.** A year since a logged job, a renovation, a
  move-in date captured by Act IV's own answer: *"Een jaar geleden liet
  je de keuken vernieuwen. Alles nog naar wens?"* (A year ago you had
  the kitchen renovated. Still holding up?) — an invitation to log
  something, never a demand.
- **Dormancy and reactivation.** An account quiet for an extended period
  gets, on return, a single soft Tier B welcome-back — never a forced
  re-run of Part B's full bootstrap sequence unless explicitly requested
  through the Help section's replay (§17.5, unchanged).
- **Life-stage transitions.** Act IV's own personalization answer
  (§5, unchanged) is this system's first stored signal source, not just
  closing-screen flavor — "just bought" vs. "renovating" vs. "manages
  several properties" changes which Tier B signals are worth surfacing
  sooner, a routing decision named here as a consumer of Act IV's answer
  rather than redesigned.

## A.6 · Companion identity — one voice, held for years

Every guidance moment, Tier A or B, day one or year five, speaks in the
same first-person voice Act II already establishes: *"Ik ben Klussie...
ik help je dat dragen."* This is the actual mechanism that makes it a
*companion* rather than a notification system — not a UI treatment, a
continuity of voice. A warranty nudge in year three and Act I's opening
line are, narratively, the same character talking, mid-relationship, not
two different systems that happen to share a color palette.

## A.7 · Guardrails — what must never happen, at any point in the relationship

- **Never two guidance moments visible or queued at once** — Part B's
  "one thing lit" pillar, held for the account's entire lifetime, not
  just within one session.
- **Never re-show anything Mastered**, regardless of what technically
  re-triggers it.
- **Tier A is never used past the point something is genuinely
  foundational** — a routine, recurring signal earns Tier B or nothing,
  never a scrim, no matter how many years pass.
- **A frequency cap on Tier B itself** — even correctly-triggered,
  genuinely relevant nudges wait for a minimum quiet period between
  them, so the companion never reads as constantly narrating.
- **Always skippable, always with zero penalty, forever** — not a Part B
  property that lapses once the bootstrap ends.

## A.8 · How Part B maps onto this architecture

Nothing in Part B is redesigned. This table is the proof: every existing
piece already fits the loop above, which is what makes this a
generalization rather than a rebuild.

| Part B element | Signal | Delivery tier | Memory |
|---|---|---|---|
| Layer 1 (Acts I–V) | New account, role selected | Tier A | Single-fire by construction — never re-triggers, so "Mastered" never applies; already the degenerate case of §A.4 |
| Layer 2.1 (Becoming a Professional) | `BecomeProSheet.onDone()` | Tier A | Role-scoped; one marker per role ever held |
| Layer 3 (Workspace collaboration) | Second membership appears on a workspace | Tier A | Workspace-type-scoped; fires once per type collaborated in |
| Layer 4's original table (first document/room/quote/maintenance reminder) | Each a genuine first-time capability reveal | Tier A | Feature-scoped, one-time |
| §A.5's new signals (warranty, anniversary, dormancy) | Recurring, time-based | **Tier B** | Ongoing — not a single marker, a recurring relevance check each time the underlying data changes |

## A.9 · Open questions for Part A

1. **Where does the "stuck" signal's screen-open counter live, and how
   many opens before it's worth offering to re-explain?** A real number
   is needed (three? five?) and I don't have enough behavioral data to
   propose one responsibly — flagged rather than guessed.
2. **Should Mastered ever decay?** Someone who mastered a control years
   ago, then the control's own UI changes significantly — does Mastered
   survive that, or should a materially changed control reset to
   Introduced? I lean toward reset-on-material-change, but "material" is
   a judgment call worth making concretely when a control actually
   changes, not in the abstract here.
3. **Does Tier B ever escalate to Tier A?** E.g., a warranty nudge
   ignored three times in a row for a genuinely expiring warranty — is
   silence still correct, or does real financial consequence (a lapsed
   warranty on an expensive appliance) justify one heavier, one-time Tier
   A moment before it lapses? Worth deciding before this ships, not
   decided here.

---

# Part B — The Bootstrap Curve

**What follows is Part A's first, densest, most front-loaded curve of
signals** — everything designed across three prior revisions, unchanged
in content. Its own internal section numbers (§0–§17, Appendix A) and
its own revision history are kept exactly as written; only its place in
the larger system (Part A, above) is new. Read it as "the specific
signals that happen to cluster in the first weeks of any relationship,"
not as a separate document bolted on underneath.

---

**Revision note (v3).** §0–§16 and Appendix A below are v2, unchanged —
that pass designed **Layer 1** of what is now an explicitly four-layer
system, in full. §17 (new, at the time) added **Layers 2–4**, the
hierarchy that governs when each layer triggers, and how they share one
mechanism. v2's "Tier 1 / Tier 2" vocabulary was renamed and generalized:
Tier 1 *is* Layer 1 (§17.1); Tier 2 *is* Layer 4, extended with one new
trigger (§17.4). Layers 2 and 3 were genuinely new then — a role
dimension and a workspace dimension v2 didn't have at all. (v4's note:
"Tier A/Tier B" in Part A above is an unrelated, later vocabulary about
*delivery weight*, not to be confused with v2's retired "Tier 1/Tier 2"
naming, which was always about *when things fire* — §A.8 is the bridge
between the two.)

**Revision note (v2, for history).** Superseded v1 in full. The headline
change there: the opening no longer introduces Klussie first. It
introduces **the home** first, and lets Klussie earn its introduction
second. Four other changes followed from that shift: a closing
personalization moment (Act IV), an explicit emotional journey held
separately from the functional one (§4), a mobile-usability pass (§11),
and a progressive-discovery table anchored to real triggers.

---

## 0 · Where I'm pushing back, and where you've already overtaken me

**You independently arrived at the structure I proposed last time.**
V1's central disagreement with its own brief was: don't try to teach
everything on day one, split into a short foundational tour plus
just-in-time reveals triggered by real events. This brief now asks for
exactly that ("Progressive discovery... reveal complexity only when it
becomes relevant") with better, more concrete triggers than I chose
myself. Noted so it's clear this is confirmation, not new persuasion —
§13 below is that idea, filled in with your examples instead of mine.

**The one place I want to push back: *when* to ask the personalization
question.** You place it at the end, "before entering the app." I agree,
and want to say why explicitly rather than silently comply, because the
opposite placement is the obvious alternative and worth ruling out on
purpose. Asking it first would let the opening's copy adapt to the
answer — tempting, since a "just bought" opener and a "renovating"
opener could genuinely differ. But asking anything before the warm,
wordless opening in Act I would make that opening the second thing that
happens, not the first — and the whole premise of "home before Klussie"
argues against introducing a **decision** before the **feeling**. Your
placement is correct, and the reason is: the answer isn't for tailoring
this tour. It's the first ingredient for tailoring *everything
afterward* — the greeting the next time they open the app, which future
capability gets mentioned first. Stated explicitly in Act IV and in
§14 so the payoff isn't just "asked and forgotten."

**One real addition to your spec, not a disagreement: is the
personalization question actually a form?** Rule 1 again. Framed as four
tap targets with an explanation, it survives the same reasoning that
survived it in v1 — no typing, no validation, nothing to get wrong. But
I want to go one step further than "it's fine, it's not a form": it
should not look like a settings screen at all. It should be delivered in
**Klussie's own voice, as a chat message with quick-reply chips** — the
exact visual and interaction language `AiIntakeSheet`'s existing
"Follow-up (optional, skippable)" step already uses
(`UX_PATTERNS.md`, "The AI intake pattern," step 3). Reusing a pattern
that already exists, rather than inventing a new "onboarding preferences"
UI, is both the more honest design (it really is Klussie asking, in the
same voice as everything else) and the cheaper build.

**A genuine open question, not resolved here: should "prefer not to
say" be its own visible fifth chip, or does Skip already cover it?** I
lean toward a fifth, explicit chip — "Liever niet zeggen" — sitting apart
from the four real answers, because a silent Skip and an active "I'd
rather not tell you that" are different signals worth being able to
tell apart later, and offering the second costs one more chip. Flagged
in §16 for your call, not decided here.

---

## 1 · The complete onboarding philosophy

**The headline reordering.** People don't care about Klussie. They care
about their home. So the very first thing on screen is not a product
introducing itself — it's a moment that says *I understand what having a
home feels like*, with no logo, no name, no button, before Klussie has
said a word. Only once that's landed does Klussie introduce itself, and
it introduces itself as being *in service of* what was just said, not
the other way around. Concretely: v1's opening line was *"Hallo Cathy. Ik
ben Klussie."* This version splits that into two separate beats, in that
order reversed — home, then Klussie — described in full in Act I/II
below.

**Seven pillars**, the sixth new to this revision:

1. **The home comes first.** Every other pillar operates inside a frame
   this one sets — nothing explains a feature before the feeling of
   owning a home has been acknowledged.
2. **Show, don't tell.** The thumb does the teaching, not a sentence.
3. **Life situation → benefit → control.** Never begin with a feature
   name. Begin with a moment a homeowner actually recognizes, explain
   what changes, only then reveal where.
4. **One thing lit, always.** Never two controls active at once.
5. **Every tap succeeds.** No wrong answers, nothing to undo.
6. **Doors, not rooms.** *(New.)* Every step opens a door and lets the
   user glimpse what's behind it — it does not walk them through
   everything the room contains. Curiosity is a deliverable, not a
   side effect of running out of time. A tour that explains everything
   has failed at this pillar even if every explanation was accurate.
7. **Warmth over completeness.** This tour will not teach everything
   Klussie does. It will make someone *feel* what Klussie is for.

**The test for "did this work."** Not *"I know where the buttons are"* —
*"this actually understands what owning a home feels like."* Every
section below is checked against that sentence, not against feature
coverage.

---

## 2 · Information architecture

**This section describes Layer 1 only** — the one universal layer every
new account sees once, regardless of what role or workspace they ever
join. See §17 for the full four-layer system this sits inside, including
when Layers 2–4 trigger and how they reuse everything below rather than
duplicating it.

Five acts, only the third of which touches the real navigation. Nothing
below adds a screen, a route, or a bottom-nav tab that doesn't already
exist (ADR-0008 still holds).

```
Sign-in → Role selection (existing, unchanged)
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  ACT I — The Home                                            │
│  Full-bleed, wordless-of-product, emotional. No Klussie yet. │
├─────────────────────────────────────────────────────────────┤
│  ACT II — Klussie Introduces Itself                          │
│  Full-bleed. Personal, by name. Positions Klussie as in      │
│  service of what Act I just said.                            │
├─────────────────────────────────────────────────────────────┤
│  ACT III — The Guided Walk (real UI, 7 real-anchored steps)  │
│  Klussie tab → My Home tab → My Items tab → add one real     │
│  item → Requests tab → Messages tab → Profile/Help           │
│  (maps onto the existing 4 bottom-nav tabs + 3 home          │
│  sections + the existing Help section — nothing new)         │
├─────────────────────────────────────────────────────────────┤
│  ACT IV — Personalize  (new)                                 │
│  One optional question, delivered as a Klussie chat message  │
│  with quick-reply chips — reuses AiIntakeSheet's existing    │
│  "optional follow-up" interaction shape.                     │
├─────────────────────────────────────────────────────────────┤
│  ACT V — The Send-off                                        │
│  Full-bleed. Inspiration, not a checklist. Closes the loop   │
│  opened in Act I.                                            │
└─────────────────────────────────────────────────────────────┘
   │
   ▼
Real app — landing point chosen by what actually happened
(Act III's real add, Act IV's real answer)
```

**Permanent structure, alongside this, forever — not part of the
tour's five acts but part of the same system:**

- **Tier 2 — just-in-time coachmarks** (§13), same mechanism as Act III,
  triggered by real product events for the rest of the account's life,
  not just on day one.
- **The replay entry**, already real: Profile → "Hulp & uitleg" →
  "Rondleiding opnieuw bekijken." Unchanged from v1 — this already
  satisfies "always available from Help."

---

## 3 · The user journey (functional)

| Act | Screen(s) | What the user does |
|---|---|---|
| I | 1 full-bleed screen | Reads, or taps through immediately — nothing required |
| II | 1 full-bleed screen | Same — a beat, not a task |
| III.1 | Klussie tab (composer) | Focuses the composer / taps a suggestion chip — nothing submits |
| III.2 | My Home tab | Taps the real tab; real section change |
| III.3 | My Items tab | Taps the real tab; real section change |
| III.4 | Add-item control | Adds one real item (short form: photo + name) — or defers |
| III.5 | Requests tab | Taps the real tab |
| III.6 | Messages tab | Taps the real tab |
| III.7 | Profile → Help | Taps through to the real, already-shipped Help section |
| IV | Chat-shaped prompt | Taps one of four chips, a fifth "prefer not to say," or skips |
| V | 1 full-bleed screen | Taps the single closing button, lands in the real app |

Total real taps required to complete: eight. Everything else (Acts I,
II, V, and Act IV if skipped) is a beat, not a task.

---

## 4 · The emotional journey

Held separately on purpose — the functional table above says *what
happens*; this says *what it should feel like*, and the two are checked
against each other, not assumed to match automatically.

| Act | Feeling walking in | Feeling walking out |
|---|---|---|
| I | Neutral, maybe a little guarded (a new app, one more thing to learn) | *Recognized.* Something just described what having a home actually feels like, unprompted |
| II | Recognized, curious who's talking | *Met.* Not "installed a tool" — introduced to something that said it's here to help carry a real weight |
| III.1 | Met, slightly testing | *Relieved.* No form. Just talk. That's really all it takes |
| III.2–3 | Relieved, warming up | *Reassured.* Nothing will be lost — not the invoice, not the date, not the name of the part |
| III.4 | Reassured | *Proud.* Something real just got saved, on day one, before any "real" use began |
| III.5–6 | Proud | *Calm.* Knows exactly where things go before anything has actually happened yet |
| III.7 | Calm | *Unburdened.* Permission to not remember any of this — it's all still here, always |
| IV | Unburdened, a little curious what's next | *Seen.* Klussie just asked a real question about their actual situation, not a generic one |
| V | Seen | *Excited.* Looking forward to it — not relieved it's over |

The single most important row is III.4 → III.5: **pride precedes calm.**
Producing something real before explaining "you'll always know what's
happening" means the reassurance that follows is backed by something the
user just did, not a promise about a system they haven't touched yet.

---

## 5 · Screen-by-screen flow

### Act I — The Home

**Purpose.** Say, wordlessly-of-product, *I understand what having a
home feels like* — before the product has a name on screen.

**Real element highlighted.** None. Full-bleed, no chrome, no logo
prominent, no button visible for the first beat of the animation
(§10) — text alone, then a single quiet way forward appears.

**Screen text (NL / EN).**
> *"Ergens is er een dak dat je beschermt.
> Een keuken waar het leven gebeurt.
> Dingen die ooit stuk zullen gaan, en dingen die je koestert.
> Dat noemen we thuis."*
>
> *"Somewhere, there's a roof that shelters you.
> A kitchen where life happens.
> Things that will eventually break, and things you treasure.
> That's what we call home."*

A single, quiet **"Verder"** (Continue) appears after the text has had
time to be read — no name, no logo, no "Klussie" anywhere on this
screen. **"Overslaan"** sits beside it from the moment it appears,
identical weight.

**Interaction & animation.** Slow fade-in, text arriving as three short
lines in sequence rather than all at once (~700ms between lines) — a
pace no notification or loading state in the rest of the app uses,
deliberately, because this is the one moment allowed to feel unhurried
in a way nothing else does.

**Psychology.** Recognition before persuasion. Nothing is being sold in
this act — nothing *can* be, since nothing has been named yet. That
absence is the point: it reads as understanding, not marketing, because
marketing requires a product to be mentioned.

---

### Act II — Klussie introduces itself

**Purpose.** Now the assistant earns its introduction — positioned as
answering what Act I just said, not as a new, separate topic.

**Real element highlighted.** None.

**Screen text (NL / EN).**
> *"Hallo Cathy. Ik ben Klussie.
> Vanaf vandaag help ik je dat dragen — het onthouden, het bijhouden,
> het uitzoeken wie je kunt bellen. Zodat jij je daar geen zorgen meer
> over hoeft te maken."*
>
> *"Hi Cathy. I'm Klussie.
> From today, I help carry that — the remembering, the keeping track,
> the figuring out who to call. So you don't have to worry about it."*

**Interaction & animation.** A soft cross-fade from Act I, ~400ms — the
same visual "room" continues, it doesn't cut to a different one. Name
personalization reuses the homepage's existing `greetingLine` logic
directly (no new personalization mechanism invented).

**Psychology.** Being introduced to an ally *after* being understood
lands completely differently than being introduced to an ally first and
told what it understands second — the same sentence in the opposite
order reads as a sales pitch. Order is the entire mechanism here, not
new content.

---

### Act III — The Guided Walk

Same real-UI mechanism as v1's Spotlight Coachmark (§9), same seven
real-anchored beats, condensed here since the underlying design didn't
change — full detail (both languages, every fallback, the Step 4
replay-adaptation) is preserved from v1 and reproduced in full in
Appendix A.

| Step | Real element | Life situation opener |
|---|---|---|
| III.1 | Klussie chat composer | *"Stel dat je wasmachine morgen stopt met draaien..."* |
| III.2 | "Mijn woning" tab | *"Elke klus, elke offerte, elke afgewerkte reparatie — op één plek."* |
| III.3 | "Mijn spullen" tab | *"In plaats van in laden te zoeken naar het aankoopbonnetje..."* |
| III.4 | Add-item control | *"Heb je iets in de buurt? Voeg het nu meteen toe."* |
| III.5 | "Aanvragen" tab | *"Zodra je iets meldt, kun je hier altijd volgen wat ermee gebeurt."* |
| III.6 | "Berichten" tab | *"Wanneer een vakman reageert, praat je rechtstreeks met hem hier."* |
| III.7 | Profile → Hulp & uitleg | *"Alles wat ik je net getoond heb, kun je hier altijd opnieuw bekijken."* |

---

### Act IV — Personalize *(new)*

**Purpose.** The first moment the relationship becomes specific to this
person, not a general introduction to the product. Explained honestly,
not disguised as anything else.

**Real element highlighted.** None new — delivered inside the same
chat-message visual language as `AiIntakeSheet`'s optional follow-up
step (§0), appearing to come from Klussie itself, not a settings panel.

**Screen text (NL / EN).**
> *"Nog één ding, en helemaal optioneel: in welke fase zit je met je
> woning? Dan kan ik me daar meteen op afstemmen."*
>
> *"One more thing, and completely optional: what stage are you at with
> your home? That way I can tailor things to you right away."*

Chips: **"Ik heb net mijn huis gekocht"** (I just bought my home) ·
**"Ik woon hier al jaren"** (I've lived here for years) ·
**"Ik ben aan het verbouwen"** (I'm renovating) ·
**"Ik beheer meerdere woningen"** (I manage several properties) ·
a visually distinct fifth, **"Liever niet zeggen"** (I'd rather not
say) · and **"Overslaan"** (Skip), always present.

**Interaction & animation.** A single tap selects and immediately
confirms — no "submit" button, matching the chip-selection pattern
`AiIntakeSheet` already uses elsewhere. A brief acknowledgement follows
in Klussie's own voice, specific to the answer (not a generic "thanks"):
for "I just bought my home" — *"Fijn — dan bouwen we dit samen helemaal
opnieuw op."* (Lovely — then we'll build this up together from
scratch.)

**Psychology.** This is the "first step toward feeling personal," stated
in your own words, and it works only if it's honestly explained rather
than framed as data collection — the sentence *"then I can tailor things
to you right away"* is the entire justification, given once, before the
question, matching `COPY_GUIDELINES.md`'s "set expectations, don't just
acknowledge" principle.

---

### Act V — The Send-off

**Purpose.** Land the whole arc on *anticipation*, not completion — the
brief's own distinction, taken literally: not "I finished a tutorial,"
but "I'm looking forward to this."

**Real element highlighted.** None.

**Screen text — varies by Act IV's answer (NL / EN), each closing on the
multi-year framing explicitly requested:**

*If "just bought":*
> *"Welkom in je nieuwe hoofdstuk. Vanaf vandaag bouwen we samen de
> geschiedenis van dit huis op — jaar na jaar."*
>
> *"Welcome to your new chapter. From today, we build this home's
> history together — year after year."*

*If "lived here for years":*
> *"Al die jaren zitten al in dit huis. Vanaf vandaag onthouden we ze
> mee."*
>
> *"All those years already live in this house. From today, we help
> remember them too."*

*If skipped / prefer not to say:*
> *"Dat is het. Wat er ook gebeurt in je huis — ik ben er, en ik groei
> mee, jaar na jaar."*
>
> *"That's it. Whatever happens in your home — I'm here, and I grow
> with it, year after year."*

Single primary button: **"Aan de slag"** (Let's get started) — lands on
My Items if Act III.4 produced a real save, otherwise back on the
Klussie composer where the walk began.

**Interaction & animation.** The single warm pulse (§10), once, slightly
longer than any of Act III's small taps — the one moment allowed to feel
like an actual arrival, still calm, never a burst. No "tour complete,"
no summary, no checklist — explicitly rejected, per the brief.

**Psychology.** Ending on a *forward-looking* sentence rather than a
backward-looking summary is what actually produces "I'm looking forward
to using this" rather than "I finished the tutorial" — a summary is
inherently retrospective; these closing lines are grammatically all
about what's still ahead.

---

## 6 · Every interaction (consolidated)

- **Read-and-continue** (Acts I, II, V) — no input, a single tap or a
  generous auto-advance after a readable pause.
- **Real navigation via a real control** (Act III, all seven steps) —
  the only way forward on any of these is pressing the actual highlighted
  tab or field; there is no separate "Next" button on any of them.
- **One short real form** (Act III.4 only) — the single exception to
  "never type," producing a real saved item.
- **One tap-to-select, no submit** (Act IV) — chip selection confirms
  itself immediately, matching the AI intake's existing pattern.

---

## 7 · Every highlighted real UI element

`KlussiePanel`'s composer + suggestion chips (`IntentSuggestions`) ·
`SegmentedTabs`'s "Mijn woning" tab · `SegmentedTabs`'s "Mijn spullen"
tab · the My Items empty-state add-item control (`ItemFormSheet`) ·
`BottomNav`'s "Aanvragen" tab · `BottomNav`'s "Berichten" tab ·
`BottomNav`'s "Profiel" tab, then the existing "Hulp & uitleg" section
inside `CustomerProfile.jsx`. Seven real elements, zero invented ones —
unchanged from v1.

---

## 8 · Every piece of microcopy

Given verbatim, both languages, inline in §5 above for Acts I, II, IV
and V (new/changed in this revision) and in Appendix A for Act III
(unchanged from v1, reproduced there rather than retyped here). The
encouragement vocabulary for Act III's small taps is unchanged from v1:
*Perfect. / Precies zo. / Goed zo. / Zo simpel is het.* — rotated, never
stacked, never on the bookend acts, which have their own dedicated lines.

---

## 9 · Accessibility review

Every literal requirement from the brief, checked against a real
mechanism rather than restated as a promise:

| Requirement | How this design meets it |
|---|---|
| Plain language | Every line in §5 — no product or software vocabulary anywhere, including Act IV's chips |
| No technical terminology | Same — "the roof," "the kitchen," never "the app," "the interface," "the platform" in user-facing copy |
| Large touch targets | 44×44px (iOS) / 48×48dp (Android) minimum on every new control, including Act IV's chips — `ACCESSIBILITY.md` already documents four existing controls falling short; this must not add a fifth |
| Calm animations | §10, in full |
| High contrast | WCAG 2.1 AA minimum on the scrim/coach-card text combination, verified against whichever theme(s) the app renders in |
| Generous spacing | Coach-card padding and chip spacing sized for a thumb, not a cursor — no two tappable targets closer than 8px edge-to-edge |
| One highlighted element only | Pillar 4, held throughout — including Act IV, where only one chip row is ever live at a time |
| Never rush | No auto-advance timer anywhere except the two clearly-labeled "read, then a control appears" beats (Acts I/II), and even those wait for a generous, fixed reading pause, never a countdown the user can see ticking |
| No countdowns | None, anywhere, visible or implied |
| No unnecessary motion | Every animation in §10 carries meaning (a scrim means "not now," a pulse means "you did it") — nothing decorative |
| Optional reduced-motion mode | Both automatic (`prefers-reduced-motion` disables scrim fade and pulse) **and manual** — see the new "Rustige modus" note below |
| Clear encouragement after every successful interaction | §6/§8, one word, every real tap in Act III, announced via `aria-live` |

**New in this revision: a manual calm-mode toggle, not just the OS
setting.** `prefers-reduced-motion` only helps a user whose device is
already configured that way — a real gap for exactly the audience named
in the brief, many of whom have never opened an accessibility settings
screen on their phone. Act I or Act II should offer a small, unforced
"Rustige modus" (Calm mode) toggle, visible but not emphasized, that
does the same thing `prefers-reduced-motion` does, discoverable inside
the product itself rather than requiring the OS setting to already be
right.

**Also carried over from v1, unchanged:** genuine `inert` (not just
dimming) on everything under the scrim; focus moves into the real
highlighted control rather than being trapped in a dialog;
`aria-describedby` links the coach card to its target; RTL support for
Arabic and Farsi, two of the ten shipped locales.

---

## 10 · Animation philosophy

Not a list of durations — a rule for what motion is *for* in this flow,
since every requirement above ("calm," "no unnecessary motion") only
means something against a stated purpose.

**Motion here always means one of exactly three things, and never
anything else:** *attention* (the scrim dims what isn't relevant right
now), *confirmation* (the pulse says "that worked"), or *continuity* (a
cross-fade says "we're still in the same place," a real scroll says "the
next thing is over here"). If a proposed animation doesn't fit one of
those three, it doesn't belong in this flow — that rules out decorative
entrances, parallax, bounce, spring physics, and anything resembling a
loading spinner (the product's one existing loading pattern, the AI
`.spin` animation, means "working" — reusing that vocabulary here for a
different meaning would teach the wrong association).

**Timing.** Two speeds only: ~250ms ease-out for anything routine (scrim
retargeting, cutout movement, the small taps' pulse), ~600ms for the two
moments allowed to feel like an arrival (Act I's line-by-line reveal,
Act V's closing pulse). No bounce or spring curve anywhere — ease-out
only, which decelerates into stillness rather than overshooting and
settling, the calmer of the two for a first-time or elderly user.

**Never simultaneous.** Never more than one of the three motion types
playing at once — a cutout should finish moving before its coach card's
text cross-fades in, not both at the same time, even though both only
take 250ms. Sequential-but-fast reads as calm; simultaneous-but-fast
reads as busy, which is the actual thing "calm animations" is guarding
against.

---

## 11 · Mobile usability review

This is a phone-first product — the shell itself renders a simulated
phone frame with a notch and status bar (`AppShell.jsx`) — so this
review is a real constraint, not a formality.

- **Thumb reach.** `BottomNav`'s four tabs already sit in the natural
  thumb zone; the composer and the segmented tabs sit higher, requiring
  a reach or a hand-shift for a one-handed grip. Coach cards for
  higher-up targets should default to the **lower half of the screen**
  regardless of the target's own position, so the card text is always
  readable without stretching, even when the lit control itself is out
  of easy reach.
- **The on-screen keyboard.** Act III.1 focuses a text field, and
  Act III.4 opens a real short form — both can raise a keyboard that
  covers the lower half of the screen. The coach card must reposition
  above the keyboard the moment it appears, never rely on a fixed
  "bottom of screen" position that a keyboard would hide.
- **Safe areas.** The simulated notch and status bar are a real visual
  fact of this shell — scrim and cutout math must respect the safe area
  the same way the existing `.phone`/`.screen`/`.notch` structure
  already does, never drawing a cutout edge under the notch.
- **One-handed operation throughout.** Every tap target in Acts I, II, IV
  and V sits within the same thumb-reach band `BottomNav` already proves
  out — no top-of-screen-only control anywhere in this flow.
- **Interruption resilience.** A phone call, a notification, or the app
  backgrounding mid-tour must resume at the exact same step on return —
  the existing `closed`/eligibility state in `useHomeTour.js` already
  models "in progress vs. finished"; this extends it to "which act and
  step," not a new mechanism.
- **Orientation.** Portrait only, matching how every other screen in
  this app is actually used in the field (a phone in one hand, at a
  washing machine or a fuse box) — no landscape layout designed or
  expected.

---

## 12 · Psychological reasoning per step

Held inline with each screen in §5 (a *"Psychology"* line under every
Act) rather than repeated here as a second pass — see §4 for the
emotional arc these individual mechanisms are building toward across the
whole flow, which is the thing worth reading as a single argument rather
than seven disconnected justifications.

---

## 13 · How this evolves as new engines are added

The Tier-2 table below now uses your own named triggers rather than the
ones I chose in v1 — same mechanism (§9/Appendix A's Spotlight
Coachmark, a shorter single-sentence version), different, better-chosen
moments:

| Real trigger | Coachmark introduces | Why it waits for the trigger, not day one |
|---|---|---|
| First document uploaded | Documents | A document viewer means nothing with zero documents to show |
| First room created | Locations | "Which room is this in" is a question that doesn't exist until a room does |
| First quote received | Quote Comparison | Comparing means nothing against zero quotes |
| First maintenance reminder | Maintenance Timeline | A prediction about upkeep is noise before there's any history to predict from |
| *(already real, v1)* First message from a pro | Direct messaging depth | Same reasoning, already shipped as a real empty state |
| *(already real, v1)* A second real workspace appears | `WorkspaceSwitcher` | Already built this way — this design matches, doesn't duplicate |

None of these four new triggers have real UI yet
(`MASTER_CONTEXT.md` §2 — Locations has zero UI, Documents/Knowledge
hasn't started, Quote Comparison and Maintenance Timeline are later
epics still). This table is written now, ahead of the UI it depends on,
on purpose — so the *next* team building any one of those four features
already knows the one sentence of "here's what that means for you" it
owes the person using it for the first time, rather than that sentence
being invented ad hoc, late, by whoever happens to build the feature.

**Correction, made while designing §17.4.3 rather than left standing:**
"Quote Comparison" was **wrong** to list as a later epic. It was carried
over from the original brief's own example list without checking the
actual code first — `RequestDetailSheet.jsx` already renders a real,
comparable list of quotes (`request.quotes.map(...)`, each a `QuoteCard`
with price, trust signal and an independent Accept button) the moment a
request reaches `quotes_ready`. Fixed in the table above and designed in
full, as real, in §17.4.3 — kept here, uncorrected in place, only because
this paragraph is v2/v3 history and this document doesn't edit its own
past revisions, only appends to them (the same discipline §13 through
§17 already hold each other to).

**v4 note:** this table's rows are all one-time, foundational reveals —
they stay Tier A under Part A's vocabulary (§A.3/§A.8). Part A's own new
recurring signals (warranty windows, anniversaries, dormancy — §A.5) are
a separate, always-Tier-B category layered on top of this table, not a
replacement for it.

---

## 14 · Integration with the long-term Home Operating System vision

The tour's own shape is not just a device for teaching navigation — it's
a small, compressed rehearsal of the product's entire multi-year
promise, and that's deliberate, not a coincidence worth pointing out
after the fact.

**Home before Klussie, in the tour — home before features, in the
product.** Act I never mentions Klussie. The homepage itself, every day
after, opens on a personal greeting and *today's* priority before
anything resembling a feature list (`useHomeContext.js`'s own
`greetingLine`, already real). The ordering this tour teaches in ninety
seconds is the ordering the whole product holds to for years.

**Doors, not rooms, in the tour — vertical slices, not epics dumped at
once, in the roadmap.** Pillar 6 (§1) and this session's own standing
engineering priority ("can the user actually benefit from the engine
that now exists, before building the next one") are the same idea
applied at two different time scales — one across ninety seconds, one
across a multi-year roadmap.

**Act IV's answer as the first thread of a much longer personalization
story.** "I just bought my home" vs. "I've lived here for years" vs.
"I manage several properties" aren't just closing-screen flavor text —
they're the first real signal the product has about *which* Home
Operating System this particular person needs: a new owner needs
onboarding into unfamiliar upkeep; a long-time owner needs their
existing history captured, not taught; someone managing several
properties needs the multi-workspace switcher (already real,
`WorkspaceSwitcher`) surfaced sooner rather than waited-out. §A.5 is
where this document finally makes good on that promise — Act IV's
answer feeds real, ongoing routing, not just a closing line.

**The tour grows with the platform, literally, not just thematically.**
§13's table is not a fixed list — it's a config the same shape the
existing `STEPS` array already is (v1 §12), meaning every future engine
that ships real UI adds one row, not a redesign. Ten years from now, if
Klussie has a Maintenance Timeline, a Documents vault, and Locations
with real rooms, this same mechanism — one sentence, one real control, one
proud tap — is still how each of them gets introduced to someone for the
first time. The tour doesn't just describe the Home Operating System
vision once, at the start. It's the one piece of the product built to
keep re-describing it, in miniature, every time the product itself grows
— which is exactly what Part A generalizes into a permanent capability
rather than a repeated coincidence.

---

## 15 · What this changes in the codebase — the seam, not the implementation

Unchanged from v1 (reproduced from there rather than restated): reuse
`useHomeTour.js` and `onboardingPrefs.js`'s eligibility, persistence and
skip/replay semantics entirely unchanged; retire `CustomerOnboarding.jsx`'s
four-slide `Modal` in favor of the Spotlight Coachmark mechanism (a new
component, worth its own `COMPONENT_LIBRARY.md` entry once built); add a
`data-tour="<step-id>"` convention on the real DOM nodes each step
targets. Act IV's answer needs one new column on `profiles` (or an
equivalent small table) to persist. **v4 adds:** the Ambient Nudge (§A.3)
is a second, new, lighter component; the confidence model (§A.4) and
temporal signals (§A.5) both need the generalized ledger already named in
§17.6, extended with per-item state (Unmet/Introduced/Mastered), not just
a timestamp. All named here as seams for whoever implements this, not
designed further in this document.

---

## 16 · Open questions — for you, not decided here

1. **Act IV's fifth chip** ("Liever niet zeggen," distinct from Skip) —
   worth building, or does Skip already cover it? (§0)
2. **The manual "Rustige modus" toggle** (§9) — worth its own onboarding
   moment, or should it live only in Profile settings, discovered later
   rather than offered during the tour itself?
3. **Everything already open from v1 §11**: whether Act III.4's real
   form is worth its one exception to "never type" (I still believe
   yes); whether Act III.5–6 should be cut for an even shorter walk. Pro
   onboarding is no longer out of scope — see §17.2.

---

## 17 · The four-layer progressive onboarding system

**The governing rule, stated once, holding for all four layers:** the
system must never teach functionality before it becomes relevant to
*this* account, and it grows exactly as fast as the account's own journey
through the platform does — not on a schedule, not all at once. Every
trigger chosen below is chosen by asking one question: *what real thing
just became true that this account didn't have yesterday?* (v4 note:
this is Part A's §A.1 question, asked here about signals rather than
guidance itself — the two questions are the same question, asked one
revision apart.)

**One mechanism, four trigger dimensions.** Every layer uses the same
Spotlight Coachmark (§9/Appendix A) — scrim, one cutout, one real
control, no Next button, press-to-advance, one word of encouragement.
Nothing below invents a second interaction pattern. What differs layer to
layer is only *when it fires* and *what it says*:

| Layer | Fires when | Scope of what it teaches |
|---|---|---|
| **1 — Universal** | Once, for every new account, after role selection | Concepts true for literally everyone: §0–§16 above, in full — unchanged |
| **2 — Role** | The first time an account becomes a Professional, or (later) a Business/Enterprise member | Capabilities that role's workspace type actually has |
| **3 — Workspace** | The first time an account joins or creates a workspace whose *type* it has never been a member of before | How collaboration works inside that specific workspace type |
| **4 — Feature** | The first time a specific feature becomes real for this account | One feature, one sentence, one control |

Layers 2–4 are **additive, not sequential** — an account might hit Layer
4 (first document uploaded) years before it ever hits Layer 2 (becoming a
professional), or never hit Layer 3 at all if it never collaborates. None
of the four layers wait for one another; each fires only on its own
trigger.

### 17.1 · Layer 1 — Universal (already fully specified)

This *is* §0–§16 above — the "home before Klussie" opening, the seven
real-anchored steps, the personalization moment, the send-off. Named
here only to place it inside the hierarchy; not redesigned, not
duplicated.

### 17.2 · Layer 2 — Role

**What's real today, and what isn't.** Klussie has one real, live role
transition right now: becoming a Professional, via `BecomeProSheet`
(`proType`, business name/VAT if applicable, bio — already collected,
already real) — landing, today, straight on `ProApp`'s dashboard with
**zero** introduction, the same "no separate tour" gap `UX_PATTERNS.md`
already names for pros. That's the one Layer-2 moment designed in full
below. Business and Enterprise are real, frozen *architecture*
(`PLATFORM_DOMAIN_MODEL.md` §6.8 — `workspace.workspaces.type` already
has a `'business'` value; Enterprise is the Business preset plus five
capabilities, not a separate type) with **no real UI at all** yet — no
"become a business" flow, no business dashboard. §17.2.2 designs the
philosophy and content direction for that role ahead of its UI, the same
restraint Layer 4's future rows already take (§17.4) — not a step
sequence to build today.

#### 17.2.1 · Becoming a Professional (real, buildable now)

**Trigger.** The instant `BecomeProSheet.onDone()` fires — the very
first render of `ProApp`, before the dashboard has been seen even once.

**Why a shorter layer than Layer 1.** Layer 1 had to build the entire
mental model of "Klussie" from nothing. Someone reaching this point
already has an account and, usually, has met Klussie as a customer
first — this layer only has to re-anchor the same trust in a new
context (earning money, not saving time), not rebuild it. Six beats:
one opener, four real-anchored steps, one closer.

**Opener** (no real control, full-bleed, one screen):
> *"Elke klus die je zo meteen ziet, is een kans om te doen waar je goed
> in bent — en er eerlijk voor betaald te worden. Laat ik je even
> wegwijs maken."*
>
> *"Every job you're about to see is a chance to do what you're good at
> — and get paid fairly for it. Let me show you around."*

Note what this opener deliberately does *not* do: it doesn't re-run
Layer 1's "home first" beat. A professional's onboarding validates their
*craft*, not their home — a different feeling, on purpose, not a
shortened copy of the same one.

| Step | Real element | Life situation → benefit |
|---|---|---|
| L2.1 | Dashboard tab (`ProDashboard`, the leads list) | *"Zodra een klant in de buurt precies zoekt wat jij aanbiedt, zie je het hier — niet toevallig, maar omdat het bij jou past."* (The moment a nearby customer needs exactly what you offer, you'll see it here — not by chance, because it matches you.) |
| L2.2 | "Mijn klussen" tab (`ProJobs` — sent/booked/completed) | *"Elke offerte die je verstuurt, elke klus die je boekt, van voorstel tot betaling — allemaal op één plek."* (Every quote you send, every job you book, from proposal to paid — all in one place.) |
| L2.3 | Messages tab | *"Praat rechtstreeks met je klant, geen nummers uitwisselen."* (Talk directly with your customer, no swapping numbers.) |
| L2.4 | Profile tab, the pause toggle specifically | *"Even geen tijd? Zet jezelf hier tijdelijk op pauze — je verdwijnt niet, je bent gewoon even niet zichtbaar voor nieuwe klussen."* (No time right now? Pause yourself here — you don't disappear, you're just temporarily not visible for new jobs.) |

The pause-toggle as L2.4's real control is deliberate: it's the one
control on the entire pro dashboard whose value is invisible unless
someone tells you it exists (nothing about the UI hints "you can turn
this off"), and it's the single highest-leverage trust-builder for a
new, possibly nervous solo tradesperson worried about being overwhelmed
— proving on day one that the relationship has an off switch.

**Closer** (no real control):
> *"Dat is het. De leads komen naar jou toe — jij kiest wat je aanneemt."*
>
> *"That's it. The leads come to you — you choose what you take on."*

**Persistence and replay.** Same mechanism as Layer 1 — a
`pro_profiles`-scoped completion marker (the natural equivalent of
`profiles.home_tour_completed_at`), replayable from the same "Hulp &
uitleg" section, which grows to list every layer this specific account
has ever unlocked (§17.5).

#### 17.2.2 · Business / Enterprise / Property Manager (philosophy only — no real UI yet)

Named explicitly because the brief names it, designed only as far as
honesty allows. `PLATFORM_DOMAIN_MODEL.md` §6.8's preset table is the
real content source once this is buildable: a Business-workspace Layer 2
would introduce Team Collaboration, Compliance, Procurement, Inventory
and Analytics — the capabilities that table shows Business gaining over
Professional. "Property Manager" is not a separate role or workspace
type anywhere in the schema — it's the domain model's own named example
of *who* ends up owning a Business workspace (§6.8: "reality will add
landlords, property managers, housing associations, franchises"), so a
Property Manager's Layer 2 is simply the Business layer, described in
language a property manager recognizes rather than language a facilities
director does — a copy variant, not a fifth layer. **Not designed
further here** — there is no `BecomeBusinessSheet`, no business
dashboard, and inventing steps for either would repeat the exact mistake
this whole document exists to avoid (teaching a control that isn't
there).

### 17.3 · Layer 3 — Workspace (collaboration)

**Honest status: no real UI exists for this today, for any workspace
type.** There is no invite flow, no member-management screen, no
roster view — anywhere, for Personal, Professional, or Business. The
`workspace.role_permissions` vocabulary already has real, seeded roles
waiting for it (Personal: Owner/Household member/Guest; Professional:
Owner/Manager/Employee/Contractor; Business:
Administrator/Manager/Team member/Auditor-Viewer/External provider,
`migration 0036`), and `membership.invite` is a real, granted permission
— but nothing in `src/` calls it. This layer is therefore designed as a
**trigger definition and a content direction**, ready the moment
collaboration ships, not as a step sequence to build now.

**The trigger, defined precisely so it needs no reinterpretation later:**
Layer 3 fires the first time a `workspace.memberships` row *other than
the account's own* appears on a workspace this account belongs to — in
plain terms, the first moment a workspace that used to have exactly one
member gets a second one, from either side (the inviter seeing someone
join, or the invitee seeing they've joined someone else's workspace).
Fires once per **workspace type** the account has collaborated in, not
once per account — someone who is both a solo pro and, later, joins a
property manager's business workspace gets this layer twice, once for
each type, because "how collaboration works" genuinely differs between
them.

**Content direction per type**, once real:

| Workspace type | What Layer 3 would explain | Real roles it would introduce |
|---|---|---|
| Personal | Sharing a home's memory with someone else living in it — a partner, a grown child helping an elderly parent | Household member, Guest |
| Professional | Growing from solo to a small team — who can see leads, who can quote, who's just along for one job | Manager, Employee, Contractor |
| Business | The richest case — who administers, who audits, who's an external provider with limited, temporary access | Administrator, Manager, Team member, Auditor/Viewer, External provider |

Each would follow the exact same benefit-before-mechanism, one-real-
control-at-a-time shape as every other layer — not designed screen by
screen here because the screens it would point at don't exist yet.
Worth a full pass, in this exact format, the moment invite/collaboration
UI is scoped.

### 17.4 · Layer 4 — Feature (extends v2 §13)

v2 §13's table, carried forward unchanged, plus one new row named
explicitly in this brief:

| Real trigger | Introduces | Status |
|---|---|---|
| First document uploaded | Documents | No real UI yet |
| First room created | Locations | No real UI yet — engine complete, no client surface (§17.4.2) |
| First quote received | Quote Comparison | **Real — already shippable.** Corrected in this revision: inherited as "future" from the original brief without checking; `RequestDetailSheet.jsx` already renders a real, comparable quote list (§17.4.3) |
| First maintenance reminder | Maintenance Timeline | No real UI yet |
| First message from a pro | Messaging depth | **Real** — already shippable |
| A second real workspace appears | `WorkspaceSwitcher` | **Real** — already shipped, matched not duplicated |
| **First AI conversation recognizes a real recorded item** *(new)* | The AI already knowing what you own | **Corrected in this revision, same as Quote Comparison was — narrower gap than previously stated.** Not "blocked on the AI intake engine," which is real, live and previously browser-verified (`api/ai-intake.js`, `api/_lib/aiGateway.js`) — designed in full in §17.4.6 |

The new row is the clearest possible demonstration of "AI before forms"
taken to its actual conclusion, worth spelling out even though a first
version of it is closer to real than this document previously said: the
moment someone types *"mijn boiler lekt"* and Klussie's response
demonstrates it already knows which boiler, from the item they recorded
in Layer 1's own Act III.4, a single coachmark should say exactly that —
*"Ik weet al dat het om je Bosch-boiler uit 2019 gaat."* (I already know
this is your 2019 Bosch boiler.) — the single strongest proof-of-value
moment the whole system can offer. §17.4.6 corrects the earlier claim
that this was "blocked" and designs it in full.

#### 17.4.1 · Documents, designed in full

The first Layer 4 row taken all the way to the same depth as Layer 1's
Acts or Layer 2's professional walk — the rest of the table stays at
one line each until each one is asked for by name, the same restraint
§17.2.2 already states.

**Status, and a distinction worth making precisely.** No real UI
exists — `MASTER_CONTEXT.md` §2: Epic 07 just completed, Epic 08
(Document Engine) hasn't started. `PLATFORM_DOMAIN_MODEL.md` names two
separate engines, **eight epics apart**, that a phrase like "Documents/
Knowledge" can make sound like one: **Epic 08, Document Engine** —
metadata in Postgres, content in Storage, real files (invoices,
warranties, manuals, photos) — is what this section designs. **Epic 16,
Knowledge Engine** ("Workspace Knowledge as declared, binding") is a
different, much later, primarily Business/Enterprise concept nowhere
near a homeowner uploading a receipt — not designed here, named only so
the two aren't conflated the way their shared brief-language invites.

**Scope, deliberately narrow.** `PLATFORM_DOMAIN_MODEL.md` §12: a
document attaches to "any number of subjects — a property, a location,
an asset, a maintenance record, a marketplace engagement, or the
workspace itself." This design covers exactly one: a document attached
to an **asset** — an item already sitting in Mijn spullen. Not because
the other five aren't real (they are, in the domain model), but because
My Items is the one surface that already exists to grow an attach
affordance onto, and "your own washing machine's warranty" is a more
legible first moment than "a document on the property." The other five
subject types each earn their own short coachmark once Epic 08's actual
UI shape makes clear where they'd live — not designed further here.

**The trigger.** The first time a document is attached to any asset for
this account.

**The callback, deliberately, not a new idea presented as one.** Layer
1's own Act III.3 (§5, unchanged) already made a promise it couldn't yet
keep: *"heeft Klussie dat al voor je klaarliggen"* (Klussie already has
that ready for you) — true in spirit the day someone heard it, not yet
true in fact. This is the first moment that sentence becomes literally
true, and the coachmark says so out loud rather than pretending it's a
new pitch:

> *"Weet je nog dat ik zei dat ik je garanties en handleidingen zou
> bewaren? Nu kan het echt. Voeg dit toe aan [naam van het item], en ik
> raak het nooit meer kwijt."*
>
> *"Remember when I said I'd keep your warranties and manuals for you?
> Now I actually can. Add this to [item name], and I'll never lose track
> of it."*

**Interaction & animation.** Tier A (§A.3) — a genuinely new capability
class, not a routine event, worth the one-time full coachmark: real
cutout on the (future) attach control on the item's detail view,
press-to-advance, no new mechanism invented. A successful real attach
gets the strongest encouragement word available, on par with Layer 1's
Act III.4 — the second of only two moments in the whole system where the
guidance itself accompanies the creation of something permanently
valuable, not just a navigation.

**The handoff to Part A's temporal signals — where Tier A stops for
good.** This coachmark never repeats. Once a document with a validity
period exists, its expiry becomes an ongoing Tier B signal (§A.3/§A.5) —
the same mechanism already described for `property.assets.warranty_
expires_on`, refined here with a detail worth stating precisely for
whoever builds this: `PLATFORM_DOMAIN_MODEL.md` §12 gives a *document*
its own validity period, independent of and richer than the plain date
column Epic 07 already shipped on the asset. **Once both can exist, the
document's own validity period should take precedence** — the column on
the asset was always a placeholder for the real evidence, not a second
source of truth alongside it. Every expiry after this first attach is
Tier B, forever, once per document — the Tier A moment above fires
exactly once per account, not once per document.

**Psychology.** Promises kept, not promises made. The single strongest
trust-building move a companion voice can make across a multi-year
relationship is proving, concretely, that it remembered something it
said months or years earlier — worth more than any new claim the copy
could make in the moment it's shown.

**The extraction thread — two future capabilities, one real event,
neither designed further here.** `PLATFORM_DOMAIN_MODEL.md` §12 also
names *extraction*: "reading a document to propose structured facts (an
invoice implying a job, a serial number, a warranty period)." This is
the literal mechanism that would eventually power Layer 4's own "AI
already recognizes a real asset" row, above — an invoice attached here,
read, is one real path to Klussie already knowing the boiler is a 2019
Bosch without anyone having typed it. Named so whoever builds either
capability knows the other is waiting for it at the same seam.

#### 17.4.2 · Locations, designed in full

**Status, and a distinction sharper than Documents'.** Documents (§17.4.1)
is ahead of a *numbered, scheduled* epic (Epic 08) that hasn't started
yet. Locations is ahead of something less certain than that: Epic 06
(Location Engine) is **complete** — `property.locations`, the `ltree`
materialised tree, containment, re-parenting, all real, all tested
(structurally; live verification still Pending, `MASTER_CONTEXT.md`
§12). What's missing isn't the engine, it's any client surface at all —
Epic 06's own completion record states it plainly: *"no backfill, no
client wiring — nothing in the product creates a real location yet."*
And unlike Document Engine, there is no numbered epic on the roadmap
that would build one. "Home Builder UI" is a recommendation from this
session's own prior turn, not a scheduled unit of work — worth being
honest about the difference: this design is ahead of an *idea*, not
ahead of a *plan*.

**The callback — not a sentence this time, a form field.** Documents'
callback (§17.4.1) was a promise made in words, months earlier, now kept.
This one is stronger, because nothing was ever promised out loud:
`ItemFormSheet.jsx` already has a real "room" field, today, with
suggested chips — Keuken, Badkamer, Terras — that every single person
who has ever added an item has already typed into or tapped. That value
goes nowhere structural; migration `0048`'s own comment on
`property.assets.room_label` says so directly: *"superseded once a real
location backfill exists."* Years of what looked like disposable data
entry turn out to have been meaningful the whole time — the coachmark,
when a real surface exists to hang it on, should say exactly that:

> *"Al die keren dat je 'Keuken' of 'Kelder' typte — dat was nooit
> zomaar een label. Nu kun je je huis echt opbouwen, kamer voor kamer,
> en elk ding vindt vanzelf zijn plek."*
>
> *"Every time you typed 'Kitchen' or 'Cellar' — that was never just a
> label. Now you can actually build your home, room by room, and
> everything finds its place automatically."*

This is a stronger trust move than Documents' callback precisely because
nothing was explicitly guaranteed — the product simply turns out to have
been quietly worth trusting the whole time, which lands differently than
a kept promise does.

**Trigger.** The first real `property.locations` row created for this
account's property — a child of the property's own root (Epic 06's
`ltree` root label is the property's own id; the first child segment is
the first real room).

**Real element it would point at.** Doesn't exist yet, so this names
where it most plausibly belongs rather than pointing at nothing: "Mijn
woning" (My Home), not Mijn spullen — a room is a fact about the *home*,
not a possession, and My Home is already where `PropertyHeader` and the
home timeline live. Once a "build your house" affordance exists there —
a room list, an "add a room" control — that becomes the real cutout.

**Tier.** A — foundational, first-time, and the single biggest
structural payoff anywhere in Layer 4's table, worth stating plainly:
the moment a real location exists, `property.assets.location_id` /
`.placed_since` (ADR-0028's mutable pointer, built in Epic 07, sitting
completely unused since) becomes reachable for the first time. This one
coachmark is where three already-shipped, currently-inert engines —
Property, Location, and Asset placement — all become usable
simultaneously. No other row in this table unlocks that much real,
already-built structure in one tap.

**A direct link to Act IV's own answer, closing a loop named but not
used until now.** §14 already flagged Act IV's personalization answer as
"the first real signal about which Home Operating System this person
needs," without a concrete example. Here is one: an account that
answered *"Ik ben aan het verbouwen"* (I'm renovating) is exactly who
this signal should be prioritized for, sooner rather than waited-out —
someone mid-renovation is the person most likely to actually want to
re-map rooms, and re-parenting (`reparent_location()`, Epic 06) is built
precisely for a boiler moving from an old garage into a new utility
room. Not a new mechanism — Act IV's answer was always meant to route
signals like this; this is the first place in the document it actually
does.

**What happens after.** This exact coachmark fires once. A second room
is not a new concept — ordinary repeated use, reaching Mastered (§A.4)
almost immediately, no further Tier A moment for room creation itself.
**A distinct, smaller follow-on moment**: the first time an *existing*
item (still holding only a free-text `room_label`) gets moved into a
real location for the first time — worth one short Tier B nudge of its
own, not designed further here, since it depends on whatever UI actually
lets someone re-home an existing item.

**Psychology.** Building on §17.4.1's "promises kept" mechanism rather
than repeating it: where Documents proves the companion remembered
something it *said*, this proves it was quietly building toward
something it never needed to say at all — the stronger of the two moves
available to a multi-year companion, and worth sequencing carefully
relative to Documents' moment when both eventually exist (not decided
here — see the open question below).

#### 17.4.3 · Quote Comparison, designed in full

**Status — the first of these three that is simply real, today, no
qualification needed.** Unlike Documents (§17.4.1, engine not started)
and Locations (§17.4.2, engine complete, no client surface), Quote
Comparison needs neither. `RequestDetailSheet.jsx` already renders,
right now, a real comparable list — `request.quotes.map(...)`, each a
`QuoteCard` carrying the professional's name, badge, `TrustBadge` (rating
plus trust score), price, and its own independent Accept button — the
moment a request reaches `quotes_ready` status. The badge on the
`Aanvragen` bottom-nav tab (`awaitingDecisionCount`, already wired in
`CustomerApp.jsx`) already announces it. This section designs the one
thing that's actually missing: nobody has ever explained any of it. This
is the same shape as §17.2.1 (Becoming a Professional) — real, buildable
now, no engineering dependency, only a guidance gap.

**The stakes are different from every other Layer 4 row so far, and the
design has to say so.** Documents and Locations are both about memory
and structure — pleasant, low-anxiety territory. This one is about
**money and trusting a stranger** — the first moment in the entire
Guidance System that touches either. The copy below is held to a
different bar than §17.4.1/§17.4.2's: not just benefit-before-mechanism,
but an explicit, honest answer to the anxiety this specific moment
produces — *am I being steered toward the pro that's best for Klussie,
not best for me?* That question deserves a direct answer, not a
reassuring tone standing in for one, which is why it's checked against
the code, not just against `PRODUCT_CONSTITUTION.md`'s Rule 9 ("trust
beats growth"): the quotes query carries no `order by` on price, rating,
or badge tier — pros appear in whatever order they replied. The claim
the copy makes is one this document confirmed against `requests.js`
before writing it, not one asserted on faith in the constitution alone.

**The callback — Layer 1's own Act III.5 said this would happen, by
name.** Its exact line (§5, unchanged): *"Zodra je iets meldt, kun je
hier altijd volgen wat ermee gebeurt — wie erop reageert, met **welke
offerte**, en wanneer."* (...who responds, with **which quote**, and
when.) This coachmark is that specific promise, made in Act III.5, made
concrete for the first time — the same "words kept" mechanism as
§17.4.1, on the exact phrase rather than the general idea.

> *"Meer dan één vakman kan reageren op wat je gemeld hebt. Je kiest zelf
> wie — op prijs, op wat anderen erover zeggen, of gewoon op wie je het
> meeste vertrouwt. Wij duwen nergens naartoe: de offertes staan hier in
> de volgorde waarin ze binnenkwamen, niet in de volgorde die ons het
> beste uitkomt."*
>
> *"More than one professional can respond to what you reported. You
> choose who — on price, on what others say about them, or simply on who
> you trust most. We don't steer you anywhere: the quotes are shown in
> the order they came in, not the order that suits us best."*

**Trigger.** The first time this account opens a request whose status has
reached `quotes_ready` — not the moment the quote arrives server-side
(§A.2's Relevance stage matters here more than in any prior entry, see
below), the moment the account actually walks into the screen carrying
it.

**Why the trigger is "opened," not "arrived."** Every previous Layer 4
row so far was user-initiated — the account did something, guidance
followed its own action. A quote arriving is the first **server-
initiated** signal this document has designed: it can happen at any
moment, including mid-conversation with the AI, mid-scroll through My
Home, or while the phone is asleep. Firing a Tier A takeover the instant
that happens would violate Relevance's own rule (§A.2: never interrupt a
real action in progress) on the very first genuinely asynchronous signal
this system has to handle. The resolution: the badge itself (already
real, already self-explanatory after Act III.5 taught what the tab
means) is the only thing that appears immediately — no guidance needed
there, it doesn't need explaining twice. The Tier A coachmark waits for
the account to *choose* to open that request, at which point opening it
already **is** the start of a task, and orienting them inside a task
they just began is not an interruption of anything.

**Real element highlighted.** The quote list itself, inside
`RequestDetailSheet` — not one card in particular (Pillar 4, "one thing
lit," is satisfied here by treating the whole comparable set as the one
control, the same way Act I's three-line reveal was one beat rather than
three separate highlights) — with the Accept button pattern named as
what "choosing" actually looks like in this UI.

**Interaction & animation.** Tier A. The required action is opening the
sheet itself (already done, since that's the trigger) — no further tap
is demanded to advance; the coachmark simply appears once, over the real
list, and clears on a single acknowledgement tap that doesn't accept any
particular quote (accepting one is a real, consequential action this
system must never nudge toward — the coachmark's own dismissal control
must be visually and functionally distinct from any `QuoteCard`'s Accept
button, so a rushed tap can never be mistaken for a booking decision).

**What happens after.** Reaching Mastered (§A.4) here should take longer
than for Documents or Locations, and be judged more conservatively — a
homeowner who has accepted one quote confidently has learned "how it
works," but a genuinely new situation (their first time seeing four
quotes at once, rather than one) is a different real experience worth
not immediately suppressing. I'd default to Mastered after the *second*
real accept, not the first, given the stakes — flagged as a real
parameter choice, not settled with confidence here.

**A distinct follow-on moment, named not designed:** the first time a
quote carries a badge tier (`proBadgeLabel`) the account hasn't seen
explained — a short, separate Tier B nudge belongs there ("what does
this badge mean"), not folded into this coachmark, since badge meaning
is a trust-signal explanation, not a comparison-mechanic one, and
conflating the two would violate "one concept at a time" the same way
combining Layer 1's Act III.5 and III.6 into one step would have.

**Psychology.** Every other entry in Layer 4 so far builds confidence
through *competence* — you now know where something lives. This one has
to build confidence through **assurance of fairness** instead, because
the anxiety it answers isn't "will I find this again," it's "can I trust
what I'm being shown." Naming the ordering rule explicitly, rather than
implying trustworthiness through warm tone alone, is the only version of
this coachmark that actually earns the thing it's claiming.

#### 17.4.4 · Maintenance Timeline, designed in full

**Status — a fourth, distinct pattern, not a repeat of the first
three.** Documents was not-started; Locations was engine-complete with
no client surface; Quote Comparison was simply real and mis-classified.
Maintenance is none of those cleanly — it's **conversationally real but
structurally inert**. `PLATFORM_DOMAIN_MODEL.md` §13.1 names three kinds
— *reactive* (something broke), *planned* (a schedule says it's due),
*predicted* (accumulated understanding says it's *becoming* due). Only
the first is real today, and only partly: `MyHomePanel`'s own history
section already shows finished jobs and reviews — reactive maintenance,
already taught in Layer 1's own Act III.2. Planned and predicted are
Epic 10 (Maintenance Engine — "obligations, schedules, due and overdue
state," not started, three epics past Epic 07). This section is about
those two, not a re-explanation of what Act III.2 already covers.

**The AI conversation already asks the right questions — and they
currently go nowhere.** `homeIntents.js`'s existing `maintain` intent
(*"I want to plan maintenance"*) already asks a homeowner: *"Staat het
al bij Mijn woning?"* (Is it already saved under My Home?), *"Is dit
eenmalig of terugkerend?"* (Is this one-time or recurring?), *"Welke
data passen jou?"* (Which dates work for you?) — real, shipped
questions, today. Every answer becomes a free-text field on an ordinary
service request and is never looked at again. This is the same shape as
Locations' callback (§17.4.2, a form field with no structural payoff),
not Documents' (a promise stated once in Act III.3) — a *repeated*
question, asked every time someone starts this conversation, that has
never once led anywhere.

**A concrete, already-written piece of dormant plumbing, worth naming
precisely.** `src/lib/homeInventory.js`'s `EMPTY_HOME` stub already
carries an `upcomingMaintenance: []` field, always empty, resolved by
`fetchHomeProfile()` every time the homepage loads. Its own
`knownFactsFrom()` function already checks
`homeProfile.upcomingMaintenance?.length` and, if it's ever non-empty,
tells the AI conversation the `maintenanceHistory` fact is already known
— which means the very question quoted above, *"Staat het al bij Mijn
woning?"*, is **already wired to stop being asked** the day real data
exists. Nobody has to build that skip logic; it's shipped, tested, and
has simply never had anything to act on. Epic 10 shipping doesn't just
add a screen — it silently makes an existing conversation smarter,
for free, the same day.

**The trigger.** The first time a real, structured maintenance
obligation exists for this account with a genuine planned or predicted
due date — not the first reactive history entry, which Act III.2
already covers.

**Real element it would point at.** Doesn't exist yet, so — matching
§17.4.2's honesty about Locations — this names where it most plausibly
belongs rather than pointing at nothing: the same "Mijn woning" surface
`upcomingMaintenance` is already reserved for, most likely as a new
section of the existing home timeline (`myHomeParts.jsx`) rather than a
separate screen, since it's temporally the same kind of information as
the history section already sitting there — just facing forward instead
of back.

> *"Al die keren dat ik vroeg of iets terugkerend was, en welke data je
> pasten — dat ging nooit ergens heen. Nu onthoud ik het echt: hier zie
> je wat eraan zit te komen, ruim voordat het een probleem wordt."*
>
> *"All those times I asked whether something was recurring, and which
> dates suited you — that never went anywhere. Now I actually remember
> it: here's what's coming up, well before it becomes a problem."*

**The trust point, checked the same way §17.4.3's was, not assumed.**
§13.1's own "critical decoupling" matters directly here: *"A maintenance
need may be resolved by an internal team, by a contracted provider, by
the marketplace, by the workspace's own members, or by a decision to
defer. The marketplace is one of several fulfilment routes."* A due
reminder must never read as a sales trigger — the coachmark should say
so as plainly as §17.4.3's ordering-honesty line did:

> *"Dit is geen verkooppraatje — het is gewoon een herinnering. Zelf
> doen, uitstellen, of iemand inschakelen: het is jouw keuze, altijd."*
>
> *"This isn't a sales pitch — it's just a reminder. Do it yourself,
> put it off, or bring someone in: it's always your choice."*

**Interaction & animation.** Tier A, once — the first reminder ever
shown introduces the whole concept (*"I can tell you what's coming
before it breaks"*), the same one-time-foundational shape as Documents'
and Locations' first moments. Every reminder after this one is Tier B
forever (§A.3/§A.5), exactly the handoff pattern §17.4.1 already
established for warranty expiry — this is the same kind of signal,
arguably its closest sibling in the whole table.

**Where its data actually comes from — a real column, not a new
invention.** `property.assets.expected_service_life_months` (migration
`0048`, Epic 07) already exists, unused, precisely for this: predicted
maintenance's raw material, sitting in the schema since the Asset
Engine shipped, waiting the same way `warranty_expires_on` was for
§17.4.1's document-expiry signal — a second already-built column this
document is naming a real consumer for, not a second coincidence.

**What happens after.** Mastered (§A.4) applies normally here — once an
account has seen a handful of reminders and acted on (or knowingly
deferred) a few, the *explanatory* framing stops appearing; the
reminders themselves never stop, only the teaching around them does,
the same distinction §A.4 already draws between suppressing guidance and
suppressing the underlying signal.

**Psychology.** The payoff of every prior "I remembered something you
told me" moment in this document (§17.4.1's promise, §17.4.2's form
field, this section's own dormant questions) converges here into the
platform's actual predictive claim — not "I saved what you said," but
"I used what you said to know something before you did." This is the
first Layer 4 entry that demonstrates the Home Operating System's
forward-looking value directly, rather than its memory; worth landing
carefully, since it's the closest thing in Layer 4 to Layer 4's own
"AI already recognizes a real asset" row in what it's proving, from a
different direction (accumulated data predicting, rather than a single
document being read).

#### 17.4.5 · WorkspaceSwitcher, designed in full

**Status.** Fully real, already shipped (Epic 03 WP12) — the only entry
in Layer 4 needing neither new engineering nor a design decision about
where it would live. `src/shell/WorkspaceSwitcher.jsx` already renders
nothing below two live memberships and a real, working segmented control
above it, in `AppShell.jsx`'s top bar, replacing the old "Previewing as"
toggle the moment a second real workspace exists.

**The one thing every other entry so far hasn't had to deal with: this
trigger collides, exactly, with Layer 2's own.** Today there is exactly
one real path to a second membership — becoming a Professional via
`BecomeProSheet` (§17.2.1) — the same event, not a similar one. Without
resolving this explicitly, an account becoming a pro would get Layer
2.1's six-beat walk **and** this Tier A coachmark from one tap, stacking
two guidance moments in direct violation of Relevance (§A.2: never stack
two). Resolution: this coachmark **never fires alongside** Layer 2.1 —
it fires once Layer 2.1's own closer has been reached (or Layer 2.1 was
skipped entirely), as the natural next beat, not a second, competing
one. Conceptually the two are different things anyway: Layer 2.1
explains *the pro dashboard*; this explains *how to leave it and come
back* — worth its own short moment, sequenced, not folded in and not
simultaneous.

**The harder problem, worth stating precisely: most of the accounts that
need this today already had the trigger fire in the past.** Every pro
backfilled in Epic 03 (WP 03.03/03.04) already has two real memberships
*right now*, before any of this ships — for them, "a second workspace
appears" isn't a future event this system will observe, it already
happened, silently, with nothing to explain it, and the switcher is
already sitting in their top bar unexplained. §A.2's new closing
paragraph is what resolves this: the signal is "this account now has a
state the system has never yet observed for it," which a pre-existing
condition satisfies exactly as validly as a fresh transition the first
time the Guidance System checks. Concretely: **on this system's own
launch, every account already at ≥2 memberships gets this Tier A moment
once**, on its own (no Layer 2.1 to sequence after, since they already
know how to be a pro) — a genuinely different cohort from "just became a
pro," reached by the same coachmark, through a different Signal path.

**The opener the architecture itself already wrote.**
`PLATFORM_DOMAIN_MODEL.md` §27 states the whole idea in one line, and
names the paradigm user by role: *"A person is always themselves; they
change which world they are looking at,"* and, further down, names *"a
plumber checking their own home between jobs"* as the ordinary case this
was built for. Both quoted directly rather than paraphrased — this is
the rare case where the frozen architecture already wrote the coachmark
script before any design pass did:

> *"Je bent nog steeds gewoon jezelf — je kijkt alleen naar een andere
> wereld. Net als een loodgieter die tussen twee klussen door even zijn
> eigen huis checkt: tik hier om te wisselen."*
>
> *"You're still just yourself — you're only looking at a different
> world. Like a plumber checking their own home between two jobs: tap
> here to switch."*

**Trigger.** Either: (a) the first time this account's own second real
membership appears, sequenced after Layer 2.1 completes or is skipped;
or (b) for an account already at ≥2 memberships when the Guidance
System first ships, the first time that account is observed post-launch
— the retroactive case §A.2 now covers explicitly.

**Real element highlighted.** The switcher itself, in `AppShell.jsx`'s
top bar — visible from inside both `CustomerApp` and `ProApp`, which
matters for where this fires: since the control sits above both apps
rather than inside either one, this is the first Layer 4 coachmark
anchored to the app's shared chrome rather than to a tab or a panel
within one specific app.

**Interaction & animation.** Tier A, once. Pressing the real switcher —
actually changing `activeWorkspace` — is the required action, the same
press-to-advance shape as every other Tier A moment; no new mechanism.

**An honest gap worth naming, not smoothing over.** §27's own stated
requirement: *"Switching is cheap and preserves place... returning
should resume where they were."* Checked against the real
implementation rather than assumed: switching workspace type today
changes which top-level app renders (`CustomerApp` vs. `ProApp`,
different component trees), and neither preserves the other's internal
tab state — a customer three taps deep in Requests who switches to their
pro workspace and back does not return to where they were. The
coachmark's own copy should not claim more than the product currently
does; it promises recognition and easy switching, which is true, not
place-preservation, which isn't yet. Worth fixing in the product
independently of this document, not designed further here.

**A cross-reference worth making rather than staying silent about.**
§27 also states, adjacently: *"The platform never asks a person to
classify themselves... type is a consequence of what someone does,
never a label they are asked to wear."* `RoleSelectionScreen` — still
gating every new signup today, unrelated to this coachmark but sitting
one screen earlier in the same account's life — already violates this
exact principle, a known, tracked debt item (`MASTER_CONTEXT.md` §12,
surfaced and deliberately not fixed in an earlier session). Not this
document's problem to solve, but worth one sentence rather than pretending
the tension isn't sitting one screen away from the coachmark that quotes
the principle it violates.

**What happens after.** The fastest Mastered of any entry in this
table — switching workspaces has nothing left to learn after the first
successful tap, unlike Quote Comparison's deliberately conservative
threshold (§17.4.3). One real switch is enough.

**Psychology.** Every other Layer 4 entry so far builds toward "I trust
this system with something." This one is different in kind: it's about
identity, not trust — reassuring someone that becoming a professional
didn't cost them being, simply, a person with a home. §27's own opening
line does that work better than any copy this document could invent, which
is why it's quoted rather than rewritten.

#### 17.4.6 · AI recognizes a real recorded item, designed in full

**Status — corrected, the same way §17.4.3 corrected Quote Comparison.**
Every prior mention of this row in this document called it "blocked on
the AI intake engine's entity resolution — itself blocked on the
Anthropic API key setup." Checked against the actual code rather than
repeated on faith: **the AI intake engine is not blocked.**
`api/ai-intake.js` and `api/_lib/aiGateway.js` are real, already call
Anthropic's API with forced structured tool output, and were previously
built and browser-verified end-to-end, including photo-based brand
recognition. What's actually missing is narrower and closer than "blocked
on a foundational capability" implied — three small, well-defined
additions to an endpoint that already works, not a new capability
waiting on infrastructure.

**Exactly what's missing, read from the tool schema itself.** The
`submit_job_analysis` tool in `api/ai-intake.js` already extracts
`brandDetected`, `ocrText` and `visionNotes` from any attached photo —
meaning if someone photographs their boiler's nameplate today, the AI
already reads "Bosch" off it, right now. What
doesn't happen: that extraction is never checked against the caller's
own recorded assets, because the caller's assets are never sent to the
model at all — the request payload sends the service catalog as context
but not the household's own items. Closing this gap is: (1) pass a short
list of the caller's recorded assets (id, name, brand, model) into the
prompt, the same way the service catalog already is; (2) add one field
to the tool schema, `matchedAssetId` (nullable, plus a confidence-style
signal, matching the existing `confidence` field's own shape); (3) one
new paragraph in the system prompt telling the model to check the list
before answering. Whether the `ANTHROPIC_API_KEY` is actually configured
in whatever environment this eventually deploys to is a real, separate,
operational question for whoever ships it — not a design blocker, and
not something this document can verify from code alone.

**The callback — a fourth instance of the same family, and the most
literal one yet.** Documents' callback was a promise in words.
Locations' and Maintenance's were both "the product already asks/holds
this, and nothing happens with it." This is the sharpest version of that
same pattern: the AI **already extracts** the brand from a photo, today,
in production code — it just throws the comparison away, because nobody
told it what to compare against.

> *"Ik zag 'Bosch' op de foto die je net stuurde — en ik herken 'm: dat
> is dezelfde ketel die je al bij Mijn spullen hebt staan, uit 2019.
> Ik hou je garantie en geschiedenis er meteen bij."*
>
> *"I saw 'Bosch' on the photo you just sent — and I recognize it:
> that's the same boiler you already have listed under My Items, from
> 2019. I'll keep your warranty and history right there with it."*

**Trigger.** The first time an AI intake response for this account
returns a non-null `matchedAssetId` above whatever confidence threshold
whoever builds this sets — the same shape as the existing
`CONFIDENCE_THRESHOLD` already gating follow-up questions in
`api/ai-intake.js`, reused rather than invented fresh.

**Real element highlighted.** The review step of the AI intake flow
(`AiIntakeSheet`, the `AIMessage`-rendered structured result —
`UX_PATTERNS.md`'s own "AI intake pattern," step 4) — specifically
wherever the matched item would be shown back, before submission, since
`UX_PATTERNS.md`'s existing description of this step is explicit that
the result is *"never mistaken for something a human wrote"* and is
reviewed before it becomes a real request; the match must be shown as
part of that same editable review, correctable like everything else on
it, never presented as a fact the account can't challenge.

**Interaction & animation.** Tier A, once. No separate real control to
press beyond continuing the AI intake flow itself, which the account is
already doing — the coachmark narrates something that's already
happening on screen rather than gating on a new tap, closer in shape to
§17.4.5's chrome-level moment than to a dedicated button-press.

**The trust nuance this entry needs that the others didn't.** Every
prior "AI already knows" claim in this table has been true by
construction. This one can be *wrong* — a misread brand, a coincidental
name match — and a wrong match is a worse failure than no match at all,
because it's a confidently stated error, not a gap. Two things follow,
neither optional: the confidence threshold from the trigger above should
be conservative, tuned toward silence over a bad guess; and the review
screen's existing correctability (already real, per
`UX_PATTERNS.md`'s own AI intake pattern) is what makes showing this
guidance safe at all — this coachmark should never be built ahead of
that correctability already being in place.

**What happens after.** Ordinary Mastered (§A.4) applies once the
account has seen a few correct matches — this is a demonstration of
capability, not a decision like Quote Comparison's, so it doesn't need
that entry's more conservative threshold (§17.4.3).

**Psychology.** The payoff line for every "I remembered" and "I already
asked" moment this document has designed — Documents (§17.4.1),
Locations (§17.4.2), Maintenance (§17.4.4) all build toward a companion
that holds information. This is the first moment it *uses* that
information without being asked to — proactive recognition, not
retrieval — which is a categorically different, stronger claim than
anything Layer 4 has shown so far, and the reason its trust nuance above
isn't optional the way it might be for a lower-stakes entry.

### 17.5 · One shared consequence: the Help section grows into a list

`CustomerProfile.jsx`'s "Hulp & uitleg" section holds one replay control
today (Layer 1 only). Once any Layer 2 or 3 moment exists for an
account, that section becomes a short list — *"Rondleiding: Mijn huis"*,
*"Rondleiding: Als vakman"*, each independently replayable, each
appearing only once that layer has actually fired for this account (a
homeowner who never became a pro never sees a professional-tour entry to
replay). No new nav surface — the same control, holding more than one
item once there's more than one to hold.

### 17.6 · Persistence, generalized

v1/v2 relied on one column, `profiles.home_tour_completed_at`. A
four-layer system needs one completion marker per *(layer, context)*
pair — Layer 1 is account-scoped (one marker), Layer 2 is
role-scoped (one marker per role ever held), Layer 3 is
workspace-type-scoped (one marker per type ever collaborated in), Layer 4
is feature-scoped (one marker per feature). **v4 extends this once more**
(§A.4/§A.8): each marker needs a state, not just a timestamp —
Unmet/Introduced/Mastered — plus, for §A.5's temporal signals, a
recurring relevance check rather than a one-time marker at all. Named
here as the shape a future migration needs to support — a small ledger
table, not several ad hoc boolean columns — and left as a seam for
whoever implements this, not designed further in this document.

### 17.7 · Open questions specific to Layers 2–4

1. **Is a copy-only variant enough for Property Manager**, or does a
   landlord managing three rented units actually need different framing
   from a facilities manager at a housing association — both nominally
   "Business," per §17.2.2? I don't have enough real signal to answer
   this yet; worth revisiting once Business workspaces have real users.
2. **Should Layer 3 fire for the *inviter* as well as the *invitee*, or
   only the person joining an existing workspace?** I'd lean toward
   both, asymmetrically — the inviter's version explains "here's what
   your new team member can and can't see," the invitee's explains
   "here's what this workspace is and who's in it" — but this is a real
   design decision for whenever collaboration UI is scoped, not settled
   here.
3. **Does becoming a pro who was never a customer first change Layer
   2.1's opener?** §17.2.1's opener assumes some familiarity with
   Klussie already existing. Someone who signs up and chooses "pro"
   immediately at `RoleSelectionScreen` has met nothing yet — worth a
   one-line variant, not designed here.
4. **Should the other five document subject types** (property, location,
   maintenance record, marketplace engagement, workspace — §17.4.1) get
   their own coachmarks at the same depth once Epic 08 ships, or does
   the asset-attachment moment do enough of the trust-building work that
   the other five can stay Tier B nudges with no dedicated Tier A
   moment of their own? I'd lean toward the latter — one genuine "now I
   can really do this" moment per account, not one per subject type —
   but it's a real call for whoever scopes Epic 08's guidance content in
   full.
5. **If Locations (§17.4.2) and Documents (§17.4.1) both become real for
   an account close together in time, which fires first?** Both are
   Tier A, both are once-per-account, and Relevance (§A.2) already says
   never stack two — but this is the first case where two *different*
   Tier A moments could plausibly queue on the same day (someone
   building a room and attaching a warranty in one renovation-driven
   session). I'd default to whichever real event actually happened
   first rather than an authored priority order, but flagging it since
   it's the first real collision between two Layer 4 rows this document
   has designed in full.
6. **Locations has no scheduled epic to be ready for, unlike every other
   row in this table.** Worth a decision independent of this design:
   should a client-facing "Home Builder" unit of work be added to the
   roadmap now that Epic 06's engine has sat unused since completion, or
   does it wait for natural demand the way Business/Enterprise's UI
   does (§17.2.2)? Not decided here — a roadmap-sequencing call, not a
   guidance-content one.
7. **Quote Comparison (§17.4.3) is real today — should it ship before
   Documents or Locations, since it alone needs no engineering work at
   all?** I think yes, and would sequence it first of the three if asked
   to prioritize, but that's an implementation-planning opinion, not a
   design one, and not mine to settle unilaterally here.
8. **Is "Mastered after the second accept" (§17.4.3) the right
   threshold**, or should money-stakes guidance use a different
   mechanism from the confidence model entirely (e.g., never fully
   suppressed, just reduced to a much shorter reminder)? Flagged as a
   real parameter, not a confident answer.
9. **Should Maintenance Timeline's first coachmark (§17.4.4) fire
   differently depending on whether it's introducing a *planned* item
   (a schedule the account itself set, via the existing `maintain`
   intent) versus the platform's own first *predicted* one** (derived
   from `expected_service_life_months`, something nobody told Klussie
   directly)? The second is a materially bigger claim — "I figured this
   out myself" — and might deserve its own, separate first-time moment
   rather than sharing this one. Not resolved here; both are described
   as one entry above for compactness, not because they're necessarily
   the same guidance moment.
10. **Is "sequence after Layer 2.1's closer" (§17.4.5) the right
    resolution to the Layer 2/Layer 4 collision**, or should the
    switcher coachmark simply be folded into Layer 2.1 as a seventh
    real-anchored step, since in practice the two cohorts (new pro,
    pre-existing pro) rarely need to be told apart? I lean toward
    keeping them separate, on the "different concepts" reasoning stated
    above, but this is the first real structural seam between two layers
    this document has had to design across, and it deserves a second
    opinion before either is built.
11. **When this system first ships, every already-multi-workspace pro
    gets this Tier A moment at once, in a single retroactive sweep.**
    Is a one-time bulk "catch-up" pass across existing accounts the
    right mechanism, or should it instead just be evaluated lazily, per
    account, the next time each one happens to open the app? The
    behaviour described in §17.4.5 assumes the latter (evaluated on
    next observation, not swept), consistent with how every other Signal
    in this document already works — named here only so it's confirmed
    as a decision, not an oversight.
12. **What confidence threshold makes a recorded-item match (§17.4.6)
    worth showing at all?** The design borrows `api/ai-intake.js`'s
    existing `CONFIDENCE_THRESHOLD` (85) as a starting reference rather
    than proposing a new number, but matching a brand string against a
    household's own short item list is a different kind of judgment than
    classifying a job category, and might genuinely need its own,
    separately-tuned threshold rather than reusing that one by default.
    A real product decision, not a guess to make here.

---

## Appendix A — Act III, full detail (unchanged from v1)

Reproduced here rather than retyped in §5, since none of it changed in
this revision. Original design: `docs/design/ONBOARDING_EXPERIENCE.md`
v1 (git history) — kept as a live appendix rather than a separate file
so this document stays the single source of truth going forward.

**The mechanism (was §4 in v1).** A soft scrim covers the phone screen
with one rounded cutout (~8px padding) around exactly one real control;
everything else under the scrim is genuinely `inert`, not just dimmed.
A coach card near the cutout (never covering it) holds the benefit-first
copy, a plain-language step counter ("Stap 2 van 6," not dots alone), a
**Terug** link, and an always-visible **Overslaan** link. **There is no
Next button on any of these seven steps** — the only way forward is
pressing the real control. On press: the app genuinely navigates, the
coach card pulses a brief affirming green, one encouragement word
appears and is announced via `aria-live="polite"` (the same live region
`CustomerOnboarding.jsx` already uses).

**III.1 — the composer.** Full text: *"Stel dat je wasmachine morgen
stopt met draaien. Je hoeft geen formulier in te vullen en geen
categorie te kiezen. Typ gewoon wat er gebeurt, of maak er een foto van
— precies zoals je het aan een buurman zou vertellen. Tik hier om het te
proberen."* A footnote makes explicit that nothing submits: *"Nog niets
wordt verstuurd — je oefent gewoon."* The required tap is light-touch and
consequence-free — focusing the field, tapping the camera icon, or
tapping a suggestion chip that pre-fills sample text.

**III.2 — "Mijn woning."** Full text: *"Elke klus die je hier meldt,
elke offerte, elke afgewerkte reparatie — Klussie onthoudt het allemaal,
op één plek. Over een jaar weet je nog precies wanneer de loodgieter is
langsgeweest. Tik op 'Mijn woning' om te zien wat daar straks staat."*
Real tap, real section change; the panel shown is whatever is actually
true for the account — never faked.

**III.3 — "Mijn spullen."** Full text (your own worked example,
verbatim): *"Stel dat je wasmachine morgen echt stopt. In plaats van in
laden te zoeken naar het aankoopbonnetje, de garantie en de handleiding...
heeft Klussie dat al voor je klaarliggen. Tik op 'Mijn spullen' om te
zien waar je dat straks terugvindt."*

**III.4 — add one real item.** New account: *"Heb je iets in de buurt —
een toestel, een gereedschap, wat dan ook? Voeg het nu meteen toe. Een
foto en een naam is genoeg, de rest kun je altijd later aanvullen. Dit
duurt tien seconden."* Fallback, equal weight: **"Ik doe dit later."**
Replay, account already has items: *"Kijk, dit heb je al vastgelegd.
Precies hier vind je het terug, wanneer je maar wilt."* — no action
required beyond a **Verder** tap. Opens the real `ItemFormSheet`; a real
save produces the strongest encouragement word in the whole flow.

**III.5 — "Aanvragen."** Full text: *"Zodra je iets meldt, kun je hier
altijd volgen wat ermee gebeurt — wie erop reageert, met welke offerte,
en wanneer. Niets verdwijnt in een inbox."* Deliberately the shortest
functional step — the panel's own real, honest empty state (already one
of the seven well-written empty states in `UX_PATTERNS.md`) does most of
the remaining work.

**III.6 — "Berichten."** Full text: *"Wanneer een vakman reageert, praat
je rechtstreeks met hem hier — geen telefoonnummers uitwisselen, geen
sms'jes die je kwijtraakt. Alles blijft op één plek."* Shortest step in
the tour, by design — two "nothing real here yet" steps back to back
(III.5, III.6) is where patience is most at risk.

**III.7 — Profile → Help.** Full text: *"Alles wat ik je net getoond
heb, kun je hier altijd opnieuw bekijken — helemaal opnieuw, rustig,
wanneer je maar wilt."* Points at the already-real "Hulp & uitleg"
section and its "Rondleiding opnieuw bekijken" control
(`CustomerProfile.jsx`) — nothing new to build for this step's
destination, only for the way of arriving at it.

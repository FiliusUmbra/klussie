# Klussie — Experience Vision

**This document owns:** the ten-part product experience vision for the
conversational homepage — the design philosophy, information
architecture, user journey, screen flow, wireframes, interaction and
motion concepts, trust framework, photography direction, and component
changes it implies. It does not own the specific concepts that led here
(`HOMEPAGE_CONCEPTS.md`, `HOMEPAGE_DIRECTION.md`) or what happens after a
job is booked (`HOME_OPERATING_SYSTEM.md`).

> Transcribed into the repository from a conversation-only artifact
> (`experience-vision.html`, published 2026-08-06). Ten documents, one
> argument, repeated ten ways: ask less, trust more, feel human. Nothing
> here is implementation — this is what implementation would be built
> from, once approved.

## 1 · Product Experience Vision

Klussie is not a marketplace that happens to use AI. It's a companion
that quietly understands a problem and finds the right person for it. The
difference isn't cosmetic — it changes what the first ten seconds are
allowed to contain.

| What a person actually thinks | Not |
|---|---|
| "My sink's fixed" | "I need a plumber" |
| "My wall looks good again" | "I need to find a painter" |
| "My house is clean before guests arrive" | "I need a cleaning service" |
| "This furniture is finally put together" | "I need an assembly professional" |

> Klussie should feel like telling a trusted friend what's wrong, and
> having them immediately say **"I know exactly who can help."**

**Klussie is:** human, calm, warm · intelligent — but invisible about it
· trustworthy before it's asked to be · premium, effortless.

**Klussie is never:** busy or dashboard-like · technical or corporate ·
marketplace-like · "AI" as a visual gimmick.

**The operating rule for every decision:** between two options, choose
the one that asks less of the user's thinking. Between three, choose the
one that builds more trust. Between five, choose the one that feels most
human. Someone opening Klussie is often dealing with something broken in
their home — design for relief, not delight. Delight follows.

## 2 · Information Architecture

One evolving canvas, not a hierarchy of screens. The old model was a
sequence of destinations (Search → Categories → Cards → Form →
Professionals → Booking — six navigations before a professional is even
shown). The new model is a single surface with six internal states and
zero navigations: **Problem → Understanding → Trust → Professional →
Booking → Relief.**

**The decision, stated plainly:** this canvas replaces today's Discover
tab specifically — it becomes the front door. It does **not** delete
Requests, Messages, or Profile: a returning customer still needs to see a
job in progress, reply to a pro, or manage their account, and pretending
otherwise would be optimizing the first ten seconds at the cost of every
visit after. Those three stay, reached by a quiet bottom nav, unchanged.

## 3 · User Journey

Walked end to end using the same scenario throughout: a kitchen sink
that's been leaking for two days.

| Moment | What happens | Feels like |
|---|---|---|
| Opens the app | A warm, time-aware greeting. Two elevated actions — Speak, Show me — and a quiet text field. Trust signals already visible. | Anxious → **noticed** |
| Describes it | Speaks naturally or shows a photo. No form fields, no category picker. | **Heard** |
| Sees it understood | The canvas grows beneath: "Supply-line leak · Plumbing · Urgent" — their own words, reflected back correctly. | **Reassured** |
| Meets the professional | One match, not a list — a face, a trust line, real recent work, a price. No comparing required. | **Confident** |
| Books | One button. A warm confirmation, not a transactional receipt. | **Relieved** |

## 4 · Screen Flow

Six states, one surface, no page ever changes: **Rest** (greeting, two
elevated actions, trust strip already visible) → **Problem** (speaks,
shows a photo, or types; a recap bubble appears) → **AI Understanding**
(reflects the problem back, structured, confident) → **Trust** (already
ambient throughout; reconfirmed at the moment it matters most) →
**Professional** (one match, a face, real recent work, a price) →
**Booking** (one button, no second-guessing) → **Relief** (a warm
confirmation — the feeling this whole page is built for).

Every state is a change in what's visible on the same canvas, never a
change of page.

## 5 · Wireframes (low fidelity)

Structure before style — deliberately colorless. Three states:

1. **Rest** — greeting, action: speak, action: photo, text field, trust
   strip, empty space beneath.
2. **Mid-unfold** — greeting, recap ("leaking sink…"), AI understanding,
   trust strip, next reveal pending.
3. **Complete** — greeting, recap, AI understanding, pro match + recent
   work, book button, trust strip.

(The polished, on-brand version of this exists as a working prototype —
see `HOMEPAGE_DIRECTION.md`.)

## 6 · Interaction Diagrams

Voice and photo aren't features. They're front doors — each needs its own
sequence, and neither should feel like "opening a tool."

**Voice:** Tap the mic (one action, no menu) → Listening (soft waveform
pulses) → Live transcript (words appear as spoken) → "Got it." (natural
confirmation). No separate "review your transcript" step — understanding
starts while they're still talking.

**Photo:** Tap "Show me" (camera or upload) → Photo appears (full width,
unhidden) → Tag on the photo ("Leak detected · 94%") → "That's enough."
(no follow-up form). The confidence tag lives on the photo itself, not in
a separate results panel — the proof and the evidence stay in the same
place.

## 7 · Motion Concepts

Today's real motion system is thin by design — four transitions, two
press states, confirmed in `docs/design/ANIMATION_GUIDELINES.md`. This
concept asks for meaningfully more, honestly: new real work, not a
re-skin of what exists.

| Moment | Communicates | Moves like |
|---|---|---|
| Listening | "I'm paying attention" | A soft waveform pulse, tied to actual audio input, not decorative looping |
| Understanding | "I heard you correctly" | Text settles in — gentle fade + gather, never a typewriter effect |
| Thinking | "Still working, not stuck" | A slow, warm breathing pulse — never a spinner |
| Matching | "Found the right one" | The professional card arrives with a soft lift, not a slide-in from off-screen |
| Booking | "It's done" | A small confirmation bloom on the button itself, contained, not full-screen |
| Relief | "You can stop worrying now" | Everything else quiets — trust strip and confirmation are the only things still visible |

## 8 · Trust Framework

Trust is the product, not a badge on it. Every signal is visible before
the user has said anything — never unlocked after AI processing, never
behind a second screen.

| Signal | Real data it draws from today | Status |
|---|---|---|
| Verified professionals | `is_certified`, badge tiers on `pro_profiles` | Real |
| High satisfaction | Computed trust score (rating + certification + badge), real reviews | Real |
| Real people, real work | Portfolio photos + testimonials, already shipped | Real |
| Transparent pricing | Quote price shown plain, no hidden fee reveal | Real |
| Insured work | No real insurance-verification data exists yet | **Not yet real** — needs its own workstream |
| Fast response | No tracked response-time metric confirmed yet | Needs verification before it's claimed on screen |

Two of six signals aren't backed by real data yet. The framework doesn't
get to claim them on screen until they are — see **Rule 9, Trust beats
growth** in `PRODUCT_CONSTITUTION.md`: a trust signal with no evidence
behind it is exactly the shortcut that rule exists to block.

## 9 · Photography Direction

Photography earns trust or it isn't doing its job.

**Use:** warm homes, natural light · real professionals, mid-task · real
families, real moments · imperfection over polish.

**Never:** generic stock photography · anything that reads as
AI-generated · staged corporate smiling · studio-lit perfection.

**Honest status:** zero photography assets exist anywhere in this
codebase today — confirmed in `docs/design/ILLUSTRATION_GUIDELINES.md`.
This section is direction for a real sourcing effort, not an inventory.
Every mockup produced in this exploration uses warm placeholder toning,
clearly labeled as such, standing in for what real photography should
feel like.

## 10 · Component Changes

The bridge to implementation — grounded in
`docs/design/COMPONENT_LIBRARY.md`'s real 15-component catalog, not
invented in the abstract.

| Component | Status | Notes |
|---|---|---|
| `VoiceCapture` | **New** | Waveform + live transcript. No equivalent exists — today's voice input is inline browser Web Speech API usage inside one sheet, not a reusable component. |
| `PhotoCapture` | **New** | Capture/upload + on-photo confidence tags. Closest precedent is plain photo upload in the job-details form — not yet a formal component. |
| `TrustStrip` | **New** | The persistent ambient trust bar. No precedent anywhere in the app. |
| `UnfoldPanel` | **New** | The reveal mechanic itself — staged, sequential entrance. Needs its own primitive rather than one-off transitions per screen. |
| `AIMessage` | Extend | Already real, already the right shape for the Understanding panel — no change needed to the component, only to where it's used. |
| `JobCard` / `QuoteCard` / `TrustBadge` | Extend | The professional-match card needs a portrait + recent-work photo slot none of these currently have. |
| Discover's category grid | Retired as entry point | The matching logic underneath stays real and needed — it just stops being the first thing anyone sees. |

---

Version 1.0 — 2026-08-06 (transcribed into the repository from the
conversation-only artifact)

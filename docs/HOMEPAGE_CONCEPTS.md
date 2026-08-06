# Klussie — Three Homepage Concepts

**This document owns:** the three original conversational-homepage
concepts explored before a direction was chosen. It does not own the
chosen direction itself (`HOMEPAGE_DIRECTION.md`) or the fuller
experience spec built afterward (`EXPERIENCE_VISION.md`).

> Transcribed into the repository from a conversation-only artifact
> (`homepage-concepts.html`, published 2026-08-06). No code was written
> or changed as part of this exploration.

## The brief

How would Apple, Airbnb, and OpenAI each design Klussie's homepage? Same
forest/sage/amber palette, same Fraunces and Inter — the palette and
warmth were never in question. The information architecture was. All
three concepts below open on the same flow: describe the problem, watch
it get understood, feel the trust, meet the pro, book. None of them open
on a grid.

**Explicit constraints:** no categories first, no search bar first, no
service cards first, existing palette + type kept exactly, existing IA
discarded.

## Concept A — The Concierge Chat

*Most OpenAI · Zero chrome · One continuous surface*

There is no home screen behind the conversation — the conversation *is*
the home screen. Klussie opens already mid-relationship: a warm line
waiting for you, a composer that's always there. The whole job —
understanding, trust, the pro, the booking — happens as one continuous
thread you scroll through, the way you'd scroll a message from a friend
who's already on it.

**On open:** a single greeting bubble — *"Good afternoon. What's going on
at home?"* — and a composer with mic and photo icons.

**Mid-conversation:** the customer's message appears, followed by an AI
bubble reflecting the understood problem ("Sounds like a supply-line leak.
Filed under Plumbing, marked urgent."), then an inline pro card (name,
rating, verified badge, price) and a book button — all inside the same
scrolling thread.

## Concept B — The Single Question

*Most Apple · Radical restraint · Progressive reveal*

Apple's confidence lives in what it leaves out. One question, centered,
alone — no nav, no suggestions, nothing competing for the eye. Answer it,
and the same page calmly grows underneath your answer: understanding,
then trust, then the one right professional, then a single button. Never
a new screen. One canvas, unfolding.

**On open:** the screen shows only *"What's going on?"* centered, with a
composer beneath it.

**After answering:** the same page, now showing the original question
(smaller), a caption of what was said, an AI-understanding panel
("Supply-line leak · Plumbing · Urgent"), a pro card, and a "Confirm
booking" button.

## Concept C — The Trusted Companion

*Most Airbnb · Ambient trust · Warmth as structure*

Airbnb never makes trust a step — it's the air the whole page breathes.
Here the invitation to talk sits inside something warm, not stark: soft
edges, a quiet human voice, gentle proof (verified, insured, loved)
sitting right there before you've said a word, not unlocked afterward.
The reveal, when it comes, reads less like a result and more like a
recommendation from someone who already gets it.

**On open:** a time-aware greeting ("Good afternoon. Welcome back,
Cathy."), an invitation module ("Tell me what's going on — I'll take it
from there.") with a composer inside it, a reassuring quote ("Real
people. Real fixes."), and a persistent trust strip (Verified pros ·
Insured work · 4.9★ average).

**After describing it:** the greeting updates to reflect what was said,
the module now shows the matched pro with a real quote-style testimonial
and a price, and the trust strip stays exactly where it was.

## Side by side

| Concept | What's on screen at rest | Where trust lives | The risk |
|---|---|---|---|
| **A — Concierge Chat** | One greeting bubble, one composer. Nothing else ever, on any visit. | Earned in-conversation, per request — never ambient. | A returning user with a done job has nothing to look at but an empty thread. |
| **B — Single Question** | One headline, one input. The most silence of the three. | Shown once, briefly, exactly when it's earned — then the flow moves on. | Can read as cold if the warmth doesn't survive the minimalism. |
| **C — Trusted Companion** | A greeting, an invitation module, a quiet trust strip — always visible. | Present before you've typed a word, and still there after. | The most surface area — furthest from "radically simple." |

## Outcome

Three real arguments, not three skins on one idea. The chosen direction —
built as Concept C's foundation simplified with Concept B's restraint —
is documented in [`HOMEPAGE_DIRECTION.md`](HOMEPAGE_DIRECTION.md).

---

Version 1.0 — 2026-08-06 (transcribed into the repository from the
conversation-only artifact)

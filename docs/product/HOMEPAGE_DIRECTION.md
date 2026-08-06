# Klussie — The Chosen Homepage Direction

**This document owns:** the chosen homepage direction — Concept C's
foundation, simplified with Concept B's restraint — as approved after
`HOMEPAGE_CONCEPTS.md`'s three-way exploration. It does not own the fuller
10-part experience spec built on top of it (`EXPERIENCE_VISION.md`).

> Transcribed into the repository from a conversation-only artifact
> (`homepage-final-concept.html`, published 2026-08-06). This is a
> prototype/direction document, not shipped code — implementation is
> tracked separately once explicitly greenlit.

## The brief

*"Build Concept C as the foundation, but simplify it with the restraint
of Concept B. Specifically: keep the warm greeting and persistent trust
strip from C. Keep the single conversational entry point from B. Let the
page unfold in place after the user speaks, instead of navigating through
multiple screens. Add real photography of homes and professionals, not
just icons and placeholders. Make voice and photo input first-class
actions alongside typing — they're part of what makes Klussie different."*

## Synthesis

- **Kept from C:** the greeting + the persistent ambient trust strip.
- **Kept from B:** one entry point, the page unfolds in place — no screen
  ever changes.
- **New:** voice and photo elevated to first-class, equal-weight actions
  — not icons buried in a composer.
- **New:** real photography direction, not icons and placeholders (see
  the honesty note below — this is *direction*, not sourced assets).

## The flow

**Rest state:** a time-aware greeting ("Good afternoon. Welcome back,
Cathy."), two elevated action tiles — **"Just talk to me"** (speak
naturally) and **"Show me"** (a quick photo) — with a quieter text row
beneath them for typing, and the trust strip (Verified pros · Insured
work · 4.9★ average) always visible underneath.

**On any of the three inputs firing**, the same screen unfolds in place,
in sequence:

1. A recap bubble echoing what was said/shown/typed.
2. An AI-understanding panel ("Supply-line leak · Plumbing · Urgent").
3. A pro-match card — portrait, name, trust line, price, and a
   "Recent work" strip of photos.
4. A single book button ("Book Peter — arrives today").

Nothing navigates to a new page at any point in this sequence.

## Design notes (verbatim reasoning from the prototype)

**Why two actions, not three tiles.** Speak and Photo are equal-weight,
elevated — genuinely first-class, not icons buried in a composer. Typing
stays available but visually quieter underneath, since it was never the
differentiator; voice and photo are.

**Why the trust strip never moves.** It's present before a word is typed
and still there after booking — trust isn't a stage in the flow here,
it's the ground the whole flow stands on, which is the actual argument
Concept C was making.

**About the photography.** What the prototype shows are warm placeholder
tones (layered gradients built only from Klussie's real palette), not
real photos — Klussie has no photography asset library yet (confirmed:
zero photography assets exist anywhere in the codebase — see
`docs/design/ILLUSTRATION_GUIDELINES.md`). The mockup shows *where and
how* photography should sit — a professional's portrait, real
recent-work shots — real sourcing is separate work before this ships.

## One thing not yet decided

What happens on a repeat visit, with a job already in progress — does the
greeting change, does the trust strip make room for "Your painter
arrives in 2 hours" instead? Worth deciding before implementation, not
assumed here.

---

Version 1.0 — 2026-08-06 (transcribed into the repository from the
conversation-only artifact)

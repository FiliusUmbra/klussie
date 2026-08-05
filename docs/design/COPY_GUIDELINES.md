# Copy Guidelines

**This document owns:** how Klussie talks — the Brand Personality
(`DESIGN_SYSTEM.md`) extended into actual words. It does not own where
copy lives structurally (`UX_PATTERNS.md`) or which strings exist for
which locale (that's `src/App.jsx`'s `STRINGS` object — this document
describes the pattern, `STRINGS` is the source of truth for the values).

Every example below is a real string from `STRINGS`, not invented for
this document. Ownership note, stated plainly: content voice is a
different skill from visual design and will likely want its own owner as
the team grows — for now it's the same "Unassigned" as everything else in
`MASTER_CONTEXT.md` §4.

---

## Voice & tone

Warm, direct, and — this is the real, distinctive pattern worth
protecting — **honest about what's simulated.** Three real examples:

- *"Demo only — not tax advice."* (the flexi-job tracker)
- *"Demo document only — not a legally valid invoice."* (the invoice view)
- *"Shared by the pro — not verified by klussie."* (testimonials, next to
  real, verified reviews)

This isn't boilerplate legal disclaimer language — it's the copy actively
practicing `DESIGN_SYSTEM.md`'s "Trust Through Transparency" principle by
telling the user exactly what they're looking at. Any future copy that
touches a not-yet-real feature (and there are several — payments,
verification) should follow this exact model rather than pretending, or
staying silent.

## Writing principles

- **Active voice, specific verb + object** — not a general rule stated in
  the abstract, this is what's actually in `STRINGS`: "Send request to
  pros," "Mark job as complete," "Boost your profile." Never a bare
  "Submit" or "Confirm."
- **Set expectations, don't just acknowledge action** — *"Pros are
  reviewing your request. Quotes usually arrive within a few minutes."*
  tells the customer what happens next and roughly when, not just "Request
  sent."
- **Real examples over generic placeholders** — the AI composer's
  placeholder text isn't "Describe your issue," it's *"E.g. my kitchen
  sink has been leaking for two days and the cabinet underneath is
  getting wet..."* — a real, specific scenario that shows rather than
  tells what kind of detail helps.

## Button / CTA conventions

The real pattern, confirmed across every button in `STRINGS`: **verb +
object**, describing exactly what happens, never the generic default.

| Generic (not used) | Real Klussie copy |
|---|---|
| "Submit" | "Send request to pros" |
| "Confirm" | "Accept this quote" |
| "Done" | "Mark job as complete" |
| "Save" | "Save changes" / "Save services" |
| "Delete" (bare) | "Delete photo" (label on the button; the confirm dialog itself is generic — see Confirmation, `UX_PATTERNS.md`) |

## Error & empty-state copy

**The principle:** an error explains what went wrong and how to fix it —
no apologies, no vagueness.

**The reality, checked against the principle:** `aiGenericError`,
*"Something went wrong. Please try again,"* is the only error string that
exists anywhere in the app, and it violates its own principle — it says
neither what went wrong nor how to actually fix it beyond "try again."
This is the clearest, most concrete finding in this whole document:
there's exactly one error message in the entire product, and it's the
generic default this section explicitly argues against. Flagged for real
follow-up work (`MASTER_CONTEXT.md` Technical Debt), not fixed by writing
better copy in this document alone — the missing error states need to be
built before they can be written well.

**Empty states**, by contrast, are mostly a real model to follow — six of
seven tell the user what to do next (see the table in `UX_PATTERNS.md`).
The exception, `nothingHereYet` ("Nothing here yet"), is reused across
three different contexts that could each say something specific — a good
small copy task for whoever picks this up next.

## AI-content labeling

Consistent pattern, two real surfaces: a visible "AI analysis" label with
a confidence percentage (job intake), and an unlabeled but clearly
optional toggle (message translation) — see `UX_PATTERNS.md`'s AI
interaction patterns for the full comparison. The rule in one line:
**AI-sourced content is always distinguishable, never dramatized.**

## Terminology glossary

The two terms for what's structurally the same underlying record
(`service_requests`) depending on whose side of the transaction is
looking at it — a deliberate split, not an inconsistency:

| Term (EN / NL) | Used when | Example |
|---|---|---|
| **Request** / **Aanvraag** | Customer-facing, before or during quote collection | "My Requests" / "Mijn aanvragen" |
| **Job** / **Klus** | Pro-facing, once work is happening or done | "My Jobs" / "Mijn klussen", "Mark job as complete" |
| **Quote** / **Offerte** | A pro's priced response to a request | "Send a quote" / "Stuur een offerte" |

**Flagged inconsistency, not silently fixed:** one string,
`flexiHiddenNote`, breaks this pattern in Dutch — it uses **"Opdrachten"**
("assignments") where every other pro-facing string uses "klussen":
*"Opdrachten enkel voor erkende specialisten zijn verborgen..."* The
English equivalent correctly uses "jobs." A one-word fix
(`Opdrachten` → `Klussen`) once someone's editing that locale block —
not changed here since this document's job is to describe the real
pattern and flag where reality departs from it, not to silently patch
`STRINGS`.

## Localization notes

8 locales exist in `STRINGS` (`nl`, `fr`, `de`, `en`, `ar`, `tr`, `ru`,
`zh`) — `nl` is first and functions as the primary/reference locale.
`ar` and `zh` get a font override (`--font-body`/`--font-display`
redefined per locale, see `DESIGN_TOKENS.md`'s locale-override pattern),
since Fraunces and Inter don't cover Arabic or Chinese script.

**Not verified in this pass:** whether `ar` (a right-to-left language)
gets real `dir="rtl"` document/layout handling anywhere, or whether the
UI just renders left-to-right with Arabic text inside it. That's an
`ACCESSIBILITY.md` / `RESPONSIVE_SYSTEM.md` question (Phase 6), flagged
here because it surfaced while reading the locale list, not resolved.

---

Version 1.0 — 2026-08-05

# UX Patterns

**This document owns:** interaction patterns above the single-component
level — real flows composed from `COMPONENT_LIBRARY.md`'s components, plus
the words inside them (`COPY_GUIDELINES.md`). It does not own component
APIs or page-level composition (`LAYOUT_SYSTEM.md`).

Every pattern below is traced from real code — `src/App.jsx` and its
`STRINGS` copy — not proposed from scratch. Where no real pattern exists
yet for something the roadmap will need, that's stated as a placeholder,
not invented here.

---

## Onboarding

**The core task is never gated behind a tutorial — that part hasn't
changed.** A new customer's first real interaction *is* the AI intake
flow below, reachable with one tap from the very first screen, always —
"AI before forms" (Product Constitution, Rule 1) means onboarding is
never allowed to stand in front of the core task. The only pre-task
screen is sign-in/sign-up (`AuthScreen`) — see Authentication, below.

**What has changed: the flat statement that no walkthrough exists at
all.** `CustomerOnboarding.jsx` — a four-slide, read-and-click-Next modal
— already existed before this note was last true, and a full redesign is
now **Planned**: see
[`GUIDANCE_SYSTEM.md`](./GUIDANCE_SYSTEM.md) for the complete design.
It's not scoped as "onboarding" at all any more — it's a permanent
guidance capability (Part A), of which the redesigned first-login tour
(Part B) is only the densest, most front-loaded instance. Part B's own
§0 explains why none of this actually conflicts with Rule 1 — the rule
is about forms, not wayfinding, and nothing in the design asks for
anything the AI could have asked for instead. Until built,
`CustomerOnboarding.jsx`'s current four-slide modal remains the real,
shipped behaviour described below.

For a pro, "onboarding" is `BecomeProSheet`: pro type, business name/VAT
if applicable, a short bio, then straight into the real dashboard — no
separate tour there either. Out of scope for the redesign above; see that
document's §11.3.

---

## The AI intake pattern

The product's signature flow, and the one every other AI-surfaced pattern
below should match in shape:

1. **Composer** — voice, text, or photo, freely mixed (`AiIntakeSheet`).
   Placeholder copy gives a real example (`aiComposerPlaceholder`) rather
   than a generic "type here."
2. **Analyzing** — a loading state (`aiAnalyzing` + the `.spin` /
   `@keyframes ai-spin` animation) — the only loading-state pattern that
   exists anywhere in the app today. Everything else that fetches data
   has no documented loading treatment (see Empty/Loading/Error states).
3. **Follow-up** (optional, skippable — `aiSkipFollowUp`) — asked only
   when the AI genuinely needs more to proceed, per Progressive
   Disclosure (`DESIGN_SYSTEM.md`).
4. **Review** — the structured result, rendered through `AIMessage`
   (amber tint, `Sparkles` icon, `aiConfidenceLabel` as a percentage) so
   it's never mistaken for something a human wrote.
5. **Submit** — becomes a real request.

**Failure mode:** one shared string, `aiGenericError`: "Something went
wrong. Please try again." — see Copy Guidelines' Error copy section for
why this is flagged, not held up as the model.

---

## Empty, loading, and error states

**Empty states** — seven real ones exist, and six of seven tell the user
what to do next rather than just stating absence:

| Context | Copy | Actionable? |
|---|---|---|
| No requests (customer) | "No requests yet. Head to Discover to ask for a quote." | Yes |
| No leads (pro) | "No new leads right now. Try requesting a service as a customer to see one appear here." | Yes |
| No reviews | "No reviews yet." | No |
| No messages | "Conversations with pros will show up here once you accept a quote." | Yes |
| No portfolio photos | "No photos yet." | No |
| No testimonials | "No testimonials yet." | No |
| Nothing in a `ProJobs` tab | "Nothing here yet." | No — flagged below |

The three bare "No X yet" cases are acceptable — there's no useful next
action to suggest for reviews, photos, or testimonials the user hasn't
created. `nothingHereYet` is the odd one out: it's the *only* empty state
in the app with zero specificity about what's empty, used across three
different tabs (`Verstuurd`/`Geboekt`/`Klaar`) that could each say
something real. Flagged for a copy pass, not fixed here — see
`COPY_GUIDELINES.md`.

**Loading states:** exactly one exists (`aiAnalyzing`, above). Every other
async operation in the app — signing in, fetching requests, sending a
quote, uploading a photo — has no documented loading treatment. Not
necessarily broken (buttons likely just do nothing visible for a moment),
but there's no pattern to point to. Flagged as a real gap for this
document's next revision, not invented here.

**Error states:** `aiGenericError`, "Something went wrong. Please try
again," is the **only** user-facing error string anywhere in `STRINGS`.
Every other failure path (a failed sign-in, a failed quote submission, a
failed photo upload) either surfaces a raw Supabase error message
un-styled and un-translated, or fails silently. This is the single most
important gap this document found — see `COPY_GUIDELINES.md`'s Error copy
section for the principle it violates, and `MASTER_CONTEXT.md`'s
Technical Debt for where this should get tracked as real work, not just a
documentation note.

---

## Confirmation and destructive actions

Two real usages, both identical in shape: `Modal` with a title, the shared
`confirmDeleteMsg` ("Are you sure? This can't be undone."), a secondary
Cancel button, and a primary destructive button.

- Deleting a portfolio photo
- Deleting a testimonial

Both share the exact same message rather than naming what's being deleted
("Delete this photo?" vs. "Delete this testimonial?"). Acceptable at two
call sites; worth revisiting if a third destructive action is added
before this gets more specific.

---

## AI interaction patterns

Two real AI surfaces in the product, both following the same visual and
copy contract — never disguised as a human, always visibly attributed,
never dramatized:

1. **Job analysis** (`AIMessage`, `aiAnalysisLabel`, confidence
   percentage) — described above.
2. **Message translation** (`viewOriginalBtn` / `viewTranslationBtn`) — a
   toggle inside a chat bubble, not a separate AI-branded surface. Quieter
   than intake analysis, matching `DESIGN_SYSTEM.md`'s "AI should feel
   invisible" — translation doesn't announce itself with a label or icon
   the way analysis does, it just offers to show the other version.

Both honor the same rule: AI content is functionally distinct (you can
always tell what's AI-sourced) without being visually loud about it.

---

## Authentication

**Placeholder.** The real authentication pattern will be defined by the
separate Authentication UX Redesign initiative, not here — writing it now
would front-run that plan. What exists today (`AuthScreen`: email/password
sign-in and sign-up, a single un-styled Supabase-error passthrough on
failure) is the baseline that redesign replaces, not a pattern worth
documenting as a model.

---

## Forms

The real form in the app worth modeling is `QuoteFormSheet`'s job-details
step: fields are dynamic per service (`SERVICE_QUESTIONS`), not one giant
static form — a plumbing request asks about leak type, a painting request
asks about room count and ceiling inclusion. This is "ask for the
minimum" (`DESIGN_SYSTEM.md`'s Form Philosophy) actually working: the AI
intake path reduces what reaches a form at all, and the form that remains
only asks what's relevant to *that* service.

Related fields are grouped visually (`.job-details-summary`) once
submitted, shown back to both customer and pro as a compact summary
rather than a wall of labeled values.

---

Version 1.0 — 2026-08-05

# Epic 03 — Conversation Experience: Engineering Execution Plan

**This document owns:** the work-package breakdown that converts the
already-approved conversational experience into buildable engineering
work — scope, dependencies, files, acceptance criteria, complexity, and
risks per package. It does not own the experience design itself (that's
`../product/HOMEPAGE_DIRECTION.md` and `../product/EXPERIENCE_VISION.md`,
both approved and **not** revisited here) or epic-level sequencing
(`../EXECUTION_ROADMAP.md`).

> **Naming note:** this is Epic 03 in `../EXECUTION_ROADMAP.md`'s fixed
> numbering ("Conversational Homepage Implementation"). It's being
> executed ahead of Epic 02 (Operational Resilience) by deliberate
> resequencing — the dependency graph already allowed it. Referred to
> conversationally as "the conversation experience epic"; Epic 02's own
> identity is unchanged.

## Ground rules for this epic

**Approved source documents — the only ones this plan derives from,
per instruction:** `../product/HOMEPAGE_DIRECTION.md`,
`../product/EXPERIENCE_VISION.md`, `../design/DESIGN_SYSTEM.md`,
`../design/DESIGN_TOKENS.md`, `../design/UX_PATTERNS.md`,
`../product/PRODUCT_CONSTITUTION.md`.

No design decision in those documents is reopened here. Where this plan
identifies something genuinely *undecided* by them, it's raised as an
open question below rather than resolved unilaterally — that's the
difference between converting an approved design into engineering work
and quietly redesigning it.

**Honest scoping caveat:** `ACCESSIBILITY.md`, `RESPONSIVE_SYSTEM.md`,
`COPY_GUIDELINES.md`, `ANIMATION_GUIDELINES.md`, and
`COMPONENT_LIBRARY.md` all exist and carry relevant detail, but are
outside the approved list for this epic. WP11 (Accessibility) and WP10
(Mobile polish) are therefore scoped against
`PRODUCT_CONSTITUTION.md` Rule 6 and `DESIGN_TOKENS.md` only. If you
want the fuller bar those documents set, add them to the approved list
before starting those two packages.

## Decisions needed before or during implementation

Three things the approved documents genuinely do not settle. Each is
flagged at its work package too; collected here so they don't get lost.

1. **Where Discover's category-browse UI goes (WP1).**
   `EXPERIENCE_VISION.md` §10 retires the category grid *as the entry
   point* and says "the matching logic underneath stays real and
   needed." It doesn't say where the browse UI itself lives afterward —
   a second-level screen, a Profile-tab affordance, or removed from the
   customer app entirely. Blocks WP1's final shape.
2. ~~**Trust strip copy vs. real data (WP7).**~~ **RESOLVED
   2026-08-06 — [`../adr/0011-trust-strip-shows-only-verified-signals.md`](../adr/0011-trust-strip-shows-only-verified-signals.md).**
   Ship only signals backed by real data; "Insured work" does not ship
   until insurance verification exists (Epic 06). WP7 unblocked, with
   one sub-question left for that package: the minimum review count
   below which a rating aggregate is withheld rather than shown.
3. **What "Book Peter" actually does to the data model (WP9).**
   The approved flow is one button, no second-guessing. Today's schema
   reaches `status = 'booked'` only via a `quotes` row transitioning
   `sent → accepted` (`handle_quote_accepted()`). Whether booking from
   the canvas creates request + quote + acceptance in one action, or
   routes into the existing quote flow, is a real backend decision the
   design documents don't make. Blocks WP9.

## Dependency sequence

```
WP1 Homepage shell
 ├─→ WP2 Composer ─┐
 ├─→ WP3 Voice ────┼─→ WP5 AI understanding ─→ WP6 Progressive reveal
 ├─→ WP4 Photo ────┘                                    │
 └─→ WP7 Trust strip (independent of WP2–WP6)           ↓
                                          WP8 Professional card
                                                        ↓
                                          WP9 Booking transition
                                                        ↓
                        WP10 Mobile polish · WP11 Accessibility · WP12 Testing
```

WP11 is listed last per the requested breakdown but should be built
*into* each package as it lands, not bolted on at the end — the package
below is the verification pass, not the first time accessibility is
considered.

---

## WP1 — Homepage shell

**Scope.** Replace `Discover` as the `tab === "discover"` view inside
`CustomerApp` with the conversational canvas root — one component
holding the six states from `EXPERIENCE_VISION.md` §4 as internal
state, never navigation. This package delivers the **Rest state only**:
time-aware greeting, two elevated action tiles (Speak / Show me), the
quiet text row beneath, trust strip below that. Per §2's IA decision,
Requests/Messages/Profile and `BottomNav` are untouched.

**Dependencies.** None inside this epic (it's the root). Epic 01's
groundwork is already frozen and stable.

**Files affected.** `src/App.jsx` — new screen-level component
(convention: screen components live here alongside `Discover`,
`CustomerApp`), the `tab === "discover"` branch at ~line 1550, new
`STRINGS` keys across all 8 locales, new CSS in the existing `<style>`
block.

**Acceptance criteria.**
- The Rest state matches `HOMEPAGE_DIRECTION.md`'s described layout and
  order exactly: greeting → two equal-weight action tiles → quieter
  text row → trust strip.
- No category grid renders as the first customer-facing view.
- `BottomNav`, Requests, Messages, Profile behave exactly as before.
- Spacing uses `--space-*` tokens (`DESIGN_TOKENS.md`) rather than new
  ad hoc pixel values — new code has no reason to repeat the untokenized
  pattern that document already flags.
- `npm run build` and `npm run lint` clean.

**Complexity.** M

**Risks.** Open question 1 (where category browse goes) — until
answered, this package can land the new canvas but shouldn't delete
`Discover`'s existing code. Recommended: keep `Discover` intact and
unreferenced from the tab until that call is made, rather than deleting
work that has no agreed new home.

---

## WP2 — Conversation composer

**Scope.** The quiet text-entry row beneath the two action tiles — the
third input mode, deliberately less prominent per
`HOMEPAGE_DIRECTION.md` ("typing … was never the differentiator").
Submitting text starts the same unfold sequence voice and photo do.

**Dependencies.** WP1.

**Files affected.** New Design System component
(`src/design-system/domain.jsx` or a new file, exported via
`src/design-system/index.js`); `src/App.jsx` wiring; `STRINGS` keys ×8
locales.

**Acceptance criteria.**
- Submitting typed text calls `analyzeJobRequest` (`src/lib/aiIntake.js`)
  — the existing intake plumbing, not a new path.
- Produces the same downstream state as voice and photo input.
- Empty submissions are prevented without an error-state dead end
  (`UX_PATTERNS.md` flags the app's error-copy gap; don't add to it).

**Complexity.** S

**Risks.** Low. The main one is scope creep into WP5's territory —
this package ends at "input captured and dispatched," not at rendering
the analysis.

---

## WP3 — Voice interaction

**Scope.** The `VoiceCapture` component named in `EXPERIENCE_VISION.md`
§10, implementing §6's sequence: tap mic → listening (soft waveform
pulse) → live transcript appearing as spoken → gentle confirmation. No
separate "review your transcript" step.

**Dependencies.** WP1.

**Files affected.** New component in `src/design-system/`; reuses
`isSpeechRecognitionSupported` and `startSpeechRecognition` from
`src/lib/aiIntake.js` (already real, already used by `AiIntakeSheet` —
reuse, don't rebuild); `STRINGS` keys ×8 locales (the existing
`aiSpeechUnsupported` string already covers the fallback copy).

**Acceptance criteria.**
- Matches `EXPERIENCE_VISION.md` Fig. 4's four-step sequence.
- Waveform is tied to actual audio input, not a decorative loop
  (§7 Motion Concepts states this explicitly).
- Unsupported browsers degrade to the existing fallback rather than a
  dead mic button.
- Motion uses `--motion-fast` / `--motion-base` (`DESIGN_TOKENS.md`) —
  no new duration values invented.

**Complexity.** M

**Risks.** Browser Web Speech API inconsistency is a known, already
tracked platform limitation (`MASTER_CONTEXT.md` §12) — this package
surfaces the existing fallback, it does not fix the underlying gap.
Verify during implementation whether `startSpeechRecognition`'s callback
already emits interim results; live transcript needs that, and if it
doesn't, extending it is in scope here.

---

## WP4 — Photo interaction

**Scope.** The `PhotoCapture` component (§10), implementing §6 Fig. 5:
tap "Show me" → camera or upload → photo appears full width, unhidden →
AI confidence tag rendered *on the photo itself* → confirmation. No
follow-up form.

**Dependencies.** WP1.

**Files affected.** New component in `src/design-system/`; reuses the
existing photo → base64 → `analyzeJobRequest` path from `AiIntakeSheet`
and `src/lib/aiIntake.js`; `STRINGS` keys ×8 locales.

**Acceptance criteria.**
- Confidence tag sits on the photo, not in a separate results panel
  (Fig. 5's stated reason: proof and evidence stay in the same place).
- Respects the existing server-side 4-photo cap (`api/ai-intake.js`'s
  `MAX_PHOTOS`) rather than introducing a second, different limit.
- Reuses existing client-side downsizing rather than re-implementing it.

**Complexity.** M

**Risks.** The on-photo tag is the one visual element with no precedent
in `COMPONENT_LIBRARY.md`'s existing catalog — expect design judgment
on placement/contrast over a photo, which is exactly where WP11's
contrast requirement bites hardest.

---

## WP5 — AI understanding cards

**Scope.** The Understanding state: the structured analysis reflected
back ("Supply-line leak · Plumbing · Urgent"), rendered through the
**existing** `AIMessage` component — §10 is explicit that no component
change is needed, "only … where it's used."

**Dependencies.** WP2, WP3, WP4 (needs a captured input to analyze).

**Files affected.** `src/App.jsx` wiring only. `AIMessage` in
`src/design-system/domain.jsx` should not need modification — if it
does, that's a finding worth recording, not a silent edit.

**Acceptance criteria.**
- Renders the real `analyzeJobRequest` result, not a mock.
- Keeps `UX_PATTERNS.md`'s AI contract: visibly attributed, amber tint,
  confidence percentage, never disguised as human-written.
- Low-confidence results surface the existing follow-up question
  pattern rather than presenting a guess as certain
  (`UX_PATTERNS.md`'s intake pattern, step 3).

**Complexity.** S

**Risks.** Low. Watch that follow-up questions don't reintroduce a
form-shaped detour that contradicts the one-canvas flow.

---

## WP6 — Progressive reveal

**Scope.** The `UnfoldPanel` primitive (§10) — the staged, sequential
entrance mechanic driving recap → understanding → professional → book.
`EXPERIENCE_VISION.md` calls for "its own primitive rather than one-off
transitions per screen."

**Dependencies.** WP1 (mounts inside the shell); consumed by WP5, WP8,
WP9.

**Files affected.** New component in `src/design-system/`, exported via
`index.js`; CSS in `src/App.jsx`'s style block.

**Acceptance criteria.**
- Reveals in sequence, not all at once, matching
  `HOMEPAGE_DIRECTION.md`'s prototype behavior.
- Motion tokens only (`--motion-base`, `--motion-fast`).
- `prefers-reduced-motion: reduce` disables the staging — the approved
  prototype already includes this rule; it ships with the component,
  not as a later fix.
- Reusable by any of the three input paths without per-caller special
  cases.

**Complexity.** M

**Risks.** Highest API-design judgment of the twelve — the prop shape
(children array? explicit stages? timing control?) isn't specified by
any approved document, and getting it wrong means every consumer
(WP5, WP8, WP9) inherits the awkwardness. Worth designing this one
against all three consumers before building it.

---

## WP7 — Trust strip

**Scope.** The `TrustStrip` component (§10) — the persistent ambient
trust bar, present before any input and still present after booking.
`HOMEPAGE_DIRECTION.md`: "trust isn't a stage in the flow here, it's the
ground the whole flow stands on."

**Dependencies.** WP1 only — independent of WP2–WP6, so it can be built
in parallel.

**Files affected.** New component in `src/design-system/`; `STRINGS`
keys ×8 locales.

**Acceptance criteria.**
- Renders identically in Rest and post-booking states, in the same
  position — it must not move as the canvas unfolds.
- **Only displays trust signals backed by real data**, per
  [`../adr/0011-trust-strip-shows-only-verified-signals.md`](../adr/0011-trust-strip-shows-only-verified-signals.md).
  Verified-pro status (`pro_stats.is_certified`, badge tiers) and the
  computed trust score / real review ratings are real; insurance
  verification is not and does not ship here.
- Rating shown is a real aggregate from `pro_stats`, never a hardcoded
  "4.9★."
- A minimum review count is chosen below which the rating signal is
  withheld rather than displayed — a technically-real average computed
  from three reviews still misleads. Decide the threshold in this
  package and record it; don't leave it implicit.

**Complexity.** S

**Risks.** Low now that ADR-0011 settles the conflict. The one live
risk is the threshold above: set it too high and the strip is nearly
empty on a young marketplace; set it too low and the strip technically
complies with Rule 9 while still overstating. Neither extreme is a
code problem — it's a judgment call worth stating out loud when WP7
ships.

---

## WP8 — Professional recommendation card

**Scope.** The pro-match card inside the unfold: portrait, name, trust
line, price, and a "Recent work" photo strip. §10 marks
`JobCard`/`QuoteCard`/`TrustBadge` as **Extend** — "the
professional-match card needs a portrait + recent-work photo slot none
of these currently have." One match, not a list (§3).

**Dependencies.** WP6 (mounts inside `UnfoldPanel`); WP5 (needs the
analysis to match against).

**Files affected.** `src/design-system/domain.jsx` (extend existing
components — do not fork new near-duplicates); reuses
`src/lib/portfolio.js` for recent-work photos and `src/lib/pros.js` for
trust data; matching via the existing `pro_matches_request()` path.

**Acceptance criteria.**
- Shows a real matched professional with real portfolio photos and a
  real computed trust score — no placeholder pro.
- Exactly one professional presented, per §3's "no comparing required."
- Photography slots degrade gracefully when a pro has no portfolio
  photos yet (a real, common case today).

**Complexity.** M

**Risks.** `pro_matches_request()` returns candidates, not a single
answer — choosing *which* one to present is real selection logic that
doesn't exist yet. Keep it simple and legible (e.g. highest trust score
among matches) and put it in `src/lib`, not in the component
(`PRODUCT_CONSTITUTION.md`: no business logic in UI). Genuine ranking
work belongs to Epic 09, not here.

---

## WP9 — Booking transition

**Scope.** The Booking and Relief states: one button ("Book Peter —
arrives today"), then a warm confirmation rather than a transactional
receipt (§3, §4).

**Dependencies.** WP8 (needs a selected professional); open question 3
must be answered before this can be built.

**Files affected.** `src/App.jsx` (booking handler in `CustomerApp`),
likely `src/lib/requests.js` (a combined create-and-book helper, if
that's the route chosen); no schema change is expected, but that
depends on the answer to open question 3.

**Acceptance criteria.**
- Tapping book produces a real `service_requests` row that genuinely
  reaches `status = 'booked'` through the existing state machine and
  its triggers — including the `QuoteAccepted` / `RequestCreated`
  domain events wired in Epic 01, which must still fire correctly.
- The Relief state follows in place, on the same canvas — no navigation.
- Failure is handled with real copy, not a silent no-op
  (`UX_PATTERNS.md` names error handling as the app's biggest gap;
  don't widen it).

**Complexity.** L — the only package with real backend implications.

**Risks.** Highest-risk package in the epic. An "instant book" that
bypasses the quote flow changes the marketplace's core assumption that
a pro opts in by quoting before being committed to a job. That's a
product decision with real consequences for professionals, not a UI
detail — it needs an explicit answer (and plausibly its own ADR) before
code.

---

## WP10 — Mobile polish

**Scope.** Responsive verification and refinement of everything WP1–WP9
produced, at the real breakpoints the app runs at — the approved
prototype is drawn inside a phone frame; the real app is frameless.

**Dependencies.** WP1–WP9 substantially complete.

**Files affected.** CSS for the new components (in `src/App.jsx`'s
style block, per current convention).

**Acceptance criteria.**
- Verified at mobile, tablet, and desktop widths in a real browser, not
  assumed from the mockup.
- Touch targets are comfortably tappable at mobile width.
- Spacing continues to use `--space-*` tokens.
- No horizontal overflow at any tested width.

**Complexity.** S

**Risks.** `RESPONSIVE_SYSTEM.md` is outside this epic's approved doc
list and, by its own admission elsewhere, thin — so "correct responsive
behavior" here means "verified working," not "conforms to a documented
breakpoint system." Flagged rather than invented.

---

## WP11 — Accessibility

**Scope.** Verification and remediation pass against
`PRODUCT_CONSTITUTION.md` Rule 6 across every component from WP1–WP9:
keyboard reachability, state-change announcement, contrast.

**Dependencies.** WP1–WP9 (but built in throughout, not deferred here).

**Files affected.** All new components from this epic.

**Acceptance criteria.**
- Every interactive element is a real `<button>` / `<input>` with
  visible text alongside any icon — never icon-only.
- The full flow is completable keyboard-only.
- Each unfold stage is announced (live region) rather than appearing
  silently for screen-reader users — this is the "every state change is
  announced" half of Rule 6, and the unfold mechanic makes it the
  epic's most likely accessibility failure.
- Text/background pairings hold contrast. Do not reach for
  `--ink-faint`: `DESIGN_TOKENS.md` records it as already having failed
  a real contrast audit and having been replaced at its one usage.

**Complexity.** M

**Risks.** Scoped against Rule 6 only, per the approved doc list —
`ACCESSIBILITY.md`'s fuller WCAG bar is deliberately not applied.
Say so when this package is called done, so nobody reads "accessibility
package complete" as "meets the documented WCAG target."

---

## WP12 — Testing

**Scope.** Extend the Vitest harness (built and frozen in Epic 01) to
cover this epic's real logic: the unfold state machine, the
professional-selection helper from WP8, and the booking handler from
WP9.

**Dependencies.** All prior packages.

**Files affected.** New tests following Epic 01's precedent
(`src/lib/__tests__/requests.test.js`); first real use of React Testing
Library, which is installed but has no existing usage.

**Acceptance criteria.**
- `npm test` passes with new coverage for: the six-state transition
  logic, professional selection, and booking success + failure paths.
- Any new `src/lib` helper introduced by WP8/WP9 has direct unit
  coverage — that's where the logic lives, per Rule "no business logic
  in UI."
- No E2E/Playwright work here: explicitly deferred with the rest of
  Epic 01's frozen infrastructure scope.

**Complexity.** M

**Risks.** Component testing has no precedent in this codebase yet —
expect the first React Testing Library test to cost more than its size
suggests while the patterns get established.

---

## Complexity summary

| WP | Package | Complexity | Blocked? |
|---|---|---|---|
| 1 | Homepage shell | M | Open question 1 (partially) |
| 2 | Conversation composer | S | — |
| 3 | Voice interaction | M | — |
| 4 | Photo interaction | M | — |
| 5 | AI understanding cards | S | — |
| 6 | Progressive reveal | M | — |
| 7 | Trust strip | S | **Open question 2** |
| 8 | Professional recommendation card | M | — |
| 9 | Booking transition | L | **Open question 3** |
| 10 | Mobile polish | S | — |
| 11 | Accessibility | M | — |
| 12 | Testing | M | — |

Suggested first implementation conversation: **WP1 + WP7 together** —
the shell and the trust strip are the two Rest-state pieces, they're
independent of the unfold machinery, and building them first makes the
approved Rest state real and reviewable before any of the harder
interaction work starts. WP7 needs open question 2 answered first.

---

Version 1.0 — 2026-08-06 (Epic 03 planning; no implementation)

# Accessibility

**This document owns:** the enforceable extension of
`PRODUCT_CONSTITUTION.md` Rule 6 ("Accessibility is mandatory") — a real
target, real rules, and a real audit against the actual codebase. It does
not own component-level API details (`COMPONENT_LIBRARY.md`) or motion
timing values (`DESIGN_TOKENS.md`/`ANIMATION_GUIDELINES.md`) — it
references both rather than restating them.

**Ownership note, stated plainly:** this needs a verification owner, not
just a spec owner — someone who actually re-runs this audit, not just
someone who wrote it once. Currently "Unassigned," matching every other
ownership field in this doc set (`MASTER_CONTEXT.md` §4).

Every finding below is a real, checked fact about `src/App.jsx` and
`src/design-system/*.jsx` as of this pass — several were fixed while
writing this document (small, mechanical, verified via build/lint and,
where practical, live in the browser); the larger ones are named plainly
as not fixed, not hidden.

---

## Target

**WCAG 2.1, Level AA.** Not previously stated anywhere in this doc set —
this is the first place a real target gets written down, chosen as the
standard practical baseline rather than invented for this document.

## Fixed in this pass

Six small, mechanical fixes, each matching a pattern that already existed
correctly elsewhere in the same codebase:

| Fix | Where | Matched pattern |
|---|---|---|
| `Drawer`'s overlay now closes on `Escape` | `overlays.jsx` | `Modal` already had this |
| `Rating` now has `role="img"` + `aria-label="N out of 5 stars"`, individual stars `aria-hidden` | `primitives.jsx` | N/A — genuinely new |
| Star-picker's 5 rating buttons now have per-star `aria-label` + `aria-pressed` | `App.jsx`, `.star-picker` | N/A — genuinely new |
| Photo-remove buttons (×2) now have `aria-label="Remove photo"` | `App.jsx`, `.photo-remove-btn` | Matches `Modal`/`Drawer`'s close-button labeling |
| Avatar-upload button now `aria-hidden` + `tabIndex={-1}` | `App.jsx`, `.avatar-upload` | Removes a redundant duplicate of the adjacent labeled text button from the accessibility tree, rather than giving two controls the same announced name |
| `<html lang>` now syncs to the selected locale | `App.jsx`, `AppShell` | Was hardcoded `"en"` in `index.html` regardless of the other 7 locales — confirmed live: switching the language selector now updates `document.documentElement.lang` in real time |
| `--ink-faint` removed from its one real usage (`.timeline-label`), replaced with `--ink-soft` | `App.jsx` | See Color contrast, below — `--ink-faint` failed AA at the size it was actually used |

## Keyboard navigation

Almost everything interactive is a real `<button>`, `<input>`, or
`<select>` — confirmed throughout the `COMPONENT_LIBRARY.md` audit — so
Tab/Enter/Space work by default without special handling. Two real gaps,
not fixed here:

- **No focus trap in `Drawer` or `Modal`.** Both now close on `Escape`,
  but while open, `Tab` can still move focus to elements behind the
  overlay. This is a genuinely non-trivial fix (a real focus-trap
  implementation, not a one-line addition) — named here as the clearest
  next task for this document, not attempted in this pass.
- **No visible focus-ring audit performed.** Browsers supply a default
  focus outline, but nothing in `src/App.jsx` confirms it's never
  suppressed (a stray `outline:none` without a replacement would be
  invisible in a `grep` for this pass's scope) — flagged for a dedicated
  pass, not checked exhaustively here.

## Screen reader

Fixed this pass: see the table above. Two real gaps remain, deliberately
not fixed here because each needs more than a label:

- **`aria-label`s in this codebase are hardcoded English, never
  localized** — including the ones just added, and the pre-existing ones
  on `Modal`. A screen-reader user on the `ar`, `fr`, or `zh` locale hears
  "Close" and "Remove photo" in English while every other word on screen
  is translated. Real, consistent with the rest of the app's localization
  effort not yet reaching this layer — flagged as a real task (add these
  to `STRINGS` across all 10 locales, the same pattern used for every
  other piece of copy in the app), not solved by hardcoding yet more
  English strings in this pass.
- **No live-region announcements exist** for async state changes (a quote
  arriving, a request status changing) — a screen-reader user gets no
  notification unless they happen to be focused on the changed content.

## Color contrast

Computed using the real WCAG relative-luminance formula against the real
hex/rgba values in `DESIGN_TOKENS.md` — not estimated:

| Foreground | Background | Ratio | AA normal text (4.5:1) |
|---|---|---|---|
| `--ink` `#16231C` | `--surface` `#FFFFFF` | 16.3:1 | Pass (AAA) |
| `--ink` `#16231C` | `--paper` `#EFEEE6` | 14.0:1 | Pass (AAA) |
| `--ink-soft` `#5B6B60` | `--surface` `#FFFFFF` | 5.65:1 | Pass |
| `--ink-soft` `#5B6B60` | `--paper` `#EFEEE6` | 4.86:1 | Pass |
| `#FFFFFF` | `--forest` `#1F4D3A` | 9.63:1 | Pass (AAA) |
| `--forest-dark` `#163828` | `--sage-bg` `#E7F0E5` | 11.0:1 | Pass (AAA) |
| `#8a5c14` (hardcoded, not a token — `.cta-quote`/boost text) | `--amber-bg` `#FBEBD2` | 4.94:1 | Pass |
| ~~`--ink-faint` `#8B978D`~~ | `--surface` `#FFFFFF` | **3.04:1** | **Fail** |

**The one real failure found, and how it was resolved:** `--ink-faint`
(added in the Phase 2 token pass) was used on `.timeline-label` at
10.5px — normal-size text, so the 4.5:1 threshold applies, not the 3:1
large-text one. It measured 3.04:1 against white. Rather than guess a new
hex value under the same time pressure that produced the first miss, the
fix reuses `--ink-soft` (already verified above at ≥4.5:1 against both
real backgrounds) for that one usage. `--ink-faint` itself is still
defined in `:root` (removing a token is a bigger call than fixing its one
usage) but now has **zero real usages anywhere** — see
`DESIGN_TOKENS.md`'s Audit section, worth a note there too. If a genuinely
lighter text tier is wanted later, the real constraint this audit found is
worth knowing: there's very little room between `--ink-soft`'s 4.86:1 (on
paper, the stricter of the two real backgrounds) and the 4.5:1 floor — a
meaningfully lighter tier that still passes normal-text AA on `--paper`
may not be achievable without changing the background it sits on too.

**Also confirmed:** the hardcoded `#8a5c14` (used for amber-tinted CTA
text, never tokenized — see `DESIGN_TOKENS.md`'s "not yet tokenized" list)
does pass at 4.94:1, so it isn't a contrast bug, just an un-tokenized
value.

**Not audited in this pass:** every color pairing in the app — this is a
representative sample of the highest-frequency real pairings, not
exhaustive. `--amber` text-on-text combinations and disabled-state colors
weren't checked.

## Motion sensitivity

**Fixed this pass:** `@media (prefers-reduced-motion: reduce)` now zeroes
`--motion-fast` and `--motion-base` globally — the token-level fix
`ANIMATION_GUIDELINES.md` predicted when it flagged this gap, confirmed
live (the media query's CSS is present in the injected stylesheet).
Deliberately **not** touched: the one continuous animation
(`@keyframes ai-spin`, the AI-analyzing loading spinner) — continuous
loading indicators are commonly exempted from reduced-motion since
removing them entirely removes necessary "is this still working"
feedback, not because it was overlooked.

## Touch targets

Real measurements against the common 44×44px (iOS) / 48×48dp (Android)
minimum recommended touch target size — originally, **none of the four
measured icon-only controls met it:**

| Control | Visible size | Real tap area | Meets 44px? |
|---|---|---|---|
| `.sheet-close` (`Drawer`) | 28×28px | 44×44px (fixed, 2026-08-28) | Yes |
| `.modal-close` (`Modal`) | 28×28px | 44×44px (fixed, 2026-08-28) | Yes |
| `.chat-input-row button` (send) | 38×38px | 38×38px — attempted, genuinely can't be hit-slopped, see below | No |
| `.photo-remove-btn` | 20×20px | 28×28px (fixed, 2026-08-28) | No — deliberately partial, see below |

**Fixed via hit-slop** (`src/shell/appStyles.js`): a transparent
`::after{ content:""; position:absolute; inset:-Npx; }` per control,
which enlarges only the invisible tappable zone — the visible icon never
grows. `.sheet-close`/`.modal-close` sit in open space at a drawer/modal
corner with nothing nearby to overlap, so both reach the full 44px —
verified by measuring the real hit-test (`document.elementFromPoint()`)
at a point just outside the visible circle, live, not just by reading
the CSS.

**`.chat-input-row button` (the message-send button) genuinely cannot be
hit-slopped, tried live, 2026-08-28** — a real CSS constraint, not an
oversight: this button lives inside a `Drawer`'s own `.sheet-scroll`
(`overflow-y:auto`), and the CSS Overflow spec forces `overflow-x` to
compute as `auto` too whenever the other axis isn't `visible` — setting
`overflow-x:visible` explicitly does not override this; the browser
coerces it back, confirmed against the real computed style live, not
just the source. Any hit-slop pseudo-element bleeding outside this
button's own box gets clipped by that same computed overflow, exactly
like any other content would be. A real fix exists — move
`.chat-input-row` outside the Drawer's scrolling children — but that is
a structural change to every conversation sheet in the app, not a
touch-target tweak, so it's named here rather than attempted under this
pass's scope.

**`.photo-remove-btn` stays a deliberately partial fix, exactly the
"real design decision per control" this section originally called for
instead of a one-line copy of the other three.** Its parent
(`.portfolio-thumb`) clips overflow, so the only direction with room to
extend is inward, toward the thumbnail's own center — and reaching the
full 44px that way would turn roughly a third of a small thumbnail into
an invisible "remove this photo" zone, a real mis-tap risk for a
destructive-feeling action. A smaller 4px hit-slop (28×28px, a real 40%
larger tap area) is the proportionate fix instead.

## Right-to-left (Arabic)

**Confirmed real and working**, correcting `COPY_GUIDELINES.md`'s earlier
"not verified" note: `dir={dir}` is applied to `.stage`, with
`dir = langCode === "ar" ? "rtl" : "ltr"` computed from the active locale
— genuine, functioning RTL support, not a gap. One caveat worth keeping:
it's applied at the demo's `.stage` wrapper, which is the outermost real
container today — once the phone-mockup demo shell is replaced by a real
responsive layout (`RESPONSIVE_SYSTEM.md`), this needs to move to
whatever becomes the new top-level container so it doesn't get silently
dropped in that rewrite.

## Component-level status

Cross-reference `COMPONENT_LIBRARY.md` for full specs — the accessibility
column, updated with this pass's fixes:

| Component | Status |
|---|---|
| `Drawer` | Close button labeled, now closes on Escape. No focus trap. |
| `Modal` | Close button labeled, closes on Escape, `role="dialog"`. No focus trap. |
| `Rating` | Now has an accessible name. |
| `Avatar` | Photo `alt=""` is correct (decorative, name is adjacent text). |
| `Badge`, `PriceTag`, `TrustBadge`, `AIMessage`, `Timeline`, `ServiceCard`, `JobCard`, `QuoteCard` | Text-based, no icon-only content — no known gaps found. |
| `Button` | Inherits native `<button>` semantics; icon-only usage (`icon` prop with no `children`) not checked for a required label — flagged for the next pass. |

---

Version 1.0 — 2026-08-05

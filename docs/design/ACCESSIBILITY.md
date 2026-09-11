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

- **Focus trap — closed 2026-09-08, `overlays.jsx`'s own `useFocusTrap()`.**
  Both close on `Escape` and now trap `Tab`/`Shift+Tab` inside the open
  dialog, focus the panel on open (the close button, in practice — it's
  the first focusable element in both), and restore focus to whatever
  was focused before the dialog opened, once it closes. Found live: the
  shared hook's own header already claimed both overlays used it, and
  `Modal` genuinely did — but `Drawer`, the far more heavily used of the
  two (every sheet in the app; `Modal` is only the two delete
  confirmations and the onboarding tour), never actually called it.
  Closing this needed no new implementation, only wiring the existing
  hook into `Drawer` the same way `Modal` already had it — see
  `overlays.test.jsx` for the regression coverage neither overlay had
  before.
- **Visible focus-ring audit — closed 2026-09-11.** The gap flagged here
  was real: `appStyles.js`'s own global `:focus-visible{ outline:2px
  solid var(--forest); }` rule (added for Epic 03's WP11 audit, see the
  Keyboard navigation section above) was never actually reaching several
  of the app's most common interactive elements. `.search input`
  (nearly every single-line text field in the product), `.lang-switch
  select`, `.chat-input-row input`, `.conv-textrow-input` (the
  homepage's own message composer), and `homeStyles.js`'s own
  `.seg-tabpanel:focus` (a real, keyboard-focusable scroll region —
  `TabPanel`'s own `tabIndex={0}`) each carried their own `outline:none`
  from before the global rule existed, and each has equal-or-higher CSS
  specificity than a bare `:focus-visible` selector — so the local reset
  silently kept winning the cascade regardless of the global rule's own
  intent. Fixed by deleting each local override rather than by raising
  the global rule's specificity, which is what actually lets one rule
  govern every interactive element as originally intended. See
  `cssFocusVisibility.test.js` for the regression coverage this gap had
  none of before.

## Screen reader

Fixed this pass: see the table above. Two real gaps remain, deliberately
not fixed here because each needs more than a label:

- **`Drawer`/`Modal`'s own close button — closed 2026-09-08, corrected
  2026-09-11.** Every ordinary sheet in the app (EditProfileSheet,
  ItemFormSheet, ReportSheet, AiIntakeSheet, ConversationSheet,
  RequestDetailSheet, 20+ more) now passes its own real `t.closeBtn`
  (new key, all 10 locales) as `closeLabel`, rather than relying on
  `overlays.jsx`'s own hardcoded `"Close"` default. That default itself
  is deliberately kept — it is the correct, real answer for the operator
  tool's own two sheets (`CaseDetailSheet`/`SupportAccessSheet`), which
  have no `t`/i18n context at all and are English-only by design.
  **The "every" above overclaimed:** `QuoteFormSheet.jsx` and
  `ServiceSheet.jsx` were both missed by that pass — found by a later
  audit and fixed 2026-09-11, alongside the "Remove photo" correction
  below.
- **`AiIntakeSheet.jsx`'s own photo-remove button — closed 2026-09-08.**
  Hardcoded `aria-label="Remove photo"`, even though its two sibling
  buttons (`ItemFormSheet.jsx`, `ServiceRecordEditorSheet.jsx`) already
  used the real, existing `t.itemPhotoRemove` — this one simply never
  did. Wired to the same key, no new string needed.
- **`LanguageSwitcher.jsx`'s own `aria-label="Language"` — also closed
  2026-09-08.** The one control whose entire purpose is switching
  language had a screen reader announce it in English regardless of
  which locale a person had already picked — the most on-the-nose
  instance of this whole category of gap. New key, `languageSwitcherLabel`,
  all 10 locales.
- **A full grep of every `aria-label="literal string"` in `src/` was run
  closing the 2026-09-08 pass** — the three above were logged as the
  only real, reachable ones found, with `QuoteFormSheet.jsx`'s own
  identical "Remove photo" explicitly left unfixed on purpose as dead,
  unreachable code (`CustomerApp.jsx`'s own header: no live trigger sets
  `activeService`/`quoteForm` today). **Revisited and fixed anyway,
  2026-09-11:** dead code today is not dead code forever — this surface
  stays in the codebase specifically because no agreed replacement exists
  yet, not because it is slated for removal, so a trivial, already-proven
  fix (the same `t.itemPhotoRemove` swap, verbatim) was worth making now
  rather than leaving a known bug for whoever reconnects it later to
  rediscover. `AuditLog.jsx`/`WorkspaceLookup.jsx`'s own hardcoded labels
  remain correctly untouched — the operator tool's own, genuinely
  English-only by design, no `t`/i18n context to localize with. This
  category of gap is genuinely closed, not merely reduced.
- **The one shared toast — closed 2026-09-08.** `AppShell.jsx`'s own
  `{toast && <div className="toast">...}` (every confirmation in the app
  goes through this one render site: a booking confirmed, a review
  sent, a quote sent, a request accepted) had no `aria-live`/`role` at
  all — it appeared and disappeared with zero announcement to a screen
  reader. Now `role="status"`. One shared render site, so this closes
  it for every toast in the app at once, not per call site.
- **Still open: state changes that never go through the shared toast**
  (a quote arriving on the dashboard, a request's own status pill
  changing while its detail sheet is open) still announce nothing —
  a screen-reader user gets no notification unless already focused on
  the changed content. Real, and a materially bigger task than the
  toast fix above: each such surface needs its own live region wired to
  its own real-time update, not one shared fix.

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
| `--amber-dark` `#8a5c14` (was hardcoded — `.cta-quote`/boost text) | `--amber-bg` `#FBEBD2` | 4.94:1 | Pass |
| `--amber-dark` `#8a5c14` | `--surface` `#FFFFFF` | 5.8:1 | Pass |
| `--amber-dark` `#8a5c14` | `--paper` `#EFEEE6` | 4.98:1 | Pass |
| ~~`--amber` `#E8A33D`~~ | `--surface` `#FFFFFF` | **2.16:1** | **Fail** |
| ~~`--ink-faint` `#8B978D`~~ | `--surface` `#FFFFFF` | **3.04:1** | **Fail** |
| ~~`--ink-faint` `#8B978D`~~ | `--paper` `#EFEEE6` | **2.61:1** | **Fail** |

**The first real failure found, and how it was resolved:** `--ink-faint`
(added in the Phase 2 token pass) was used on `.timeline-label` at
10.5px — normal-size text, so the 4.5:1 threshold applies, not the 3:1
large-text one. It measured 3.04:1 against white. Rather than guess a new
hex value under the same time pressure that produced the first miss, the
fix reuses `--ink-soft` (already verified above at ≥4.5:1 against both
real backgrounds) for that one usage. `--ink-faint` itself is still
defined in `:root` (removing a token is a bigger call than fixing its one
usage) and had **zero real usages anywhere** at the time of that pass.

**That regressed once, and has now been fixed a second time:**
`src/home/homeStyles.js`, added after the Phase 6 pass above, had picked
up ten real `color:var(--ink-faint)` usages, all at the same 10.5–11px
size class that already failed once (`.home-group-count`,
`.location-node-type`, `.location-node-edit`, `.timeline-card-date`,
`.timeline-card-chevron`, `.trusted-pro`, `.home-photo-missing`,
`.item-card-room`, `.item-card-edit`, `.item-detail-document-chevron`).
Measured against `--paper` for the first time this pass, it's actually
worse there than the documented `--surface` failure: 2.61:1. Same fix as
the original: all ten now use `--ink-soft` instead (5.65:1 / 4.85:1 —
comfortably clears 4.5:1 against both real backgrounds). `--ink-faint`
stays defined, zero real usages again — see `DESIGN_TOKENS.md`'s Audit
section for the full regression history. This time the fix ships with a
regression test (`src/shell/__tests__/cssTokenContrast.test.js`) that
fails CI if `var(--ink-faint)` reappears in either stylesheet string, so
a third silent regression isn't just possible again. If a genuinely
lighter text tier is wanted later, the real constraint the original audit
found is worth knowing: there's very little room between `--ink-soft`'s
4.85:1 (on paper, the stricter of the two real backgrounds) and the 4.5:1
floor — a meaningfully lighter tier that still passes normal-text AA on
`--paper` may not be achievable without changing the background it sits
on too.

**The second real failure found, and how it was resolved:** `--amber`
(`#E8A33D`) was never checked against a real background before this pass
— DESIGN_TOKENS.md carried it as a plain accent color with no contrast
note. It measures 2.16:1 against both `--surface` and `--paper`, failing
not just the 4.5:1 text floor but the 3:1 non-text floor too. Every real
usage of bare `var(--amber)` in the app put that color directly under
text or a meaningful icon/dot: `.waiting`'s "waiting for quotes" text,
`.tab-badge`'s unread-count number, both timeline-active status dots
(`appStyles.js` and `homeStyles.js`), the photo conversation-action
glyph's icon, both star-rating components' filled stars, and the AI
intake sheet's error text. Same fix shape as `--ink-faint` above: reuse
an already-verified value rather than invent one. The hardcoded `#8a5c14`
used for `.cta-quote`/`.badge-amber` text was already confirmed passing
(4.94:1 on `--amber-bg`, and — now separately verified — 5.8:1 on
`--surface` and 4.98:1 on `--paper`), so it's now the real `--amber-dark`
token, and every usage above switched to it. `--amber` itself stays
defined and untouched, for any future large-scale/decorative use where it
isn't sitting directly under text or a small icon. `var(--amber)` reappearing
as a foreground color is also covered by
`src/shell/__tests__/cssTokenContrast.test.js` now, same as `--ink-faint`
above — that test's own header comment is honest about what it doesn't
cover: an inline `style={{ color: "var(--amber)" }}` prop outside the two
shared stylesheet strings.

**Not audited in this pass:** every color pairing in the app — this is a
representative sample of the highest-frequency real pairings, not
exhaustive. Disabled-state colors weren't checked.

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
| `.chat-input-row button` (send) | 44×44px (grown, 2026-09-08 — see below) | 44×44px | Yes |
| `.photo-remove-btn` | 20×20px | 28×28px (fixed, 2026-08-28) | No — deliberately partial, see below |

**Fixed via hit-slop** (`src/shell/appStyles.js`): a transparent
`::after{ content:""; position:absolute; inset:-Npx; }` per control,
which enlarges only the invisible tappable zone — the visible icon never
grows. `.sheet-close`/`.modal-close` sit in open space at a drawer/modal
corner with nothing nearby to overlap, so both reach the full 44px —
verified by measuring the real hit-test (`document.elementFromPoint()`)
at a point just outside the visible circle, live, not just by reading
the CSS.

**`.chat-input-row button` (the message-send button) genuinely could not be
hit-slopped, tried live, 2026-08-28** — a real CSS constraint, not an
oversight: this button lives inside a `Drawer`'s own `.sheet-scroll`
(`overflow-y:auto`), and the CSS Overflow spec forces `overflow-x` to
compute as `auto` too whenever the other axis isn't `visible` — setting
`overflow-x:visible` explicitly does not override this; the browser
coerces it back, confirmed against the real computed style live, not
just the source. Any hit-slop pseudo-element bleeding outside this
button's own box gets clipped by that same computed overflow, exactly
like any other content would be. Two real fixes were named at the time:
move `.chat-input-row` outside the Drawer's scrolling children (a
structural change to every conversation sheet in the app), or grow the
button's own visible box, which sidesteps the clipping problem
entirely — nothing bleeds outside the button's own bounds for the
ancestor's overflow to clip against. **Closed 2026-09-08 the second
way**: grown from 38×38px to a real 44×44px. A visibly larger round send
button reads as more tappable, not as a design regression, unlike the
small utility icons (`.sheet-close`/`.photo-remove-btn`) hit-slop was
chosen for instead. Verified against the source CSS and the surrounding
flex layout (`.chat-input-row input` is `flex:1`, so the 6px larger
button simply takes 6px more from the space the input already yields);
**not re-verified live in a real browser this pass** — the same
limitation this session's own other real-browser-dependent findings
(this codebase's voice capture chief among them) already named plainly
rather than glossed over.

**`.photo-remove-btn` stays a deliberately partial fix, exactly the
"real design decision per control" this section originally called for
instead of a one-line copy of the other three.** Its parent
(`.portfolio-thumb`) clips overflow, so the only direction with room to
extend is inward, toward the thumbnail's own center — and reaching the
full 44px that way would turn roughly a third of a small thumbnail into
an invisible "remove this photo" zone, a real mis-tap risk for a
destructive-feeling action. A smaller 4px hit-slop (28×28px, a real 40%
larger tap area) is the proportionate fix instead.

### Chips — the shared primitive, fixed 2026-08-28

`.chip` (every service picker, when/where selector, category filter, and
property-type choice in the app — dozens of screens, hundreds of real
instances) measured at **~119×31px, below the 44px minimum**, same as
the four controls above. Named at the time as a separate, much
wider-blast-radius gap this section didn't attempt — resizing a shared
primitive used everywhere carries real risk of breaking something on a
screen not checked.

**Hit-slop, tried first, genuinely doesn't work here either** — verified
live before writing a single line of the real fix: `.chiprow` itself
sets `overflow-x:auto` with no `overflow-y` declared, so the identical
CSS Overflow spec coercion that blocked `.chat-input-row button` forces
`overflow-y` to compute as `auto` too. A pseudo-element extending above
a chip resolved (`document.elementFromPoint`) to `.sheet-scroll`, not
the chip — clipped, not a coincidence.

**Fixed instead with a real box size increase** — `min-height:44px`,
horizontal padding grown from 12px to 14px so the larger pill stays
proportioned, `justify-content:center` added so icon+text stay centered
in the taller box. Measured live afterward: exactly 44.0px. `.chiprow`'s
own row height grows to match (58px, was ~45px) since flex rows size to
their tallest child — a real, visible layout change on every screen with
a chip row, by design, not a side effect to explain away.

**Checked across the highest-density chip screen in the app** before
shipping — the pro's own "Diensten die je aanbiedt" (services offered)
screen, six category groups, each its own horizontally-scrolling chip
row, the most chips and the most rows anywhere in the codebase. No
overlap, no broken wrapping, no visual regression; if anything the
larger pills read as more confident, not less, matching the "warm,
premium" design direction rather than fighting it.

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
| `Drawer` | Close button labeled, closes on Escape, `role="dialog"`, real focus trap and restoration (2026-09-08). |
| `Modal` | Close button labeled, closes on Escape, `role="dialog"`, real focus trap and restoration. |
| `Rating` | Now has an accessible name. |
| `Avatar` | Photo `alt=""` is correct (decorative, name is adjacent text). |
| `Badge`, `PriceTag`, `TrustBadge`, `AIMessage`, `Timeline`, `ServiceCard`, `JobCard`, `QuoteCard` | Text-based, no icon-only content — no known gaps found. |
| `Button` | Inherits native `<button>` semantics. **Checked, 2026-09-11:** the flagged icon-only case (`icon` prop with no `children`) has zero real call sites — both real usages of `icon` (`RequestDetailSheet.jsx`, `ProJobDetailSheet.jsx`, both `icon={MessageCircle}`) pass real text as `children` too. Not a live gap today; `Button`'s own comment now says so and warns that adding a genuinely icon-only instance later would need its own `aria-label`, since the component has no fallback for one. |

---

Version 1.0 — 2026-08-05

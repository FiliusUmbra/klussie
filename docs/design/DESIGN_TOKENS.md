# Design Tokens

**This document owns:** the value and name of every real design token — not
usage guidance (that's `DESIGN_SYSTEM.md`'s color/type philosophy,
`COMPONENT_LIBRARY.md`'s per-component specs, or `ANIMATION_GUIDELINES.md`'s
motion rules), just the source of truth for what a token is currently
worth. Where this document and the code disagree, the code
(`src/App.jsx`'s `:root` block) wins — update this file, don't trust it
blindly.

Status vocabulary throughout: **Implemented**, **In Progress**, **Planned**.

---

## Naming convention

`--<category>[-<variant>][-<state>]`, lowercase, hyphen-separated. Observed
in the real token set (this is a description of the existing pattern, not
a new rule invented for this doc):

- **Category first:** `forest`, `sage`, `amber`, `ink`, `line`, `space`,
  `shadow`, `motion`, `font`.
- **Tint/background variant:** `-bg` for a light background tint of a
  color (`--sage-bg`, `--amber-bg`) — not `-light` or `-tint`.
- **Weight/emphasis variant:** `-dark`, `-soft`, `-strong`, `-faint`,
  `-fast`, `-base` — always relative to the bare token, never a number
  (no `--ink-100`/`--ink-200` scale exists; this system uses semantic
  suffixes, not numeric steps).
- **Numbered scale, only where the values are genuinely interchangeable
  steps:** `--space-1` through `--space-6`. Colors and shadows don't use
  numbered suffixes because "forest 3" means nothing; "space 3" does.

New tokens should follow this pattern rather than introducing a second
convention (e.g. don't add `--colorForestDark` or `--forest_dark`).

---

## Color

| Token | Value | Notes |
|---|---|---|
| `--forest` | `#1F4D3A` | Primary — the anchor, per `DESIGN_SYSTEM.md` |
| `--forest-dark` | `#163828` | Deeper forest — headers, pressed states, strong text-on-tint |
| `--sage` | `#8FB996` | Supporting neutral | **Implemented, defined — currently unused.** See Audit below |
| `--sage-bg` | `#E7F0E5` | Sage tint — the actual supporting-neutral background in use everywhere |
| `--amber` | `#E8A33D` | Accent — reserved for emphasis, per `DESIGN_SYSTEM.md` |
| `--amber-bg` | `#FBEBD2` | Amber tint |
| `--paper` | `#EFEEE6` | Page/sheet ground |
| `--surface` | `#FFFFFF` | Card/input ground, sits on `--paper` |
| `--ink` | `#16231C` | Primary text |
| `--ink-soft` | `#5B6B60` | Secondary text |
| `--ink-faint` | `#8B978D` | Tertiary/de-emphasized text (timeline labels, etc.) | **Fixed — see Audit below, was referenced but undefined until this pass** |
| `--line` | `rgba(22,35,28,0.10)` | Standard hairline border |
| `--line-soft` | `rgba(22,35,28,0.06)` | Softer border, paired with `--shadow-card` on content cards |
| `--line-strong` | `rgba(22,35,28,0.28)` | Emphasized border/divider (dashed dividers, timeline dots) |

**Not yet tokenized** — hardcoded hex still in use, candidates for a future
pass, not decided here:

- `#0d1512` — the phone-mockup frame border and notch. Arguably device
  chrome, not app UI, so may never need a token (see `DESIGN_SYSTEM.md`'s
  distinction between the two).
- `#24382e` / `#121b16` — the `.stage` background gradient (the dark
  backdrop behind the phone mockup in the demo shell).

---

## Spacing scale

| Token | Value |
|---|---|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `24px` |
| `--space-6` | `32px` |

**Status: Implemented as tokens, Planned in practice.** These were added
in the Design Direction Lock pass but have **zero usages** anywhere in the
actual CSS today — every padding and margin in `src/App.jsx` is still an
ad hoc pixel value (examples: `.pad` uses `18px 20px 30px`, `.svc-card`
uses `13px`, `.chip` uses `7px 12px` — none reference a `--space-*`
token). Applying them retroactively across the whole file is out of scope
for this document; that's `LAYOUT_SYSTEM.md`'s job (Phase 4). Documenting
them here now so the next person who reaches for a spacing value has a
scale to reach for, even before the retrofit happens.

---

## Radius

**No `--radius-*` tokens exist.** Every `border-radius` in the codebase is
a literal pixel value. The real, currently-in-use values, sorted, are the
de facto scale:

`6px · 8px · 10px · 11px · 12px · 13px · 14px · 16px · 24px · 44px · 50% · 99px / 999px (pill)`

That's eleven distinct non-pill values for what's functionally a handful
of real use cases (tight/standard/loose card corners, the sheet's top
corners, the phone frame, circles, pills). A real radius scale (e.g. `sm /
md / lg / pill`) is a reasonable candidate for a future token pass —
flagged, not decided here, since picking the canonical 3-4 values is a
design call this document shouldn't make unilaterally.

---

## Shadow / elevation

| Token | Value | Used by |
|---|---|---|
| `--shadow-card` | `0 1px 2px rgba(31,77,58,0.05), 0 2px 10px rgba(31,77,58,0.06)` | The 12 content-card selectors from the Design Direction Lock pass (`.svc-card`, `.ticket`, `.quote-card`, `.ds-card`, and others) |

**Not yet tokenized** — four `box-shadow` declarations still use literal
values, all on overlay/frame chrome rather than content cards:

- `.phone` — `0 30px 70px rgba(0,0,0,0.5)`
- `.sheet` — `0 -10px 30px rgba(0,0,0,0.2)`
- `.toast` — `0 8px 20px rgba(0,0,0,0.3)`
- `.modal-panel` — `0 20px 60px rgba(0,0,0,0.25)`

These are neutral-black shadows, not forest-tinted like `--shadow-card` —
consistent with each other (all overlay-layer chrome) but a different
family from the card shadow. Whether they should become a second
`--shadow-overlay` token or stay bespoke per-element is a real design
question, not resolved here.

---

## Motion

| Token | Value |
|---|---|
| `--motion-fast` | `120ms ease-out` |
| `--motion-base` | `200ms ease-out` |

Used on card `box-shadow`/`transform` transitions and button/chip
`background`/`transform`/`opacity` transitions, added in the Design
Direction Lock pass. See `ANIMATION_GUIDELINES.md` (Phase 5, planned) for
choreography rules and reduced-motion behavior — this table is only the
two raw values.

**Not yet tokenized:** the one existing `@keyframes ai-spin` animation
uses a literal `0.9s linear infinite` duration, not `--motion-base`. It's
a continuous loading spinner rather than a discrete state transition, so
it may legitimately warrant its own token rather than reusing these two —
flagged, not changed here.

---

## Typography

Font family tokens:

| Token | Value | Role |
|---|---|---|
| `--font-display` | `'Fraunces', serif` | Hero titles, onboarding, important headings only |
| `--font-body` | `'Inter', sans-serif` | Everything else |
| `--font-mono` | `'IBM Plex Mono', monospace` | IDs, prices, timestamps, diagnostics |

**No `--font-size-*` scale exists.** The real, currently-in-use values,
sorted, are the de facto scale:

`9px · 9.5px · 10px · 10.5px · 11px · 11.5px · 12px · 12.5px · 13px ·
13.5px · 14px · 14.5px · 15px · 15.5px · 16px · 17px · 18px · 19px · 22px`

Nineteen distinct values is too many for a deliberate type scale — this
reads as organic growth (each component picking whatever looked right at
the time) rather than a designed system. A real scale (e.g. a 6-8 step
ramp) is the clearest candidate for the next token-hygiene pass, but
choosing those steps is a design decision this document documents the
need for, not one it makes.

**Locale override pattern** (a real, working example of scoped token
overrides, worth keeping as the model for future ones):

```css
.phone.lang-ar{ --font-body:'Noto Sans Arabic', sans-serif; --font-display:'Noto Sans Arabic', sans-serif; }
.phone.lang-zh{ --font-body:'Noto Sans SC', sans-serif; --font-display:'Noto Sans SC', sans-serif; }
```

A class-scoped override redefining the same token names — this is the
mechanism `WHITE_LABEL.md` (Phase 7) will eventually generalize for
tenant theming.

---

## Z-index

**No `--z-*` tokens exist.** The real, currently-in-use values are the de
facto layering order:

| Value | Element | Layer |
|---|---|---|
| `0` | `.timeline-step::after` | Base connecting line |
| `1` | `.timeline-dot` | Above the connecting line |
| `5` | `.notch` | Phone-frame chrome |
| `20` | `.sheet-overlay` | Bottom sheet |
| `30` | `.toast` | Above sheets |
| `60` | `.modal-overlay` | Above everything |

Six values, no collisions, a sensible implicit order — this one's in
better shape than radius or type size. Still worth a named scale
eventually (`LAYOUT_SYSTEM.md`, Phase 4) so the next overlay type doesn't
have to guess where `45` or `70` would land.

---

## Token audit — findings from writing this document

A defined-vs-referenced sweep across `src/App.jsx` surfaced two real
issues, both addressed in this pass:

- **`--ink-faint` was referenced but never defined.** `.timeline-label`
  used `color:var(--ink-faint)` with no fallback and no definition in
  `:root` — an invalid custom-property reference, which resolves to the
  property's inherited value rather than crashing, so it was silently
  rendering timeline labels darker than intended rather than visibly
  broken. **Fixed**: added `--ink-faint:#8B978D` to `:root`, continuing
  the existing `--ink` → `--ink-soft` → `--ink-faint` emphasis ladder.
- **`--surface-2` is referenced but never defined.** `.modal-close` uses
  `background:var(--surface-2, var(--sage-bg))` — the explicit fallback
  means it's harmless today (always resolves to `--sage-bg`), but the
  token itself doesn't exist. **Not changed**: defining a real
  `--surface-2` is a design decision (what should a second surface tone
  actually be?), not a bug fix — left as a flagged finding rather than
  guessed at here.
- **`--sage` is defined but has zero real usages** — every reference in
  the codebase uses `--sage-bg` instead. Not a bug (the bare token may be
  wanted later, e.g. for an icon or accent use distinct from the tint
  background), but worth knowing it's currently inert.
- **`--space-1` through `--space-6` are defined but have zero real
  usages** — see Spacing scale, above.

---

## Governance

Adding a new token: follow the naming convention above, add it to `:root`
in `src/App.jsx`, and add a row to the relevant table in this document in
the same change — a token that exists in code but not here (or vice
versa) is exactly the class of bug this audit just found twice. The full
process for proposing a token (who approves it, when a new one is
justified vs. reusing an existing one) belongs in `DESIGN_GOVERNANCE.md`
(Phase 8) — this document only covers the mechanical "how to add one
correctly."

---

Version 1.0 — 2026-08-05

# Component Library

**This document owns:** the real component catalog — API, states, variants,
accessibility notes, and real usage counts for everything in
`src/design-system/`. It does not own token values (`DESIGN_TOKENS.md`),
higher-level flows built from these components (`UX_PATTERNS.md`), or the
constitution-level litmus test these components are held to
(`DESIGN_SYSTEM.md`).

Every prop, variant, and usage count below was pulled from real code in
this pass — `src/design-system/*.jsx` and their call sites in
`src/App.jsx` — not from intention. Where a variant is defined but never
used, that's stated plainly rather than presented as if it were adopted.

---

## Index

| Component | File | Real usages | Status |
|---|---|---|---|
| `Avatar` | `primitives.jsx` | 7 | Implemented |
| `Badge` | `primitives.jsx` | 10 (4 forest, 4 amber, 2 sage) | Implemented |
| `Rating` | `primitives.jsx` | 6 | Implemented |
| `Button` | `primitives.jsx` | 4 | In Progress — see Audit |
| `Card` | `primitives.jsx` | 0 | In Progress — see Audit |
| `PriceTag` | `primitives.jsx` | 6 | Implemented |
| `Drawer` | `overlays.jsx` | 15 (always via the `Sheet` alias) | Implemented |
| `Modal` | `overlays.jsx` | 2 | Implemented |
| `TicketTear` | `domain.jsx` | 0 direct — internal to `JobCard` only | In Progress — see Audit |
| `ServiceCard` | `domain.jsx` | 1 call site (looped) | Implemented |
| `JobCard` | `domain.jsx` | 4 call sites (each looped) | Implemented |
| `QuoteCard` | `domain.jsx` | 6 | Implemented |
| `TrustBadge` | `domain.jsx` | 4 | Implemented |
| `AIMessage` | `domain.jsx` | 1 | Implemented |
| `Timeline` | `domain.jsx` | 1 | Implemented |

---

## Primitives

Generic building blocks with no domain knowledge — see
`src/design-system/primitives.jsx`.

### Avatar

| | |
|---|---|
| Props | `url`, `initials`, `size` |
| Variants | Default (36px, `.avatar`) · `size="lg"` (52px, `.avatar-lg`) |
| States | Photo (`url` set) or initials fallback |
| A11y | Photo `<img>` has `alt=""` (decorative — the name next to it carries the meaning) |

`size` accepts any string but only `"lg"` has real CSS behind it — no
`"sm"` variant exists despite the prop being unconstrained. Not a bug
today (nothing passes anything else), but a footgun for the next call
site that tries `size="sm"` expecting it to do something.

### Badge

| | |
|---|---|
| Props | `children`, `tone` (default `"sage"`) |
| Variants | `forest` · `sage` · `amber` — all three real, all three in use |
| A11y | Text content only, no icon-only usage found |

### Rating

| | |
|---|---|
| Props | `value`, `size` (default `13`) |
| States | Five stars, filled up to `Math.round(value)` |
| A11y | No accessible name — a screen reader hears five unlabeled star
  icons, not "4 out of 5 stars." Flagged for `ACCESSIBILITY.md` (Phase 6), not fixed here. |

### Button

| | |
|---|---|
| Props | `variant` (`"primary"` default \| `"secondary"`), `icon`, `iconSize` (default `15`), `children`, plus passthrough props |
| Variants | Primary (`.btn-primary`) · Secondary (`.btn-secondary`) |

**Audit finding:** only 4 real call sites use the `Button` component —
every other primary/secondary button in the app (dozens) still renders a
raw `<button className="btn-primary">` directly. `Button` isn't broken or
wrong, it's under-adopted. Retrofitting the rest is `LAYOUT_SYSTEM.md` /
ongoing cleanup work, not a defect in the component itself.

### Card

| | |
|---|---|
| Props | `children`, `onClick`, plus passthrough props |
| States | Renders `<button>` when `onClick` is given, `<div>` otherwise |

**Audit finding: zero real usages.** `Card` (`.ds-card`) is fully built,
exported, and unused — every content card in the app is either a more
specific domain component (`ServiceCard`, `JobCard`, `QuoteCard`) or still
raw markup. Not a defect; it exists as the generic base the domain cards
are conceptually built on, but nothing calls it directly today.

### PriceTag

| | |
|---|---|
| Props | `amount`, `fmt` (locale-aware formatter, passed in — not imported), `size` (default `"md"`) |
| Variants | `sm` (12.5px) · `md` (14px, default) · `lg` (18px) |

**Audit finding:** `size="lg"` is defined in CSS and in the component but
has zero real usages — `sm` and the `md` default are the only sizes
actually in play today.

---

## Overlays

The two full-screen interruption patterns — see
`src/design-system/overlays.jsx`.

### Drawer

| | |
|---|---|
| Props | `children`, `onClose` |
| Consumed as | `Sheet` — a local alias (`const Sheet = Drawer` in `App.jsx`) formalizing the pre-existing name without a 15-call-site rename |
| A11y | Close button now has `aria-label="Close"` (fixed in this pass — it matched `Modal`'s pattern everywhere except here) |

No focus trap and no `Escape`-to-close handler exist yet (`Modal` has
`Escape`, `Drawer` doesn't) — flagged for `ACCESSIBILITY.md`, not fixed
here since it's a real behavior change, not a one-line label.

### Modal

| | |
|---|---|
| Props | `children`, `onClose` |
| A11y | `role="dialog"`, `aria-modal="true"`, `Escape` key closes it, close button has `aria-label="Close"` — the more complete of the two overlays |

---

## Domain

Composed from the primitives, carrying Klussie-specific meaning but no
business logic or data-fetching of their own — see
`src/design-system/domain.jsx`. Every domain component is pure
presentation: callers pass in already-resolved, already-translated values.

### TicketTear

| | |
|---|---|
| Props | none |
| Renders | `.tear` — the single-tone hairline separator (simplified from a zigzag paper gradient in the Design Direction Lock pass) |

**Audit finding:** exported from the barrel (`index.js`) but has zero
direct external usages — `JobCard` is the only thing that renders it
(`domain.jsx:34`). Since the `MessagesList`/`ProJobs` consolidation onto
`JobCard`, nothing outside this file needs it directly. Worth considering
whether it should still be a public export, or become a private,
non-exported helper inside `domain.jsx` — flagged, not changed here, since
narrowing a public API is a real decision even when the change is small.

### ServiceCard

Slot props: `icon`, `name`, `certifiedOnly`, `certifiedLabel`,
`proCountLabel`, `rating`, `ctaLabel`, `ctaVariant` (`"quote"` default \|
`"book"`), `onClick`. Renders as a `<button>` — always clickable, no
non-interactive variant exists (unlike `JobCard`/`Card`).

### JobCard

Slot-based rather than one prop per field: `onClick`, `badge`, `title`,
`subtitle`, `children`, `footer`. Renders `<button>` when `onClick` is
given, `<div>` otherwise — the only domain card with both interactive and
static modes. The three real call sites (customer requests, pro leads, pro
jobs) each fill `children` with meaningfully different body content,
which is the documented reason this is slot-based instead of a rigid prop
shape.

### QuoteCard

Props: `children`, `booked` (boolean, default `false`), `className`.
`booked` swaps the border color to `--forest` via `.quote-card-booked` —
color carries the state, no icon or text badge duplicates it.

### TrustBadge

Props: `rating`, `reviewCount` (optional), `score` (optional), `scoreLabel`,
`fmt`. Both optional fields are genuinely optional in practice — `score`
is omitted in `ProProfile`'s own header (no trust-score display there),
confirming the conditional rendering isn't dead code.

### AIMessage

Props: `label`, `confidence` (optional, 0–100), `children`. The distinct
visual treatment (amber-tinted background) that keeps AI-sourced content
from being confused with something a human wrote — see
`DESIGN_SYSTEM.md`'s "AI should feel invisible" alongside this component's
job of making AI content *visibly distinct*; the two aren't in tension —
invisible in tone, distinct in provenance.

### Timeline

Props: `steps` — an array of `{ key, label, done, active }`. Renders a
horizontal sequence of dots and labels; `done` fills the dot and the
connecting line, `active` colors the current step amber. Only one real
call site (`RequestDetailSheet`), but it's the only component in the
library modeling a real state machine (request status progression) rather
than static content.

---

## Contribution process

Before creating a new component, ask: **can an existing one be extended
safely?** If yes, extend it — don't duplicate a pattern that already
exists. This was `DESIGN_SYSTEM.md`'s "Component Philosophy" section;
it lives here now because it's a process, not a permanent principle.

A new component is justified when:

- No existing primitive or domain component can represent the content
  without contorting its slots (see `JobCard`'s slot-based design as the
  model for "genuinely different content, same chrome").
- The pattern will realistically recur (two or more call sites) — a
  one-off doesn't need a component, it needs a comment explaining why it's
  bespoke.

A new component is **not** justified when the real need is a new
`Badge` tone, `Button` variant, or `PriceTag` size — extend the existing
component's variant set instead of building a parallel one.

## Deprecation process

Not yet needed — nothing in this library has been deprecated. When it is:
mark the component's status here as `Deprecated`, keep it exported and
working until every real call site has migrated (grep the real usage
count in the Index table above before removing anything — it's kept
current for exactly this reason), then remove it in its own change, not
bundled with unrelated work.

---

Version 1.0 — 2026-08-05

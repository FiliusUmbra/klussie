# Iconography

**This document owns:** icon library, sizing, color rules, and the
process for the day Lucide doesn't have what's needed. It does not own
component-level layout (`COMPONENT_LIBRARY.md`) or color token values
(`DESIGN_TOKENS.md`) — it references both rather than restating them.

---

## Library

**Lucide** (`lucide-react`), and only Lucide — confirmed via a full sweep
of `src/`: no `react-icons`, `@heroicons`, or any other icon package is
imported anywhere. **Status: Implemented**, matching `DESIGN_SYSTEM.md`'s
"never mix icon libraries" rule with no exceptions found.

## Real icon inventory

32 distinct icons in real use, imported in four places:

| Imported in | Icons |
|---|---|
| `src/App.jsx` | `Search`, `Star`, `MapPin`, `ChevronRight`, `X`, `Check`, `User`, `Home`, `ClipboardList`, `MessageCircle`, `Send`, `Briefcase`, `TrendingUp`, `ThumbsUp`, `Clock`, `ShieldCheck`, `Globe`, `BadgeCheck`, `LogOut`, `Mail`, `Lock`, `Camera`, `Mic`, `Sparkles`, `Loader2`, `AlertTriangle` (26) |
| `src/lib/catalog.js` | `Sparkles`, `Truck`, `Hammer`, `Wrench`, `BookOpen`, `PartyPopper`, `BadgeCheck`, `MoreHorizontal` — the category-icon map, converting a DB string column back into a component | +6 new |
| `src/design-system/domain.jsx` | `Sparkles`, `BadgeCheck` (both reused, not new) | — |
| `src/design-system/overlays.jsx` | `X` (reused) | — |
| `src/design-system/primitives.jsx` | `Star` (reused) | — |

`Sparkles` and `BadgeCheck` are the two icons that cross the
app/design-system boundary, appearing in both `App.jsx` and
`domain.jsx` — worth knowing if either is ever renamed or swapped.

## Sizing

**No formal size scale exists.** The real, currently-in-use values, sorted:

`11px · 12px · 13px · 14px · 15px · 16px · 17px · 18px · 20px · 22px ·
26px · 30px`

Twelve distinct sizes for icons that are functionally either "inline with
text" (11–15px), "standalone UI icon" (16–22px), or "large/decorative"
(26–30px, e.g. the star-picker's rating stars). A real 3-4 step scale
(`xs / sm / md / lg`) is the clear candidate here, same pattern already
flagged for radius, font-size, and z-index in `DESIGN_TOKENS.md` — this
document doesn't pick those steps, since that's a token decision, not an
icon-usage one.

## Color

The real, observed pattern — not a rule invented for this document:

- **Semantic/brand icons** set color explicitly: `color="var(--forest)"`
  for category tiles, conditional `var(--amber)` / `var(--line-strong)`
  for filled vs. empty rating stars (see `Rating` in
  `COMPONENT_LIBRARY.md`).
- **Chrome icons** (close buttons, chevrons, nav icons) mostly inherit
  `currentColor` from their parent's `color` — no explicit `color` prop,
  relying on the surrounding text/button color.
- No icon anywhere uses a color outside the forest/sage/amber/ink family —
  confirmed during the same sweep that found the icon inventory above.

## Custom icon process

**Planned — not applicable today.** Every icon need so far has been met
by Lucide's existing set. When one isn't: match Lucide's own visual
weight (their `strokeWidth={1.5}`–`{2}` range, already used for the
`Rating` stars) rather than introducing a differently-weighted icon that
would visually clash with the other 31.

## Accessibility for icon-only controls

A sweep of every icon-only interactive element (a button whose only
content is an icon, no visible text) found:

| Control | Location | Status |
|---|---|---|
| `Drawer` close button | `overlays.jsx` | **Fixed in this pass** — now has `aria-label="Close"`, matching `Modal` |
| `Modal` close button | `overlays.jsx` | Already had `aria-label="Close"` |
| Photo-remove button (×2 call sites) | `App.jsx`, `.photo-remove-btn` | No accessible name — flagged for `ACCESSIBILITY.md` (Phase 6) |
| Avatar upload button | `App.jsx`, `.avatar-upload` | No accessible name (a labeled text button sits next to it doing the same thing, but the icon-only one alone has none) — flagged for Phase 6 |
| Star-picker rating buttons (×5) | `App.jsx`, `.star-picker` | No accessible name indicating which star value each button sets — flagged for Phase 6 |

The `Drawer` fix landed here because it's one of the 14 cataloged design
system components (`COMPONENT_LIBRARY.md`'s job). The other four are raw
`App.jsx` markup, not design-system components — in scope for the
dedicated accessibility audit, not this document, so they're recorded
here as a starting list rather than fixed piecemeal.

---

Version 1.0 — 2026-08-05

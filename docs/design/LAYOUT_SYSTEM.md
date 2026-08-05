# Layout System

**This document owns:** how tokens (`DESIGN_TOKENS.md`) and components
(`COMPONENT_LIBRARY.md`) compose into actual screens — grid, page
templates, and layering. It does not own breakpoints or cross-device
adaptation — that's `RESPONSIVE_SYSTEM.md` (Phase 6), and the boundary is
deliberate: this document covers composition *within* the single width
the product renders at today; `RESPONSIVE_SYSTEM.md` covers what happens
across widths, once there's more than one to design for.

---

## The real page template

Every screen in the app is built from the same five nested layers,
outside-in:

```
.stage      full-viewport dark backdrop, centers everything (demo shell only)
  .phone    the 390px device-frame mockup
    .screen   flex column, fills the phone below the status bar
      .view     flex:1 flex column — the actual screen content lives here
        .content  flex:1, overflow-y:auto — the scrollable region
          .pad      18px 20px 30px padding — where real content starts
```

This isn't a documented convention that components are expected to
follow — it's the literal, consistent structure of every screen in
`src/App.jsx` today. Naming it here is what turns it from an implicit
habit into a real pattern the next screen can be checked against.

`BottomNav` sits outside `.content`, pinned to the bottom of `.screen` —
the one persistent piece of chrome across every tab (4 items for
customers: Discover/Requests/Messages/Profile; 4 for pros:
Dashboard/My Jobs/Messages/Profile).

## Grid

**No formal grid system exists.** Exactly two `display:grid` declarations
in the entire codebase, both fixed, single-purpose layouts:

- `.grid2` — a 2-column grid (`1fr 1fr`), used for the Discover screen's
  service tiles.
- `.portfolio-grid` — a 3-column grid (`repeat(3, 1fr)`), used for
  portfolio photo thumbnails.

Two fixed grids for two specific contexts, not a reusable column system.
Same honest gap already flagged for radius, type scale, and z-index in
`DESIGN_TOKENS.md` — a real grid system is a candidate for future work,
not something this document invents on the spot.

## Spacing composition

The `--space-1` through `--space-6` tokens exist (`DESIGN_TOKENS.md`) but
have zero real usages — every margin and gap in the app is still an ad
hoc pixel value chosen per-selector. This document doesn't retrofit them;
that's real, separate work once someone owns doing it screen by screen.

The one composition rule that *is* real and consistent: `.pad`'s
`18px 20px 30px` is the single entry point for content padding across
every screen — nothing adds its own top-level padding on top of it.

## Page templates by role

Three real, distinct top-level shells, not one generic template forced
onto every context:

- **Customer**: `Discover` → `RequestsList` → `MessagesList` → `CustomerProfile`, all sharing the five-layer structure above.
- **Pro**: `ProApp`'s `Dashboard` → `ProJobs` → `MessagesList` (shared component) → `ProProfile`.
- **Overlay**: `Drawer`/`Sheet` and `Modal` (`COMPONENT_LIBRARY.md`) — these don't follow the page template at all, they layer on top of it. See Z-index, below.

## Z-index / layering

Fully documented already in `DESIGN_TOKENS.md`'s Z-index table — six real
values (`0` through `60`), no collisions, not repeated here. The
composition rule this document adds: overlays (`Drawer`, `Modal`, `toast`)
always render as siblings of `.phone`'s content, absolutely positioned
over it — never nested inside `.content`'s scroll region, which is why
opening a sheet never fights with the page's own scroll position.

## Breakpoints

**Out of scope here — see `RESPONSIVE_SYSTEM.md` (Phase 6).** There is
exactly one width in the entire product today: the 390px phone mockup.
This document has nothing to say about breakpoints because none exist to
document; inventing a breakpoint scale in a document about *today's*
layout composition would be exactly the aspirational-fiction problem this
whole doc set has deliberately avoided elsewhere (`ENGINEERING_STANDARDS.md`'s
scorecard, `MASTER_CONTEXT.md`'s honest Repository Health). That
conversation belongs entirely to Phase 6.

---

Version 1.0 — 2026-08-05

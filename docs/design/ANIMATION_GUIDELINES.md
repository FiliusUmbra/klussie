# Animation Guidelines

**This document owns:** motion usage rules — choreography, reduced-motion
behavior, and which components move and why. It does not own the raw
timing values (`--motion-fast`/`--motion-base`, `DESIGN_TOKENS.md`'s job)
or the principle that motion should feel calm and purposeful
(`DESIGN_SYSTEM.md`'s Motion section, referenced here, not repeated).

Every rule below describes real CSS in `src/App.jsx` — there is no
animation library in this codebase (`DESIGN_TOKENS.md` already confirmed
`package.json` has none), so "the animation system" is, in full, four
`transition` declarations, two `:active` press states, and one
`@keyframes` block. This document is scoped to that reality.

---

## Timing reference

Two tokens exist (`DESIGN_TOKENS.md` is authoritative on the values):
`--motion-fast` for transform/press feedback, `--motion-base` for color
and shadow changes. The rule for choosing between them, observed from
real usage: **fast for anything that moves (`transform`), base for
anything that fades or recolors** (`background`, `color`,
`border-color`, `box-shadow`, `opacity`). Not a rule invented for this
document — every real declaration below already follows it.

## The complete real inventory

Four `transition` declarations exist in the entire codebase:

| Selector | Transition | Paired `:active` state |
|---|---|---|
| `.chip` | `background`, `color`, `border-color` — all `--motion-base` | none |
| `.btn-primary`, `.btn-secondary` | `transform` (`--motion-fast`), `opacity` (`--motion-base`) | `scale(0.98)`, `opacity:0.92` |
| `.svc-card`, `.ticket`, `.quote-card`, `.ds-card`, `.portfolio-thumb` | `box-shadow` (`--motion-base`), `transform` (`--motion-fast`) | `scale(0.98)`, `box-shadow:none` |
| `@keyframes ai-spin` (`.spin`) | `transform:rotate` — `0.9s linear infinite`, not tokenized | n/a — continuous, not a state transition |

That's the whole system. Everything else in the product — every overlay,
every badge, every icon, every piece of text — has zero animation.

## Choreography rules

Two real, deliberate patterns, and one real gap:

1. **Press feedback exists; hover does not.** Zero `:hover` rules exist
   anywhere in the codebase — a genuine mobile-first choice (the product
   has no pointer-hover concept on a touch device), not an oversight. If
   a desktop-optimized surface is ever built, this is the first thing
   that needs deciding, not assumed to already work.
2. **State changes transition; entrances and exits don't.** Cards animate
   their press state, buttons animate their press state — but `Drawer`,
   `Modal`, and the toast (the three overlay patterns that interrupt the
   whole screen) have **zero enter/exit animation**. They mount and
   unmount instantly via React with no CSS transition on opacity or
   transform. This is the single largest gap in the current motion
   system: the most emotionally significant moments in the product (a
   sheet sliding up, a modal appearing) currently have *less* motion
   polish than a card being pressed. Flagged as the clearest next target
   once this document moves from cataloging to prescribing.
3. **`ai-spin` is the one continuous animation** — a loading spinner, not
   a state transition, correctly exempted from the "fast for movement"
   rule above since it has no discrete start/end.

## Reduced-motion behavior

**Zero `prefers-reduced-motion` handling exists anywhere in the
codebase** — confirmed by a full sweep of `src/`. Every transition and
the one keyframe animation plays unconditionally, regardless of the
user's OS-level motion preference. This is a real, direct gap against
`DESIGN_SYSTEM.md`'s "motion respectful" accessibility line (originally
under this file's now-relocated Accessibility section) and
`PRODUCT_CONSTITUTION.md` Rule 6. It's flagged here rather than patched
in this pass because the correct fix — wrapping the token-driven
transitions in a `@media (prefers-reduced-motion: reduce)` block that
zeroes `--motion-fast`/`--motion-base` globally — is exactly the kind of
token-level, one-place fix `DESIGN_TOKENS.md`'s governance section
describes, and belongs with `ACCESSIBILITY.md` (Phase 6) rather than
being bolted on here as an afterthought.

## Component-specific state

| Has motion | Has none |
|---|---|
| `Button` (primary/secondary) | `Modal`, `Drawer` (entrance/exit — see above) |
| `.chip` filter buttons | `Badge`, `Avatar`, `PriceTag`, `Rating` |
| `ServiceCard`, `JobCard`/`.ticket`, `QuoteCard`, `Card`/`.ds-card`, portfolio thumbnails | `Timeline`, `AIMessage`, toast |
| The AI-analyzing spinner (`.spin`) | Everything else |

Cross-reference `COMPONENT_LIBRARY.md` for what each of these components
actually is — this table only tracks motion, not the rest of their specs.

---

Version 1.0 — 2026-08-05

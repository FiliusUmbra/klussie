# Responsive System

**This document owns:** breakpoints and cross-device adaptation. It does
not own composition within a single width (`LAYOUT_SYSTEM.md`'s job) or
touch-target sizing standards (`ACCESSIBILITY.md`'s job — this document
points to those real measurements rather than repeating them).

**Status: mostly a gap, documented honestly rather than padded out.** The
product renders at exactly one width today. This document says that
plainly rather than describing breakpoints that don't exist.

---

## The real current state

Confirmed by a full sweep of `src/App.jsx`: **zero `@media` queries exist
anywhere in the codebase.** Every screen renders inside `.phone`, a fixed
`width:390px` mockup frame (see `LAYOUT_SYSTEM.md`'s page template) —
there is no wide-viewport, tablet, or desktop layout, and no logic that
adapts to one. "Responsive design," as a system, doesn't exist yet — this
isn't a documentation gap, it's a real, accurate description of the
product.

**One thing that is real and correct:** `index.html`'s viewport meta tag
— `width=device-width, initial-scale=1.0` — the standard mobile-web
baseline, present and correctly configured. It just has nothing
responsive to activate yet.

## Breakpoint scale

**Planned.** No values exist to document. When real breakpoints are
designed, they belong here, referencing `DESIGN_TOKENS.md`'s spacing
scale for how content re-flows at each step — not invented in this
document ahead of the actual work.

## Mobile-first rules

Carried forward from `DESIGN_SYSTEM.md`'s original Responsive Philosophy
section, unchanged — principles, not yet backed by a real breakpoint
system to enforce them:

- Design mobile first. Scale upward.
- Never remove functionality on mobile.
- Support one-handed interaction.
- Large touch targets.
- Comfortable spacing.

**Reality check against the last two:** `ACCESSIBILITY.md`'s Touch
Targets audit found the four measured icon-only controls
(`.sheet-close`, `.modal-close`, the chat send button, `.photo-remove-btn`)
all fall short of the 44×44px standard — 28px, 28px, 38px, and 20px
respectively. "Large touch targets" is the stated principle; the measured
reality doesn't meet it yet. Not re-measured or re-argued here — see
`ACCESSIBILITY.md` for the numbers and why they weren't resized in that
pass.

## Touch target minimums

Owned in full by `ACCESSIBILITY.md` (the real measurements, the 44px
standard they're checked against, and why fixing them is a real per-control
design decision, not a token change) — referenced here rather than
duplicated, per this document set's "single responsibility per document"
rule.

## What "responsive" will actually require

Named honestly, not solved: the entire page template
(`LAYOUT_SYSTEM.md`'s five-layer `.stage → .phone → .screen → .view →
.content → .pad` structure) is built around being a fixed-width mockup
*inside* a centered demo shell — `.stage` itself is `min-height:100vh`
with the phone centered in it via flexbox, not a layout meant to hold
real content at a wide viewport. Making the product genuinely responsive
isn't just "add breakpoints to `.pad`'s padding" — it's very likely
retiring the phone-mockup shell itself in favor of a real top-level
layout, which is why this is sequenced as its own roadmap phase (5, in
`MASTER_CONTEXT.md`'s numbering) rather than folded into this
documentation pass.

---

Version 1.0 — 2026-08-05

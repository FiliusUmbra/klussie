# Klussie Design System

> This is the constitution tier — permanent design philosophy. It does
> **not** contain implementation detail (token values, component specs,
> motion curves, layout rules, copy rules) — that lives in the companion
> documents indexed at [`docs/design/README.md`](./README.md).
>
> It does not define product philosophy (see `../PRODUCT_CONSTITUTION.md`)
> or implementation status (see `../MASTER_CONTEXT.md`).

**This document owns:** why Klussie looks and feels the way it does —
brand personality, design principles, inspiration, and the small set of
permanent rules every companion document and every component must satisfy.
It does not own *how* — tokens, components, patterns, motion, layout,
accessibility, and copy each have their own document, one responsibility
each.

---

# Status

**Locked** — Design Direction Lock, 2026-08-05.

This design direction supersedes any drift toward generic SaaS or
dashboard aesthetics. The goal is evolution, not redesign.

---

# Design Mission

Klussie should become the world's most trusted and effortless platform for
finding professional help.

Every visual decision should reinforce:

- Trust
- Simplicity
- Warmth
- Premium quality
- Human-centered design

These values always take precedence over design trends.

---

# Brand Personality

Klussie should feel:

- Warm
- Human
- Trustworthy
- Premium
- Calm
- Helpful
- Elegant
- Approachable
- Optimistic

Never:

- Corporate
- Cold
- Futuristic
- "AI-first" visually

Artificial Intelligence should feel invisible.

---

# Emotional Goal

When someone opens Klussie they should immediately feel:

"I trust this platform."

"I know exactly what to do."

"This feels effortless."

Never:

"This looks like business software."

---

# Design Principles

Every interface should follow these principles.

## Invisible Complexity

Complexity belongs behind the scenes. The interface should always feel
simple.

---

## Progressive Disclosure

Only show information when it becomes useful. Never overwhelm the user.

---

## Recognition over Recall

Users should recognize interactions. Never require users to remember
workflows. Prefer familiar patterns.

---

## Calm Technology

Technology should reduce stress. Notifications help. Animations reassure.
AI quietly assists. Nothing competes for attention.

---

## Trust Through Transparency

Users should always understand:

- What is happening
- Why it is happening
- What happens next

Never surprise users.

---

# Design Inspiration

Inspired by:

- Airbnb
- Apple
- Stripe
- Headspace
- Notion

Avoid becoming:

- Linear
- GitHub
- Vercel Dashboard
- Supabase Studio
- Generic Tailwind Admin Templates

We borrow principles. We do not imitate products.

---

# Visual Identity

## Evolve — Don't Redesign

| Keep | Reduce | Increase |
|------|---------|----------|
| Warm palette | Heavy borders | Breathing room |
| Organic shapes | Visual noise | Premium spacing |
| Premium typography | Excessive paper effects | Visual hierarchy |
| Friendly illustrations | Decoration | Subtle shadows |
| Generous whitespace | | Calm motion |

The token values, component specs, and current implementation status that
satisfy this table live in `DESIGN_TOKENS.md` and `COMPONENT_LIBRARY.md`
(both planned — see `docs/design/README.md`), not here.

---

# Color Philosophy

Colours communicate trust.

Primary — Forest Green

Secondary — Warm Sage

Accent — Golden Amber

Avoid:

- neon
- purple AI gradients
- highly saturated blues

Exact values, naming, and scale: `DESIGN_TOKENS.md` (planned).

---

# Typography

Fraunces — use only for hero titles, marketing, onboarding, important
headings.

Inter — use for interface, forms, navigation, content.

IBM Plex Mono — use only for IDs, prices, AI confidence, diagnostics,
timestamps.

Sizes, weights, and the full type scale: `DESIGN_TOKENS.md` (planned).

---

# Component Litmus Test

Every component must answer YES to all three.

✓ Does this increase trust?

✓ Does this reduce cognitive load?

✓ Does this feel effortless?

If any answer is NO, redesign it.

The component contribution process (extend vs. create new) lives in
`COMPONENT_LIBRARY.md` (planned).

---

# Final Rule

Never redesign Klussie to follow trends.

Every visual decision must improve at least one of:

- Trust
- Usability
- Accessibility
- Performance
- Clarity

If it improves none, it does not belong in Klussie.

---

# Companion Documents

Photography, icons, motion, component philosophy, form philosophy,
authentication patterns, accessibility, design tokens, AI interaction
patterns, microinteractions, and responsive rules all used to live inline
in this file. They now live in dedicated documents under
[`docs/design/`](./README.md), one responsibility each — see that index
for what exists today versus what's still planned.

---

Version 1.1 — trimmed to constitution scope

Locked

2026-08-05

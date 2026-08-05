# Design Documentation

**This document owns:** the index and reading order for everything under
`docs/design/`. It does not contain design content itself — see
[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) for that.

Updated at the end of every implementation phase — see the roadmap this
architecture was built from for the phase sequence. Status uses the same
vocabulary as the rest of the doc set: **Implemented**, **In Progress**,
**Planned**.

## Documents

| Document | Purpose | Phase | Status |
|---|---|---|---|
| [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) | Constitution — brand personality, principles, inspiration, the litmus test | 1 | Implemented |
| [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md) | Every real token: color, spacing, radius, shadow, motion, type | 2 | Implemented |
| [`COMPONENT_LIBRARY.md`](./COMPONENT_LIBRARY.md) | The real components — API, states, variants, accessibility, tokens used | 3 | Implemented |
| [`ICONOGRAPHY.md`](./ICONOGRAPHY.md) | Icon library, sizing, color, custom-icon process | 3 | Implemented |
| [`UX_PATTERNS.md`](./UX_PATTERNS.md) | Flows composed from components — onboarding, states, AI, authentication | 4 | Implemented |
| [`COPY_GUIDELINES.md`](./COPY_GUIDELINES.md) | Voice, tone, microcopy, terminology glossary | 4 | Implemented |
| [`LAYOUT_SYSTEM.md`](./LAYOUT_SYSTEM.md) | Grid, spacing composition, page templates, z-index | 4 | Implemented |
| [`ANIMATION_GUIDELINES.md`](./ANIMATION_GUIDELINES.md) | Easing, duration, choreography, reduced-motion | 5 | Implemented |
| [`ILLUSTRATION_GUIDELINES.md`](./ILLUSTRATION_GUIDELINES.md) | Photography direction today; illustration once it exists | 5 | Implemented |
| [`ACCESSIBILITY.md`](./ACCESSIBILITY.md) | WCAG target, keyboard/screen-reader rules, contrast audit | 6 | Implemented |
| [`RESPONSIVE_SYSTEM.md`](./RESPONSIVE_SYSTEM.md) | Breakpoints, touch targets — honestly, mostly a gap today | 6 | Implemented |
| [`WHITE_LABEL.md`](./WHITE_LABEL.md) | Theming/token-override strategy for the roadmap's white-label phase | 7 | Implemented |
| `DESIGN_GOVERNANCE.md` | Roles, change process, versioning, review cadence | 8 | Planned |

## Reading order by role

- **Designer, first time here:** `DESIGN_SYSTEM.md` → `DESIGN_TOKENS.md` → `COMPONENT_LIBRARY.md` → `UX_PATTERNS.md`.
- **Engineer implementing a screen:** `COMPONENT_LIBRARY.md` → `DESIGN_TOKENS.md` → `LAYOUT_SYSTEM.md` → `ACCESSIBILITY.md`.
- **Writing copy:** `DESIGN_SYSTEM.md` (Brand Personality, Emotional Goal) → `COPY_GUIDELINES.md`.
- **AI session, any task touching UI:** `DESIGN_SYSTEM.md` first, always — then whichever companion document matches the task.

## Outside this folder

- [`../MASTER_CONTEXT.md`](../MASTER_CONTEXT.md) — current project state, architecture, roadmap.
- [`../PRODUCT_CONSTITUTION.md`](../PRODUCT_CONSTITUTION.md) — permanent product philosophy (this folder's product-level counterpart).
- [`../ENGINEERING_STANDARDS.md`](../ENGINEERING_STANDARDS.md) — enforceable code rules.

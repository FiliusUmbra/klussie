# White Label

**This document owns:** the theming/token-override strategy for the
architecture roadmap's White Label phase (`MASTER_CONTEXT.md`'s Phase 12
— the "City of Brussels, powered by Klussie" scenario, 12 roadmap phases
out from where the product is today). It does not own tenant-management
product features, billing, or provisioning — none of that exists, and
none of it is invented here.

**Status: stub, deliberately.** A full sweep of `src/` and
`supabase/migrations/` found **zero existing tenant, white-label, or
multi-brand infrastructure anywhere** — not partially built, not
scaffolded, genuinely nothing. Writing a detailed tenant-configuration
spec now would front-run a roadmap phase that hasn't been scoped yet,
which is exactly the aspirational-fiction problem this whole documentation
set has avoided elsewhere (`RESPONSIVE_SYSTEM.md`, `MASTER_CONTEXT.md`'s
Repository Health). This document states the real strategy in outline and
stops there.

---

## Theming architecture

**Planned**, but not speculative — the mechanism already exists in
miniature, working, today. `DESIGN_TOKENS.md` documents the real,
shipping pattern:

```css
.phone.lang-ar{ --font-body:'Noto Sans Arabic', sans-serif; --font-display:'Noto Sans Arabic', sans-serif; }
.phone.lang-zh{ --font-body:'Noto Sans SC', sans-serif; --font-display:'Noto Sans SC', sans-serif; }
```

A class-scoped selector redefining the same token names the rest of the
app already reads from `:root`. White-labeling is the same idea at a
different axis: instead of a `.lang-ar` class swapping type tokens per
*locale*, a `.tenant-{id}` class (or a data attribute, `[data-tenant]`)
would swap color/type/radius tokens per *deployment* — `--forest` becomes
the City of Brussels' brand color, `--font-display` becomes whatever they
require, and every component that already reads from `var(--forest)`
instead of a hardcoded hex needs zero changes.

This is exactly why `DESIGN_TOKENS.md`'s governance rule ("every value
should reference a token — never hardcode a color, radius, or type
choice") matters beyond internal consistency: it's the actual
precondition for white-labeling ever being possible without a rewrite.
The "not yet tokenized" items that document lists (a few hardcoded hex
values, the un-tokenized overlay shadows) are the concrete, current gap
between today's codebase and a themeable one.

## What can be themed vs. what's protected

Not a new rule — restating `DESIGN_SYSTEM.md`'s Protected Decisions in
the one place they matter most for this phase: **tokens are themeable,
principles are not.** A tenant deployment could reasonably override:

- Color tokens (`--forest`, `--sage`, `--amber` and their variants)
- Type tokens (`--font-display`, `--font-body`, `--font-mono`)
- Radius and shadow values, once those are tokenized (`DESIGN_TOKENS.md`
  flags both as currently ad hoc, not yet real tokens)

A tenant deployment could **not** reasonably override, regardless of
branding requirements:

- The Component Litmus Test (`DESIGN_SYSTEM.md`) — trust, cognitive load,
  effortlessness aren't negotiable per-tenant
- The AI visual rules (no purple, no neon, no glowing borders, no
  robot aesthetics) — a municipal deployment doesn't get to make AI look
  like a chatbot any more than the main product does
- Copy voice (`COPY_GUIDELINES.md`) — transparency about what's real
  ("Demo only," "not verified") isn't a tone a tenant opts out of

## Tenant configuration model

**Planned.** No schema, no provisioning flow, no per-tenant data model
exists. When this phase actually starts, the real design questions are:
one tenant per subdomain vs. per custom domain, how deep theming goes
(tokens only, or layout/copy too), and whether `feature_flags`
(`supabase/migrations/0010_phase1_foundation.sql`, already real — see
`MASTER_CONTEXT.md` §2) is the right foundation to extend for per-tenant
feature gating rather than building a parallel system. Not answered here
— naming the real questions is this stub's job, not answering them ahead
of the work.

---

Version 1.0 — 2026-08-05

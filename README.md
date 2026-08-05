# 🏡 Klussie

> AI-powered operating system for trusted professional services.

A customer describes a problem — by text, speech, or photo. AI understands
it, builds a structured work order, and matches a trusted professional. No
category picker, no jargon, no comparing ten providers by hand.

> **Describe your problem. We'll handle the rest.**

**This document owns:** the public introduction to Klussie — what it is,
current status at a glance, and how to run the code. Deeper detail lives in
`docs/` (see Documentation, below).

## Status

Early-stage. **Phase 1 (Foundation) is in progress** — not production-ready,
no real payments yet. For the live, honest status dashboard (current
milestone, architecture status, risks, technical debt), see
**[`docs/MASTER_CONTEXT.md`](./docs/MASTER_CONTEXT.md) — start there, not here.**

## Vision

Klussie isn't just a handyman app — it's meant to become the operating
system for trusted professional services, across many verticals and
countries. Full vision: [`docs/MASTER_CONTEXT.md` §5, Product Vision](./docs/MASTER_CONTEXT.md#5-product-vision).

## What's real today vs. planned

| Capability | Status |
|---|---|
| AI job intake (voice, text, photo → structured request) | Implemented |
| Live chat with AI message translation | Implemented |
| Reviews, reputation score, pro portfolios/testimonials | Implemented |
| Location-based matching, pause profile, report a business | Implemented |
| Payments (Stripe Connect) | Planned |
| Professional identity/insurance verification | Planned |
| Push/email/SMS notifications | Planned |
| Configurable category taxonomy | Planned — categories are hardcoded today |

Full breakdown: [`docs/MASTER_CONTEXT.md` §3, Current State](./docs/MASTER_CONTEXT.md#3-current-state).

## Tech stack

- **Frontend:** Vite + React 19, plain JS/JSX (no TypeScript yet), hand-written CSS via custom properties (no Tailwind, no Framer Motion)
- **Backend:** Vercel serverless functions (`api/*.js`) + Supabase (Postgres, Auth, Storage, Realtime) — **not** Supabase Edge Functions
- **AI:** Anthropic Claude, routed through a capability-based AI Gateway (`api/_lib/aiGateway.js`) — no component calls a provider directly
- **Payments:** none integrated yet (Stripe Connect is planned)
- **Hosting:** Vercel

## Repository structure

```
api/                Vercel serverless functions
  _lib/             Core Platform modules (auth, rate limiting, AI Gateway, events)
ai/                 AI prompt library (prompt.md + evaluation.md per capability)
docs/               Governance & architecture documentation
src/
  App.jsx           Main application (customer + professional experiences)
  lib/              Data access and business logic
  design-system/    Shared UI components
supabase/
  migrations/       Database schema and RLS policies
marketing/          Separate Astro marketing site (klussie.be)
```

This is the canonical repository-structure reference — `MASTER_CONTEXT.md`
links here rather than repeating it.

## Documentation

Read in this order:

1. [`docs/MASTER_CONTEXT.md`](./docs/MASTER_CONTEXT.md) — single source of truth: current milestone, architecture status, priorities, risks, protected decisions
2. [`docs/PRODUCT_CONSTITUTION.md`](./docs/PRODUCT_CONSTITUTION.md) — non-negotiable product rules
3. [`docs/ENGINEERING_STANDARDS.md`](./docs/ENGINEERING_STANDARDS.md) — enforceable code rules + an honest scorecard
4. [`docs/design/DESIGN_SYSTEM.md`](./docs/design/DESIGN_SYSTEM.md) — visual and interaction design direction, plus the rest of `docs/design/` for tokens, components, and patterns as they land

`ARCHITECTURE.md`, `AI_ARCHITECTURE.md`, `API_SPEC.md`, `SECURITY.md`, and
`MONETIZATION.md` are planned but not written yet — don't assume they exist.

## Getting started

```bash
npm install
npm run dev
```

Requires a Supabase project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
and an `ANTHROPIC_API_KEY` in `.env.local` — see `.env.local.example`. AI
endpoints (`api/*.js`) only run under `vercel dev`, not plain `vite dev`.

```bash
npm run build   # production build
npm run lint    # eslint
```

## Contributing

Every change should satisfy `docs/PRODUCT_CONSTITUTION.md` and
`docs/ENGINEERING_STANDARDS.md`. There's no separate `CONTRIBUTING.md` yet.

---

Built to remove every barrier between people with problems and the
professionals who can solve them.

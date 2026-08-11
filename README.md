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
| My Home — property timeline derived from real jobs, pros, reviews, photos | Implemented |
| My Items — household inventory entered by hand, with photos | Implemented |
| AI recognising an item from its photo | Planned — the schema and confirm-before-save flow exist (migration 0016); the recognition itself is not wired |
| Rooms, installations, documents, maintenance schedules | Planned — no schema yet (ADR-0008) |
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
  design/           Visual/interaction design system (13 docs + README)
  product/          Product philosophy, vision, UX exploration docs
  architecture/     Platform architecture review & roadmap
  engineering/      Enforceable engineering standards
  operations/       External setup & operational runbooks
  adr/              Architecture Decision Records
  features/         Feature-brief template, process, and briefs
src/
  App.jsx           Composition root (auth provider + shell)
  shell/            App chrome, locale, role preview, surface selection
  auth/             Sign-in and first-run role choice
  profile/          Profile editing, pro-profile setup (both sides)
  customer/         Customer experience: requests, quotes, intake, invoices
  pro/              Professional experience: leads, quoting, jobs
  messaging/        Conversations and message translation (both sides)
  requests/         How a request is summarised wherever it appears
  home/             The conversation homepage
  ui/               App-level primitives below the design system
  lib/              Data access, business rules, string tables
  design-system/    Shared UI components
supabase/
  migrations/       Database schema and RLS policies
marketing/          Separate Astro marketing site (klussie.be)
```

This is the canonical repository-structure reference — `MASTER_CONTEXT.md`
links here rather than repeating it.

## Documentation

Read in this order:

1. [`docs/AI_CONTEXT.md`](./docs/AI_CONTEXT.md) — the fast-onboarding briefing every AI session reads first
2. [`docs/MASTER_CONTEXT.md`](./docs/MASTER_CONTEXT.md) — single source of truth: current milestone, architecture status, priorities, risks, protected decisions
3. [`docs/product/PRODUCT_CONSTITUTION.md`](./docs/product/PRODUCT_CONSTITUTION.md) — non-negotiable product rules
4. [`docs/engineering/ENGINEERING_STANDARDS.md`](./docs/engineering/ENGINEERING_STANDARDS.md) — enforceable code rules + an honest scorecard
5. [`docs/design/DESIGN_SYSTEM.md`](./docs/design/DESIGN_SYSTEM.md) — visual and interaction design direction, plus the rest of `docs/design/` for tokens, components, and patterns as they land

Working on something specific? [`docs/READING_GUIDES.md`](./docs/READING_GUIDES.md)
has a role-based order (CEO/Product/Design/Frontend/Backend/AI/DevOps/QA)
that's more targeted than reading everything above top to bottom. Proposing
new work or wondering why a past decision was made a certain way:
[`docs/features/`](./docs/features/README.md) and
[`docs/adr/`](./docs/adr/README.md), respectively.

Full document index with status: `docs/MASTER_CONTEXT.md`'s Document
Map — don't assume a file exists just because it's mentioned in prose.

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

Every change should satisfy `docs/product/PRODUCT_CONSTITUTION.md` and
`docs/engineering/ENGINEERING_STANDARDS.md`. There's no separate
`CONTRIBUTING.md` yet.

---

Built to remove every barrier between people with problems and the
professionals who can solve them.

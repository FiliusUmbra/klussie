# AI_CONTEXT.md

> Read this first, in full, before touching anything. It's short on
> purpose — everything below points to where the real depth lives.

**This document owns:** the fast-onboarding briefing and session
behavior checklist for any AI working on Klussie. It does not own
current project status (`MASTER_CONTEXT.md`), permanent product
philosophy (`product/PRODUCT_CONSTITUTION.md`), or code-level rules
(`engineering/ENGINEERING_STANDARDS.md`) — this document sends you to
each of those rather than repeating them.

## What Klussie is

An AI-powered operating system for trusted professional services — not
a handyman app. A customer describes a problem by text, speech, or
photo; AI understands it, builds a structured work order, matches a
trusted professional, and manages the job through completion and
payment. No category picker, no jargon, no manually comparing ten
providers. The long-term ambition is multi-vertical and multi-country;
today it's a Belgian home-services marketplace with a genuinely
differentiated, already-shipped AI layer (multimodal job intake,
real-time chat translation across 10 languages).

## The rules that cannot be broken

This is a fast summary, not the source of truth — see
`product/PRODUCT_CONSTITUTION.md` for the full Rules and Principles, and
`MASTER_CONTEXT.md` §17 for the full Protected Decisions list. Both
evolve; this list is deliberately short and stable:

- **AI before forms.** If AI can remove a click or a form, remove it.
- **Never hardcode business logic.** Categories, pricing rules,
  thresholds are data, not source code, once the Marketplace Engine
  exists — today's hardcoded catalog is a tracked exception, not a
  precedent.
- **Never bypass the AI Gateway** (`api/_lib/aiGateway.js`) or call an
  AI provider directly from anywhere else. Never expose an AI provider
  key client-side.
- **Never use the Supabase service-role key in a user-facing request
  path.** Server code authenticates as the calling user; RLS does the
  rest.
- **Never put business logic in UI components** — commission math,
  trust-score computation, matching rules belong in `src/lib` or a Core
  Platform module.
- **Every feature must serve a Product Principle and move a Product
  KPI** (Constitution Rule 10) — "it seemed useful" is not sufficient.
  See `features/README.md` before proposing new work.
- **Trust beats growth.** No fake urgency, no unearned trust badges, no
  growth tactic that costs the platform's credibility.
- **Never redesign the product because something looks more modern** —
  see `design/DESIGN_SYSTEM.md`'s Final Rule (ADR-0006).

## How this repository is organized

```
docs/
  AI_CONTEXT.md        You are here.
  MASTER_CONTEXT.md     Current state — read this next, always.
  product/              Philosophy, vision, homepage/UX exploration
  engineering/           Enforceable code rules, threat model
  architecture/          System architecture, AI internals, API spec, roadmap
  design/                Visual/interaction design system (own README)
  operations/            External setup, runbooks
  adr/                   Why past decisions were made this way (own README)
  features/              Template + briefs for proposing new work (own README)
```

Full index with status: `MASTER_CONTEXT.md`'s Document Map. Don't
assume a file exists because it's referenced in prose — check the
Document Map's status column first.

## Read next, based on what you're doing

- **Anything at all, right after this** → `MASTER_CONTEXT.md` — current
  milestone, what's actually implemented vs. planned, current
  priorities and blockers. This document goes stale fast if skipped;
  never assume you already know the current state.
- **Touching UI** → `design/DESIGN_SYSTEM.md`, then `design/README.md`
  for which companion document applies.
- **Touching the data model, an API endpoint, or the AI Gateway** →
  `architecture/ARCHITECTURE.md`, `architecture/AI_ARCHITECTURE.md`,
  `architecture/API_SPEC.md`.
- **Proposing a new feature** → `features/README.md` and
  `features/TEMPLATE.md` — before writing code, not after.
- **Wondering why something is built the way it is** → `adr/README.md`
  — check there before assuming a past decision was an oversight.
- **Planning what's next** → `architecture/ROADMAP.md` — 13 phases,
  sequenced deliberately; don't skip ahead without understanding why
  the order is what it is (see ADR-0005 for the clearest example of why
  sequencing itself was a real decision).

## How to behave in a session

1. Read `MASTER_CONTEXT.md` next, in full.
2. Read `product/PRODUCT_CONSTITUTION.md` and
   `engineering/ENGINEERING_STANDARDS.md`.
3. Review the existing code before proposing changes — don't assume a
   document is more current than the code; `MASTER_CONTEXT.md` §3 says
   plainly that the code is the tiebreaker when they disagree.
4. Explain proposed changes before implementing them.
5. Implement only the approved scope — not adjacent scope that seemed
   convenient to fix while you were in there.
6. Update documentation, including `MASTER_CONTEXT.md`, if reality
   changed as a result of your work.
7. Stop. Don't keep going past what was asked or approved.

Never redesign an existing system without justification. Never trust a
"current state" claim in any document, including this one, without
checking `MASTER_CONTEXT.md` §3 — documents drift, the code doesn't
lie.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 6)

# Klussie — Role-Based Reading Guides

**This document owns:** which documents matter most for which role, and
in what order, now that the doc set is large enough that "read
everything" is no longer realistic advice. It does not own the
documents themselves — every link below points to the file that owns
that content; nothing is duplicated here.

## Why this exists

`AI_CONTEXT.md` and `MASTER_CONTEXT.md` are read by everyone, every
time. Past that, a founder deciding whether to greenlight Phase 4 and a
backend engineer implementing Phase 1's Permissions layer need almost
entirely different depth from the rest of `docs/` — and neither should
have to read `ANIMATION_GUIDELINES.md` to figure that out. Pick the
role below closest to what you're doing; if you're doing more than one,
read more than one guide.

## Everyone, regardless of role

1. [`AI_CONTEXT.md`](./AI_CONTEXT.md) — the fast briefing, first, always.
2. [`MASTER_CONTEXT.md`](./MASTER_CONTEXT.md) — current state; the
   single thing most likely to have changed since you last read it.

Below this point, guides diverge.

---

## CEO / Founder

**You need:** business state, vision, risk, money, and why the roadmap
is sequenced the way it is — not implementation detail.

1. [`README.md`](../README.md) — the 30-second pitch and status.
2. `MASTER_CONTEXT.md` §1 (Executive Summary), §2 (Current Milestone),
   §5 (Product Vision), §13 (Risks), §14 (KPIs).
3. [`product/PRODUCT_CONSTITUTION.md`](./product/PRODUCT_CONSTITUTION.md)
   — the Product Principles section specifically; this is the *why*
   behind every later prioritization argument.
4. [`product/MONETIZATION.md`](./product/MONETIZATION.md) — what's
   real (nothing, yet) and the five planned revenue streams.
5. [`architecture/ROADMAP.md`](./architecture/ROADMAP.md) — read the
   Executive Summary and the phase table; the full per-phase technical
   bodies are optional depth, not required reading for this role.
6. [`product/HOME_OPERATING_SYSTEM.md`](./product/HOME_OPERATING_SYSTEM.md)
   and [`product/PROPERTY_MEMORY.md`](./product/PROPERTY_MEMORY.md) —
   the long-term "why this compounds" argument, worth reading in full
   when thinking past the next funding/hiring milestone.

**Skip:** `ENGINEERING_STANDARDS.md`'s scorecard detail,
`ARCHITECTURE.md`/`AI_ARCHITECTURE.md`/`API_SPEC.md`'s technical depth,
`design/`'s token-level specifics.

---

## Product Manager

**You need:** what's actually shipped versus planned, the vocabulary
for prioritizing (Principles/KPIs), and the tool for proposing new
work.

1. `MASTER_CONTEXT.md` §3 (Current State), §8 (Current Priorities), §14
   (KPIs) — read these more carefully than the CEO guide does; this is
   your daily reference.
2. `product/PRODUCT_CONSTITUTION.md` in full — Rule 10 (every feature
   serves a Principle and moves a KPI) is the rule you enforce on every
   proposal that crosses your desk.
3. `architecture/ROADMAP.md` in full, including phase bodies — you need
   to know what's actually scoped for Phase 5 before promising it.
4. [`product/HOMEPAGE_CONCEPTS.md`](./product/HOMEPAGE_CONCEPTS.md),
   [`product/HOMEPAGE_DIRECTION.md`](./product/HOMEPAGE_DIRECTION.md),
   [`product/EXPERIENCE_VISION.md`](./product/EXPERIENCE_VISION.md) —
   the approved direction; don't re-litigate a decision already made
   here without a real reason.
5. [`features/README.md`](./features/README.md) and
   [`features/TEMPLATE.md`](./features/TEMPLATE.md) — this is your
   actual tool. Every feature you want built starts as one of these.
6. [`adr/README.md`](./adr/README.md) — skim the index; read the full
   ADR before proposing anything that would reverse one.

**Skip:** `AI_ARCHITECTURE.md`'s prompt-internals depth, `design/`'s
token values, `SECURITY.md`'s full threat model (know it exists, defer
to Backend/DevOps on depth).

---

## Design

**You need:** the full design system as the actual source of truth for
what you build, plus the approved product direction you're extending.

1. [`design/README.md`](./design/README.md) — the index and reading
   order for all 13 companion documents; follow its own phase order
   (1 → 8) rather than reading them in an arbitrary sequence.
2. [`design/DESIGN_SYSTEM.md`](./design/DESIGN_SYSTEM.md) — constitution
   tier; read this before any other design/ document.
3. The rest of `design/`: `DESIGN_TOKENS.md`, `COMPONENT_LIBRARY.md`,
   `ICONOGRAPHY.md`, `UX_PATTERNS.md`, `COPY_GUIDELINES.md`,
   `LAYOUT_SYSTEM.md`, `ANIMATION_GUIDELINES.md`,
   `ILLUSTRATION_GUIDELINES.md`, `ACCESSIBILITY.md`,
   `RESPONSIVE_SYSTEM.md`, `WHITE_LABEL.md`, `DESIGN_GOVERNANCE.md` —
   the last one is how you propose a change to any of the others.
4. `product/PRODUCT_CONSTITUTION.md`'s Design Constitution section —
   the brand-personality *why* behind `DESIGN_SYSTEM.md`'s *how*.
5. `product/HOMEPAGE_CONCEPTS.md` → `HOMEPAGE_DIRECTION.md` →
   `EXPERIENCE_VISION.md` — read in that order; it's the actual
   decision trail from three options to one approved direction.
6. [`adr/0006`](./adr/0006-design-direction-lock.md),
   [`0007`](./adr/0007-conversational-homepage-ia.md),
   [`0008`](./adr/0008-my-home-replaces-discover-tab.md) — the three
   ADRs design work is most likely to run into.

**Skip:** `ARCHITECTURE.md`/`API_SPEC.md`'s backend depth,
`SECURITY.md`, `MONETIZATION.md`.

---

## Frontend Engineer

**You need:** the client architecture, the design system as
implementation-ready spec, and the API contracts you call.

1. `MASTER_CONTEXT.md` §3 (Current State) and §6 (Architecture
   Overview).
2. [`engineering/ENGINEERING_STANDARDS.md`](./engineering/ENGINEERING_STANDARDS.md)
   in full, including the scorecard — know exactly which rules
   `App.jsx` currently violates and why, before adding to the pile.
3. `architecture/ARCHITECTURE.md`'s "Client architecture" section.
4. `design/DESIGN_SYSTEM.md` and `design/COMPONENT_LIBRARY.md` — the
   components you build with, and the litmus test for adding a new one.
5. [`architecture/API_SPEC.md`](./architecture/API_SPEC.md) — the real
   contracts of `api/ai-intake.js` and `api/translate-message.js`.
6. `features/TEMPLATE.md` — required before proposing new user-visible
   behavior.

**Skip:** `SECURITY.md`'s RLS-policy-writing depth (know the posture,
defer policy authorship to Backend), `AI_ARCHITECTURE.md`'s prompt
internals (unless you're building the calling UI for a new capability),
`MONETIZATION.md`.

---

## Backend Engineer

**You need:** the full data model, RLS posture, Core Platform layer
status, and the security/event-bus patterns every new endpoint must
follow.

1. `MASTER_CONTEXT.md` §3, §6, §7.
2. `engineering/ENGINEERING_STANDARDS.md` in full.
3. `architecture/ARCHITECTURE.md` in full — this is your primary
   reference, not a skim.
4. `engineering/SECURITY.md` in full — the RLS policy examples and
   threat-model table are the pattern every new table/endpoint follows.
5. `architecture/API_SPEC.md`.
6. [`architecture/AI_ARCHITECTURE.md`](./architecture/AI_ARCHITECTURE.md)
   — required if any work touches the AI Gateway, even indirectly.
7. [`adr/0001`](./adr/0001-capability-based-ai-gateway.md),
   [`0003`](./adr/0003-postgres-backed-rate-limiting.md),
   [`0004`](./adr/0004-domain-events-via-security-definer-rpc.md) — the
   backend-shaping decisions you'll otherwise be tempted to "fix" back
   to a more conventional pattern.
8. `architecture/ROADMAP.md`, especially Phases 1–3 (Foundation) — the
   sequencing logic you're building inside of.

**Skip:** `design/`'s token-level detail (know the Core Platform
boundary, not the hex values), `product/HOMEPAGE_CONCEPTS.md` and
sibling vision docs (aware of direction, not the owner).

---

## AI / ML Engineer

**You need:** the Gateway's internal contract, the real prompts, and
the evaluation discipline — this role sits closest to the product's
actual differentiator.

1. `architecture/AI_ARCHITECTURE.md` in full — this is your `MASTER_CONTEXT.md`.
2. The real prompt library: `ai/intake/prompt.md` +
   `ai/intake/evaluation.md`, `ai/translation/prompt.md` +
   `ai/translation/evaluation.md` — read the actual source, not just
   the document describing it.
3. `architecture/API_SPEC.md`'s `ai-intake`/`translate-message`
   sections — the contract your capability's output must satisfy.
4. `engineering/SECURITY.md`'s prompt-injection row — know the current,
   partial mitigation and its real limits.
5. `product/PRODUCT_CONSTITUTION.md` Rule 1 (AI before forms) and Rule
   8 (one source of truth — `SERVICE_QUESTIONS` is the canonical
   example of not maintaining a second copy of a schema for the AI).
6. `architecture/ROADMAP.md` Phases 9, 10, and 13 — where the AI
   Gateway's capability surface is expected to grow next.
7. [`adr/0001`](./adr/0001-capability-based-ai-gateway.md) — why the
   Gateway is capability-based rather than provider-based; read this
   before proposing anything that assumes "the model" rather than "the
   capability."

**Skip:** `design/`'s token specifics, `product/MONETIZATION.md`'s
detail.

---

## DevOps / Infrastructure

**You need:** deployment reality, the security posture, and exactly
what Phases 2 and 3 require before this role's job is actually done.

1. `MASTER_CONTEXT.md` §3 — the honest "no CI, no staging, production
   is the only environment" state.
2. `architecture/ARCHITECTURE.md`'s "Deployment topology" section.
3. `engineering/SECURITY.md` in full — this role owns closing several
   of its named gaps (no automated CVE scanning, no rehearsed
   disaster-recovery drill).
4. `architecture/ROADMAP.md` Phase 2 (Testing, CI, Types & Release
   Strategy) and Phase 3 (Disaster Recovery & Operational Resilience)
   in full detail — these two phases are largely this role's job.
5. `engineering/ENGINEERING_STANDARDS.md` — specifically the rules a CI
   pipeline is meant to enforce mechanically once Phase 2 ships.
6. [`adr/0003`](./adr/0003-postgres-backed-rate-limiting.md) and
   [`0005`](./adr/0005-testing-ci-disaster-recovery-before-payments.md)
   — an infrastructure choice and a sequencing decision that both
   belong to this role's judgment call.

**Skip:** `design/`, `product/`'s vision documents, `MONETIZATION.md`.

---

## QA / Testing

**You need:** what "correct" means for each surface, since there's no
automated test suite yet to read instead — this role is currently
defining that ground truth, not just running it.

1. `engineering/ENGINEERING_STANDARDS.md` — the scorecard shows exactly
   what's untested today; that's your backlog.
2. `ai/intake/evaluation.md` and `ai/translation/evaluation.md` — the
   only real test cases that exist in the repository right now; the
   pattern (input → expected shape, not exact-match) is the one to
   extend.
3. `architecture/API_SPEC.md` — the contracts to verify against,
   including every documented error status.
4. `engineering/SECURITY.md` — the threat-model table doubles as a
   probing checklist.
5. `architecture/ROADMAP.md` Phase 2 — the specific testing
   requirements named for the CI foundation this role will eventually
   run inside.
6. `features/TEMPLATE.md` — every new feature's "Testing requirements"
   field is written with this role as its reader; hold authors to
   specificity there, not "test thoroughly."

**Skip:** `design/`'s token values, `product/MONETIZATION.md`,
`product/`'s vision documents (aware only, not the owner of correctness
there).

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 7)

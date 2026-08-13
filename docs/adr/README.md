# Architecture Decision Records

**This document owns:** what an ADR is for in this repository, the
template every ADR follows, and the index of every ADR written so far.
It does not own the decisions' full reasoning (each numbered ADR file
owns its own) or current project status (`../MASTER_CONTEXT.md`).

## What goes here

An ADR records a real decision that was genuinely debatable — where a
different, reasonable choice existed and someone picked one on purpose,
for stated reasons. Not every change needs one. Write an ADR when:

- The decision would be expensive or awkward to reverse later.
- A future contributor (human or AI) could plausibly "fix" it back to
  the alternative without knowing why it was rejected.
- It sets a pattern other code is expected to follow (per
  `../product/PRODUCT_CONSTITUTION.md` Rule 8, one source of truth —
  the ADR is that one source once the decision is made).

Don't write one for a decision with no real alternative, or for
something that belongs in `../MASTER_CONTEXT.md` §16 (Open Decisions)
because it hasn't actually been made yet.

## Format

Individual ADRs deliberately don't use this repository's usual
"This document owns" + `Version X.Y` footer convention — that
convention is for documents that own an evolving domain of content;
an ADR owns one point-in-time decision and is never revised after the
fact (a changed decision gets a new, superseded-by ADR, not an edit).
Use the lighter Status/Date/Related header below instead. This is
intentional, not a gap — see the Implementation Readiness Review's
audit note if this ever looks like an oversight.

Each ADR is its own file, `NNNN-short-kebab-title.md`, numbered
sequentially and never renumbered or reused even if superseded:

```markdown
# ADR-NNNN: Title

**Status:** Proposed | Implemented | Superseded by ADR-NNNN
**Date:** YYYY-MM-DD
**Related:** file paths, other docs

## Context
What situation forced a choice, and what the real alternatives were.

## Decision
What was actually decided, stated plainly.

## Consequences
What this makes easier, what it makes harder, and what it rules out.
```

A superseded ADR is never deleted or rewritten — it stays as the
historical record of what was decided and why, with its `Status`
pointing at whatever replaced it.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-capability-based-ai-gateway.md) | Adopt a capability-based AI Gateway | Implemented |
| [0002](0002-warm-paper-ticket-design-language.md) | Keep the warm "paper ticket" design language for now | Superseded by [0006](0006-design-direction-lock.md) |
| [0003](0003-postgres-backed-rate-limiting.md) | Postgres-backed rate limiting instead of Redis | Implemented |
| [0004](0004-domain-events-via-security-definer-rpc.md) | Route domain events through `emit_domain_event()` RPC | Implemented |
| [0005](0005-testing-ci-disaster-recovery-before-payments.md) | Move Testing/CI/Disaster Recovery ahead of Payments in the roadmap | Implemented |
| [0006](0006-design-direction-lock.md) | Design Direction Lock: evolve the warm identity, reject the cooler SaaS-dashboard register | Implemented |
| [0007](0007-conversational-homepage-ia.md) | Conversational-first homepage over marketplace/category-grid IA | Implemented (design direction) |
| [0008](0008-my-home-replaces-discover-tab.md) | "My Home" replaces the Discover tab, not a new tab | Implemented (design direction) |
| [0009](0009-docs-folder-reorganization.md) | Reorganize `docs/` into category subfolders | Implemented |
| [0010](0010-defer-permissions-layer-formalization.md) | Defer Permissions layer formalization until Trust & Safety needs it | Implemented (deferral) |
| [0011](0011-trust-strip-shows-only-verified-signals.md) | The trust strip shows only signals backed by real data | Implemented |
| [0012](0012-one-tap-booking-commits-the-customer-not-the-professional.md) | One-tap booking commits the customer, not the professional | Proposed |
| [0013](0013-workspace-centred-platform-domain-model.md) | Adopt a workspace-centred platform domain model | Implemented (domain model) — extended by [0014](0014-capability-model-as-the-platform-organising-concept.md) |
| [0014](0014-capability-model-as-the-platform-organising-concept.md) | The Capability Model is the platform's organising concept | Implemented (domain model) — extended by [0015](0015-service-records-digital-twin-workflows-and-execution-strategies.md) |
| [0015](0015-service-records-digital-twin-workflows-and-execution-strategies.md) | Service Records, the Digital Twin, the Knowledge Graph, Workflows and Execution Strategies — architecture frozen at Version 1.0 | Implemented (domain model) |
| [0016](0016-operate-production-on-free-plan-without-automatic-backups.md) | Operate production on the Free plan, without automatic backups | Superseded by [0017](0017-free-tier-disaster-recovery-strategy.md) |
| [0017](0017-free-tier-disaster-recovery-strategy.md) | A self-managed disaster recovery strategy on the Free plan | Accepted |
| [0018](0018-restore-mode-suspend-triggers-during-logical-restore.md) | Restore Mode — suspend platform triggers during logical restores | **Proposed** — recorded, not implemented |
| [0019](0019-canonical-platform-event-envelope.md) | The canonical platform Event Envelope | Accepted — completes Platform Architecture v1.0 |
| [0020](0020-events-partitioning-parameters.md) | Eight hash partitions, yearly time ranges, and a default range partition | **Proposed** — implemented against an empty table; free to revise until the first event is written |

"Implemented (design direction)" means the decision governs approved
design documents but hasn't been built in application code yet — see
each ADR's own Status line for the distinction from decisions that are
live in production code.

---

Version 1.0 — 2026-08-06 (Foundation Freeze, Phase 4 — extracted from
`../MASTER_CONTEXT.md` §15, which previously held these inline)

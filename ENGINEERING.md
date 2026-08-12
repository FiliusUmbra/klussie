# Klussie — Engineering Operating Manual

**This document owns:** how work gets done on Klussie day to day — the
workflow, the conventions, the gates, and where everything lives. It is
the first thing an engineer (human or AI) reads before touching code.

It does **not** own: what to build ([`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md)),
code-level rules ([`docs/engineering/ENGINEERING_STANDARDS.md`](docs/engineering/ENGINEERING_STANDARDS.md)),
or any architecture — that is frozen and listed below.

---

## 1 · The map

| Question | Document |
|---|---|
| **How do I work?** | This file |
| **What do I build next?** | [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md) — the only source of truth for sequence |
| **How should the code look?** | [`docs/engineering/ENGINEERING_STANDARDS.md`](docs/engineering/ENGINEERING_STANDARDS.md) |
| **What is the platform?** | [`docs/architecture/PLATFORM_DOMAIN_MODEL.md`](docs/architecture/PLATFORM_DOMAIN_MODEL.md) — **frozen** |
| **How is it held as data?** | [`docs/architecture/DATABASE_ARCHITECTURE.md`](docs/architecture/DATABASE_ARCHITECTURE.md) — **frozen** |
| **How does the software behave?** | [`docs/architecture/SYSTEM_ARCHITECTURE.md`](docs/architecture/SYSTEM_ARCHITECTURE.md) — **frozen** |
| **How is it persisted?** | [`docs/architecture/SUPABASE_ARCHITECTURE.md`](docs/architecture/SUPABASE_ARCHITECTURE.md) — **frozen** |
| **Why is it built this way?** | [`docs/product/PRODUCT_CONSTITUTION.md`](docs/product/PRODUCT_CONSTITUTION.md) — **frozen** |
| **What was decided, and why?** | [`docs/adr/README.md`](docs/adr/README.md) |
| **What is the current state?** | [`docs/MASTER_CONTEXT.md`](docs/MASTER_CONTEXT.md) |
| **Where is work tracked?** | [`implementation/`](implementation/README.md) |

**The five frozen documents are never edited by implementation work.** If
reality diverges from them, that is an ADR (§7), not a documentation fix.

---

## 2 · The unit of work

Everything is a **work package** — roughly 1–3 hours, independently
testable, independently shippable, and leaving the application working.

> **The non-negotiable: the application is fully functional after every
> completed work package.** Not after every epic. After every package.

Work packages live in the roadmap (§11–§14 there) and are tracked in
`implementation/epic-NN/`. Their standard is roadmap §6; the template is
[`implementation/templates/WORK_PACKAGE.md`](implementation/templates/WORK_PACKAGE.md).

**One work package per session.** Finish it, verify it, report it, stop.
Do not roll into the next one.

---

## 3 · The loop

```
  Read           →  Branch        →  Implement    →  Verify
  epic + frozen     epic-NN/          the package     lint · test
  docs it cites     wp-NN.NN-slug     only            build · manual
                                                         │
  Merge          ←  Review        ←  Commit         ←────┘
  update docs       checklist         Epic NN WPnn:
```

**Read.** The epic definition, and the specific frozen sections it
references. Not the whole architecture — the parts that constrain this
package.

**Branch.** One branch per work package (§5).

**Implement.** Exactly the package's scope. Extend existing code before
rewriting it. Touch no unrelated module.

**Verify.** §4. Every gate, every time.

**Commit.** §5.

**Review.** [`implementation/templates/REVIEW_CHECKLIST.md`](implementation/templates/REVIEW_CHECKLIST.md).

**Merge.** Update the documents the epic owes (roadmap §9), tick the work
package in `implementation/epic-NN/`.

---

## 4 · Verification — run before every commit

```bash
npm run lint && npm test && npm run build
```

All three must pass. Once Work Package 00.03 lands, add:

```bash
npm run typecheck
```

**Plus, for the package's own scope:**

- Its acceptance criteria, checked literally rather than approximately.
- Its tests, added or changed — never "none" except where the roadmap
  explicitly permits it.
- Manual verification against `docs/engineering/TESTING.md` when the
  package touches a user-facing flow.

**A package is not done because the code is written.** It is done when
[`implementation/templates/DEFINITION_OF_DONE.md`](implementation/templates/DEFINITION_OF_DONE.md)
is satisfied.

---

## 5 · Conventions

### Branches

```
epic-NN/wp-NN.NN-short-slug        →  epic-00/wp-00.01-ci-pipeline
adr/NNNN-short-slug                →  adr/0016-workflow-migration
fix/short-slug                     →  fix/stale-scope-cache
```

Branch from `main` unless the roadmap says otherwise. One work package
per branch. Never commit directly to `main`.

### Commits

The existing convention, formalised — it is already in the history and is
kept for continuity:

```
Epic NN WPnn: <imperative summary>       Epic 00 WP01: add CI pipeline
Epic NN: <summary>                       Epic 00: engineering foundations
ADR-NNNN: <decision title>               ADR-0016: workflow definitions replace triggers
```

**Rules.** Imperative mood. Lower case after the colon. No trailing full
stop. Body explains *why* when the change is not self-evident; the
diff already explains *what*.

Every commit ends with:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

**Never** commit or push unless asked. **Never** use `--no-verify`.

### Pull requests

Use [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).
One work package per PR. The PR is green or it does not merge.

---

## 6 · The rules that are not negotiable

From roadmap §4. Quotable in review; violating one is a finding, not a
style preference.

**Architecture**

1. No architectural drift — the five frozen documents are the only source
   of truth.
2. No engine bypasses another engine; no direct writes into another
   engine's aggregates.
3. Business rules belong in workflow definitions — not triggers, not
   components, not data-access modules.
4. Permissions belong to the Workspace and Capability engines.
5. AI never owns business rules.
6. **Never branch on workspace type.** Branch on capability.

**Code**

7. Extend before rewriting.
8. No duplicate business logic.
9. No feature-specific implementations of a general concept.
10. No temporary hacks. A genuinely necessary shortcut is an ADR with a
    removal trigger, not a comment.
11. No component over 300 lines, no function over 40.

**Delivery**

12. Every work package leaves the repository releasable.
13. Every migrated or extracted module ships with tests.
14. Behaviour changes are explicit and stated in acceptance criteria.

---

## 7 · When you need to deviate

**Stop. Do not decide in passing.**

If implementing a work package appears to require something the frozen
architecture does not allow:

1. Stop implementing.
2. Follow [`implementation/templates/ADR_WORKFLOW.md`](implementation/templates/ADR_WORKFLOW.md).
3. The ADR is written and accepted **before** the code, not after.

An ADR is warranted when the decision would be expensive to reverse, when
a future contributor could plausibly "fix" it back without knowing why,
or when it sets a pattern others will follow. It is not warranted for a
decision with no real alternative.

---

## 8 · Migrations

Every existing aggregate migrates by the six-step pattern in roadmap §3:

```
add → backfill → dual-write → reconcile → switch reads → retire
```

**Only the read-switch changes behaviour, and only it can roll back.**
Steps 1–4 are pure addition and cannot break anything.

Two rules that come from this and are easy to forget:

- **Backfills are idempotent and re-runnable.** A backfill that can only
  run once is a backfill that cannot be trusted.
- **A read-switch without a passing reconciliation is not permitted.**
  Reconciliation over real data is the gate, not a formality.

Rollback: [`implementation/templates/ROLLBACK_CHECKLIST.md`](implementation/templates/ROLLBACK_CHECKLIST.md).

### Applying migrations

Via the Supabase CLI, which maintains the migration ledger
(`supabase_migrations.schema_migrations`) in each project:

```bash
npx supabase migration new <name>     # creates a timestamped file
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked  # what is applied where
```

**Always dry-run first**, and rehearse in staging before production —
once staging exists, that is the rule for every epic from 01 onward.

No `supabase/config.toml` is needed: Klussie uses Supabase Cloud, not the
local Docker stack, so `supabase status` failing without Docker is
expected. The linked project is recorded in `supabase/.temp/`, which is
gitignored and per-machine — link your own.

> **Production's ledger is not yet reconciled.** Its seventeen migrations
> were applied by hand, so the CLI would try to re-apply all of them.
> `docs/operations/ENVIRONMENTS.md` §9 has the one-time `migration
> repair` procedure that must run before production is ever pushed to.

---

## 9 · Environments

| Environment | Status | Purpose |
|---|---|---|
| Local | Available | Development |
| **Staging** | **Created in WP 00.06** | Verify before production |
| Production | Live, real users | The only environment that has ever existed |

**Until WP 00.06 lands, production is the only environment.** No schema
work happens before it exists — that ordering is the whole reason Epic 00
comes first.

Full detail, including the provisioning runbook and the production
reconciliation that must precede any CLI push to it:
[`docs/operations/ENVIRONMENTS.md`](docs/operations/ENVIRONMENTS.md).

Never run destructive operations against production. Never push without
being asked.

---

## 10 · Session shapes

From roadmap §16. Implementation sessions take one of five forms:

| Request | What happens |
|---|---|
| **"Start Epic X"** | Read the epic + its frozen references; decompose into work packages if not already done; add them to the roadmap and `implementation/epic-NN/`; begin the first |
| **"Start Work Package Y"** | Implement exactly that package; verify; report against acceptance criteria; **stop** |
| **"Review implementation"** | Review against frozen architecture and acceptance criteria; report findings; **change nothing** |
| **"Fix findings"** | Apply findings; re-verify |
| **"Merge"** | Confirm gates; update owed documents; mark progress |

**No further planning documents are created.** The architecture phase is
closed.

---

Version 1.0 — 2026-08-11 (created as the final preparation step before
Work Package 00.01)

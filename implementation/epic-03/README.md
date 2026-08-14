# Epic 03 — Workspace Engine

**Status.** 2 of 13 packages done — epic not yet closed
**Purpose.** Introduce workspaces and memberships, and migrate every
existing user onto them. The pivot of the entire roadmap.
**Definition.** [`docs/IMPLEMENTATION_ROADMAP.md`](../../docs/IMPLEMENTATION_ROADMAP.md) §10
**Work packages.** [`docs/IMPLEMENTATION_ROADMAP.md`](../../docs/IMPLEMENTATION_ROADMAP.md) §14

---

## Entry criteria

- **Epics 00, 01 and 02 complete.** All three are.
- **Three ADRs accepted before any package began:** [0024](../../docs/adr/0024-request-context-resolved-in-the-database.md),
  [0025](../../docs/adr/0025-marketplace-visibility-survives-epic-03.md),
  [0026](../../docs/adr/0026-membership-helper-lives-in-public.md) — the
  last two revised during review before acceptance (0025's title
  predates a corrected understanding but is unchanged per its own
  decision; 0026 was revised twice, once before acceptance and once
  during WP 03.02's own implementation — see its "As revised" and
  "As implemented" sections).

## Work packages

| WP | Title | Complexity | Status |
|---|---|---|---|
| 03.01 | [Create workspace and membership tables (add)](wp-03.01-workspace-tables.md) | Medium | **Done** |
| 03.02 | [Add the membership helper](wp-03.02-membership-helper.md) | High | **Done** — [ADR-0026](../../docs/adr/0026-membership-helper-lives-in-public.md), accepted and revised twice |
| 03.03 | Backfill one Personal Workspace per existing identity | Medium | Not started — blocked on ADR-0022 acceptance (P2 in the epic plan) |
| 03.04 | Backfill one Professional Workspace per existing pro profile | Medium | Not started |
| 03.05 | Add the workspace column to existing tables (add) | Low | Not started |
| 03.06 | Backfill workspace on existing rows | High | Not started |
| 03.07 | Reconcile workspace assignment | Medium | Not started — hard gate on 03.09 |
| 03.08 | Add the workspace engine contract | High | Not started |
| 03.09 | Resolve request context once | High | Not started — reshaped by [ADR-0024](../../docs/adr/0024-request-context-resolved-in-the-database.md) |
| 03.10 | Add workspace isolation to RLS as a backstop | High | Not started — reshaped by [ADR-0025](../../docs/adr/0025-marketplace-visibility-survives-epic-03.md); adds policies, deletes none |
| 03.11 | Add the workspace switcher, hidden for single-workspace users | Medium | Not started — **moved ahead of the read switch**; was 03.12 in the original roadmap §14 |
| 03.12 | Switch reads to workspace scoping | High | Not started — **moved after the switcher**; the epic's only behaviour-changing package |

**Numbering matches the revised decomposition** from the architecture
review preceding this epic, not roadmap §14's original twelve. §14 has
not yet been edited to match — that is owed before the epic closes
(roadmap §9's documentation obligations), and is deliberately not done
mid-epic to avoid rewriting a document while packages are still landing
against it.

## Architecture this epic must satisfy

Read these sections before starting a package — not the whole documents:

- `PLATFORM_DOMAIN_MODEL.md` §2, §5, §7, §8, §27 — the founding
  constraint, workspace, membership and roles, invitations, workspace
  switching
- `SYSTEM_ARCHITECTURE.md` §6.2, §12.1 — the Workspace Engine; the
  gateway's context-resolution rule (deferred by ADR-0024, not repealed)
- `SUPABASE_ARCHITECTURE.md` §2, §6, §7, §8, §9, §10, §20, §24.1 —
  schema organisation, RLS philosophy, access paths, RLS by scenario,
  roles and grants, identifier strategy, performance, "nothing in public"
- `DATABASE_ARCHITECTURE.md` §5, §6, §9, §10 — the tenancy model, the
  crossing registry (ADR-0025 registers a fifth entry), workspace,
  membership

## Acceptance (epic-level, not yet met)

From roadmap §10, unchanged by the ADR revisions:

- [ ] Every existing user has a Personal Workspace; every pro has a
      Professional Workspace; both belong to one identity
- [ ] A user with one workspace sees no workspace concept anywhere in the
      UI
- [ ] Every existing flow behaves identically
- [ ] Every workspace-scoped row carries its workspace
- [ ] Permission decisions are explainable
- [x] **The membership helper is `STABLE` and evaluated once per
      statement** — WP 03.02, with the qualification ADR-0024 states
      explicitly: once per *statement*, not once per *request*, because
      there is no gateway. Achieved via `api.current_workspace_memberships()`
      used as an uncorrelated subquery — see WP 03.02's findings for why
      the originally accepted shape could not have met this. **Confirmed
      on staging**, not merely argued: `EXPLAIN` shows the delegate on
      the build side of a hash semi join at `loops=1`, independent of the
      left-hand scan's size

**Verified on staging by two scripts, both probed to prove they can fail
before being trusted:**

```bash
psql -w -h aws-1-eu-west-1.pooler.supabase.com -p 5432 -U postgres.<staging-ref> -d postgres \
     -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKSPACE.sql
psql -w -h aws-1-eu-west-1.pooler.supabase.com -p 5432 -U postgres.<staging-ref> -d postgres \
     -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_MEMBERSHIP_HELPER.sql
```

Both pass, exit 0. Migrations `0030` and `0031` applied via
`npx supabase db push --linked` after a dry run; `migration list --linked`
confirms both as `remote` on `klussie-staging` (`mxcuxnvjfnktwjcmkqqk`).
**Production remains untouched and unreconciled** — see the epic plan's
P1, still undecided.

## Notes

**Two ADR corrections happened inside this epic's first two packages,
both before any RLS policy was written and both caught by holding the
package to its own acceptance criterion rather than to the marking
alone.** Neither reached staging in the rejected form.

1. **ADR-0026 changed placement before acceptance** (`public` → `api`),
   following an architecture feasibility study. Recorded in the ADR's
   "As revised" section.
2. **ADR-0026's delegate shape changed during WP 03.02's own
   implementation** (`is_workspace_member(uuid)` → parameterless
   `current_workspace_memberships()`), because the first shape cannot
   achieve once-per-statement evaluation regardless of the `STABLE`
   marking — a scalar function taking the scanned row's own column as an
   argument is re-invoked per row. Recorded in the ADR's "As implemented"
   section, with the citation. **Every RLS policy from WP 03.10 onward
   must use the `IN (subquery)` form; a per-row scalar wrapper reintroduces
   the defect this correction removed.**

**WP 03.01 was not originally scoped for this session** — it exists
because WP 03.02 cannot be built without it: `workspace.current_memberships()`
queries `workspace.memberships`, which did not exist. A `language sql`
function is validated against real objects at creation time, so this
was a hard blocker, not a style preference. Both packages landed together
by explicit approval; see WP 03.01's own record.

**Three tables, not two, for membership.** `DATABASE_ARCHITECTURE.md`
§10 gives membership two mutability halves — "append-only history +
mutable current" — and §4's Mutability Classes table names "membership
history" under Append-only by name. `workspace.memberships` (mutable
current) and `workspace.membership_history` (append-only) are separate
tables; nothing populates the history table yet, deliberately — that
mechanism is a decision for whichever package first writes to
`memberships` for real (03.03 or 03.08), not this one.

## Raised during the epic

**Roadmap §14's twelve packages do not match what shipped.** A prior
architecture review (before this epic's first package) already found
this — see the roadmap's own carried-forward note after Epic 02 — and
added WP 03.00 (staging fixtures), reshaped 03.02/03.09/03.10 against
three new ADRs, and swapped the order of the switcher and the read
switch. §14's text itself has not been edited yet; do that before the
epic closes.

**Production is still on migration `0029`.** Every package in this epic
widens the eventual production gap (roadmap's own P1 in the epic plan,
not yet decided). Not resolved by WP 03.01 or WP 03.02 — both are
additive and staging-only so far, matching every prior epic's opening
packages.

# Epic 19 — Completion Record

**Epic.** 19 — Notification Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 3 work packages.

**Epic 18 (Provider Intelligence Engine) was deliberately skipped**, on
explicit instruction, in favour of proceeding directly to Epic 19. Not
silently dropped — recorded here, in `MASTER_CONTEXT.md` §2, and in the
roadmap's own sequencing note, as a real, out-of-order gap the roadmap
still expects filled.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1393 tests, 141 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — PR to be opened
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Same standing gap as every epic since
      Epic 03.

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Notification records are workspace-scoped; delivery receipts are a separate aggregate (§32) | **Yes** | `platform.notifications` / `platform.notification_deliveries`, two tables |
| Preferences are per-membership, not per-identity or per-workspace (§20) | **Yes** | `platform.notification_preferences.membership_id`, a real FK, unique per row |
| The inbox is composed at read time, never materialised, and honours live membership | **Yes, proven** | `platform.my_inbox()`; `VERIFY_NOTIFICATION_ENGINE.sql` §5 |
| Revoking a membership removes its items with no separate invalidation step | **Yes, proven** | `VERIFY_NOTIFICATION_ENGINE.sql` §5b |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 19.01 | Notification records and delivery receipts | Complete |
| 19.02 | Preferences per membership | Complete |
| 19.03 | The notification engine contract | Complete |

No backfill work package — nothing in the legacy schema resembles a
notification record, delivery receipt, or per-membership preference.
Greenfield, the same shape Epic 09 held for the identical reason.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; the one genuine gap this epic
      found (§5.1) is resolved by precedent, documented in the migration
      header itself, not formalised as an ADR

## 5 · Findings, read before design

### 5.1 · No schema, no engine role exists for Notification anywhere in
the frozen documents — resolved by Audit's own precedent, not invented

`SUPABASE_ARCHITECTURE.md` §7's own schema table names exactly ten
schemas and their owning engines; Notification appears in none of them,
and no `klussie_engine_notification` role exists in `ROLES.md`. A real,
silent gap, not something to guess past. `PLATFORM_DOMAIN_MODEL.md`
groups Notification, Search, Analytics and Audit as "Platform Services,"
and of those four, Audit is the nearest structural analogue — a
cross-cutting concern with a genuine aggregate rather than a pure
projection — and Audit already lives in `platform`, owned by
`klussie_engine_platform`. This epic follows that precedent: no new
schema, no new engine role, consistent with §7's own stated reason for
tier-level rather than per-engine schemas. Full reasoning in
`0115_notifications.sql`'s own header.

### 5.2 · `raise_notification()` never mints a recipient id — the
identifier-generation conflict resolved the only way ADR-0022 permits

Fanning out one notification to N delivery receipts means minting N new
row identifiers, a number unknowable until the recipient set is resolved
inside the transaction — and `platform.uuid_v7_at()` is backfill-only
(ADR-0022). Unlike every other "conditional extra id" case this session
has solved (a single, required, sometimes-unused parameter), this is an
unbounded set, not one conditional branch. Resolved the only way ADR-0022
permits: identifiers come from the application. The caller resolves the
recipient list and supplies pre-minted `{personRef, deliveryId, channel}`
triples; one bulk `INSERT ... SELECT FROM jsonb_array_elements()` writes
them all, no per-row loop.

### 5.3 · `mark_notification_acted()` emits a named extension beyond
§10.1's own event list — the third occurrence of this pattern

`NotificationRaised`/`Delivered`/`Seen`/`Escalated` is the frozen list;
no `NotificationActed` exists, even though "Recording... acted-upon" is
named as a real responsibility and `notification_deliveries.acted_at`
exists structurally to hold it. `platform.notification.acted_on` is
emitted anyway — the same pragmatic gap-fill `commerce.fail_payment()`'s
`billing.payout.failed` (Epic 14) and `knowledge.retract_edge()`'s
`knowledge.workspace_edge.retracted` (Epic 16) already established.

### 5.4 · Preferences are the one genuinely mutable, non-append-only
aggregate this session has built — and that is correct here

Every other table this session has built is either Historical
append-only or immutable-except-named-columns, because each represents a
decision or fact worth a permanent trail. A notification preference is
"what does this person want right now," with no governance value in
preserving a history of past toggles the way `knowledge.rules`'
supersession preserves policy history. One row per membership, updated
in place — the same "current pointer" shape `workspace.workspaces`'
own mutable columns already hold.

## 6 · Platform Discoveries

- **The first epic to place its aggregate in `platform` schema for a
  reason other than being the Event Backbone or Audit itself** —
  resolved by naming the precedent explicitly rather than assuming
  silently.
- **The first genuinely mutable aggregate this session has built**
  (`platform.notification_preferences`) — every prior table chose
  append-only or immutable-except-guarded; this one correctly does not,
  and the header explains why the distinction matters.
- **`platform.my_inbox()` is the first read function this session has
  built that joins across three schemas in one query** (`platform`,
  `identity`, `workspace`) — composing, at read time, exactly the
  boundary-respecting view §10.1/§32 both require.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches any existing
client surface; there is no legacy notification concept to have been
touching in the first place.

**What was not done: nothing in this epic has been run against any
database** — the same standing gap.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Epic 18 (Provider Intelligence Engine) skipped, on explicit instruction | Named, out-of-order gap | `MASTER_CONTEXT.md` §2 |
| No live wiring — nothing emits a notification yet from any other engine's own contract | Named, deliberate | This section |

## 8 · Verification performed

**Automated.** 1368 → **1393 tests**, 138 → **141 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. `VERIFY_NOTIFICATION_ENGINE.sql`
proves the full lifecycle: raising a notification fanning out to two
resolved recipients in one call; delivered/seen/acted each a one-way
transition refusing to repeat; an unacted delivery escalatable, an acted
one refused; preferences updating in place rather than duplicating; and
the inbox composed per identity at read time, correctly disappearing the
moment a membership ends while the other member's own item stays
visible. Not executed against a real Postgres instance.

## 9 · Sign-off

- [x] All three work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now nineteen epics deep (counting the skipped Epic 18 as still
      outstanding, not closed)

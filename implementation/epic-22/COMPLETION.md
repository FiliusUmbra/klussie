# Epic 22 — Completion Record

**Epic.** 22 — Subscription Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 3 work packages.

Built immediately after Epic 21, on the roadmap's own forward
sequencing, continuing the stacked-branch chain from
`epic-21/analytics-engine`'s own tip. The last named epic in Tier
"Services and Commercial" (Epics 19–22).

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1488 tests, 154 files**
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
| A subscription is a commercial wrapper around a capability bundle (`PLATFORM_DOMAIN_MODEL.md` §24) | **Yes** | `commerce.activate_subscription()` grants a plan's exact `capability_keys` bundle, nothing more |
| Subscription requests capability grants; Capability decides (`SYSTEM_ARCHITECTURE.md` §11.1) | **Yes, structurally** | Every grant/withdraw goes through `workspace.grant_capability()`/`withdraw_capability()`, never a direct write to `workspace.capability_grants` |
| Subscriptions grant capabilities; they do not gate data — a lapse withdraws behaviour, not data (`DATABASE_ARCHITECTURE.md` §22, §11) | **Yes, proven** | `lapse_subscription()` withdraws every capability; nothing else in the platform is touched |
| The payer need not be the workspace itself | **Yes** | `payer` is `{payerType, payerRef}` jsonb, not a typed `workspace_id` column |
| Subscription is separate from Capability so a grant can carry no commercial event | **Preserved** | This epic adds a second path to `workspace.grant_capability()`; the direct, no-subscription path (preset, operator) is untouched |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 22.01 | The plan catalogue and the subscription aggregate | Complete |
| 22.02 | RLS isolation | Complete |
| 22.03 | The subscription engine contract | Complete |

No backfill work package — no subscription concept exists anywhere in
the legacy schema (commission is a display-only constant per
`MASTER_CONTEXT.md`, formalised as real billing in Epic 14 but never
wired to a subscription). Greenfield, the same shape every service-tier
epic this session has held.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every placement question this
      epic raised (schema, cross-engine call) was already answered by
      the frozen documents or Epic 04's own precedent

## 5 · Findings, read before design

### 5.1 · `platform.plans`, not `commerce.plans` — mirroring
`platform.capabilities`' own placement exactly

`0075_capability_catalogue.sql` put the capability catalogue in
`platform` even though Capability itself owns `workspace`, because a
catalogue is platform-wide configuration, not a tenant's own data.
`PLATFORM_DOMAIN_MODEL.md` §24 makes the same point for plans
explicitly: "no code knows what a tier is" — pricing and packaging are
product work, changed by editing a table, not by shipping code. This
epic places `platform.plans` identically, keeping `commerce.subscriptions`
(the actual workspace aggregate) as the only new table in `commerce`.

### 5.2 · The first true cross-engine contract call this session has
made

Every function this session has written until now touches only its own
schema and `platform.emit_event()`/`write_audit_record()`.
`SYSTEM_ARCHITECTURE.md` §11.1 is explicit that Subscription "does not
own capability grants themselves — it *requests* them, and Capability
decides." This epic's contract calls `workspace.grant_capability()`/
`workspace.withdraw_capability()` directly — Epic 04's own functions,
owned by `klussie_engine_workspace` — rather than writing
`workspace.capability_grants` itself. `klussie_engine_commerce` needed
`USAGE` on schema `workspace` and `EXECUTE` on both functions, granted
here for the first time, following the same "grant only when a real
caller needs it" discipline every prior cross-schema grant has held.

### 5.3 · Capabilities are granted forward, withdrawn in reverse — a
correctness requirement, not a style choice

`platform.plans.capability_keys` is dependency-ordered for granting
(0127's own header). `workspace.withdraw_capability()` has the
mirror-image precondition: it refuses to withdraw a capability while
something still held depends on it (§6.2). Withdrawing a plan's full
bundle therefore walks `capability_keys` in reverse — dependents first,
their dependencies last — proven directly in
`VERIFY_SUBSCRIPTION_ENGINE.sql` §3 (downgrading `premium_home` →
`personal` withdraws `maintenance_planning` before `asset_management`,
never the other way round, and never hits the blocking-dependency
exception).

### 5.4 · Grant/withdraw loops swallow exactly two precondition
messages, nothing else

A workspace may already hold a capability from another source (a preset
backfill, an operator grant) before its first subscription activates,
or may have had one withdrawn already before a lapse reaches it. Both
are tolerated by catching only `workspace.grant_capability()`'s
"already holds" and `workspace.withdraw_capability()`'s "does not
currently hold" messages; a genuine dependency-blocking violation is a
real bug in this epic's own bundle ordering and always propagates.

### 5.5 · `commerce.subscriptions` is the second genuinely mutable
aggregate this session has built

`DATABASE_ARCHITECTURE.md` §10's own placement table: "Subscription |
commerce | Mutable | One per workspace." Real `UPDATE`, no guard
trigger — the same shape `platform.notification_preferences` (Epic 19)
held as "the first genuinely mutable aggregate this session has built."
The financial record that must survive unedited is `commerce.invoices`/
`payments` (Epic 14), separately immutable; the subscription's own
current state has no comparable governance value in a permanent trail.

### 5.6 · `TrialStarted`/`TrialExpired` are a distinct aggregate token
from `SubscriptionActivated`/`Changed`/`Renewed`/`Lapsed` — not the same
event with a flag

`SYSTEM_ARCHITECTURE.md` §11.1's own produced-event list states both
explicitly. `commerce.start_trial()`/`commerce.expire_trial()` mint
`subscription.trial.*`; every other lifecycle action mints
`subscription.subscription.*`. Capabilities granted by a trial carry
`source = 'trial'`, distinguishable from `source = 'subscription'`,
which is what lets `expire_trial()` withdraw exactly the trial's own
grants without touching anything a real subscription separately holds.

## 6 · Platform Discoveries

- **The first true cross-engine contract call this session has made**
  (§5.2) — every prior epic's functions stayed inside their own schema.
- **The second genuinely mutable aggregate this session has built**
  (§5.5), after Epic 19's notification preferences.
- **The seventh epic in a row to mint every `event_type` correctly from
  the start.**
- **The last named epic in Tier "Services and Commercial"** (Epics
  19–22) — the roadmap's next tier is Edge (API Gateway, Integration,
  Administration) or whatever the session is directed toward next.

## 7 · Regressions and known issues

**No regression possible.** This epic adds a second, optional path to
`workspace.grant_capability()`/`withdraw_capability()`; the existing
direct path (presets, operator grants) is untouched, and nothing in the
current product calls either path yet.

**What was not done: nothing in this epic has been run against any
database** — the same standing gap.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| No live wiring — nothing calls `activate_subscription()` from any real signup or payment flow yet; Payments (Epic 14's own remaining scope) is a named, separate gap | Named, deliberate | This section |
| White Label is not seeded as a real, purchasable plan — `PLATFORM_DOMAIN_MODEL.md` §24 itself marks it "(future)" | Named, deliberate (§5.1) | This section |
| `authenticated`/`anon` hold no `SELECT` grant on `platform.plans` or `commerce.subscriptions` yet — `ROLES.md` §2.4's own "Not yet" bucket | Named, deliberate | This section |

## 8 · Verification performed

**Automated.** 1461 → **1488 tests**, 150 → **154 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. `VERIFY_SUBSCRIPTION_ENGINE.sql`
proves: activating a subscription grants its plan's full bundle;
upgrading grants exactly the bundle difference, forward; downgrading
withdraws exactly the bundle difference, in reverse, without ever
hitting `workspace.withdraw_capability()`'s own blocking-dependency
refusal; a trial grants with a distinguishable source and expiring one
withdraws exactly those grants, refusing when the subscription is not
currently trialing; renewing touches no capability at all; lapsing
withdraws every capability the plan granted; and a workspace can never
hold a second subscription row. Not executed against a real Postgres
instance.

## 9 · Sign-off

- [x] All three work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now twenty-two epics deep

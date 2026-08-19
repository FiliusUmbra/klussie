# Epic 14 — Completion Record

**Epic.** 14 — Billing Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 5 work packages.

The first real revenue path — "commission is currently a display-only
constant" (`src/lib/billing.js`), and this epic formalises it as a real,
immutable ledger. No real payment provider exists yet; this is the
structural record a real provider's callbacks will eventually write
into.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1269 tests, 125 files**
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
| Immutable, multi-currency, multi-jurisdiction from the first record | **Yes** | `commerce.invoices`/`payments`, no closed currency/jurisdiction list |
| Corrections by credit-and-reissue, never edit | **Yes, enforced structurally** | `commerce.invoices_guard_mutation()`, `commerce.credits` append-only |
| Subscription is not this epic | **Yes, by omission** | No subscription table, column or concept anywhere in this epic |
| Formalises the real revenue source correctly | **Yes, proven against a real engagement** | `VERIFY_BILLING_CONTRACT.sql` §1 computes 12.00 from a 100.00 engagement at a 12% rate |
| Settling a payment updates its invoice atomically | **Yes, same transaction** | `commerce.settle_payment()`, proven in `VERIFY_BILLING_CONTRACT.sql` §2 |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 14.01 | The Invoice aggregate | Complete |
| 14.02 | Credits | Complete |
| 14.03 | Payments (and payouts, one table) | Complete |
| 14.04 | RLS isolation | Complete |
| 14.05 | The billing engine contract | Complete |

No backfill work package — no legacy financial data exists anywhere;
`src/lib/billing.js` is pure client-side display math with no persisted
record. This epic is greenfield, the same shape Epic 09 (Workflow) held
for the identical reason.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice reuses an
      existing pattern

## 5 · Findings, read before design

### 5.1 · Subscription is deliberately not this epic — already decided
by the roadmap, six epics apart

`SYSTEM_ARCHITECTURE.md` names Subscription (§11.1) and Billing (§11.2)
as two engines sharing one schema (`commerce`). The roadmap's own
sequence already resolves the order: Epic 14 is Billing, "sequenced here
because it becomes possible the moment engagements complete correctly";
Epic 22 is Subscription, in the Services and Commercial tier, six epics
later. §11.2 itself: "Does not own... Subscriptions." Nothing in this
epic invents a subscription concept ahead of Epic 22.

### 5.2 · One table for payments and payouts, not two duplicated shapes

§11.2 names both, with distinct (asymmetric) event vocabularies. Both
are structurally the same fact — a money movement against a workspace,
eventually settling or failing — differing only in direction. One table
with a `direction` column, matching how `work.maintenance_obligations`
(Epic 10) uses one `source` column rather than four near-identical
tables.

### 5.3 · "Commission record" is a kind of invoice, not a fourth table

§11.2 lists "Invoices. Charges. Payments. Payouts. Commission records"
among what this engine owns. Nothing gives "commission record" its own
shape the way §13.2 gave Service Record one. Interpreted as `commerce.
invoices.kind = 'marketplace_commission'` — the only real revenue source
this epic actually produces — rather than a fourth table invented with
no stated shape to build against.

### 5.4 · A named gap in the frozen event vocabulary, filled pragmatically

§11.2's own event list is asymmetric: `PaymentAuthorized`/`Settled`/
`Failed` for inbound money, but only `PayoutInitiated`/`Settled` for
outbound — no `PayoutFailed` anywhere, even though `commerce.payments`'
own `status` column permits a failed outbound payment structurally.
`commerce.fail_payment()` emits `PayoutFailed` anyway, a direct,
minimal extension of the pattern the frozen list already establishes,
recorded here as a real gap rather than silently worked around.

### 5.5 · The commission rate is a parameter, never a hardcoded constant

`src/lib/billing.js`'s `PLATFORM_COMMISSION_RATE` is a client-side
constant. `commerce.issue_marketplace_commission_invoice()` takes the
rate as a required parameter — "pricing, packaging and plan design
become product work rather than engineering work" (§24) applies just as
much to a commission rate as to a capability bundle; nothing in this
engine bakes in a number product configuration should own.

## 6 · Platform Discoveries

- **`commerce` is the first new schema this session actually writes
  into** — created empty in migration 0018, unused across thirteen
  epics, until now.
- **The "compose, don't duplicate" pattern (`work.generate_due_
  obligation()` calling `work.create_maintenance_obligation()`, Epic 10)
  reused a third time**: `commerce.issue_marketplace_commission_invoice()`
  resolves a real engagement and calls the general-purpose `commerce.
  issue_invoice()` rather than a second insert path.
- **No new bug class this epic** — every emitted event's `workspace_id`
  is a real, directly-available column on the table doing the writing,
  never a polymorphic subject needing the kind of resolver Epic 13 had
  to build. Worth noting as the first epic since Epic 11 where the
  "read before design" pass did not surface a structural bug, only
  scope and naming findings.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches
`src/lib/billing.js` or any client surface; no legacy financial data
exists to migrate.

**What was not done: nothing in this epic has been run against any
database.** Five new migrations (`0097`–`0101`), one diagnostic, all
written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0097`–`0101` not applied to any environment | **Critical** before any future epic wires a real caller | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| No real payment provider integration | Named, separately tracked (`MASTER_CONTEXT.md` §12, P1) | Stripe Connect, Phase 4 |
| `issue_marketplace_commission_invoice()` not wired to `work.complete_engagement()` | Named gap (§5.5-adjacent restraint) | Whenever a real live-wiring decision is made across engines |

## 8 · Verification performed

**Automated.** 1228 → **1269 tests**, 120 → **125 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. `VERIFY_BILLING_CONTRACT.sql` proves the full lifecycle:
issuing a real commission invoice from a real engagement (asserting the
exact computed amount), settling an inbound payment (asserting the
linked invoice becomes paid, atomically), an independent outbound
payout, a credit (asserting the invoice becomes permanently frozen), and
every immutability guard. Not executed against a real Postgres instance.

## 9 · Sign-off

- [x] All five work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now fourteen epics deep

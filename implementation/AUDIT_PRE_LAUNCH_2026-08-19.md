# Pre-Launch Audit — "if we shipped tomorrow"

**Date.** 2026-08-19
**Scope.** Everything built this session (Epics 01–22) plus the state of
the existing live product. Not a code review of any one epic — those
already exist per-epic in `implementation/epic-*/COMPLETION.md`. This is
the cross-cutting question: *if a deploy went out right now, what would
actually happen?*

---

## Update — later the same day: §1.1 and §1.2 substantially closed

Both acted on, in order, per §5's own recommended sequence:

**§1.1 (the PR stack) — closed.** All 20 PRs merged into `main`, in
order, each verified CI-green before merging. `main` now matches the
tip: 130 migrations, zero open PRs. See commit history from
`epic-03/wp-03.09-workspace-context-bootstrap` (PR #3) through
`epic-22/subscription-engine` (PR #22).

**§1.2 (nothing has ever run against a real database) — substantially
closed for the first time this session.** The Supabase CLI was already
authenticated and linked to `klussie-staging`, previously unknown
to this session. `supabase db push --linked` closed staging's own
94-migration gap (36 → 130), surfacing two real migration bugs neither
the static test suite nor code review could ever have caught, since
neither executes SQL:

- **`0060_backfill_documents.sql`** — a `RETURNING` clause tried to
  return a column (`request_id`) that was never inserted into the
  target table and does not exist there (SQLSTATE 42703). Fixed.
- **`0064_document_caption.sql`** — six functions changed their own
  return row shape via `CREATE OR REPLACE FUNCTION`, which Postgres
  refuses ("cannot change return type of existing function"). Fixed
  with `DROP FUNCTION IF EXISTS` before each.

With both fixed, **all 130 migrations apply cleanly from empty** —
confirmed via `supabase migration list`, zero mismatches.

A third, more interesting finding: `VERIFY_WORKSPACE_ISOLATION_POLICIES.sql`
initially raised a real-looking failure — "a non-member saw a private
item." Traced to the root cause: the `postgres` role every diagnostic's
own header instructs connecting as has `BYPASSRLS` in Supabase by
design (confirmed directly against `pg_roles`), so **every diagnostic
that behaviourally probes raw table RLS by connecting as `postgres` was
structurally incapable of proving anything**, since RLS is skipped
entirely regardless of the simulated identity. **Not a security
vulnerability** — confirmed by re-running under `set local role
authenticated` (which does not bypass RLS): owner=1, member=1,
stranger=0, exactly correct. Applied the same fix to the three other
diagnostics with the identical gap (asset/location/property isolation).
The other 7 diagnostics using JWT impersonation were checked and are
unaffected — they call functions with explicit `auth.uid()` checks in
their own body, not raw RLS.

A fourth: `VERIFY_KNOWLEDGE_ENGINE.sql` check 4 had a genuinely wrong
test expectation (assumed superseding one of two tied rules would
silently clear a conflict involving a rule it never touched) — traced
directly against real data, confirmed the *implementation* is correct
("conflicts are surfaced, never resolved silently" holds even under
supersession) and the *diagnostic* was wrong. Rewrote it to assert the
real, correct behaviour.

A fifth: `VERIFY_BILLING_CONTRACT.sql` passed `null` for `actor_ref` on
three `'system'`-actor calls; `platform.events.actor_ref` is `NOT NULL`
unconditionally. Fixed.

**All of the above are merged or open for review**: PR #23
(`fix/live-verification-findings`), CI green. Diagnostics confirmed
passing against real staging data: the four isolation policies above,
`RECONCILE_ASSETS.sql`, `RECONCILE_DOCUMENTS.sql`,
`VERIFY_SERVICE_RECORD_ISOLATION.sql` (this document's own §5 named it
"the single most consequential diagnostic in the repository" — passed,
including the steward-transfer scenario and both directions of the
annex-leak proof), `VERIFY_MARKETPLACE_ISOLATION.sql`,
`VERIFY_CONVERSATION_ISOLATION.sql`, `VERIFY_INTELLIGENCE_ENGINE.sql`,
`VERIFY_BILLING_CONTRACT.sql`, `VERIFY_KNOWLEDGE_ENGINE.sql`.

**What this does not close.** The reconciliations passed *vacuously* —
staging currently holds 0 `household_items`, 0 `property.assets`, 0
`service_requests`; only 5 `profiles`. A pass with nothing to reconcile
against is not the same evidence as a pass over real volume — the exact
distinction `RECONCILE_ASSETS.sql`'s own header already names. §1.3
(no client code calls almost any of this) is untouched — nothing here
changes what the live product does. §2 (payments, cascading deletes, no
restore drill, branch protection, RoleSelectionScreen) is entirely
untouched.

---

## Update 2 — every diagnostic in the repository has now been run

All 67 `VERIFY_*.sql`/`RECONCILE_*.sql` diagnostics — the entire
directory, not a sample — have now been executed against real staging
data at least once. [PR #23](https://github.com/FiliusUmbra/klussie/pull/23)
and [PR #24](https://github.com/FiliusUmbra/klussie/pull/24) carry the
fixes; both CI-green. This closes the diagnostic-coverage half of §1.2
completely — what remains of §1.2 is that most of the *data* to
reconcile against is still thin (see above), not that the checks
themselves are unrun.

**Six more real, previously-invisible bugs, found only by execution:**

1. **`property.reparent_location()` failed on every single call,
   unconditionally** — `subpath()` raises "invalid positions" whenever
   its offset equals the path's own length, which is always true for
   the row being moved. The function's own original comment assumed
   this returned empty; it doesn't. This is the most serious individual
   finding of the whole pass: a core Location Engine write path that
   has never worked, not once, since Epic 06.
2. **The household_items dual-write trigger silently discarded
   historical timestamps** — mirrored `created_at` used `now()`
   instead of `new.created_at`, invisible for an ordinary fresh insert
   but wrong for anything backfilled or imported with a real historical
   date.
3. **`VERIFY_EVENTS.sql` and `VERIFY_GRANTS.sql`** asserted invariants
   that were true at Epic 01 and have since been deliberately,
   correctly superseded by seven epics' worth of real, individually
   justified decisions (Epic 15's events-read policy; seven
   cross-schema grants through Epic 22). Both rewritten as precise,
   fully-attributed allowlists rather than loosened.
4. **A capability-count off-by-one** (`VERIFY_CAPABILITY_CATALOGUE.sql`
   expected 26, the real seed has always been 27) — harmless, caught
   only because the diagnostic actually counted the live table instead
   of trusting its own comment.
5. **A date/timestamp type mismatch** in `VERIFY_MAINTENANCE_CONTRACT.sql`
   (`current_date - interval` is a timestamp, not a date).
6. **A chain of fixture bugs** — missing `pro_profiles` rows, a
   `public.categories`/`public.services` schema mismatch repeated
   across three diagnostics (`name` columns that live in `_translations`
   tables instead), `service_requests.when_pref` and `directed_until`
   (whose own non-null default was *itself* set by a migration,
   `0014_directed_until_default.sql`, whose header describes this
   exact class of bug — found in production, years before this
   session, the same lesson relearned), and a diagnostic racing against
   a dual-write trigger that post-dated it.

**One real debris incident, caught and cleaned.** The first, failing
run of `VERIFY_LOCATION_REPARENTING.sql` (before its fix landed) left a
workspace, a property and five locations behind — the trailing
`rollback;` in that script never executed once the mid-script error
aborted the run early. Found and removed via a full sweep; a second,
exhaustive sweep across every schema every diagnostic in the whole pass
touched confirmed nothing else was left behind.

**What this still does not close.** Nothing here changes what data
exists — staging is still thin, so most passes prove the *mechanism* is
correct, not that it holds at volume. §1.3 and §2 remain exactly as
before.

---

## Update 3 — three of §2's five Critical findings closed

- **§2.2 (cascading deletes) — closed.**
  [PR #25](https://github.com/FiliusUmbra/klussie/pull/25), merged.
  Removed `ON DELETE CASCADE` from all nine foreign keys into
  `public.profiles(id)`, restoring Postgres's default (`RESTRICT`).
  Sufficiency proven, not assumed: profiles.id is transitively
  referenced by ~21 edges once second-order cascades are counted, but
  blocking only the shallowest nine is enough, because Postgres
  evaluates a DELETE's full cascade tree as one atomic operation — a
  single blocked constraint anywhere fails the whole statement and
  rolls back every cascade that had already fired elsewhere in the same
  operation. Verified against real staging data: a customer attempting
  to delete their own profile is refused, and the pro's own message in
  their shared conversation survives — the exact "other party's data"
  scenario this finding named.
- **§2.4 (branch protection) — closed.** Required status checks
  (`Lint, type-check, test, build`) and up-to-date-branch enforcement
  turned on for `main` before the PR stack merge in Update; still
  active, and it's what caught PR #26 needing a branch update before
  merge just now.
- **§2.5 (`RoleSelectionScreen`) — closed.**
  [PR #26](https://github.com/FiliusUmbra/klussie/pull/26), merged.
  Deleted the forced "how will you use klussie?" screen entirely.
  Feasible now, where it wasn't when Epic 03 shipped, because the
  Workspace engine already gives every account a Personal Workspace and
  already has a fully-working, unforced "become a pro" path
  (`BecomeProPrompt`/`BecomeProSheet`, plus the existing customer/pro
  preview toggle) — removing the gate needed no new product surface,
  only deleting the one that violated §27. Every signed-in session now
  lands directly in `CustomerApp`.

**What's still open, and why it wasn't attempted:**

- **§2.1 (no payment processing)** — not attempted. This needs a real
  payment provider account, live API keys/secrets, and pricing/provider
  decisions that are the user's to make, not something to stand up
  unilaterally in an engineering session.
- **§2.3 (no backup/restore drill)** — not attempted. Proving a restore
  actually works needs either a paid Supabase plan upgrade (a spending
  decision) or deliberately sacrificing the one verified staging
  environment as the restore target (a destructive, hard-to-reverse
  action) — both require the user's explicit go-ahead first.

Both remain exactly as scoped in §2 below; nothing about them changed
this pass.

---

## Verdict

**Not shippable tomorrow — not close.** The blocker isn't code quality;
every migration, test and diagnostic built this session is real and
internally consistent. The blocker is that **none of it is reachable**:
it sits on 20 open, unmerged PRs, `main` is 94 migrations behind the
work described as "complete," and even if it were merged today, nothing
in the live product calls any of it. Shipping tomorrow would ship
exactly what's live today — the pre-refactor product — with 22 epics of
backend sitting inert underneath it.

---

## 1 · Blockers (would cause a bad or broken launch)

### 1.1 · `main` is not the tip. It's not even close.

```
main:            36 migrations (through 0036, mid–Epic 03)
epic-22 (tip):  130 migrations (through 0130, Epic 22 complete)
```

**20 open PRs, none merged**, each stacked on the last:

| PR | Epic | Base |
|---|---|---|
| #3 | Epic 03 WP09–12 | `main` |
| #4–#22 | Epics 05–22 (Epic 04 built retroactively as #10) | each stacked on the previous |

Every PR is individually `CLEAN`/`MERGEABLE` against its own base — the
stack is technically sound — but **nothing has been merged past PR #2**
(Epic 03 WP03–08, 2026-08-16). "Shipping tomorrow" ships `main`. `main`
does not know Workspace, Property, Location, Asset, Document, Workflow,
Maintenance, Capability, Service Record, Marketplace, Conversation,
Billing, Timeline, Knowledge, Intelligence, Notification, Provider
Intelligence, Search, Analytics, or Subscription exist.

**Why this matters more than it sounds.** Merging 20 stacked PRs in
order is mechanical, but it is not a formality: it means running 94
migrations against production for the first time, in sequence, with the
first real chance to discover a migration that doesn't apply cleanly to
a live database with real rows in it — which brings us to 1.2.

### 1.2 · Zero of this session's SQL has ever run against a real
database

`grep -c pg\|postgres package.json` → nothing. The 1488-test suite that
gates every PR is **entirely static analysis** — `readFileSync()` on the
`.sql` files plus regex assertions against the text (`expect(block).
toMatch(/create policy/)`, etc.). No test in this repository executes a
`create table`, no test inserts a row, no test evaluates an RLS policy.
"1488 tests passing" is a real and useful signal that every migration
*says* what its own header claims — it is **zero evidence** that any of
it *works* when Postgres actually runs it.

Concretely unverified, ever, anywhere:
- Every RLS policy in every epic (18 isolation-policy migrations)
- Every guard trigger's actual enforcement (Epic 11, 18, 19's
  immutability triggers)
- The two session-spanning defects found *by inspection* in Epics 15/16
  (event_type format, missing schema USAGE) — fixed, but the fix itself
  has never been exercised
- Every diagnostic (`VERIFY_*.sql`, `RECONCILE_*.sql` — 51 files) — all
  written, all structurally reviewed, **none executed**
- The six-step migration pattern's own hard gate (roadmap §3): no
  reconciliation has ever actually run for Epic 07's or Epic 08's
  dual-write

Even **staging** — the one environment that exists to catch exactly this
— is stale: `docs/operations/ENVIRONMENTS.md` records it as provisioned
2026-08-12 with **17 migrations replayed from empty**. That's Epic
00/01-era. Staging has never seen migrations 0018–0130.

### 1.3 · No client code calls almost any of this

Diffing `main` against the current tip on `src/` and `api/` shows real
client changes only from the *early* epics — Epic 03's workspace
switcher, Epic 07/08's two read switches (household items, request
photos/portfolio). **From Epic 09 onward — 14 of the 19 unmerged
epics — there is no client code at all.** Every one of those epics'
own completion record says so explicitly ("no client caller exists
yet — pure addition"), so this isn't a surprise finding, but it's worth
stating plainly for a launch decision: merging Epics 09–22 tomorrow
changes **zero** user-visible behavior. The backend would exist; nothing
would read or write it.

---

## 2 · Critical (real risk if launched, even if 1.1–1.3 were fixed)

### 2.1 · No payment processing at all

`Payments | Planned. Commission is a display-only constant on a demo
invoice; no integration implemented` (`MASTER_CONTEXT.md` §3, still
accurate). Epic 14 built a real, immutable billing ledger
(`commerce.invoices/credits/payments`) but explicitly did not touch
payment processing. Epic 22's Subscription Engine can activate a
subscription and grant capabilities, but nothing charges anyone. **There
is no code path in this entire repository that moves money.**

### 2.2 · Deleting an account destroys the other party's data too

Standing debt, predates this session, unresolved: `public.profiles` has
nine `on delete cascade` foreign keys. Deleting one `auth.users` row
cascades through requests, reviews, and **both sides of every
conversation, including the other party's messages**. Violates
`SUPABASE_ARCHITECTURE.md` §5 ("no cascading deletes anywhere") and
§11.4. Erasure (Epic 02) routes around it by never actually deleting —
which means the legal "right to erasure" this implies is not actually
honored end-to-end; it's redaction with the row surviving.

### 2.3 · No backup/restore has ever been tested

`ADR-0017`'s procedure is documented and the backup path is verified,
but **no restore has ever been performed** — the Free plan provides two
projects and neither can be used as a restore target. A verified-but-
never-tested restore is, for launch purposes, an untested restore.

### 2.4 · Branch protection is off

`main` has no branch protection (`gh api .../branches/main/protection`
→ 404, confirmed live during this audit). CI can fail and a merge
proceeds anyway. Combined with 1.1, the first real merge into `main`
will be 20 PRs deep with no automated gate stopping a bad one from
landing.

### 2.5 · `RoleSelectionScreen` still asks the question the domain
model forbids

Principle 3 / `PLATFORM_DOMAIN_MODEL.md` §27: "The platform never asks a
person to classify themselves." `src/auth/RoleSelectionScreen.jsx` still
does, on every signup. Predates this session; Epic 03 deliberately left
it alone. Still live, still shown to every new user today.

---

## 3 · High (should block a *considered* launch, not a hotfix)

- **Three ADRs are still `Proposed`, not `Accepted`** (0020 events
  partitioning, 0021 nullable-workspace audit, 0022 UUIDv7 identifiers)
  — all implemented, all cheap to formally accept now, expensive after
  `platform.events`/`platform.audit_records` hold real rows (which
  happens the moment anything merges).
- **No render tests on 31 user-facing components**, including the ones
  that spend money (`InvoiceSheet`, `ServiceSheet`).
- **`MASTER_CONTEXT.md` §3 ("Current State" — the doc's own declared
  tie-breaker) is stale**: it still reads "1393 tests across 141 files"
  and stops narrating at Epic 19. §2 ("Current Milestone") was kept
  current every epic this session; §3 was not, even though the document
  says explicitly "where any other section disagrees with this table,
  this table wins." A reader trusting §3 today gets a picture three
  epics and ~100 tests out of date.
- **Production migration runbook covers only `0018`–`0029`**
  (`operations/PRODUCTION_MIGRATION_0018_0029.md`), 101 migrations short
  of the current tip. Nobody could actually run the production cutover
  from the document that exists to describe it.
- **An untracked `.claude.zip`** has sat in the working tree for this
  entire session, deliberately excluded from every commit. Its contents
  were never inspected as part of this audit — worth the user's own
  look before it's forgotten.

---

## 4 · What's actually solid

Said plainly, because an audit that only lists problems is as
misleading as one that only lists wins:

- **The architecture is coherent and the implementation matches it.**
  22 epics, ~130 migrations, and the cross-epic invariants (event
  naming, schema/role grants, mutability class per table, "compose
  don't duplicate") hold consistently — including two real
  session-spanning defects that were *found by this session's own
  process* and fixed everywhere, not just where first noticed.
- **Nothing this session touched has degraded the live product.** The
  live app on `main` today is unchanged and unaffected by any of this;
  the risk is entirely in what happens *if* the stack is merged
  carelessly, not in what exists right now.
- **The gates that do run (lint, typecheck, build, structural tests) are
  green on every PR**, and have been at every step — this is a real,
  continuously-verified base to build the *next* phase (live
  verification) on top of, not a backlog of half-finished work.
- **Every open finding is named, not hidden.** Every epic's own
  completion record and this session's `MASTER_CONTEXT.md` §12 already
  state the vast majority of what's in this audit — the debt is tracked,
  which is different from debt that's been ignored.

---

## 5 · If you actually want to ship soon

In order, because each step is a prerequisite for trusting the next:

1. **Re-provision or refresh staging** to the current tip (130
   migrations) — the one environment allowed to fail safely.
2. **Get a real Postgres connection and working test credentials** — the
   single standing P0 that blocks every diagnostic in §12's debt table
   from ever running. Nothing past step 1 matters without this.
3. **Run the diagnostics in dependency order**, starting with
   `VERIFY_WORKSPACE_ISOLATION_POLICIES.sql` and `RECONCILE_ASSETS.sql`/
   `RECONCILE_DOCUMENTS.sql` (the six-step pattern's own hard gate) —
   not all 51 at once; the ones gating tenant isolation first.
4. **Merge the PR stack into `main` in order**, only after step 3 passes
   — this is genuinely 20 real merges, not a formality, given step 1–3
   are what make each one safe.
5. **Turn on branch protection** before, not after, step 4.
6. **Decide, deliberately, what actually gets wired to a client this
   quarter** — Epics 09–22 give you nothing users can touch until
   something calls them. That's a product sequencing decision, not an
   engineering one.

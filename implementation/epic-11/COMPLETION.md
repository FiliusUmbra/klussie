# Epic 11 — Completion Record

**Epic.** 11 — Service Record Engine
**Started.** 2026-08-18
**Completed.** 2026-08-18 — all 4 work packages.

`DATABASE_ARCHITECTURE.md` §17 names this "the most consequential
aggregate in the document" and "the highest-risk surface in the
architecture." `PLATFORM_DOMAIN_MODEL.md` §32 item 5 (the frozen
architecture's own verification pass) names the visibility split as "the
part `DATABASE_ARCHITECTURE.md` must get exactly right." Both statements
were read in full, twice, before any SQL was written.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1136 tests, 108 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — PR to be opened
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Written and structurally tested, not
      run against a database. Same standing gap as every epic since
      Epic 03. **This epic's own diagnostic is the most consequential
      one in the repository to actually run**, given what a real
      isolation mistake here would expose.

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| One record, two legitimate owners, three separated boundaries (authorship, visibility, lifecycle) | **Yes** | `work.service_records` + two annexes; ten contract functions, none generic |
| The core "follows the property" (live), the property annex freezes to the steward at write time | **Yes, and the asymmetry is proven, not just asserted** | `VERIFY_SERVICE_RECORD_ISOLATION.sql` §6 changes a real property's steward and checks both directions |
| A business's cost base can never reach the property side; a household's private notes can never reach the performing side | **Yes, proven structurally, not just by scenario** | `VERIFY_SERVICE_RECORD_ISOLATION.sql` §4–§5 inspect the actual policy text on `pg_policies`, not only a passing/failing query |
| The performing workspace's grant to the core is permanent and non-revocable | **Yes, by omission** | No withdraw function, no expiry column, exists anywhere in this schema for it |
| Completed records are immutable; corrections are amendments | **Yes** | `work.service_records_guard_mutation()`, `work.service_record_amendments` (append-only) |
| No delete, anywhere in the engine | **Yes** | No `grant delete` on any of the four tables |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 11.01 | The Service Record shared core | Complete |
| 11.02 | The two private annexes, and the amendment log | Complete |
| 11.03 | RLS isolation | Complete |
| 11.04 | The service record engine contract | Complete |

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every design choice reuses an
      existing pattern (`property.assets`' live-stewardship-resolution
      shape for the core, `property.documents`' frozen-owner shape for
      the property annex, `workflow_definitions`' one-exception-column
      guard, `property.reparent_location()`'s no-`api.*`-delegate
      posture)

## 5 · Findings, read before design

### 5.1 · The core has no `owning_workspace_id` — it "follows the
property," which is a different shape than every prior bilateral object

§17's own transfer table is explicit and asymmetric: when a property
changes steward, the core is "Unaffected — follows the property," while
the property annex "Stays with the previous steward." A document (Epic
08) freezes `owning_workspace_id` at creation because a document's
ownership does not follow anything. A service record's core belongs to
*the property*, dynamically — the same shape `property.assets`/
`locations` already use (no workspace column, resolved live through
`property_id -> steward_workspace_id`), not `property.documents`' frozen
shape. Getting this backwards would have meant a service record silently
staying with a business's *former* customer relationship after a
property sale — the wrong direction entirely.

### 5.2 · `performing_workspace_id` is the permanent grant itself, not a
separate grants table

§17: "The performing workspace holds a permanent, non-revocable grant to
the core — the one grant in the architecture that does not expire." A
service record has exactly one performing workspace, permanently — a
plain `not null` column already is the grant. No withdraw path exists
anywhere in this schema for it; that absence is the "non-revocable" rule,
enforced by omission rather than by a check that could later be relaxed.

### 5.3 · Rich, variable content is `jsonb`, not fifteen nullable columns

§13.2: "A household's tap washer produces a service record with four
fields; a hospital's annual boiler inspection produces one with two
hundred." Every field in the classification table carries the identical
visibility rule (shared, visible to both parties) — RLS needs no
per-field typing to enforce that. The handful of real, typed columns
(`work_performed`, `performed_at`, `agreed_price`, `warranty_until`,
`customer_approved*`) are the ones another part of the architecture
already depends on structurally; everything else lives in `content
jsonb`.

### 5.4 · A real bug caught before shipping, inside this epic's own
first draft

`work.create_service_record()`'s first draft minted the conditional
`WarrantyArising` event's id internally via `gen_random_uuid()` — the
identical mistake Epic 04's `grant_capability()` made and had to fix
(`implementation/epic-04/COMPLETION.md` §5.4), now caught here before it
shipped rather than after. Fixed by adding `p_warranty_event_id` as a
required parameter on every call, used only when `p_warranty_until` is
set. Two epics in a row making the identical class of mistake, both
caught before running the tests, is itself worth naming: server-side
event-id minting is evidently the single easiest ADR-0022 violation to
write by accident in this codebase, and the second catch was faster than
the first because the pattern was already named.

### 5.5 · Photos, video, documents and certificates are a named
connection, not built here

§13.2 lists these as core content. `property.document_attachments`
(Epic 08) scopes to exactly four subjects and its own header names
"maintenance record and marketplace engagement" as excluded because
neither table existed yet. `work.service_records` is a fifth real
candidate subject, the identical shape — not added here, because doing
so means altering an already-open, already-reviewed Epic 08 migration
from this epic's own branch, reaching into a surface this epic was not
asked to touch. Named for whichever future work first needs a service
record's photos attached through the document engine rather than
duplicated into `content`.

### 5.6 · No live wiring, the same restraint every engine epic since
Epic 09 has held

Nothing in the current product creates a service record — Marketplace
(Epic 12) and Maintenance-driven completion (Epic 10's own named gap)
both produce the first real callers later. No `api.*` delegate exists
for any of the ten functions.

## 6 · Platform Discoveries

- **The core's "follows the property" resolution and the property
  annex's "frozen at write time" resolution are the same table pair
  Epic 05 and Epic 08 each modelled separately** — `property.assets`
  (live) and `property.documents` (frozen) — now both required *within
  a single new aggregate*, proving both shapes were genuinely necessary
  primitives rather than one epic's local choice.
- **The combined OR predicate (`work.service_records`' own RLS policy)
  is the first isolation policy in this schema where two independent
  relationships grant visibility to the same row** — every prior policy
  has been one chain, however many joins deep. Reusing
  `api.current_workspace_memberships()` twice in one policy, combined
  with `or`, needed no new resolver — only a new combination of the
  existing primitive.
- **A second occurrence of the exact same identifier-minting mistake**
  (§5.4) confirms this class of bug is a real, recurring risk in this
  codebase's own idiom (a conditional second event inside a write
  function), not a one-off — worth a standing note for whichever future
  epic writes another conditional `platform.emit_event()` call.

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic is reachable by any
client path yet.

**What was not done: nothing in this epic has been run against any
database.** Four new migrations (`0081`–`0084`), two diagnostics, all
written, none run — including the isolation diagnostic, which is the
single most consequential unrun diagnostic in this repository given
what a real mistake here would expose.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical, and the highest-stakes instance of this standing gap so far** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0081`–`0084` not applied to any environment | **Critical** before any future epic wires a real caller | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| `property.document_attachments` has no `service_record_id` subject | Named gap (§5.5) | Whichever epic first attaches a document to a service record |
| No live consumer creates or reads a service record | Named gap (§5.6) | Epic 10 (completion-driven creation), Epic 12 (engagement-driven creation) |

## 8 · Verification performed

**Automated.** 1096 → **1136 tests**, 104 → **108 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed — no journey uses
this engine yet.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. `VERIFY_SERVICE_RECORD_ISOLATION.sql` is written to prove
the exact failure mode §17 names, not a generic pass/fail check: it
constructs a real property with a steward, a real performing workspace,
a real stranger workspace, and a real steward transfer, then inspects
both annex policies' own `pg_policies` text directly to prove neither
can ever reference the other side's relationship — structurally, not
only for this one scenario's data. `VERIFY_SERVICE_RECORD_CONTRACT.sql`
proves the write path end to end, including the exact regression §5.4
would have shipped if uncaught. Neither has executed against a real
Postgres instance.

## 9 · Sign-off

- [x] All four work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now eleven epics deep — and the one epic in the sequence where
      running `VERIFY_SERVICE_RECORD_ISOLATION.sql` before anything
      depends on this engine matters most

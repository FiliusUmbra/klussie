# Epic 08 — Progress Record (partial — WP 08.01–08.08 of 9)

**Epic.** 08 — Document Engine
**Started.** 2026-08-17
**This session's work packages.** 8 of 9 (08.01–08.08). 08.09 (the read
switch) is **blocked on a genuine architectural decision**, not merely
deferred — see §5.5. This is the first work package in this roadmap
stopped for that reason rather than for scope or database access.

This is a **progress record, not a completion record** — named
differently on purpose, matching Epic 07's own precedent.

---

## 1 · Gates

- [x] Every package built (08.01–08.08) finished to the same standard as
      a complete epic's packages
- [x] `npm run lint` passes
- [x] `npm test` passes — **940 tests, 83 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [x] CI green — PR #7
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed (ADR-0026 and ADR-0028 already cover this epic's structural
      questions; see §5)
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Written and structurally tested, not
      run against a database.

## 2 · Acceptance criteria (for the eight packages built)

| Criterion | Met? | Evidence |
|---|---|---|
| Documents attach to any number of real subjects | **Yes** | `property.document_attachments`, scoped to property/location/asset/workspace |
| Attachment is never a visibility grant | **Yes, proven in a real scenario** | `VERIFY_DOCUMENT_ISOLATION_POLICIES.sql`; `documentIsolationPolicies.test.js` asserts the isolation policy's SQL never references `document_attachments` |
| Sharing is independent of attachment | **Yes** | `property.document_shares`, no attachment reference anywhere |
| Document type carries retention behaviour | **Yes** | `property.document_types.retention_class` gates deletion via a conditional trigger, not a grant |
| Versioning follows ADR-0028's shape | **Yes** | Current version on the row; `property.document_versions` holds only closed versions |
| Every live source row is represented | **Yes, structurally; not verified live** | `VERIFY_BACKFILL_DOCUMENTS.sql` |
| household_items/source tables stay authoritative through dual-write (roadmap §3, step 3) | **Yes** | 0061's triggers only mirror; no read depends on `property.documents` yet |
| A real bug is caught *before* it could ship, not after | **Yes — the first time in this roadmap** | `document_attachments.document_id`/`document_shares.document_id` had no `ON DELETE` clause (the same class of bug as Epic 07's `household_items_id`); found by re-reading 0056/0057 before writing 0061's delete triggers, fixed with `ON DELETE CASCADE` in the same migration, never shipped broken |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 08.01 | Document types, the document aggregate, and version history | Complete | Versioning is ADR-0028's shape, a third time |
| 08.02 | Attachment, scoped to real subjects | Complete | Maintenance record and marketplace engagement deliberately excluded |
| 08.03 | Sharing, independent of attachment | Complete | Formalises a pattern already informally real in `service_request_photos`' RLS |
| 08.04 | RLS isolation | Complete | Negative structural test as its central assertion |
| 08.05 | The document engine contract | Complete | Real `api` delegates from the start |
| 08.06 | Backfill `portfolio_items` and `service_request_photos` | Complete | Second backfill moving real data; first from two source tables at once |
| 08.07 | Dual-write | **Complete** | Two database triggers per source table (insert, delete); no update trigger needed on either — read before design found neither table has a client-mutable field the document model maps |
| 08.08 | Reconcile | **Complete, structurally** | `RECONCILE_DOCUMENTS.sql`; not yet run against real data |
| 08.09 | Switch reads | **Blocked** — see §5.5 | A genuine architectural gap, found while designing this package, not before |

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md` — §18, epic status table
- [x] `docs/MASTER_CONTEXT.md` — §2 milestone, §12 debt table, version footer, test counts
- [x] `docs/architecture/ARCHITECTURE.md` — Known Gaps
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR yet; §5.5's open question may produce one

## 5 · Read before design — findings that changed what got built

Sections 5.1–5.4 are unchanged from this epic's first commit (WP
08.01–08.06) and are not repeated verbatim here — see that commit's own
message and `IMPLEMENTATION_ROADMAP.md` §18 for the full text: `avatar_url`
excluded (checked against `DATABASE_ARCHITECTURE.md` §15's actual
definition); versioning is §15's stated model, not a deferred one, and
reuses ADR-0028's shape a third time; `property.document_types` could not
ship empty, unlike `facet_types`; "attachment is not a visibility grant"
is verified in a real scenario, not just asserted.

### 5.5 · The architectural gap found while designing WP 08.09, and why it stopped the read switch

Designing the read switch surfaced two problems neither earlier package
had reason to find, because neither reading nor visibility-at-scale had
been exercised yet:

**First — `service_request_photos` documents are deliberately
unattached (0060/0061's own stated restraint), which means
`property.my_documents(subject)` cannot find them at all.** The contract
discovers documents by subject (property/location/asset/workspace).
A request photo has no real subject to attach to today (no
`service_requests`-to-`property` link exists until Epic 12) — which was
the right call for *storage*, but its consequence for *reading* was not
worked through until this package: there is no clean way to list "every
document for this service request" through the existing contract. The
only linkage is `service_request_photo_id`, explicitly built as
"bookkeeping only... read by nothing except the backfill/dual-write's
own idempotency guard" (0060's own header) — repurposing it as a general
read path would contradict the restraint that column was built under.

**Second, and more significant — `property.documents`' isolation model
has no concept of "publicly visible," but `portfolio_items` is public
today.** Checked against the actual RLS on `public.portfolio_items`
(migration 0006) rather than assumed: `for select to anon, authenticated
using (true)` — anyone, including a signed-out visitor, can see a pro's
portfolio, by design (it's marketing content on a public profile,
`ProPublicProfileSheet.jsx`). `property.documents`' own isolation policy
(0058) has exactly two visibility paths: owning-workspace membership, or
an explicit share. Neither covers "anyone." Switching the portfolio read
to the new model as designed would **silently break public portfolio
viewing** — a real user-facing regression this session caught before
writing it, not after.

**Why this is a stop, not a judgment call to make alone.** Both problems
have more than one honest resolution, each with real trade-offs:

- Add an explicit `is_public boolean` to `property.documents` and a
  third isolation branch for it — closest to today's behaviour, but
  widens the isolation policy this epic went out of its way to keep
  narrow (0058's own header), and raises a real question `§15` doesn't
  answer: should *any* document type be able to opt into public
  visibility, or only `portfolio_photo` specifically?
- Give `service_request_photos`-sourced documents a dedicated lookup
  function keyed on the request, bypassing subject-based discovery
  entirely — solves the read, but is a second discovery mechanism
  alongside `my_documents()`, worth weighing against "one source of
  truth" (Product Constitution Rule 8).
- Reconsider whether `portfolio_items` and `service_request_photos`
  belong in the Document model at all, given how differently they
  behave from the private, evidentiary documents `§15` was written
  around — the more disruptive option, since it would mean unwinding
  work already committed and pushed (0055–0061).

None of these is obviously correct, and picking one silently would be
exactly the kind of "guess when the code can answer the question"
this session's own standing discipline rules out — the code answered
clearly that a gap exists; it does not by itself say which fix is
right. Flagged for the product owner's decision rather than built.

## 6 · Platform Discoveries

- **`service_request_photos`' existing RLS (migration 0007) already
  implemented attachment/sharing separation, informally, years before
  this epic gave it a name.**
- **`property.assets.warranty_expires_on` (Epic 07, unused since) gains
  a real relationship to this epic**, already designed ahead of time in
  `docs/design/GUIDANCE_SYSTEM.md` §17.4.1.
- **The AI intake's existing `brandDetected`/`ocrText` extraction is a
  second, later connection point** for the domain model's own named
  future "extraction" capability.
- **A second real bug caught before shipping, not after** (§2's own
  table): `document_attachments`/`document_shares`' missing `ON DELETE`
  clauses, found and fixed in the same migration that would have needed
  them, rather than across two sessions the way Epic 07's equivalent
  bug was.
- **`portfolio_items`' public visibility is itself a discovery**,
  surfaced only by actually designing the read switch rather than
  stopping at the write side — the kind of gap that structural tests and
  even live-data reconciliation would never have caught, since neither
  exercises "can a signed-out visitor see this."

## 7 · Regressions and known issues

**No regression is possible from the work in this session.**
`portfolio_items` and `service_request_photos` are read, never written,
by everything built here — WP 08.09 (the read switch) is exactly the
package that was not built, specifically because building it as
originally scoped would have been the regression.

**What was not done: nothing in this epic has been run against any
database.** Seventh epic in a row. Seven new migrations (`0055`–`0061`),
five diagnostics, all written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in WP 08.01–08 verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| WP 08.09 blocked on an architectural decision, not built | Expected, not a defect | §5.5 |
| Migrations `0055`–`0061` not applied to any environment | **Critical** before WP 08.09 begins | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| Only four of seven migrations have a dedicated diagnostic | Low | `document_attachments`/`document_shares` (linking tables) and the dual-write triggers are exercised inside other diagnostics — stated economy |

## 8 · Verification performed

**Automated.** 922 → **940 tests**, 81 → **83 files**. Every package ran
lint, type-check, test and build before moving to the next; all green.
No client code changed in this session — nothing to boot-check in a
browser.

**On staging.** None.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment.

## 9 · Sign-off

- [x] Eight of nine work packages complete, to full standard
- [x] Repository releasable — no behaviour change reaches a real user
      until these migrations are applied and WP 08.09 is actually built
- [ ] **Epic not closed. WP 08.09 needs a product decision before it can
      be built** (§5.5) — not a database connection, not more time. Once
      decided: (1) a direct Postgres connection to run the five
      diagnostics written across this epic; (2) build WP 08.09 per
      whichever resolution is chosen; (3) do not deploy it without
      `RECONCILE_DOCUMENTS.sql` passing against real data.

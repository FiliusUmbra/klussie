# Epic 08 — Progress Record (partial — WP 08.01–08.06 of 9)

**Epic.** 08 — Document Engine
**Started.** 2026-08-17
**This session's work packages.** 6 of 9 (08.01–08.06). 08.07–08.09
decomposed but deliberately not built — see §5.

This is a **progress record, not a completion record** — named
differently on purpose, matching Epic 07's own precedent. Epic 08 is not
done. It stops here deliberately: the remaining packages touch two
separate pieces of live, running client code (portfolio-photo upload,
request-photo upload) and real user data, and this session judged that
worth its own dedicated pass rather than appending it to an already-large
structural epic — a complexity boundary, not a database-access one (see
roadmap §18's own scope note; this session's standing directive no
longer treats lack of database access as a reason to stop implementation
short).

---

## 1 · Gates

- [x] Every package built (08.01–08.06) finished to the same standard as
      a complete epic's packages
- [x] `npm run lint` passes
- [x] `npm test` passes — **922 tests, 81 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — not yet pushed as a PR at the time of writing
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed (ADR-0026 and ADR-0028 already cover this epic's structural
      questions; see §5)
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Written and structurally tested, not
      run against a database.

## 2 · Acceptance criteria (for the six packages built)

| Criterion | Met? | Evidence |
|---|---|---|
| Documents attach to any number of real subjects | **Yes** | `property.document_attachments`, scoped to property/location/asset/workspace — the four subjects with a real table today |
| Attachment is never a visibility grant | **Yes, proven in a real scenario, not just structurally** | `VERIFY_DOCUMENT_ISOLATION_POLICIES.sql` constructs a property steward who can see an asset but not a document attached to it; `documentIsolationPolicies.test.js` asserts the isolation policy's SQL never references `document_attachments` at all |
| Sharing is independent of attachment | **Yes** | `property.document_shares`, a plain table with no attachment reference anywhere |
| Document type carries retention behaviour | **Yes** | `property.document_types.retention_class` gates deletion via `documents_guard_deletion()`, a conditional trigger, not a grant |
| Versioning follows ADR-0028's shape | **Yes** | `property.documents` holds the current version directly; `property.document_versions` holds only closed (superseded) versions, append-only guarded |
| Every live source row is represented | **Yes, structurally; not verified live** | `VERIFY_BACKFILL_DOCUMENTS.sql` check 1 is the real-data reconciliation; check 2 proves the mapping including the sharing snapshot |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 08.01 | Document types, the document aggregate, and version history | Complete | Versioning is ADR-0028's shape, a third time — see §5 |
| 08.02 | Attachment, scoped to real subjects | Complete | Maintenance record and marketplace engagement deliberately excluded — neither table exists |
| 08.03 | Sharing, independent of attachment | Complete | The general form of `service_request_photos`' own "matching pro can view" policy, given a name |
| 08.04 | RLS isolation | Complete | The one migration in this epic with a negative structural test as its central assertion |
| 08.05 | The document engine contract | Complete | Real `api` delegates from the start, matching Epic 07's asset contract, not Epic 06's engine-only containment functions |
| 08.06 | Backfill `portfolio_items` and `service_request_photos` | Complete | The second backfill in this roadmap moving real, existing data, and the first from two source tables at once |
| 08.07 | Dual-write | **Decomposed, not built** | Two live client code paths (portfolio upload, request-photo upload) |
| 08.08 | Reconcile | **Decomposed, not built** | Needs real data to reconcile against |
| 08.09 | Switch reads | **Decomposed, not built** | The epic's one behaviour-changing package |

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md` — §18 (new), epic status table,
      TOC, Risk Register and How-Sessions-Work renumbered §19/§20
- [x] `docs/MASTER_CONTEXT.md` — §2 milestone, §12 debt table, version
      footer, test counts
- [x] `docs/architecture/ARCHITECTURE.md` — Known Gaps
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; ADR-0026 (the split) and
      ADR-0028 (versioning's shape) already cover this epic's structural
      questions

## 5 · Read before design — what changed from the roadmap's own one-liner

Before writing any SQL, this session read `DATABASE_ARCHITECTURE.md`
§15 and `SUPABASE_ARCHITECTURE.md` §11.3 in full, rather than building
from Epic 08's own pre-existing one-line roadmap summary
("migrates existing avatars, portfolio images and request photos"). Four
findings changed what got built, each recorded in full in
`IMPLEMENTATION_ROADMAP.md` §18 and repeated here because they are this
epic's actual headline:

1. **`profiles.avatar_url` is excluded.** §15 defines a document as
   evidence that is "about" something else, carrying type, validity and
   an issuer. An avatar is none of those — it is identity decoration,
   not evidence about a home. The roadmap's own one-liner was wrong to
   include it; corrected here rather than built as written.
2. **Versioning is not deferred — it is `DATABASE_ARCHITECTURE.md` §15's
   stated model, and it is ADR-0028's shape a third time.**
   `PLATFORM_DOMAIN_MODEL.md` §12 lists versioning under "how it
   evolves," which reads as future work; §15 states it as the aggregate
   itself: "metadata mutable, content immutable... version history is
   retained." The more specific, more authoritative document won. No new
   ADR — the mutable-current-plus-append-only-closed-log shape is
   reused, not redesigned.
3. **`property.document_types` could not ship empty, unlike
   `property.facet_types` (Epic 07).** §15 ties deletion behaviour to
   declared type, and this epic's own backfill needed real values to
   classify existing rows into — the first declared catalog in this
   roadmap that had to deviate from its own precedent's restraint, and
   the deviation is stated rather than silent.
4. **"Attachment is not a visibility grant" is called out in §15 as a
   principle that was "nearly lost."** The isolation policy (WP 08.04)
   and the engine contract (WP 08.05) both treat attachment and
   visibility as two structurally independent filters, never one
   collapsing into the other — verified in a real, reproducible scenario
   in `VERIFY_DOCUMENT_ISOLATION_POLICIES.sql`, not just asserted.

## 6 · Platform Discoveries

- **`service_request_photos`' existing RLS (migration 0007) already
  implemented attachment/sharing separation, informally, years before
  this epic gave it a name.** Its "customers manage own" and "matching
  pros can view" policies are exactly attachment and sharing, expressed
  as two ad hoc predicates on one table. This epic did not invent the
  separation — it gave an already-real pattern its own structural home,
  and confirmed the general form of "a matching pro can view" is simply
  "share with another workspace" (a professional's identity already is
  a workspace, `PLATFORM_DOMAIN_MODEL.md` §27).
- **`property.assets.warranty_expires_on` (Epic 07, unused since) gains
  a real relationship to this epic**, already designed ahead of time in
  `docs/design/GUIDANCE_SYSTEM.md` §17.4.1: once a document has its own
  `valid_until`, it supersedes the asset's own column as the source for
  the Guidance System's warranty-expiry signal. Named here as the
  connection now being real on the database side, not just designed.
- **The AI intake's existing `brandDetected`/`ocrText` extraction
  (`api/ai-intake.js`, already real — see `GUIDANCE_SYSTEM.md` §17.4.6's
  own correction) is a second, later connection point**: once documents
  exist with real content, the domain model's own named future
  capability — "extraction: reading a document to propose structured
  facts" — has a real table to write its output into. Not built this
  epic; named so the seam is visible.

## 7 · Regressions and known issues

**No regression is possible from the work in this session.**
`portfolio_items` and `service_request_photos` are read, never written,
by everything built here.

**What was not done: nothing in this epic has been run against any
database.** Seventh epic in a row. Six new migrations (`0055`–`0060`),
four diagnostics, all written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in WP 08.01–06 verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| WP 08.07–08.09 not built — the epic is incomplete | Expected, not a defect | §5 above; roadmap §18 |
| Migrations `0055`–`0060` not applied to any environment | **Critical** before WP 08.07 begins | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| Only four diagnostics for six migrations | Low | `document_attachments` (0056) and `document_shares` (0057) are simple linking tables with no independent business logic — both are meaningfully exercised inside `VERIFY_DOCUMENT_ISOLATION_POLICIES.sql` and `VERIFY_DOCUMENT_CONTRACT.sql` rather than getting a thin diagnostic of their own. A deliberate economy, stated here rather than silent. |

## 8 · Verification performed

**Automated.** 875 → **922 tests**, 75 → **81 files**. Every package ran
lint, type-check, test and build before moving to the next; all green.
No client code changed in this session — nothing to boot-check in a
browser.

**On staging.** None.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment. No PR opened at the time of writing.

## 9 · Sign-off

- [x] Six of nine work packages complete, to full standard
- [x] Repository releasable
- [ ] **Epic not closed.** Next session on Epic 08 needs, in order: (1) a
      direct Postgres connection, to actually run the four diagnostics
      written this session; (2) WP 08.07 (dual-write, two client code
      paths); (3) WP 08.08 (reconciliation, the hard gate); (4) WP 08.09
      (the read switch). Do not attempt 08.09 without 08.08 passing
      against real data.

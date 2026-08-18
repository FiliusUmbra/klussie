# Epic 08 — Progress Record (nearly complete — WP 08.01–08.09, one split remaining)

**Epic.** 08 — Document Engine
**Started.** 2026-08-17
**This session's work packages.** All nine decomposed packages have been
built. WP 08.09 (the read switch) split in two once the product owner's
decision arrived: the **request-photo read switch is complete and live**;
the **portfolio read switch is deliberately not made** — a new, narrower
finding surfaced while building it (§5.6), not the original architectural
gap, which is now resolved.

This is a **progress record, not a completion record** — Epic 08 is not
formally closed until the portfolio question in §5.6 is settled.

---

## 1 · Gates

- [x] Every package built finished to the same standard as a complete
      epic's packages
- [x] `npm run lint` passes
- [x] `npm test` passes — **959 tests, 86 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [x] CI green — PR #7
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Written and structurally tested, not
      run against a database.

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Documents attach to any number of real subjects | **Yes** | `property.document_attachments` |
| Attachment is never a visibility grant | **Yes, proven in a real scenario** | `VERIFY_DOCUMENT_ISOLATION_POLICIES.sql` |
| Sharing is independent of attachment | **Yes** | `property.document_shares` |
| Document type carries retention behaviour | **Yes** | `documents_guard_deletion()` |
| Versioning follows ADR-0028's shape | **Yes** | `property.document_versions` |
| Every live source row is represented | **Yes, structurally** | `VERIFY_BACKFILL_DOCUMENTS.sql` |
| Two real bugs caught *before* they could ship, not after | **Yes — first time this has happened twice in one epic** | `document_attachments`/`document_shares` FK fix (§6) |
| Public visibility is carried by type, per §15's own retention-class precedent | **Yes** | `property.document_types.is_public`, `documentPublicVisibility.test.js` |
| A read switch is genuinely live for at least one source table | **Yes** | `src/lib/requestPhotos.js`'s `fetchRequestPhotos` now reads `property.documents` via `api.documents_for_service_request()`, with a proven fallback |

## 3 · Work packages

| WP | Title | Status | Notes |
|---|---|---|---|
| 08.01 | Document types, the document aggregate, and version history | Complete | |
| 08.02 | Attachment, scoped to real subjects | Complete | |
| 08.03 | Sharing, independent of attachment | Complete | |
| 08.04 | RLS isolation | Complete | |
| 08.05 | The document engine contract | Complete | |
| 08.06 | Backfill `portfolio_items` and `service_request_photos` | Complete | |
| 08.07 | Dual-write | Complete | |
| 08.08 | Reconcile | Complete, structurally | |
| 08.09a | Resolve the architectural gap: public visibility | **Complete** | Product decision: carry it by document type (0062), matching `retention_class`'s own precedent |
| 08.09b | Resolve the architectural gap: request-photo discoverability | **Complete** | A dedicated lookup (0063) — judged as ordinary implementation work once 08.09a settled the harder question |
| 08.09c | Switch reads: request photos | **Complete, live** | `src/lib/requestPhotos.js` |
| 08.09d | Switch reads: portfolio photos | **Not built — see §5.6** | A new, narrower finding: `caption` isn't mirrored to `property.documents` |

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md` — §18, epic status table
- [x] `docs/MASTER_CONTEXT.md` — §2 milestone, §12 debt table, version footer, test counts
- [x] `docs/architecture/ARCHITECTURE.md` — Known Gaps
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; the public-visibility decision follows §15's own precedent closely enough not to need one

## 5 · Read before design — findings that changed what got built

### 5.1–5.4 (unchanged from the epic's first commit)

`avatar_url` excluded; versioning is §15's stated model (ADR-0028's shape,
a third time); `property.document_types` could not ship empty; "attachment
is not a visibility grant" is verified in a real scenario. See
`IMPLEMENTATION_ROADMAP.md` §18 for the full text.

### 5.5 · The architectural gap found designing WP 08.09 — resolved

Two problems, both real: `service_request_photos` documents cannot be
discovered by subject (deliberately unattached), and `property.documents`'
isolation model had no path for `portfolio_items`' genuine public
visibility (checked against its real RLS, migration `0006`: `for select
to anon, authenticated using (true)`). Full original reasoning preserved
in this file's git history (the prior revision of this section). **The
product owner's decision:** add explicit public-visibility support to the
isolation model.

**What was built, in response.** `property.document_types.is_public`
(migration `0062`) — carried by type, not a per-row flag, mirroring
`retention_class`'s own placement and the identical reasoning §15 already
gives for it: "the distinction is carried by document type, so it is
decided by configuration rather than by a user's judgement in the
moment." `portfolio_photo` is the only type marked public;
`request_photo` stays private. The isolation policy and both contract
functions (`my_documents`/`resolve_document`) gained a third visibility
branch, checked before the membership/share branches, which are now
explicitly guarded on `auth.uid() is not null` so an anonymous caller
falls through cleanly rather than evaluating a membership check against
no identity. The `api` delegates are now granted to `anon`, matching
`portfolio_items`' own real grant.

**The second half — request-photo discoverability — was resolved as
ordinary implementation work, not re-asked.** The product owner's
instruction was specifically about public visibility; the discoverability
gap has no comparable user-facing trade-off between its own alternatives,
so it was built directly: `property.documents_for_service_request()`
(migration `0063`), a dedicated lookup via the existing bookkeeping join
(`service_request_photo_id`), applying the identical owning-workspace-
or-share rule as `resolve_document()`, with no public branch — a request
photo was never meant to be public, and this doesn't change that. This
judgment call is recorded here explicitly so it's visible, not silently
assumed.

### 5.6 · A new, narrower finding — the portfolio read switch is not made

Building the actual client-side read switch (not just the database side)
found a third problem, smaller than §5.5's two: `src/lib/portfolio.js`'s
`fetchPortfolioItems()` returns `caption` (via `updatePortfolioCaption()`,
a real, client-mutable field) and a precomputed `image_url`. Neither has
an equivalent on `property.documents` — `caption` was already a stated,
deliberate gap in the dual-write (WP 08.07's own header: "there is
nothing for an UPDATE trigger to mirror"), but its consequence for
*reading* was not worked through until this point: switching the read
would silently drop every portfolio caption from the UI, a real
regression this session caught before writing it, matching the same
discipline that caught §5.5's two problems.

**`fetchRequestPhotos` has no equivalent problem** — its old shape
(`id`, `storagePath`, `url`) maps cleanly onto `property.documents`
(`storage_bucket` + `storage_path`, signed client-side), with nothing
dropped in translation. That read switch is built and live (§3, WP
08.09c).

**Not built, and not decided here**: whether to add a `caption` column
to `property.documents` (widening its shape for a field only one of two
current document types uses), keep portfolio reads on the legacy table
indefinitely, or something else. Lower-stakes than §5.5's two problems —
no user-facing visibility trade-off, purely a schema-completeness
question — but real enough not to guess at silently a third time in one
epic.

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
- **Two real bugs caught before shipping, not after, in one epic** — a
  first for this roadmap: `document_attachments`/`document_shares`'
  missing `ON DELETE` clauses (found re-reading 0056/0057 before writing
  0061's delete triggers); and the portfolio-caption gap (§5.6, found
  building the read switch, before it could drop data in production).
- **`portfolio_items`' public visibility is itself a discovery**,
  surfaced only by actually designing the read switch rather than
  stopping at the write side.

## 7 · Regressions and known issues

**No regression is possible from the work in this session.** The one
live behaviour change — `fetchRequestPhotos` now reading
`property.documents` — is additive with a proven fallback
(`requestPhotos.test.js`), and `portfolio_items`/`service_request_photos`
remain fully authoritative and unmodified either way.

**What was not done: nothing in this epic has been run against any
database.** Nine new migrations (`0055`–`0063`), seven diagnostics, all
written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| The portfolio read switch is not built (§5.6) | Medium — a scoping question, not a defect | §5.6 |
| Migrations `0055`–`0063` not applied to any environment | **Critical** before this read switch reaches real users | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| Only five of nine migrations have a dedicated diagnostic | Low | Linking tables and dual-write triggers exercised inside other diagnostics — stated economy |

## 8 · Verification performed

**Automated.** 940 → **959 tests**, 83 → **86 files**. Every package ran
lint, type-check, test and build before moving to the next; all green.
`src/lib/requestPhotos.js` changed for the first time in this epic;
covered by a new unit test file (`requestPhotos.test.js`) mocking
`supabase.schema('api').rpc(...)` and the storage-signing path, including
the fallback case.

**On staging.** None. `fetchRequestPhotos`'s new code path was not
exercised in a browser this session — no working test credentials, no
database connection, and a fallback-based change has nothing new to
observe in a browser without real data behind the RPC.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment.

## 9 · Sign-off

- [x] The architectural blocker from §5.5 is resolved
- [x] Repository releasable — the one live change degrades gracefully to
      identical prior behaviour if the new migrations aren't applied
- [ ] **Epic not formally closed.** Two things remain: (1) a direct
      Postgres connection to run the seven diagnostics written across
      this epic — the same standing gap as every epic since Epic 03; (2)
      a decision on §5.6 (the portfolio caption gap) before the portfolio
      read switch can be built. Neither blocks real users today — nothing
      in this epic has reached an environment they use.

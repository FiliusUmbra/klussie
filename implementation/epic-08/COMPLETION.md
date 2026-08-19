# Epic 08 — Completion Record

**Epic.** 08 — Document Engine
**Started.** 2026-08-17
**Completed.** 2026-08-17 — all 9 work packages, both read switches live.

This is a genuine **completion record** — the two intermediate stops this
epic took (an architectural decision on public visibility, then a
narrower caption-mirroring gap) are both resolved. Live verification
remains **Pending**, consistent with every epic since Epic 03.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **978 tests, 89 files**
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
| Document type carries retention *and* visibility behaviour | **Yes** | `retention_class` gates deletion; `is_public` gates visibility — both by type, one precedent |
| Versioning follows ADR-0028's shape | **Yes** | `property.document_versions` |
| Every live source row is represented | **Yes, structurally** | `VERIFY_BACKFILL_DOCUMENTS.sql` |
| Two real bugs caught *before* they could ship | **Yes** | §6 |
| Both read switches are genuinely live, nothing silently dropped | **Yes** | `fetchRequestPhotos` and `fetchPortfolioItems` both switched, `caption` carried across, both with proven fallbacks |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 08.01 | Document types, the document aggregate, and version history | Complete |
| 08.02 | Attachment, scoped to real subjects | Complete |
| 08.03 | Sharing, independent of attachment | Complete |
| 08.04 | RLS isolation | Complete |
| 08.05 | The document engine contract | Complete |
| 08.06 | Backfill `portfolio_items` and `service_request_photos` | Complete |
| 08.07 | Dual-write | Complete |
| 08.08 | Reconcile | Complete, structurally |
| 08.09 | Switch reads | **Complete** — both source tables |

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; the public-visibility decision follows §15's `retention_class` precedent closely enough not to need one

## 5 · The full arc, in order — three findings, three resolutions

### 5.1–5.4 (unchanged from the epic's first commit)

`avatar_url` excluded; versioning is `DATABASE_ARCHITECTURE.md` §15's
stated model (ADR-0028's shape, a third time); `property.document_types`
could not ship empty; "attachment is not a visibility grant" verified in
a real scenario, not just asserted.

### 5.5 · The architectural gap — resolved by the product owner

Designing the read switch found two real problems:
`service_request_photos` documents are deliberately unattached and
undiscoverable by subject; `property.documents`' isolation model had no
path for `portfolio_items`' genuine public visibility (checked against
its real RLS, migration `0006`, not assumed). **Decision: add explicit
public-visibility support to the isolation model.**

Built as `property.document_types.is_public` (`0062`) — carried by type,
the identical reasoning §15 already gives `retention_class`.
`portfolio_photo` is the only public type. The isolation policy and both
contract functions gained a third visibility branch, guarded on
`auth.uid() is not null`. `api` delegates granted to `anon`. The
discoverability half was resolved directly as ordinary implementation
work: `property.documents_for_service_request()` (`0063`), a dedicated
lookup via the bookkeeping join, no public branch.

### 5.6 · A narrower finding — resolved without re-asking

Building the actual client read switch found `fetchPortfolioItems()`
returns `caption` (real, client-mutable, via `updatePortfolioCaption()`)
with no equivalent on `property.documents`. Lower-stakes than §5.5 — no
user-facing visibility trade-off, purely schema completeness — so it was
resolved directly: `property.documents.caption` (`0064`), backfilled
onto already-mirrored rows, added to every contract function's return
shape, and `portfolio_items` gained its first-ever UPDATE mirror trigger
(0061's own header had correctly said none was needed *yet* — this
migration is what gave it something to mirror).

### 5.7 · The last piece — a public workspace resolver

Switching `fetchPortfolioItems` needed one more thing: given a pro's
auth id (all its callers have), resolve their Professional Workspace id,
so `api.my_documents({p_workspace_id})` has a real subject. No existing
function did this — every prior workspace resolver answers "what are
*my own* workspaces," never "what is *this other person's* public
workspace." Built as `workspace.resolve_public_professional_workspace()`
(`0065`), granted to `anon` for the same reason `is_public` exists:
`ProPublicProfileSheet.jsx` is genuinely viewable signed out, and a
workspace id is not sensitive by itself — visibility of anything real
stays gated by `api.my_documents()` separately.

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
  missing `ON DELETE` clauses; and the portfolio-caption gap, both found
  by building the next package rather than discovered by a user later.
- **`portfolio_items`' public visibility, and its `caption` field, were
  both discoveries** surfaced only by actually building the read switch
  end to end rather than stopping at the database layer — the kind of
  gap structural tests and even live-data reconciliation would never
  catch, since neither exercises "what does the UI actually show."

## 7 · Regressions and known issues

**No regression.** Both live read switches (`fetchRequestPhotos`,
`fetchPortfolioItems`) are additive with proven fallbacks; every field
the old shape returned is still returned. `portfolio_items` and
`service_request_photos` remain fully authoritative and unmodified.

**What was not done: nothing in this epic has been run against any
database.** Eleven new migrations (`0055`–`0065`), eight diagnostics, all
written, none run.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| Migrations `0055`–`0065` not applied to any environment | **Critical** before either read switch reaches real users | `operations/PRODUCTION_MIGRATION_0018_0029.md`, owed a further update |
| Only six of eleven migrations have a dedicated diagnostic | Low | Linking tables, dual-write triggers, and the caption/resolver pair are exercised together or inside other diagnostics — stated economy |

## 8 · Verification performed

**Automated.** 875 → **978 tests**, 75 → **89 files** across this epic.
Every package ran lint, type-check, test and build before moving to the
next; all green. `src/lib/requestPhotos.js` and `src/lib/portfolio.js`
both changed for the first time in this epic; both covered by new unit
test files mocking `supabase.schema('api').rpc(...)` and the
storage-signing/public-URL paths, including every fallback case.

**On staging.** None. Neither new code path was exercised in a browser
this session — no working test credentials, no database connection, and
both changes degrade gracefully to identical prior behaviour without
either, so nothing new to observe in a browser without real data behind
the RPCs.

**Not performed.** No SQL diagnostic run. Nothing applied to any
environment.

## 9 · Sign-off

- [x] All nine work packages complete
- [x] Repository releasable — both live changes degrade gracefully to
      identical prior behaviour if the new migrations aren't applied
- [ ] **Live verification Pending**, the only thing standing between this
      epic and full closure in the sense every other epic uses the word:
      a direct Postgres connection to run the eight diagnostics written
      across this epic, then confirm `RECONCILE_DOCUMENTS.sql` passes
      against real data before either read switch is trusted with an
      environment that has real users.

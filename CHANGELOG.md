# Changelog

All notable changes to Klussie are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
adapted to this project's unit of delivery: **entries group under
engineering epics, not version numbers.** Klussie has no release
versioning yet — `docs/IMPLEMENTATION_ROADMAP.md` delivers epics, and an
epic is what a reader wants to locate. If versioned releases arrive
later, they slot in above the epics without restructuring this file.

---

## How to write an entry

**When.** At epic completion, as part of the gates in
`docs/IMPLEMENTATION_ROADMAP.md` §7 — not at the end of every work
package, which would make this a second commit log.

**What.** What changed for someone using or operating Klussie. Not a
restatement of the diff — `git log` already holds that, and holds it more
accurately.

**Categories**, used only when they have content:

| Category | For |
|---|---|
| `Added` | New capability |
| `Changed` | Different behaviour in something that already existed |
| `Deprecated` | Still works, going away, with what replaces it |
| `Removed` | Gone |
| `Fixed` | A defect corrected |
| `Security` | Anything affecting isolation, permissions, secrets or data protection |

**Two rules specific to this project:**

- **Behaviour changes are stated plainly.** Most migration work packages
  are deliberately behaviour-preserving; when one is not, this file says
  what a user sees differently. A silent behaviour change is a defect
  whether or not it was intended.
- **Migrations name their step.** Where an entry covers part of the
  six-step migration pattern (roadmap §3), it says which step, because
  "reads now come from the new structure" and "the old structure was
  dropped" are very different events to a reader debugging something
  months later.

---

## Unreleased

### Added

**Epic 00 — Engineering Foundations.** Nothing in this epic changes what
a user sees; all of it changes what can be built safely afterwards.

- **CI pipeline** gating every push and pull request on lint, type-check,
  test and build.
- **This changelog**, and the rule that every epic updates it.
- **TypeScript toolchain** alongside JavaScript, `strict` from the start,
  with one leaf module converted as proof. No big-bang migration.
- **A staging environment.** Production is no longer the only environment
  Klussie has ever had. All 17 migrations replayed onto an empty database
  with no file modified — **the first proof that the migration chain can
  rebuild the schema from nothing.**
- **A disaster recovery strategy** that works on the Supabase Free plan
  without Docker: native `pg_dump` over the session pooler, storage via
  the Storage API, four backup cadences, and a stated RPO/RTO
  ([ADR-0017](docs/adr/0017-free-tier-disaster-recovery-strategy.md)).
  Klussie previously had **no working backup mechanism of any kind**.
- **A regression baseline** — a definition of what a behavioural
  regression is, an inventory of all 59 user-facing flows, and automated
  pins on the known defects so none is fixed silently
  ([TESTING.md](docs/engineering/TESTING.md)).

### Changed

- Test suite grew from 404 tests across 22 files to **411 across 24**.
- `.gitignore` now covers Supabase CLI machine state (`supabase/.temp/`).

### Notes

- **No behaviour changed for users in this epic.** The literal
  escape-text defects and the untranslated `awaiting_pro` status are
  deliberately preserved and now pinned by tests — fixing either is a
  declared change requiring its own entry here.
- The restore procedure is documented and its tooling verified, but **no
  restore drill has been performed** — the Free plan provides two
  projects and neither can be consumed as a target.

---

## Before this file

This changelog begins with Epic 00. Klussie was built over roughly forty
commits before that point — the marketplace, AI intake, ten-locale
i18n, the design system, Property Memory V1, and the architecture phase
that produced the five frozen documents.

**That history is not reconstructed here, on purpose.** A changelog
written after the fact is a later guess at what mattered, presented with
the authority of a contemporaneous record. `git log` is the accurate
source for anything before Epic 00, and
`docs/architecture/ARCHITECTURE.md` describes what that history actually
built.

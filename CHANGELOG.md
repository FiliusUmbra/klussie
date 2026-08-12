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

- **Engineering foundations (Epic 00, in progress).** CI pipeline gating
  every push and pull request on lint, test and build. This changelog.

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

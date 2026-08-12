# Implementation Workspace

Where engineering work is tracked. The plan lives in
[`docs/IMPLEMENTATION_ROADMAP.md`](../docs/IMPLEMENTATION_ROADMAP.md);
the working record lives here.

**Start here:** [`ENGINEERING.md`](../ENGINEERING.md) — the operating
manual.

---

## Layout

```
implementation/
├── README.md                    this file
├── templates/                   copy from these; never edit in place
│   ├── WORK_PACKAGE.md
│   ├── DEFINITION_OF_DONE.md
│   ├── REVIEW_CHECKLIST.md
│   ├── ROLLBACK_CHECKLIST.md
│   ├── ADR_WORKFLOW.md
│   └── EPIC_COMPLETION.md
├── epic-00/                     Engineering Foundations
│   ├── README.md                epic tracker
│   ├── wp-00.01-*.md            one file per work package
│   └── COMPLETION.md            written at epic close
└── epic-01/                     Schema Foundation & Event Backbone
    └── README.md
```

Epic folders are created **when the epic starts**, not in advance. Only
`epic-00` and `epic-01` exist today, because only those are imminent.

---

## Working a package

1. Copy `templates/WORK_PACKAGE.md` to
   `epic-NN/wp-NN.NN-short-slug.md` and fill in the plan **before**
   writing code.
2. Branch: `epic-NN/wp-NN.NN-short-slug`.
3. Implement only what the package says.
4. Verify: `npm run lint && npm test && npm run build`.
5. Check `templates/DEFINITION_OF_DONE.md` §1.
6. Update the package file with what actually happened.
7. Tick it in the epic README.
8. **Stop.** One package per session.

## Closing an epic

1. Every package done and ticked.
2. Copy `templates/EPIC_COMPLETION.md` to `epic-NN/COMPLETION.md`.
3. Work the ten gates in roadmap §7.
4. Update the documents the epic owes (roadmap §9).
5. Mark the epic complete in the roadmap's status table.

---

## Conventions

**Branches.** `epic-NN/wp-NN.NN-slug` · `adr/NNNN-slug` · `fix/slug`

**Commits.** `Epic NN WPnn: <imperative summary>` — the convention
already in this repository's history, kept for continuity.

**Work package files** record the plan *and* the outcome. A package file
that still reads like a plan after the work is done is incomplete — the
value is in what actually happened.

---

## The rules that matter most

From [`ENGINEERING.md`](../ENGINEERING.md) §6, repeated because they are
the ones violated under pressure:

- **The application is fully functional after every completed work
  package.** Not after every epic.
- **No architectural drift.** The five frozen documents are the only
  source of truth. Deviating requires an ADR *before* the code.
- **Never branch on workspace type.** Branch on capability.
- **A read-switch without a passing reconciliation is not permitted.**
- **Backfills are idempotent and re-runnable.**
- **Stop at the end of a work package.**

# Design Governance

**This document owns:** the process layer — how a design decision gets
made, reviewed, and changed; how a new token/component/pattern gets
proposed; who has final say; how `docs/design/` itself stays accurate
over time. It does not own design content (every other document in this
folder) — it owns the process that keeps that content honest.

This is also the document that defines the **Head of Design** role every
other document in this folder assigns things to. That role doesn't exist
as an actual person yet — this is a single-maintainer project, same
"Unassigned" as every ownership field in `MASTER_CONTEXT.md` §4. Writing
this document doesn't create the role; it defines what the role would be
responsible for once someone holds it.

---

## Roles & ownership

Compiled from every document's own "This document owns" statement — the
real, current ownership model, not invented fresh for this summary:

| Document | Owner (role, not a person) |
|---|---|
| `DESIGN_SYSTEM.md` | Head of Design + Product, jointly |
| `DESIGN_TOKENS.md` | Whoever maintains the real `:root` block — design and engineering share it by necessity |
| `COMPONENT_LIBRARY.md` | Design Systems engineer + design, jointly |
| `ICONOGRAPHY.md` | Design Systems engineer |
| `UX_PATTERNS.md` | Head of Design, shared with whoever owns the feature the pattern lives in |
| `COPY_GUIDELINES.md` | Content/Product — a distinct skill from visual design, flagged as likely needing its own owner as the team grows |
| `LAYOUT_SYSTEM.md` | Design Systems engineer |
| `ANIMATION_GUIDELINES.md` | Design Systems engineer |
| `ILLUSTRATION_GUIDELINES.md` | Head of Design; an external photography contractor once anything is commissioned |
| `ACCESSIBILITY.md` | Design Systems engineer + QA — needs a verification owner, not just a spec owner |
| `RESPONSIVE_SYSTEM.md` | Design Systems engineer + frontend |
| `WHITE_LABEL.md` | Design Systems engineer, activated only when that roadmap phase starts |
| `DESIGN_GOVERNANCE.md` | Head of Design — this document defines that authority |

Every row is currently unfilled by an actual person. That's not a gap
this document can close — it's an honest map of *where* responsibility
should land once there's a team to put it on, matching
`MASTER_CONTEXT.md` §4's Repository Health table.

## Change process

Extends `COMPONENT_LIBRARY.md`'s Contribution process (originally scoped
to components) to cover tokens and patterns too, since the real question
is the same one three times: **can something that already exists be
extended, or is this genuinely new?**

1. **Check the constitution first.** Does the proposal pass
   `DESIGN_SYSTEM.md`'s Component Litmus Test (increases trust, reduces
   cognitive load, feels effortless) and its Final Rule (improves Trust,
   Usability, Accessibility, Performance, or Clarity — not "looks more
   modern")? If not, it doesn't proceed regardless of how small it is.
2. **Check for an existing extension point.** A new `Badge` tone, a new
   `PriceTag` size, a new spacing value that fits the existing
   `--space-1`–`6` scale — these are variants of something real, not new
   things. `COMPONENT_LIBRARY.md`'s Index table (real usage counts per
   component) and `DESIGN_TOKENS.md`'s tables are the first place to
   check, not a fresh proposal.
3. **If it's genuinely new, the code change and the documentation change
   land in the same commit.** This is not a style preference — it's the
   specific, real failure this project already hit twice in
   `DESIGN_TOKENS.md`'s audit (`--ink-faint` referenced before it was
   defined; `--surface-2` referenced and never defined at all). A token,
   component, or pattern that exists in code but not in its document — or
   vice versa — is exactly the bug class this rule exists to prevent.
4. **Update `docs/design/README.md`'s status row** if the change affects
   what's Implemented/In Progress/Planned for that document — the index
   is only trustworthy if every change to what it describes updates it in
   the same pass.

## Versioning

Every document in this folder carries a `Version X.Y — date` footer,
mirroring `MASTER_CONTEXT.md`'s convention. The rule, stated for the
first time here even though it was implicitly followed everywhere else:
**a version bumps when a document's real content changes, in the same
change that changes it.**

**This rule was already broken twice before this document existed to
state it.** `COPY_GUIDELINES.md` and `DESIGN_TOKENS.md` were both edited
in the Phase 6 accessibility pass (a corrected RTL finding, a corrected
`--ink-faint` story) but their footers still read "Version 1.0" — no
bump, despite real content changing. Both are fixed as part of writing
this document (now `1.1`), and both fixes are the concrete example of why
this rule needs to be written down rather than assumed: informal
discipline held for six phases and then quietly lapsed on exactly the
two documents that got a second pass. `docs/design/README.md` is the one
deliberate exception — it's stated to be a living index updated every
phase, not a versioned artifact, and doesn't carry its own version
footer.

## Review cadence

No fixed schedule exists — this is a single-maintainer project, and a
calendar cadence would be aspirational fiction the same way an invented
breakpoint scale would be (`RESPONSIVE_SYSTEM.md`). The real trigger that
already exists in this doc set: `MASTER_CONTEXT.md` §4's Repository
Health table is meant to be revisited "opportunistically, not
automatically" — this folder should be reviewed on the same cadence,
alongside it, not on a separate schedule. When a real team exists, a
monthly or quarterly cadence is the reasonable default to adopt — not
decided here, since there's no one yet for it to be a commitment from.

## Escalation

When design and engineering disagree — a component the design spec calls
for that's expensive to build, a token change that cascades further than
expected — the tie-breaker is `DESIGN_SYSTEM.md`'s Final Rule: does the
change improve Trust, Usability, Accessibility, Performance, or Clarity?
If yes on the design side and the engineering cost is real, that's a
roadmap sequencing question for `MASTER_CONTEXT.md`, not a reason to skip
the documentation update. If neither side can point to one of those five
things, per the Final Rule, the change doesn't happen — that's not an
escalation, that's the rule already deciding it.

## Deprecation process

Not yet needed — nothing in this documentation set has been deprecated.
When it is: mark the item's status `Deprecated` in its document (not
silently removed), keep it working until every real usage has migrated
(`COMPONENT_LIBRARY.md`'s real usage counts exist specifically so this
check is possible instead of guessed at), then remove it in its own
change — never bundled with unrelated work, matching
`ENGINEERING_STANDARDS.md`'s general discipline against mixing concerns
in one change.

---

## Closing the loop

This is the eighth and final phase of the `docs/design/` architecture.
`docs/design/README.md`'s status column is now accurate for all 13
documents (including this one) — every row reads Implemented, meaning
each document itself is real and written, which is a different claim
than "the system it describes is complete." Several — `RESPONSIVE_SYSTEM.md`,
`WHITE_LABEL.md`, large parts of `ILLUSTRATION_GUIDELINES.md` — describe
mostly Planned realities on purpose, and say so plainly rather than
padding themselves out. That distinction, stated once here, is the thing
worth carrying forward past this phase: a documentation set is honest not
because everything in it is finished, but because it never claims to be
finished when it isn't.

---

Version 1.0 — 2026-08-05

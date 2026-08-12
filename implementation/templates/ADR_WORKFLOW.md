# ADR Workflow

**When implementation appears to require something the frozen
architecture does not allow: stop. Do not decide in passing.**

This document is the procedure. The format and the index are owned by
[`docs/adr/README.md`](../../docs/adr/README.md) and are not restated
here.

---

## 1 · Does this need an ADR?

**Yes, if any of these is true** (from `docs/adr/README.md`):

- The decision would be expensive or awkward to reverse later
- A future contributor — human or AI — could plausibly "fix" it back to
  the alternative without knowing why it was rejected
- It sets a pattern other code is expected to follow

**Specific to this project, always yes for:**

- Any deviation from a frozen architecture document
- A genuinely necessary shortcut (which then carries a removal trigger)
- A new boundary crossing beyond the closed registry
- A change to what an engine owns
- A technology choice not already named in `SUPABASE_ARCHITECTURE.md`

**No, if:**

- There is no real alternative — it is the only way it works
- It is a local implementation detail with no pattern-setting effect
- It belongs in `MASTER_CONTEXT.md` §16 because it has not actually been
  decided yet

---

## 2 · The procedure

**Order matters. The ADR comes before the code.** An ADR written
afterwards is a justification, not a decision, and it will read like one
to whoever finds it in three years.

1. **Stop implementing.** Leave the branch as it is.
2. **Write the ADR** — next number in sequence, never reusing or
   renumbering. Branch: `adr/NNNN-short-slug`.
3. **State the real alternatives.** An ADR with one option is a note. The
   value is in recording what was rejected and why.
4. **Be honest about consequences** — what it makes easier, what it makes
   harder, what it rules out. The "makes harder" section is the one
   future readers actually need.
5. **Get it accepted.** For a deviation from frozen architecture, this
   needs explicit confirmation — it is not a call to make alone.
6. **Update `docs/adr/README.md`** — the index is canonical.
7. **Update `docs/MASTER_CONTEXT.md` §15.**
8. **Then implement**, referencing the ADR in the commit.

---

## 3 · Superseding

**An ADR is never edited after the fact.** It records a point-in-time
decision. A changed decision gets a new ADR whose status supersedes the
old one, and the old one keeps its text and points forward.

Extending rather than replacing? Say so explicitly — ADR-0014 extends
ADR-0013 without superseding it, and both stand. That distinction is
worth preserving.

---

## 4 · Where ADRs sit relative to frozen documents

The five frozen documents are the architectural source of truth. **An ADR
is how they change** — never a direct edit.

If an accepted ADR contradicts a frozen document, the ADR wins from its
date forward, and the frozen document is annotated to point at it. The
frozen text itself is not rewritten: the architecture's history is part
of its value, and a document that silently changes cannot be trusted
about anything.

---

## 5 · Naming

```
docs/adr/NNNN-short-kebab-title.md
```

Sequential, never reused, never renumbered — including for superseded
ADRs. The next number is one above the highest in the index, regardless
of status.

---

## 6 · The failure mode this exists to prevent

The dangerous case is not a bad ADR. It is **the decision nobody wrote
down** — a deviation made under delivery pressure because writing it up
felt like overhead, discovered eighteen months later by someone who
cannot tell whether it was deliberate.

Every rule in the frozen architecture exists because breaking it is
locally convenient. That is precisely why the deviation needs a record.

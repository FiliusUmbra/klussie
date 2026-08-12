# Rollback Checklist

Rollback is a planned path, not an improvisation. Every work package
states its rollback before it is implemented, and this checklist is how
that path is executed.

**The governing property** (roadmap §3): *no step ever requires reversing
a data migration.* If a rollback appears to need one, stop — something
was sequenced wrongly, and forcing it is how data is lost.

---

## 1 · Before rolling back — 60 seconds of assessment

- [ ] What is actually broken? Symptom, not theory
- [ ] Which work package introduced it?
- [ ] Which migration step was it (roadmap §3)?
- [ ] Is anyone's data at risk **right now**? If yes, that is the first
      priority and rollback is second
- [ ] Is rolling forward genuinely safer? Sometimes it is — say so and
      decide deliberately rather than by reflex

## 2 · By migration step

| Step | Rollback | Data loss? |
|---|---|---|
| **1 · add** | Drop what was added | None — it was never read or written |
| **2 · backfill** | Delete the backfilled rows | None — the source is untouched |
| **3 · dual-write** | Remove the second write | None — the old path is still authoritative |
| **4 · reconcile** | Nothing to roll back | None — read-only |
| **5 · switch reads** | **Revert the read path — a code change only** | None — both structures are still written |
| **6 · retire** | **Restore from backup** | **Possible — this is the one irreversible step** |

**Step 6 is the only dangerous one**, which is why it happens weeks after
the read-switch, after a soak period, and never in the same session.

## 3 · Code rollback

- [ ] Identify the commit or PR
- [ ] Revert on a branch, not directly on `main`
- [ ] `npm run lint && npm test && npm run build`
- [ ] Verify the specific broken behaviour is restored
- [ ] Verify nothing else regressed — run the regression suite, not a
      spot check
- [ ] Deploy the revert
- [ ] Confirm in the live environment

## 4 · Database rollback

- [ ] Confirm which migration step this was (§2)
- [ ] **Confirm a backup exists and is recent** before touching anything
- [ ] Apply the reversal on staging first — always, without exception
- [ ] Verify on staging
- [ ] Apply to production
- [ ] Verify against known data
- [ ] Confirm no orphaned rows or dangling references remain

> Until WP 00.06 lands there is no staging. **Until then, no database
> rollback is attempted without a fresh verified backup and explicit
> confirmation.**

## 5 · After

- [ ] Application verified working
- [ ] Root cause understood — not merely worked around
- [ ] Work package file updated with what happened and why
- [ ] `docs/MASTER_CONTEXT.md` updated if the state changed materially
- [ ] The gap that let this through is closed — usually a missing test.
      **Add it before re-attempting**
- [ ] Re-attempt planned, with the flaw addressed

## 6 · Escalate rather than improvise

Stop and ask when:

- Data may already be lost
- The rollback would itself lose data
- Production is affected and the cause is not understood
- A backup is needed and none is verified
- Rolling back would leave the application in a state neither before nor
  after

**A confused rollback does more damage than a slow one.** Nothing here is
so urgent that it justifies acting without understanding.

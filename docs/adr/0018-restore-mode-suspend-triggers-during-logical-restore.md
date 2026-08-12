# ADR-0018: Restore Mode — suspend platform triggers during logical restores

**Status:** Proposed — **recorded, deliberately not implemented**
**Date:** 2026-08-12
**Related:** [ADR-0017](0017-free-tier-disaster-recovery-strategy.md),
`../operations/DISASTER_RECOVERY.md` §5.0 §5.9 §7,
`../architecture/PLATFORM_DOMAIN_MODEL.md` §14.2 (business rules are
configuration, not triggers)

## Context

Klussie's logical restore is complicated by its own triggers. Nine of
them fire on insert or update, and a naive data restore does not produce
a copy of production — it produces a database that **re-ran its own
history**: `handle_new_user` inserting profiles, `handle_quote_sent`
moving request statuses, `handle_new_review` recomputing `pro_stats`,
`handle_new_request` and `handle_job_completed` re-emitting domain
events.

`DISASTER_RECOVERY.md` §5.0 mitigates this with **ordering**:
`pg_dump --section` splits the schema so data loads into a database whose
triggers do not exist yet, and are created afterwards.

**Ordering solves eight of the nine.** It cannot solve
`handle_new_user`, which sits on `auth.users` — a Supabase-managed table
that exists in a fresh project before any restore begins and is therefore
not in our dump to reorder. That one is *mitigated*, not solved:
`--on-conflict-do-nothing` prevents the trigger's rows from breaking the
restore, but whether the surviving `profiles` rows carry restored values
or trigger defaults is currently unknown and is the primary thing the
first drill must check.

**PostgreSQL has a proper mechanism for this.** Setting
`session_replication_role = 'replica'` causes the session to skip
user-defined triggers and foreign-key trigger enforcement — the standard
approach for logical restores and replication apply.

**Verified on Supabase, 2026-08-12** — this was the open question, and it
is answered:

```sql
set session_replication_role = 'replica';
show session_replication_role;   -- → replica
```

It succeeds for the `postgres` role on the session-mode pooler. **Restore
Mode is available today; it is not a future platform capability.**

**Alternatives considered:**

1. **Keep the four-stage ordering.** Works, proven in design if not yet
   in practice, no new privilege in play. Leaves `handle_new_user`
   mitigated rather than solved.
2. **Drop and recreate the `auth.users` trigger around a restore.**
   Touches a Supabase-managed schema, is destructive if interrupted, and
   would need re-verifying after every platform change.
3. **Restore Mode** — suspend triggers for the session, load, restore
   normal mode, verify integrity.

## Decision

**Define Restore Mode as a documented procedure, and do not adopt it
yet.**

Recorded now because the mechanism is verified and the reasoning is
fresh; not implemented because **the current four-stage procedure has
never been executed.** Replacing an untested procedure with a different
untested procedure would leave Klussie exactly as unproven, having spent
the effort. The first drill runs the documented path.

**What Restore Mode would be, when adopted:**

- A bounded procedure: `set session_replication_role = 'replica'`, load
  data, `set session_replication_role = 'origin'`, then verify referential
  integrity explicitly, because FK enforcement was off during the load.
- **Restricted to restores into a scratch or replacement project.** Never
  a normal operating mode, and never used against a live production
  database serving traffic.
- Accompanied by a verification step, since the load no longer enforces
  what it normally would.

**Adoption trigger:** after the first successful drill on the current
procedure, and only if that drill shows the `handle_new_user` mitigation
producing wrong `profiles` values.

## Consequences

**Makes easier**

- **Solves `handle_new_user` rather than mitigating it.** The single
  weakness in the current design disappears — no trigger fires, so no
  conflicting rows exist, so restored profile values survive intact.
- **Collapses the restore from four files to two** — schema, then data —
  because ordering is no longer doing the work that trigger suspension
  does properly.
- **Unlocks COPY format.** With no conflicts to tolerate,
  `--on-conflict-do-nothing` is unnecessary, and §5.9's decisive argument
  for `--column-inserts` disappears. Restores become substantially faster
  at volume.
- Removes the ordering constraint that FK dependencies otherwise impose
  on data load sequence.

**Makes harder**

- **Foreign keys are not enforced during the load.** A malformed backup
  restores silently and produces a database that looks fine and is not.
  Integrity verification stops being optional.
- **A session left in `replica` mode silently disables business rules.**
  If that ever leaked into an application connection, quote acceptance
  would stop booking requests and reviews would stop updating stats —
  with no error anywhere. The procedure must be bounded and obviously
  scoped.
- Depends on a privilege Supabase currently grants. Verified today; not
  guaranteed forever. The four-stage procedure remains the fallback if
  that changes.
- Adds a second restore path, and two paths mean the less-used one rots.

**Rules out**

- Using Restore Mode against a production database serving traffic.
- Treating a Restore Mode load as verified without an explicit integrity
  check afterwards.
- Adopting it before the current procedure has been proven by a drill.

## Relationship to the current four-stage procedure

**It would simplify it, not supersede it.** The distinction matters and
is the reason this ADR is Proposed rather than Accepted.

| | Today (four-stage) | With Restore Mode |
|---|---|---|
| Schema files | `01-schema-pre`, `04-schema-post` | One schema file |
| Data files | `02-data-platform`, `03-data-public` | One data file |
| Restore steps | 4, order-critical | 2 |
| `--on-conflict-do-nothing` | Required | Unnecessary |
| Dump format | `--column-inserts` (forced) | COPY becomes viable |
| `handle_new_user` | Mitigated | Solved |
| FK enforcement during load | Normal | **Off — must verify after** |

**`DISASTER_RECOVERY.md` would not be replaced.** Its coverage table,
schedule, RPO/RTO, storage handling and safety rules are unaffected —
only §5's file layout and §7's ordering would change, and the four-stage
procedure would be retained as the documented fallback for any
environment where `session_replication_role` is unavailable.

**The four-stage procedure is not wasted work.** It is correct, it needs
no special privilege, and it is what proves the backups are real in the
first drill. Restore Mode is an optimisation to apply once there is
something working to optimise.

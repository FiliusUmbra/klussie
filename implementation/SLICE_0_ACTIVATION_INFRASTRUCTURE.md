# Slice 0 — Activation Infrastructure: Scoping

**This document owns:** the concrete work-package breakdown for
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, Slice 0. It does not own the Programme's cross-cutting reasoning
(the Four Questions, the Legacy Inventory, the Activation Ratio) — this
document applies that reasoning to one slice, in the level of detail
`implementation/templates/WORK_PACKAGE.md` requires before a package can
actually be picked up.

**Status.** Complete. All seven work packages built and verified against
staging — `ADR-0029`/`0030` `Accepted`; `0132`–`0134` applied; the
client shell and Audit viewer merged; `VERIFY_SLICE_0_END_TO_END.sql`
(WP 0.7) passes. §6 below is the honest accounting — six of seven
acceptance criteria hold; one does not yet, for a reason outside this
slice's own scope, stated plainly rather than glossed over.

**Why Slice 0 first.** Per the Programme's own §5: it activates no
user-facing journey and is invisible to the homeowner and the
professional. It exists because every other slice's Four-Questions
answer for Platform Operations is unanswerable without it — Slice 1
already names this directly ("Workspace lookup's *read-only* half ships
alongside this slice... its access-request half waits for Slice 0 to be
fully proven in production first").

---

## 1 · What was found before scoping this

Two things this session verified by reading the actual schema rather
than assuming from the architecture documents — both change the shape
of the recommendation below, so they're stated first.

**The audit write path is narrower than "closed."** `MASTER_CONTEXT.md`
§12 lists it as closed by Epic 16, and it is — but `platform.write_audit_record()`
(`supabase/migrations/0105_audit_write_path.sql`) is granted to exactly
one caller, `klussie_engine_knowledge`, for exactly one real caller
(`knowledge.promote_fact()`). Its own header states the intended
pattern plainly: *"any other engine that later has a real audited
action to record is a one-line grant addition to this function, not a
redesign."* Slice 0's audit-viewer work needs a **read** path, which
doesn't exist in any form yet — nothing has ever queried
`platform.audit_records` from outside `postgres`.

**`klussie_operator` cannot be assumed as a login mechanism.** It is a
`NOLOGIN` group role (`docs/operations/ROLES.md` §2) — like every
engine role, nothing connects *as* it directly. It is meant to be
assumed by a `SECURITY DEFINER` function, the same shape as every
engine contract this whole platform is built from. This rules out the
naive reading of "give operators the `klussie_operator` role" as a
literal login mechanism — it was never going to be one, and Decision 2
below is scoped around that correctly rather than around a
misreading of `ROLES.md`.

---

## 2 · Decision 1 — the client-read strategy

**Recommendation carried forward from the superseded `ROADMAP_SEQUENCING.md`
§3, unchanged by this scoping pass:** RPC/API routes as the default,
matching ADR-0024 and the AI Gateway's own existing pattern
(`api/_lib/aiGateway.js`) — a client calls a contract function; the
function enforces capability and permission itself; a missing
function fails loud, a missing RLS grant fails silent. Direct
PostgREST reads remain acceptable only for the narrow, already-precedented
case Epic 07/08 established (a single-table read behind a real RLS
policy, verified against staging before being trusted).

This decision is scoped as an ADR because it binds every later slice's
client code, not because it is contested — the reasoning already exists;
what's missing is a document with a number that later work can cite.

### WP 0.1 — ADR: client access pattern for the new engines

**Goal.** A numbered, `Proposed` ADR stating the RPC/API-route default
and the narrow exception, so Slice 1 onward has one citation instead of
a paragraph in a superseded planning document.

**Not a migration.**

**Architecture references.**
- `docs/adr/0024-request-context-resolved-in-the-database.md` — the
  precedent this ADR extends from a general principle to a concrete
  client-access rule.
- `docs/operations/ROLES.md` §7 rule 3 — "a direct client read is
  opened per table, never per schema" — the boundary this ADR must not
  loosen.

**Scope.**
- **In scope:** stating the default, the exception, and the review
  question a future work package must answer before choosing direct
  reads over an RPC ("has this exact table's RLS policy been verified
  against a live client, the way Epic 07's household-items switch
  was?").
- **Explicitly out of scope:** re-litigating ADR-0024 itself; specifying
  a naming convention for the RPC functions (that belongs to whichever
  slice writes the first one).

**Acceptance criteria.**
- [ ] ADR filed as `docs/adr/0029-<slug>.md`, `Proposed`.
- [ ] `docs/adr/README.md` index updated.
- [ ] Cites this document and the Programme, not the other way around —
  the ADR is the durable artifact; this scoping document is working
  material.

---

## 3 · Decision 2 — the operator identity mechanism

This is the real design work in Slice 0. `ROADMAP_C_PLATFORM_OPERATIONS.md`
§4/§10 named three options and recommended none of them. Scoping this
slice requires an actual recommendation, argued from the same
architecture the rest of the platform is held to — not a fourth
unresolved option added to the list.

### 3.1 · The recommendation: an Operations Workspace, not a new mechanism

**An operator is a person, and this platform already has exactly one
way for a person to gain scoped access to something: a membership.**
Rather than inventing a second path, Slice 0 should stand up **one
real workspace** — `type = 'business'` (the closest existing preset;
`workspace.workspaces.type` is a three-value check constraint with no
`'operator'` value today, and per Principle 1, type is a label, never a
branch — see 3.3 for why extending the constraint is explicitly *not*
recommended), holding a new capability, with real people as real
members:

```
workspace.workspaces
  id: <fixed, seeded>
  type: 'business'
  name: 'Klussie Operations'

platform.capabilities
  + one new row: capability_key = 'platform_operations'
    (never granted to any customer-facing plan/preset — §24's table
    gets no new column, this capability simply never appears in it)

workspace.memberships
  one row per real operator, role = 'Administrator' | 'Support' | ...
  (role is free text, unconstrained — no schema change to add role
  names, exactly the same mechanism §7's own role-shape table describes)
```

**Why this is the architecturally correct answer, not merely a
convenient one:**

- **Principle 3 (One Identity) is honoured, not worked around.** An
  operator authenticates exactly like everyone else — Supabase Auth,
  the identity they already have if they're also a customer. They gain
  a *second membership*, in the Operations workspace, exactly as
  anyone gains a second workspace. No parallel login, no second
  password, no second identity table.
- **Permission evaluation stays at one point** (§28 rule 11). Whether
  someone may act as an operator is answered by the same membership
  check every other permission question in this platform is answered
  by. A second, parallel "is this an admin" boolean anywhere — on the
  identity row, in an environment variable allowlist — is exactly the
  second path §7/§28 forbid, and is what the rejected alternatives
  in `ROADMAP_C` §4/§10 would have built.
- **It makes §12.3's own trust guarantee literally true, not merely
  stated.** Administration engine access to a customer workspace is
  already specified as "the same mechanism as contractor access" (a
  time-boxed, scoped membership). If the *operator's own* access is
  built the same way — a membership, auditable, revocable, time-boundable
  — then there is exactly one access-granting mechanism in the entire
  platform, top to bottom, which is the "One Engine" principle applied
  to Administration for the first time since it was named in
  `SYSTEM_ARCHITECTURE.md` §12.3 and never built.
- **It costs no new schema.** No new table, no new column, no new check
  constraint. One capability row, one workspace row, N membership rows.
  This is the cheapest possible answer measured in schema surface, and
  the schema-cheapest answer and the architecturally-correct answer are
  the same answer here — worth stating plainly because it is not always
  true and shouldn't be assumed as a default justification.

### 3.2 · What this does *not* solve, named honestly

- **No self-service path exists to *become* an operator, deliberately.**
  The first membership (the founder's own) is seeded by a migration,
  by hand, the same way `docs/operations/staging_test_accounts.sql`-style
  seeding already works for test accounts. Every subsequent operator is
  added the same way an enterprise customer's employee is invited (§8,
  direct invitation) — reusing existing machinery again, not inventing
  onboarding for a five-person internal team.
- **`klussie_engine_platform` needs new `SECURITY DEFINER` functions**,
  each checking "does the calling session's identity hold an active
  membership in the Operations workspace, at a role the requested
  action needs" before doing anything privileged — this is real,
  net-new function-writing work (WP 0.4 below), not free.

### 3.3 · The tension this recommendation does not paper over

`PLATFORM_DOMAIN_MODEL.md` §6.2 requires every capability to be
*"describable to a customer... if a capability cannot be explained to
the person paying for it, it is too fine-grained."* `platform_operations`
has no paying customer, ever, by design — it is the one capability in
the entire catalogue that exists purely for the operator of the
platform itself, not for anyone who could buy it.

This is a real finding, not a rationalization to explain away: either
(a) §6.2's rule is implicitly scoped to *customer-facing* capabilities
and Administration's own internal capability is a stated, narrow
exception — the more likely reading, since §12.3 already describes
Administration as structurally different from every customer-facing
engine — or (b) the rule needs a one-line amendment naming this
exception explicitly. **This is exactly what WP 0.2's ADR must resolve,
not this scoping document.**

**Extending `workspace.workspaces.type`'s check constraint to add a
fourth value (`'operator'` or similar) was considered and is not
recommended:** it would need its own migration touching a table every
other engine already depends on, for a distinction the `type` column is
explicitly documented as *not* supposed to carry meaning beyond preset
selection (Principle 1: "type is a preset name and a label for humans —
nothing more"). Using `'business'` plus a capability costs nothing and
is more consistent with the platform's own stated rule about what
`type` is for.

### WP 0.2 — ADR: operator identity via an internal Operations Workspace

**Goal.** A `Proposed` ADR recording §3.1's recommendation, its
rejected alternatives (the two `ROADMAP_C` §4 options this scoping
pass did not choose, plus the type-constraint-extension option named
in §3.3), and a resolution of the §3.3 tension.

**Not a migration** (WP 0.3 is).

**Architecture references.**
- `PLATFORM_DOMAIN_MODEL.md` §6.2 — the tension this ADR must resolve.
- `PLATFORM_DOMAIN_MODEL.md` §7, §8 — the membership/permission/
  invitation machinery this design reuses rather than replaces.
- `SYSTEM_ARCHITECTURE.md` §12.3 — Administration's own stated
  boundary ("no customer data whatsoever... the same mechanism as
  contractor access").

**Acceptance criteria.**
- [ ] ADR filed as `docs/adr/0030-<slug>.md`, `Proposed`.
- [ ] Explicitly resolves the §6.2 tension (§3.3 above) one way or the
  other — not left open.
- [ ] States the capability key (`platform_operations` or a better name
  chosen during drafting) as the literal string WP 0.3's migration must
  use.

---

## 4 · Build work packages

Everything below depends on WP 0.2 reaching `Proposed` — building the
schema before the design is written down inverts this session's own
established discipline (every fix this session was traced to root
cause and verified before being trusted; the same applies to
architecture, not only bugs).

### WP 0.3 — Migration: the Operations Workspace

**Migration step.** `add` only — no existing data, nothing to backfill,
nothing to dual-write. The simplest of the six steps, alone.

**Architecture references.** WP 0.2's own ADR, once filed.

**Scope.**
- **In scope:** one `platform.capabilities` row; one `workspace.workspaces`
  row; the founder's own first `workspace.memberships` row, seeded by
  the migration itself (the one deliberate exception to "migrations
  don't seed identity data," justified the same way
  `staging_test_accounts.sql` already is — there is no other honest way
  to bootstrap the first operator); RLS/grant posture matching
  `ROLES.md` §3's five rules exactly like every other table this
  session touched.
- **Explicitly out of scope:** any `SECURITY DEFINER` function (WP
  0.4); any client screen (WP 0.5/0.6).

**Tests.** A migration test in the established style
(`supabase/migrations/__tests__/`) asserting: exactly one
`platform_operations` capability row exists; it is never referenced by
any plan's `capability_keys` (WP 0.2's ADR resolves whether that's a
hard invariant or a convention — test accordingly); the Operations
workspace has `type = 'business'`.

**Diagnostic.** `VERIFY_OPERATIONS_WORKSPACE.sql`, matching this
session's own pattern — run against staging, prove the founder's seeded
membership actually resolves through `workspace.current_memberships()`
before trusting anything built on top of it.

### WP 0.4 — Migration: the audited read path

**Goal.** A `SECURITY DEFINER` function an operator's own client can
call to read `platform.audit_records`, gated on real membership in the
Operations Workspace — the first genuine consumer of `platform.audit_records`
outside `postgres` since the table was created in Epic 01.

**Migration step.** Not a six-step migration (there is no existing data
this reads *into* client-visibility for the first time in the sense §3
of the roadmap means — this is a brand new read path onto an
already-append-only table). Treat as `add`.

**Architecture references.**
- `supabase/migrations/0105_audit_write_path.sql` — the mirror pattern
  this function's *read* counterpart should follow structurally
  (`SECURITY DEFINER`, revoke-from-`PUBLIC`-then-grant-narrow), even
  though it authorizes reads instead of writes.
- `PLATFORM_DOMAIN_MODEL.md` §23 — what the viewer (WP 0.6) needs to be
  able to show: actor, workspace, action, outcome, authority,
  correlation.

**Scope.**
- **In scope:** one function (`platform.list_audit_records()` or
  similar), owned by `klussie_engine_platform` (the schema's existing
  owner per `ROLES.md` §2.1 — Administration is already named under
  this role's ownership, unbuilt until now), checking the caller's
  Operations-workspace membership before returning anything; pagination
  and filtering (actor, workspace, action, time range) sufficient for
  WP 0.6's screen, nothing more.
- **Explicitly out of scope:** export (§23's own named future); any
  write capability; any other Catalogue/Billing/Trust-and-Safety
  function — those belong to later slices per the Programme §5.

**Tests.** Function-level tests plus a diagnostic proving the negative
case directly: a session with **no** Operations-workspace membership,
including one with an otherwise-valid session, gets zero rows or a
clean denial — never a partial or filtered-looking result that could be
mistaken for "there's nothing to see" rather than "you may not see
this." This is the same class of proof this session's own diagnostic
sweep insisted on throughout (VERIFY_*_ISOLATION_POLICIES.sql
precedent) — reuse that discipline exactly.

### WP 0.5 — Client: operator sign-in and shell

**Goal.** An operator can sign in (existing Supabase Auth, no new auth
code) and land in a minimal shell distinguishing "you are in the
Operations Workspace" from every other context — reusing `AppShell.jsx`'s
existing workspace-context-resolution logic rather than building a
parallel one, since an operator's session *is* a normal session with an
extra membership, not a different kind of session.

**Frontend.** New: a route/shell gated on "does `activeWorkspace`
resolve to the seeded Operations Workspace." No new design system
components required for this package specifically — reuse existing
shell chrome; §5's screens (WP 0.6 onward) are where real new UI work
happens.

**Explicitly out of scope:** any screen beyond a landing shell and the
audit viewer's own entry point.

### WP 0.6 — Client: the Audit viewer

**Goal.** `ROADMAP_C_PLATFORM_OPERATIONS.md` §3.7, built for real:
searchable by actor, workspace, action type and time range, reading
through WP 0.4's function.

**Frontend.** New screen. First real UI investment in Roadmap C's
"first-class product" instruction — worth building with the same
design discipline as the customer canvas, not as a bare table, per
`ROADMAP_C` §3.7's own framing.

**Behaviour.** New — this is the first Platform Operations screen to
exist at all.

**Acceptance criteria.**
- [ ] Every action taken by WP 0.3–0.5's own machinery (the founder's
  seed membership, any subsequent operator invitation) is itself
  visible in this viewer once seeded — the slice proves itself by being
  able to show its own creation.

### WP 0.7 — Diagnostic: prove the whole slice, end to end

**Goal.** One diagnostic, in the style of every `VERIFY_*.sql` this
session has written and fixed, run against staging before Slice 0 is
declared done: seed a second, non-operator identity; confirm it cannot
read audit records through WP 0.4's function; confirm the founder's
seeded identity can; confirm the read function's own denial is itself
recorded (or deliberately is not — WP 0.2's ADR should say which, since
a denied read attempt is exactly the kind of fact §23 says audit exists
to capture, and leaving it unrecorded needs to be a decision, not an
oversight).

---

## 5 · Sequencing within Slice 0

```
WP 0.1 (ADR: client-read strategy) ──────────────┐
                                                   │ independent of each other,
WP 0.2 (ADR: operator identity)  ─────────────────┤ may run in parallel
                                                   │
                                                   ▼
                                          WP 0.3 (Operations Workspace migration)
                                                   │
                                                   ▼
                                          WP 0.4 (audited read path)
                                                   │
                                     ┌─────────────┴─────────────┐
                                     ▼                           ▼
                              WP 0.5 (operator shell)    (feeds into 0.6)
                                     │                           │
                                     └─────────────┬─────────────┘
                                                    ▼
                                          WP 0.6 (Audit viewer)
                                                    │
                                                    ▼
                                          WP 0.7 (end-to-end diagnostic)
```

WP 0.1 has no downstream dependency within Slice 0 itself — it is
sequenced here because it must exist before Slice 1's client code
starts, not because Slice 0's own later packages need it.

---

## 6 · Acceptance criteria for "Slice 0 is done"

Directly against the Programme's own §5 Slice 0 entry and §6 end-state
conditions — not a new bar invented here. Six of seven hold; the
seventh honestly does not yet, and is explained rather than marked done
regardless.

- [x] ADR-0029 and ADR-0030 both `Accepted` (§2, §3) — explicit
  confirmation received; both updated from `Proposed`.
- [x] The Operations Workspace exists in staging, seeded, verified via
  diagnostic (WP 0.3, WP 0.7) — `VERIFY_OPERATIONS_WORKSPACE.sql` and
  `VERIFY_SLICE_0_END_TO_END.sql` both pass.
- [x] `platform.audit_records` has a real, gated, tested read path — the
  first non-`postgres` consumer of that table since Epic 01 (WP 0.4) —
  `VERIFY_AUDIT_READ_PATH.sql` proves it with a real impersonated
  session, both directions.
- [ ] **The Audit viewer is live and shows real data, including its own
  bootstrap (WP 0.6) — not met.** The viewer itself is real, correct,
  and fully tested (`AuditLog.jsx`, verified against a fabricated
  record in `VERIFY_AUDIT_READ_PATH.sql`/`VERIFY_SLICE_0_END_TO_END.sql`).
  What's missing is real data to show: checked directly, exactly two
  call sites for `platform.write_audit_record()` exist anywhere in the
  codebase (`knowledge.promote_fact()`, the analytics contract), and
  neither has ever been invoked through a live client —
  `platform.audit_records` holds zero rows on staging, confirmed again
  by WP 0.7's own diagnostic. This is not a Slice 0 defect; it's a
  fact about the rest of the platform that Slice 0 surfaced rather than
  caused. Closing it needs a later slice to wire a real audited action
  (a support-access grant, a capability withdrawal) to an actual
  caller — tracked here, not fixed here.
- [x] Zero homeowner- or professional-facing behaviour changed — Slice 0
  is invisible to both, exactly as the Programme states. Confirmed: no
  file under `src/customer/`, `src/pro/`, or `src/home/` changed across
  any Slice 0 work package.
- [x] The Legacy Inventory (`PLATFORM_ACTIVATION_PROGRAMME.md` §3) gains
  no new row from this slice — nothing legacy is replaced yet, by
  design. Confirmed: no legacy table or client module was touched.
- [x] The Activation Ratio dashboard (§4 of the Programme) has
  somewhere to live once it's built — this slice does not build the
  dashboard itself, only the Overview shell it will eventually sit in.
  Read literally rather than generously: `OperatorApp.jsx` is that
  shell (the workspace-gated container, the tab mechanism), currently
  holding one tab (Audit); an Overview tab is additive to `TABS`, not a
  redesign, whenever a later slice builds it.

---

## 7 · Open questions — resolved

- **The §3.3 capability-describability tension** — resolved in
  `ADR-0030`'s own text: a capability used solely to gate the
  platform's own operator tooling, never granted to any customer-facing
  plan or preset, is a stated, narrow exception to §6.2's
  describability rule, not a violation of it.
- **Naming.** Kept as scoped: `platform_operations` and `Klussie
  Operations`, both live in `0132_operations_workspace.sql` unchanged.
- **Whether a denied (or any) audit-read attempt is itself audited**
  (WP 0.7) — **no.** Checked against `PLATFORM_DOMAIN_MODEL.md` §23's
  own list of what must be audited — permission/membership changes,
  access grants and revocations, commercial changes, exports or
  deletions, administrative actions, intelligence actions on a
  person's behalf. A plain view of the audit log, permitted or denied,
  matches none of them; §23 names *export* specifically as the
  auditable read-adjacent action (not built — out of scope per
  `0133`'s own header), which is the textual signal that a plain view
  without exporting was deliberately left out. `VERIFY_SLICE_0_END_TO_END.sql`
  check 4 proves this structurally, not just by citation: reading
  `platform.audit_records`, by an operator or a stranger, inserts no
  new row into it.

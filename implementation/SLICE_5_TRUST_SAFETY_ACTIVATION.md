# Slice 5 — Trust & Safety Activation: Scoping

**This document owns:** the concrete work-package breakdown for
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, Slice 5. It does not own the Programme's cross-cutting reasoning
(the Four Questions, §2; the Activation Priority, §1.1) or
[`ROADMAP_C_PLATFORM_OPERATIONS.md`](ROADMAP_C_PLATFORM_OPERATIONS.md)
§3.3/§5.1's own product framing, which this document applies rather
than restates.

**Status.** Scoping. Written after Slice 4's own close (all 3 WPs
shipped and live-verified, PRs #90/#91/#93, plus infra fixes #92/#94).
Slice 5 is next in the Programme's own sequencing (§5) — and the last
one before Beta 1: *"Beta 1 ships at the end of this slice."*

---

## 1 · The Four Questions (Programme §2), answered before scoping

**1 · Homeowner.** Filing a report is already real and reachable
(`ReportSheet.jsx`, from `RequestDetailSheet.jsx`) — this slice's
homeowner-facing surface is narrow: what happens to that report once
it's filed, and — where relevant — seeing the outcome of an
enforcement decision (§6.10: a suspended capability, never destroyed
data).

**2 · Professional.** The reported party. Today: nothing happens to
them at all once a report is filed — `public.reports` accumulates
rows nobody reads. This slice is what makes a report have real
consequences for the workspace it names.

**3 · Platform Operations.** This is where nearly all of this slice's
weight legitimately sits — `ROADMAP_C` §3.3 names it directly: a real
triage queue, a case view (reporter, reported party, evidence, decision
history, actions), and enforcement (`warn`/`suspend`/`escalate`/`close`).
`ROADMAP_C` §8 names this Phase C3, explicitly next after C1 (operator
identity + audit, done) and C2 (workspace lookup + support access,
done).

**4 · Legacy replaced.** `public.reports` — real data today (an actual
reporting flow exists, per `ROADMAP_C` §5.1: *"Report arrives (legacy
`reports` table, real today)"*), but keyed to the legacy identity model
(`public.profiles`/`public.pro_profiles`) and read by nobody. This
slice's "legacy replaced" is `reports` gaining a first real consumer,
not a table being deleted with nothing to show for it.

---

## 2 · What was found before scoping this — checked directly, not assumed

### 2.1 · The legacy `reports` table, checked directly

`0004_trustlocal_features.sql`:

```sql
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  pro_id uuid not null references public.pro_profiles (profile_id) on delete cascade,
  request_id uuid references public.service_requests (id) on delete set null,
  reason text not null check (reason in ('no_show','poor_quality','billing_issue','other')),
  details text,
  status text not null default 'open' check (status in ('open','reviewed','resolved')),
  created_at timestamptz not null default now()
);
```

`src/lib/reports.js` does one thing — a plain client-side
`supabase.from("reports").insert(...)`, no `api.*` delegate, no engine
at all. `src/customer/ReportSheet.jsx` is the one real caller. No read
path exists anywhere client-side — a customer cannot see their own past
reports, and nothing reads `status` to move it past `'open'`.

**What this means concretely:** this is pre-engine-architecture code,
same generation as the legacy `conversations`/`messages` tables Slice 4
found already superseded — except here nothing has superseded it yet.
`reporter_id`/`pro_id` are profile ids, not `person_ref`/`workspace_id`
— the reported party is a *person* (`pro_id`), not the *workspace* an
enforcement action would actually need to act on. This is a real
modelling gap, not merely a legacy-naming one: today's schema cannot
express "suspend this workspace's capability," because it never named
a workspace at all.

### 2.2 · `workspace.withdraw_capability()` already exists — the enforcement primitive this slice needs, not one it has to build

Checked directly (`0079_capability_contract.sql`): a real, working,
already-shipped function — removes a `workspace.capability_grants` row
(`withdrawn_at = now()`), refuses if a still-held capability depends on
the one being withdrawn, writes `workspace.capability_grant_history`,
emits `capability.capability_grant.withdrawn`. Exactly
§6.10's own rule already enforced: *"removes the grant, nothing else —
no feature's data is touched here, by construction."` Granted to
nobody but the engine role today (no caller check, no `api.*`
delegate) — the identical "built once, never wired to a real caller"
shape Slice 3 and Slice 4 both opened with for their own engines.
**This slice's enforcement action is largely a wiring problem, not a
new capability-model problem** — the hard part (§6.10's own semantics)
is already correct and already shipped.

### 2.3 · `is_certified` — named in `ROADMAP_C` §3.3, real but out of scope here

*"Certification verification (today's `is_certified` flag, currently
unverifiable by anyone) belongs here too: a document-review queue once
Document Intelligence exists."* Checked: `pro_profiles` (or its
successor) does carry a boolean nobody can currently evidence.
**Deliberately not scoped as a work package in this pass** — it
depends on Document Intelligence, which does not exist yet in this
codebase (no OCR/document-classification engine has shipped this
session). Named here so it isn't silently forgotten, matching this
programme's own "real, deliberately deferred decision" convention
(Slice 4 §2.3's browser-push precedent).

### 2.4 · Operator roles are still "one," not "plural" — `ROADMAP_C` §6's own open design question, still open

§6 states outright that *"Support, Trust & Safety, and platform
configuration are different jobs with different blast radii"* should
eventually be separate operator roles, composing permissions — and
that *"none of the following exists yet."* Checked directly:
`OperatorApp.jsx` today gates on exactly one capability
(`platform_operations`, ADR-0030) for everything — Audit, Workspace
Lookup, and (after this slice) Trust & Safety alike. **This slice does
not build "roles, plural."** It adds Trust & Safety as a fourth tab
inside the existing single-capability Operator shell, the same way
Workspace Lookup was added in Phase C2 — real, reachable, correctly
audited, but not yet permission-separated from an operator's other
powers. A future slice narrowing operator capabilities is a named,
separate piece of work, not something this slice's own schema choices
should block.

---

## 3 · Target schema — a new `safety` schema, matching this codebase's one-schema-per-engine convention

Checked: every existing bounded context — `identity`, `property`,
`work`, `workspace`, `platform`, `commerce`, `knowledge`,
`derived`, `analytics_ws`, `analytics_pf` — is its own schema with its
own `klussie_engine_*` role. Trust & Safety is a genuinely distinct
aggregate (a report becomes a case, a case gets a decision, a decision
can trigger an enforcement action) — proposed as a new schema, `safety`,
owned by a new role `klussie_engine_safety`, following the exact
pattern every engine since Epic 07 has used (its own schema, its own
role, `platform.emit_event()` reached the same way every non-platform
engine already reaches it).

**Report and case are the same row for v1** — `ROADMAP_C` §3.3's own
language ("each report opens into a case view") does not require a
many-reports-to-one-case merge model, and nothing in this codebase's
current data suggests duplicate reports are common enough to need one
yet. `safety.cases` (not `safety.reports` — the row's own lifecycle
*is* a case, from the moment it's filed) is proposed as the one table;
merging multiple reports into a case is a real, separable future
capability if it turns out to be needed, not a v1 requirement.

**Core columns (grounded in what a case view genuinely needs, per
`ROADMAP_C` §3.3's own list — reporter, reported workspace, evidence,
decision history, actions):**

- `id`, `reporter_person_ref` (not `reporter_id` — this codebase's own
  durable-reference convention, matching every other person-keyed
  column since `identity.identities`), `reported_workspace_id`
  (**the real fix over legacy's `pro_id`** — an enforcement action
  acts on a workspace, via `workspace.withdraw_capability()`, so the
  case must name one from the start)
- `category` (open text, matching `platform.notifications.category`'s
  own "the vocabulary of what warrants attention is not closed here"
  restraint, over legacy's closed four-value check constraint)
- `details` (free text, from the reporter)
- `subject_type`/`subject_id` (nullable — the same polymorphic
  reference shape `platform.notifications` already uses, pointing at
  the request/engagement/service record the report concerns, when
  there is one; legacy's `request_id` alone cannot reach a Service
  Record)
- `status` (`open` / `under_review` / `resolved` — matching legacy's
  three states; a fourth, `escalated`, per `ROADMAP_C`'s own action
  list)
- `created_at`

**`safety.decisions`** — append-only, one row per operator action on a
case (matching the workflow-transition/audit-log append-only pattern
already established everywhere else in this codebase, not a single
mutable "current decision" column): `id`, `case_id`, `operator_person_ref`,
`action` (`warn` / `suspend` / `escalate` / `close_no_action`),
`reason`, `capability_key` (nullable — only set when `action = 'suspend'`,
naming which capability `workspace.withdraw_capability()` was called
for), `decided_at`.

**No new evidence-storage table.** "Evidence" per `ROADMAP_C` §3.3 —
photos, messages, the relevant Service Record — already exists,
respectively, in `property.document_attachments`,
`work.messages`/`work.conversations`, and `work.service_records`. The
case view assembles these by real cross-engine reads keyed off
`subject_type`/`subject_id` and the reported workspace, the same
"compose at read time, never duplicate" principle `platform.my_inbox()`
and `property.locations_for_property()` already use — not a copy of
evidence into `safety`'s own tables.

---

## 4 · Work packages

### WP 5.0 — Trust & Safety contract: schema, file/decide write path, operator read path

- `safety.cases`/`safety.decisions` tables (§3 above), RLS enabled,
  no policy (matching the established "reachable only through
  `api.*`" posture every engine schema uses).
- `safety.file_case_for_caller()` — real caller check: the reporter's
  own `person_ref` must resolve from `auth.uid()` (the same
  `identity.identities` join WP 4.0/4.1 both already use), and
  `reported_workspace_id` must be a workspace the reporter has a real
  prior relationship with (an engagement or accepted quote against
  it) — refusing an anonymous, unrelated report, the same
  caller-authorization discipline every `_for_caller` wrapper in this
  programme already applies.
- `safety.record_decision_for_caller()` — real caller check: the
  caller must hold the `platform_operations` capability (§2.4 — one
  role for v1, not "Trust & Safety" specifically). When
  `p_action = 'suspend'`, calls `workspace.withdraw_capability()`
  directly (§2.2 — already correct, already shipped) rather than
  reimplementing withdrawal logic. Refuses `suspend` without a
  `capability_key`, refuses every other action *with* one.
- `safety.queue_for_caller()` / `safety.case_detail_for_caller()` —
  operator reads: the open/under-review queue, and one case's full
  detail assembled from the cross-engine reads §3 names. Both check
  the caller holds `platform_operations`, matching `AuditLog`'s and
  `WorkspaceLookup`'s own existing read-path shape.
- `api.*` delegates for all four, thin `SECURITY DEFINER`
  pass-throughs, matching every prior contract this programme has
  built.
- **Not built in WP 5.0**: `my_reports` (a reporter's own past-reports
  read). Not named in `ROADMAP_C` §5.1's own journey at all — the
  homeowner's role in this slice is filing and, later, seeing an
  enforcement outcome, not a full report history screen. A real,
  deliberately deferred decision, not an oversight — add it if a
  concrete need for it surfaces.

### WP 5.1 — Client: `ReportSheet.jsx` cuts over to the real contract

Depends on WP 5.0. `src/lib/reports.js`'s `submitReport()` calls
`api.file_case()` instead of the legacy table insert — same shape as
every other client cutover this programme has done (Slice 2 WP 2.6,
Slice 4's own Conversation half already being live). **Real design
choice this WP resolves**: `ReportSheet.jsx` today takes a `proId`
(a person), not a workspace — the caller resolving *which* of that
pro's workspaces to report needs the same kind of resolution
`RequestDetailSheet.jsx` already performs to reach a pro's
`performing_workspace_id` on an engagement. No new UI needed if the
report is always filed from a real engagement's own detail sheet
(today's only real entry point) — the workspace is already on hand
there.

### WP 5.2 — Client: the operator's own Trust & Safety tab

Depends on WP 5.0. A fourth tab on `OperatorApp.jsx`'s existing
`BottomNav` (Audit / Workspaces / Trust & Safety / Profile), following
`AuditLog.jsx`/`WorkspaceLookup.jsx`'s own established shape exactly —
a list (the queue) that opens into a detail view (the case), not a new
navigation pattern. The case view is the one genuinely new piece of UI
complexity this slice adds: reporter identity, reported workspace
identity, the assembled evidence (§3's cross-engine reads), the
decision history, and the four action buttons. Not scoped in
file-and-line detail here — real screen-level choices (how much
evidence renders inline vs. link-through; whether `suspend` needs a
confirming second step, given it is a genuinely consequential,
hard-to-casually-reverse action) belong to implementation, informed by
WP 5.0 actually existing first, matching WP 3.3's and WP 4.2's own
precedent of leaving screen-level decisions to the implementation pass.

---

## 5 · Sequencing

```
WP 5.0 (safety.* contract: file, decide, queue, case detail)
   │
   ├──▶ WP 5.1 (ReportSheet.jsx cuts over — homeowner side, small)
   │
   └──▶ WP 5.2 (Operator Trust & Safety tab — the real weight of this slice)
```

WP 5.1 and WP 5.2 both depend on WP 5.0 but not on each other — either
can ship first once the contract exists, matching Slice 3's own WP
3.1/3.2 fork rather than Slice 4's own strictly sequential shape.
**Recommended order: 5.0, then 5.2, then 5.1** — the operator side is
where nearly all of this slice's real product weight sits (§1's own
Four Questions answer), and a real queue with real cases in it is more
useful to verify against than an empty one; `ReportSheet.jsx`'s cutover
is a small, low-risk mechanical change once the contract exists,
safe to land whenever convenient after WP 5.2 proves the contract
itself is right.

This document does not decide whether Beta 1's own threshold (Programme
§4's Activation Ratio, at an agreed level, for every slice 0-5) is met
the moment WP 5.2 ships — that determination belongs to whoever owns
the Programme's own sign-off, not assumed here.

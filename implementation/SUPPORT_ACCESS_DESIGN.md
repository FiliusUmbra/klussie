# Support Access — Design Note

**This document owns:** the concrete work-package breakdown for the
consent-governed support-access flow
[`ROADMAP_C_PLATFORM_OPERATIONS.md`](ROADMAP_C_PLATFORM_OPERATIONS.md)
§3.2 names but Phase C2 never actually built — checked directly, not
assumed. It does not restate
[`PLATFORM_DOMAIN_MODEL.md`](../docs/architecture/PLATFORM_DOMAIN_MODEL.md)
§8 or
[`SYSTEM_ARCHITECTURE.md`](../docs/architecture/SYSTEM_ARCHITECTURE.md)
§12.3, which govern this and are applied rather than repeated below.

**Status: both work packages shipped.** WP S.0 (migration
`0172_support_access_contract.sql`, statically tested, applied live to
staging — a non-operator caller confirmed live-refused with the exact
expected error, proving the full `api.grant_support_access()` →
`_for_caller` → auth-check chain is real and reachable) and WP S.1 (a
real "Request access" button on `WorkspaceLookup.jsx`, opening
`SupportAccessSheet.jsx` — the purpose/duration form, the grant
history, "End access" on an active grant) both shipped.
`PLATFORM_ACTIVATION_PROGRAMME.md` marked Slice 0 / Phase C2
"Complete" for what it had actually built at the time —
`WorkspaceLookup.jsx`'s own read-only search-and-inspect half. §3.2's
own second half — *"a button that starts the same time-boxed, scoped,
consent-governed membership flow a contractor uses"* — was never
built until now. Named in that same document as *"the single
highest-priority screen for operating Beta 1 responsibly."*

---

## 1 · What was found before scoping this — checked directly, not assumed

### 1.1 · The mechanism is already named, precisely, in two architecture documents

`PLATFORM_DOMAIN_MODEL.md` §8: *"Temporary contractor access... is not
a special mechanism: it is a membership with a scope and an expiry...
Designing this as ordinary membership rather than a parallel 'external
access' concept is deliberate. A separate mechanism would mean two
systems that grant access, two places to audit, and two chances to get
revocation wrong."*

`SYSTEM_ARCHITECTURE.md` §12.3, stated as the Administration Engine's
own governing rule: *"Support access to a customer workspace is a
time-bounded, audited, consent-governed membership — the same
mechanism as contractor access, not a parallel one."* Named produced
events: `SupportAccessGranted`, `SupportAccessEnded`.

This is not a design choice this document is free to make differently
— it is already decided, twice, in the frozen architecture. The
mechanism is `workspace.memberships`, the same table
`workspace.grant_engagement_access()` (WP 2.4, migration 0162) already
writes to for contractor access — the reference implementation this
work package follows, not invents.

### 1.2 · The real primitive already exists and already proves the shape works

`workspace.grant_engagement_access()` (0162) is exactly this pattern
one level over: a `SECURITY DEFINER` delegate, minting a scoped,
time-boxed `workspace.memberships` row (`scope`, `expires_at`,
`granting_engagement_id` naming its own origin), emitting a real
event. Support access needs the identical shape with a different
trigger (an operator's own deliberate request, not an accepted quote)
and a different origin column (`granting_support_request_id`, not
`granting_engagement_id`).

### 1.3 · A real, previously undiscovered risk this scoping pass found — checked directly across the codebase, not assumed

**Almost nothing in this codebase discriminates a caller's *write*
privilege by membership `role` today.** Checked directly:
`workspace.current_memberships()` (0031) returns `role` as a column,
but every real caller found (`0036`, `0038`, `0041`, `0051`, `0054`,
`0059`, `0062`, and more) uses it purely as *"is this workspace one of
mine at all"* — `workspace_id in (select workspace_id from
workspace.current_memberships())` — never filtered by which role. This
is correct and harmless for every role that exists today
(`'owner'`/`'member'`/`'contractor'`, none of which this platform has
ever needed to distinguish for read-vs-write purposes, since a real
member is expected to both read and act).

**A `role = 'support'` membership breaks that assumption for the first
time.** `ROADMAP_C` §3.2 states support access is *"read-only by
default."* If a support-access grant is implemented as an ordinary
`workspace.memberships` row and nothing changes, an operator on a
support session would silently gain the *same write privileges* an
ordinary member has — sending messages, accepting quotes, creating
requests — across every engine that has never had a reason to check
role before, because none of them have ever needed to. This is not a
hypothetical: it is the direct, mechanical consequence of the
architecture's own correct "one mechanism, not two" mandate meeting a
codebase that has never had a non-privileged membership role before.

**This is the single most important open question this design resolves,
not a footnote.** Two credible resolutions, and this document
recommends the first:

- **(a) Read-only by construction, not by audit.** Support access
  reads go through new, purpose-built `workspace.support_*` /
  `api.*` functions — the same shape `AuditLog`/`WorkspaceLookup`/Trust
  & Safety's own queue already use (a real, scoped `SELECT`, nothing
  else) — rather than the support operator's own membership being
  relied on by *existing* write paths to correctly refuse them. The
  membership row itself still exists (§1.1's mandate is honored: one
  real, audited, expiring grant, one place to review, one place
  revocation actually revokes) — it is what makes the grant real and
  auditable — but no *new* read reaches customer data by piggybacking
  on it having `role`-blind existing write paths. This is what "read
  only by default" concretely commits to build.
- **(b) Audit and gate every existing write path.** Add a `role <>
  'support'` guard (or equivalent) to every write function currently
  reachable via *any* live membership, across every engine. Real,
  necessary work eventually regardless — but a full-codebase audit is
  large, is not blocking *this* work package's own correctness if (a)
  is built first, and becomes strictly lower-risk once (a) exists
  (nothing forces a support session to touch a write path at all in
  the meantime). Named here as required future work, not deferred
  silently.

### 1.4 · Consent — real, and correctly scoped down for v1

`ROADMAP_C` §3.2: *"a stated purpose, an expiry, and (where the
workspace's own settings require it) the customer's own consent."*
Checked directly: `workspace.workspaces` has no approval-mode or
consent-requirement column at all — `PLATFORM_DOMAIN_MODEL.md` §8's own
three approval modes (open / approval-required / domain-verified) are
described but never built as a real column anywhere. **Consent as a
real, workspace-configurable gate cannot be built before that setting
exists** — a real, separate, future work package (`ROADMAP_C` §3.6's
own subscription/plan machinery is the more natural home for it, not
this one). What this pass can and does build: a mandatory stated
purpose and a mandatory expiry on every grant — the two conditions
§3.2 names unconditionally, not the one it names conditionally.

### 1.5 · This closes Slice 0's own still-open gap, for real

Slice 0's own known-gap note: *"the Audit viewer has nothing real to
show yet — `platform.audit_records` holds zero rows on staging,
because no engine's live code path calls
`platform.write_audit_record()` today... wiring a real audited action
— a support-access grant, a capability withdrawal — to an actual
caller [is] a later slice's job."* Checked directly: Trust & Safety's
own decisions (Slice 5) correctly did *not* write here — `0022`'s own
header states `platform.audit_records` is for *"a denied access
attempt, a failed authentication, a permission check that
refused"* — facts distinct from ordinary domain events, which Trust &
Safety already emits correctly via `platform.events`. A support-access
grant is exactly the other case: an authority actually exercised,
which is precisely what this table exists to record. This work package
is `platform.audit_records`'s first genuinely real, client-reachable
caller.

---

## 2 · Target design

**New role on `workspace.memberships`:** `'support'`. Real
`scope`/`expires_at`/a new `granting_support_request_id` column
(nullable, mirroring `granting_engagement_id`'s own shape exactly —
0162's own precedent). `scope = null` (unscoped within that one
workspace) — support access per §3.2 is "capabilities held,
subscription tier, membership list, property count, recent activity,"
not a single property the way contractor access is.

**`workspace.grant_support_access_for_caller()`** — like every other
`_for_caller` function this programme has built, plain (not `SECURITY
DEFINER` itself — reached through `api.grant_support_access()`'s own
`SECURITY DEFINER`, whose elevation to `postgres` is what actually
lets it write into `workspace.memberships` and call
`platform.write_audit_record()`, the same mechanism the Trust & Safety
contract's own comment documents in full). Resolves the operator's own
identity, requires `platform_operations`, requires a real, non-blank
stated purpose and a bounded duration (shipped as 1-72 hours — an
active support session, not a standing relationship, unlike WP 2.4's
own 90-day *safety-net* framing for a different kind of grant). Mints
the membership row (`role = 'support'`, `scope = null` — unscoped
within that one workspace), writes the purpose to a new, narrow
`workspace.support_access_grants` table (keyed 1:1 by the membership's
own id — a refinement over this section's own original
`granting_support_request_id` sketch: there is no separate "request"
entity to reference, so the grant's own extra fact — why — is stored
directly, without inventing one), calls
`platform.write_audit_record()` (§1.5), emits
`workspace.support_access.granted`.

**`workspace.end_support_access_for_caller()`** — sets `state =
'ended'` (§7's own four-state model, matching how a real ended
membership already looks elsewhere) *before* its own `expires_at`,
for when an operator finishes early. Also writes an audit record
(`platform.write_audit_record()`, outcome `'permitted'`) and emits
`workspace.support_access.ended`.

**Read function** — `workspace.support_access_grants_for_caller()`,
new, operator-only, matching §1.3(a)'s own resolution: every grant
ever made for one workspace (active, expired and ended alike, most
recent first — real history, not only "what's live now"), each
showing its own purpose, operator, granted-at, expires-at, and a
computed status. The workspace's own operator-facing profile itself
(capabilities, membership count, property count, last activity) needs
no new function at all — `search_workspaces()`'s own existing row
shape, queried by workspace id, already provides it; reused, not
rebuilt.

**Client:** on `WorkspaceLookup.jsx`'s own result card, a "Request
access" button beside "View audit trail" — the same list-into-action
shape already established. A small form (purpose, duration) before the
grant is created — the one place in this whole flow that asks a real
question rather than defaulting silently.

---

## 3 · Work packages

**WP S.0 — the contract — shipped, 2026-08-24.**
`workspace.support_access_grants` (the purpose-only table, §2),
`grant_support_access_for_caller()`/`end_support_access_for_caller()`,
the one new operator-only read, three `api.*` delegates. Every id
client-minted (matching `becomePro()`/Trust & Safety's own real-time,
human-initiated-action precedent, not the consumer-minting pattern).
25 new structural tests; applied live to staging — a non-operator
caller confirmed live-refused with the exact expected error, proving
the real `api.grant_support_access()` → `_for_caller` → auth-check
chain end to end. The positive (real-operator) path was not separately
live-exercised — no standing operator test account exists, matching
every other operator-only contract this programme has shipped.

**WP S.1 — client: the request-access button and active-grants list —
shipped, 2026-08-24.** A "Request access" button beside "View audit
trail" on `WorkspaceLookup.jsx`'s own result card, opening
`SupportAccessSheet.jsx` (`Drawer`) — a purpose/duration form, the
full grant history for that workspace (active, expired and ended
alike), and "End access" on any currently-active one. No new tab, no
new navigation pattern, self-contained within `WorkspaceLookup.jsx`
rather than threaded up to `OperatorApp.jsx` — unlike "View audit
trail," granting access never changes what the search results
themselves show. 18 new tests (`supportAccess.js`'s own client
library, `SupportAccessSheet.jsx`, `WorkspaceLookup.jsx`'s own
integration). Not separately live-clicked-through — same standing-
operator-account constraint as WP S.0; a real console check confirmed
the new code loads and bundles cleanly with zero errors.

**§1.3(b) begun, 2026-08-24** (migration
`0173_exclude_support_role_from_marketplace_writes.sql`) —
`work.accept_quote_for_caller()`/`work.submit_quote_for_caller()`,
checked directly and confirmed vulnerable (both authorized on "any
live membership in this workspace," no role check — a support-access
grant could accept or submit a quote as someone else's business, a
real financial action, not merely a read), each gained one `and
m.role <> 'support'` clause. Bodies otherwise byte-for-byte identical
to their last shipped version, verified by a direct string
comparison in the migration's own test. Also checked in the same
pass and confirmed **not** vulnerable:
`work.send_message_for_caller()` (0147) authorizes on
`work.conversation_participants` membership by `person_ref`, never on
`workspace.current_memberships()` at all — a support grant confers no
message-sending ability by itself. **The rest of the codebase's write
paths were not re-checked** — property/asset/document writes, service
records, workflow, and more remain a real, still-open audit, not
assumed safe.

**Not scoped here, named as real future work:**
- Workspace-configurable consent (§1.4) — blocked on a setting that
  does not exist yet.
- The remainder of the existing-write-path role audit (§1.3(b)) —
  two of the highest-stakes instances are fixed; the rest is real,
  not blocking, but should not be forgotten indefinitely either.
- Auto-ending a grant at `expires_at` (a background sweep, matching
  the `pg_cron` consumer pattern WP 2.4/4.1 both established) — v1
  relies on every read correctly checking `expires_at > now()` at
  query time (the same check `current_memberships()` already performs
  for every other membership), which is already sufficient for
  *access* to actually end on time; a sweep only matters for a
  membership *list* to stop showing a lapsed grant as if it were still
  live, a real but lower-severity gap.

---

## 4 · Sequencing

```
WP S.0 (grant/end/read contract, the audit-record write, the role-scoping resolution)
   │
   ▼
WP S.1 (client: request access + active-grants list on WorkspaceLookup.jsx)
```

Strictly sequential — the client has nothing real to call before the
contract exists.

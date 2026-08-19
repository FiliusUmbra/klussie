# Slice 1 — Property & Asset Activation: Scoping

**This document owns:** the concrete work-package breakdown for
[`PLATFORM_ACTIVATION_PROGRAMME.md`](PLATFORM_ACTIVATION_PROGRAMME.md)
§5, Slice 1 — the first slice with real, visible impact for the
homeowner and the professional. It does not own the Programme's
cross-cutting reasoning, which this document applies rather than
restates.

**Status.** Tier 1 (Read) complete — WP 1.0 (#34), WP 1.1 (#35), WP 1.2
(#36), WP 1.3 (#37) and WP 1.1a all merged. Every real account now gets
a Personal workspace with a real property from signup onward (WP 1.0);
all five engines' read contracts are real and wired into
`MyItemsPanel.jsx` (WP 1.1–1.3); Platform Operations can look up a
workspace by name, owner, property name or id and see its real
capabilities, membership/property counts and last audit activity (WP
1.1a). Tier 2 (Write + legacy retirement) is underway: WP 1.4 (asset
write contract — create/update/retire/dispose, backend only, no client
caller yet) is merged (#39). WP 1.5 (location write contract —
create_location() only, deliberately narrower than WP 1.4's own scope;
update/retire/reparent-permission all named as deferred, not built) is
merged (#40). WP 1.6 (document write contract — create_document() plus
the 'documents' Storage bucket and its workspace-membership policies,
the open question §5 flagged answered: no such policy existed before
this; four new customer-facing document_types seeded; property-level
attachment only, matching WP 1.3's own read scope) is merged
(#41). WP 1.7 (maintenance write delegate —
work.create_manual_maintenance_obligation(), a new function with a
real membership + asset/location-stewardship check, never a change to
the shared work.create_maintenance_obligation() that
schedule/compliance/prediction still call directly and unchanged; see
this WP's own migration for why a thin delegate alone would have
reopened the exact hole WP 1.2 closed on the read side) is merged
(#42). WP 1.8 (client: write through the real contracts — the first
work package in this slice where customer-facing behaviour actually
changes, and a genuine bugfix found along the way: editing/deleting an
item whose card came from api.my_assets() called updateHouseholdItem()/
deleteHouseholdItem() with a property.assets id against the
household_items table, matching zero rows, for every account WP 1.0
covers, before this landed; new LocationFormSheet.jsx/
DocumentUploadSheet.jsx give Locations and Documents their first write
surface, both gated on a real property existing; Maintenance stays
read-only — no client caller is named in this work package's own scope)
is merged (#PR_NUMBER). WP 1.9 and WP 1.10 (My Business reuse) have not
started. This slice is substantially larger
than Slice 0 — five engines, two client experiences, and (per §1 below)
genuinely missing write contracts, not merely unwired read paths — and
is broken into a longer work-package sequence for exactly that reason,
not built in one pass.

**Why this took real investigation before a single line could be
scoped.** The Programme's own §5 entry for this slice, and both
`ROADMAP_A`/`ROADMAP_B`'s Phase A1/B1 sections, describe this as
"replace the data source" — implying the hard part is already built and
the client just needs pointing at it. Checked directly against the
schema: that's true for three of five engines and false for the other
two, and it's false in a more important way for every engine's *write*
side. §1 states exactly what was found, because it changes the shape of
every work package that follows.

---

## 1 · What was found before scoping this

### 1.1 · Read contracts: real for three engines, missing for two

| Engine | Client-facing read function | State |
|---|---|---|
| Property | `api.my_properties()`, `api.resolve_property()` | **Real**, built Epic 05 |
| Asset | `api.my_assets()`, `api.resolve_asset()` | **Real**, built Epic 07, already the live read switch behind `fetchHouseholdItems()` |
| Document | `api.my_documents()`, `api.resolve_document()`, `api.documents_for_service_request()` | **Real**, built Epic 08 |
| Location | — | **Missing.** `property.location_within()`/`location_ancestors()`/`location_descendants()` exist (Epic 06) but none is exposed through `api`, and none of the three *lists* a tree — they answer containment questions about a location you already have an id for |
| Maintenance | `work.my_maintenance_schedules(p_workspace_id)`, `work.my_maintenance_obligations(p_workspace_id)` (already computes `is_overdue`) | **Half-built.** Real logic exists in `work`, built Epic 10 — but neither has an `api` delegate, and neither checks the caller's own membership internally (`where o.workspace_id = p_workspace_id`, no join to `workspace.current_memberships()`) — exposing them directly would let any authenticated caller read any workspace's maintenance by guessing an id |

### 1.2 · Write contracts: none exist, for any of the five engines

Checked exhaustively across every Property/Asset/Location/Document
migration: every function found is a read (`my_*`, `resolve_*`) or an
internal trigger guard (`*_reject_mutation`, `documents_guard_deletion`).
**There is no `create_property()`, `create_asset()`, `create_location()`,
or `create_document()` anywhere.** Today, the only way a row enters
`property.assets` is the one-directional dual-write trigger
(`0053_household_items_dual_write.sql`) mirroring a legacy
`household_items` insert — never the reverse. This is not a gap in
this slice's understanding of the roadmap; it's a real, previously
unstated fact about the codebase that changes what "replace the data
source" actually requires.

**Consequence, stated plainly:** retiring `household_items` — which
`PLATFORM_ACTIVATION_PROGRAMME.md` §3 already lists as this slice's own
"legacy replaced" row — is not reachable by a read-side cutover alone.
It needs real write contracts built first, for four engines, following
the same care every other contract in this codebase has had (identifier
discipline, ADR-0022; event emission, ADR-0019; capability/permission
checks, §6.2).

### 1.3 · `MyHomePanel.jsx` is not the panel this slice touches

Read in full before assuming from its name: its own header states its
job precisely — "Property information → the customer's own profile...
Active requests... Trusted professionals... Home history" — entirely
derived from `service_requests`/`quotes`/`reviews`, nothing from
`household_items` or `property.assets` at all. **`MyItemsPanel.jsx`** is
where household inventory actually lives, and is the real target for
this slice's Asset/Location/Document/Maintenance work.
`ROADMAP_A_CUSTOMER_EXPERIENCE.md` §8's Phase A1 listed both panels
together; this scoping pass corrects that — `MyHomePanel.jsx` is
untouched by this slice.

### 1.4 · Location has no legacy equivalent, and that's a simplification, not a gap

No backfill migration exists for locations (checked: every backfill
migration in the repo is listed, and none targets `property.locations`)
— because none is needed. `household_items.room` is a free-text field,
not a structured reference; there is nothing to migrate *from*. This
means Location carries none of the "retire the old path" risk the other
four engines do. It is pure net-new capability for the customer, which
makes it the **lowest-risk place to build the first real write
contract** — nothing to reconcile against, nothing that could
regress.

### 1.5 · The decision this slice must make before any write contract is built

**No account created after Epic 05's backfill migration ran has a
`property.properties` row at all**, and there is no code path — signup,
lazy-create-on-first-use, anything — that gives one to a new account.
`0040_backfill_property.sql` was a one-time migration for *existing*
accounts at that point in time; it is not a standing mechanism.
`src/lib/homeInventory.js`'s `loadProperty()` already calls
`api.my_properties()` and already handles getting nothing back
(`return null`) — silently, as a normal case, not a bug — but nothing
in the entire codebase has ever given that function a real row to find
for a post-backfill signup.

**This has to be resolved before WP 1.4 (the asset write contract) is
useful for anyone but pre-backfill accounts.** Two real options, named
here because this needs a decision, not an assumption:

- **A · Automatic, at signup** — a property is created the same
  transaction that creates the Personal Workspace, mirroring how
  Identity and Workspace are already created together
  (`handle_new_user()`'s trigger). Fits `PLATFORM_DOMAIN_MODEL.md` §27's
  own framing ("everyone has somewhere they live") and keeps property
  provisioning as invisible as workspace provisioning already is.
  Natural for Personal workspaces; less obviously right for
  Professional ones — a plumber signing up does not necessarily have
  business premises to register on day one.
- **B · Lazy, on first real need** — a property is created the first
  time a customer adds their first location or item, not before. Avoids
  ever creating an empty, unused property row for an account that never
  touches My Home at all; costs one extra round-trip the first time
  they do.

**Recommendation: A for Personal workspaces (mirrors existing
account-creation discipline exactly), B for Professional workspaces
(matches Roadmap B's own framing that "My Business" is opt-in
depth, not a forced step of becoming a pro).** This is scoped as WP 1.0
below, its own small decision, resolved the same way Slice 0 resolved
its two — not silently assumed inside a larger migration.

---

## 2 · Work package sequence

Two tiers. **Tier 1 (Read)** makes the physical twin real and visible
without touching how data gets written — lower risk, ships first, and
is where "My Home becomes real" is actually felt for the first time.
**Tier 2 (Write + Retire)** is what actually closes
`PLATFORM_ACTIVATION_PROGRAMME.md` §3's legacy-inventory row — genuinely
riskier, genuinely more work, sequenced after Tier 1 has been running
against real accounts.

### Tier 1 — Read cutover

**WP 1.0 — Decision: property provisioning**

Resolve §1.5 above. Not an ADR by the strict `ADR_WORKFLOW.md` test (no
frozen-architecture deviation — §9.1 already permits properties to be
created however a workspace needs) but real enough to record as a
decision before WP 1.1 depends on it, the same way Slice 0's ADRs were
scoped ahead of the work packages that needed them.

**WP 1.1 — The location read contract**

`property.locations_for_property(p_property_id)` /
`api.locations_for_property()` — new. Returns every location under a
property, flat (id, parent_id, name, type, path), for the client to
assemble into a tree — matching how `path`/`parent_id` are already
structured for exactly this (§10, recursive, no fixed depth). Caller
membership checked the same way `property.my_assets()` already does
(`join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id`).

**WP 1.2 — The maintenance read delegates**

`api.my_maintenance_schedules()` / `api.my_maintenance_obligations()` —
thin delegates around the real logic already built in `work`
(Epic 10), **adding the caller-membership check that's currently
missing** (§1.1) before either is safe to expose. Same two-layer shape
as every delegate this session has built since WP 0.4.

**WP 1.3 — Client: the real physical twin**

- `src/lib/homeInventory.js` / `householdItems.js` — read every one of
  the five engines through their real functions unconditionally (not
  only "if propertyId happens to be known," which today silently falls
  back to legacy for any account WP 1.0 hasn't provisioned yet).
- New: a Location tree component (recursive, collapsible, matching
  `ROADMAP_A_CUSTOMER_EXPERIENCE.md` §3.2's own spec — "room by room,
  recursive per §10").
- New: a Document list with validity badges (reusing `Badge`, the same
  primitive `AuditLog.jsx` already established for exactly this kind of
  status marker).
- New: a Maintenance due/overdue list (`is_overdue`, already computed
  server-side by `work.my_maintenance_obligations()` — no client-side
  date math to get wrong).
- `MyItemsPanel.jsx` restructured to hold all four (Locations, Assets,
  Documents, Maintenance) as sections of one panel, not four
  destinations — matching `HOME_OPERATING_SYSTEM.md` §2's own five-group
  IA (`ROADMAP_A` §3.2 already scoped this shape).

**WP 1.1a — Workspace lookup, read-only half (Platform Operations)**

Per the Programme's own Slice 1 entry: "Workspace lookup's read-only
half ships alongside this slice... its access-request half waits for
Slice 0 to be fully proven in production first." A new operator-scoped
search function (name/owner/property-address/id → workspace profile:
capabilities held, tier, membership list, property count, recent
activity), gated by `platform_operations` exactly like every function
Slice 0 built, plus a second `OperatorApp` tab alongside Audit. This is
the *first* real reason for `platform.list_audit_records()`'s own
capability-check composition (`workspace.my_workspace_has_capability()`,
WP 0.5) to have a second caller.

### Tier 2 — Write + legacy retirement

**WP 1.4 — The asset write contract**

`property.create_asset()` / `api.create_asset()`, plus update and
lifecycle-state functions (`retire_asset()`, matching `lifecycle_state`'s
existing `active|retired|disposed` states — never a hard delete, §11's
own placement-over-time framing). Identifier discipline per ADR-0022;
events per ADR-0019 (`property.asset.created`, matching the engine's own
aggregate name).

**WP 1.5 — The location write contract**

`property.create_location()` / `api.create_location()`. Lowest-risk of
the four (§1.4) — build and verify this one first within Tier 2, both
because nothing depends on it existing yet and because a mistake here
has no legacy data to corrupt.

**WP 1.6 — The document write contract**

`property.create_document()` / `api.create_document()`, plus the
Storage-bucket upload flow (`storage_bucket`/`storage_path`, unlike
Asset/Location this genuinely touches a second Supabase service, not
only Postgres — the real reason this is its own work package rather
than folded into WP 1.4).

**WP 1.7 — The maintenance write delegate**

`api.create_maintenance_obligation()` — a thin delegate; the real
function (`work.create_maintenance_obligation()`) already exists
(Epic 10's own contract work package), same shape as WP 1.2.

**WP 1.8 — Client: write through the real contracts**

`ItemFormSheet.jsx` (asset create/edit), a new `LocationFormSheet.jsx`,
a new `DocumentUploadSheet.jsx` — each calling its WP 1.4–1.7 contract
instead of `household_items`. This is where the customer-facing
behaviour actually changes for the first time in this slice; everything
in Tier 1 was additive, this is a genuine cutover and needs the same
"behaviour-preserving except where named" discipline every migration in
this codebase has already held to.

**WP 1.9 — Retire `household_items`**

Step 6 of the six-step pattern, finally reachable: once WP 1.8 is live
and verified against real accounts, drop the dual-write trigger
(`0053`), stop writing the legacy table, and — only after a real
observation window, not immediately — drop `household_items` itself.
Closes `PLATFORM_ACTIVATION_PROGRAMME.md` §3's own legacy-inventory row
for real, not provisionally.

### Reuse — Professional Experience

**WP 1.10 — My Business**

Per the Programme's own framing: "the same engines, the same
components... built as one activation, not two independently-timed
ones." Once Tier 1 (and, for write, Tier 2) exist, wiring them into a
new `ProApp.jsx` tab against the Professional workspace's own property
is close to free — the same components, a different `workspaceId`. The
one genuinely new piece: WP 1.0's Option B (lazy property creation) is
this tab's own first-use trigger.

---

## 3 · Sequencing

```
WP 1.0 (decision)
   │
   ├──► WP 1.1 (location reads) ──┐
   ├──► WP 1.2 (maintenance reads)├──► WP 1.3 (client: read cutover) ──► WP 1.1a (workspace lookup)
   └──► (Property/Asset/Document already have real reads — no WP needed)
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                             ▼
         WP 1.5 (location writes,          WP 1.4 (asset writes)
         lowest risk, built first)                  │
                    │                                ▼
                    │                       WP 1.6 (document writes)
                    │                                │
                    │                                ▼
                    │                       WP 1.7 (maintenance writes)
                    └────────────────┬───────────────┘
                                      ▼
                            WP 1.8 (client: write cutover)
                                      │
                                      ▼
                            WP 1.9 (retire household_items)
                                      │
                                      ▼
                            WP 1.10 (My Business reuse)
```

Tier 1 (WP 1.0–1.3, WP 1.1a) can ship and start proving itself against
real accounts while Tier 2 is still being built — nothing in Tier 2
blocks Tier 1's own value from landing first.

---

## 4 · Acceptance criteria for "Slice 1 is done"

- [ ] WP 1.0's decision recorded and implemented — every Personal
  workspace has a real property, automatically, from signup onward.
- [ ] All five engines (Property, Asset, Location, Document,
  Maintenance) have real, tested, capability-checked read *and* write
  contracts.
- [ ] `MyItemsPanel.jsx` shows a real Location tree, real Assets, real
  Documents with validity, real Maintenance due/overdue — for both a
  pre-backfill account and a freshly signed-up one.
- [ ] `household_items` is read-only or dropped, and its dual-write
  trigger is retired.
- [ ] The same components serve a Professional workspace's own
  premises, unmodified beyond the workspace id they're pointed at.
- [ ] Workspace lookup's read-only half is live for Platform Operations,
  gated the same way every other operator function in Slice 0 was.
- [ ] Per the Programme's own Activation Ratio (§4): the "property/asset
  recorded" journey type shows a real, non-zero, rising ratio of
  `platform.events`-backed writes against legacy `household_items`
  inserts — checkable, not merely claimed, once WP 1.4/1.8 are live.

---

## 5 · Open questions carried into implementation

- **WP 1.0's exact mechanism** — a trigger alongside `handle_new_user()`,
  or a first-class step in the same transaction — is an implementation
  choice for whoever picks up that work package, not resolved here.
- **Document upload's Storage bucket policy** — `storage_bucket`/
  `storage_path` already exist as columns (Epic 08); whether the
  Storage-level RLS policy for a *customer-initiated* upload already
  exists or needs its own migration is unverified — check before
  starting WP 1.6, not assumed from the column's presence.
- **Whether WP 1.9's observation window has a stated minimum** — this
  document doesn't set one; it's a real product/ops decision (how long
  to run dual-write-then-read-real before trusting the cutover) that
  belongs to whoever is accountable for data loss risk, not a default
  picked by this scoping pass.

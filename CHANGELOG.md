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

**Epic 08 — Document Engine (partial, 6 of 9 packages).** Nothing here
changes what a user sees yet — `portfolio_items` and
`service_request_photos` are read, never written, by everything built
this session.

- **A scope correction, before anything was built**: the roadmap's own
  original note for this epic named `avatar_url` as a migration target.
  Checked against `DATABASE_ARCHITECTURE.md` §15's actual definition of
  a document — evidence, with a type, a validity period, an issuer — an
  avatar fits none of that. Excluded, corrected rather than built as
  originally scoped.
- **`property.documents`** and **`property.document_versions`** —
  versioning repeats [ADR-0028](docs/adr/0028-stewardship-current-pointer-and-closed-period-log.md)'s
  mutable-current-pointer-plus-closed-log shape, a third time, matching
  `DATABASE_ARCHITECTURE.md` §15's own wording ("metadata mutable,
  content immutable... version history is retained") rather than the
  domain model's own softer "how it evolves" phrasing — the more
  specific document won.
- **`property.document_types`** — a declared catalog, matching
  `property.facet_types`' own shape (Epic 07), but seeded from the
  start: unlike facets, this epic's backfill needed real values.
  `retention_class` (`evidence`/`convenience`) gates deletion via a
  conditional trigger, never a grant alone.
- **`property.document_attachments`** — scoped to the four subjects
  with a real table today (property, location, asset, workspace);
  maintenance record and marketplace engagement, both named in the
  architecture, are not included since neither table exists yet.
- **`property.document_shares`, fully independent of attachment** —
  `DATABASE_ARCHITECTURE.md` §15 calls "attachment is not a visibility
  grant" a principle that was nearly lost; the isolation policy and
  engine contract both hold that line, proven in a real scenario (a
  property steward who can see an asset but not a document attached to
  it), not just by an absent join.
- **Backfilled: `portfolio_items` and `service_request_photos` into
  `property.documents`** — the second backfill in this roadmap moving
  real, existing data, and the first from two source tables into one
  target at once. Sharing for request photos is backfilled as a
  point-in-time snapshot of the existing `pro_matches_request()`
  matching rule.
- **Deliberately incomplete.** WP 08.07 (dual-write), 08.08
  (reconciliation), 08.09 (the read switch) are decomposed but not
  built — dual-write here touches two separate live client code paths
  (portfolio upload, request-photo upload) at once, judged worth its
  own dedicated pass rather than appending it to an already-large
  structural epic.

- Test suite grew from 875 tests across 75 files to **922 across 81**.

**Epic 07 — Asset Engine (complete, 8 of 8 packages).** `household_items`
is still what every write actually lands on. What changed is where "Mijn
spullen" reads from — see Changed, below, for that part stated plainly.

- **`property.assets`** and **`property.asset_placements`** — placement
  repeats [ADR-0028](docs/adr/0028-stewardship-current-pointer-and-closed-period-log.md)'s
  mutable-current-pointer-plus-closed-log shape by citation, matching
  `DATABASE_ARCHITECTURE.md` §14's near-verbatim wording; no new ADR
  needed.
- **Declared facets** — `property.facet_types` (a catalog an attribute
  set must be declared in) and `property.asset_facets`, validated by
  trigger against the declared key set. No facet type seeded yet;
  nothing needs one.
- **Isolation inherits the property's current stewardship**, same
  pattern as locations — no asset- or facet-specific resolver.
  `asset_placements` deliberately gets no policy: Historical class, read
  through the engine contract only.
- **The asset engine contract** — `my_assets()`/`resolve_asset()`, with
  real `api` delegates this time (unlike Epic 06's engine-only
  containment functions), narrowed to active-only assets once the
  contract got a real caller.
- **Backfilled: every live `household_items` row into `property.assets`**
  — the first backfill in this roadmap moving real, existing data rather
  than deriving from a table the same epic just created. Idempotent via
  a bookkeeping-only `household_items_id` column. Deliberately does
  **not** exclude erased identities, departing from migration 0033's
  pattern, because this moves existing possession data rather than
  creating new structure.
- **Dual-write: every `household_items` write also writes
  `property.assets`, going forward** — three database triggers, not an
  application-level second write. A closer, already-accepted precedent
  in this codebase (the identity dual-write) makes a trigger the only
  place the mirror write is genuinely transactional with the primary
  one. `household_items` remains authoritative.
- **Fixed: a foreign key that would have broken deleting an item.**
  `property.assets.household_items_id` had no `ON DELETE` behaviour,
  which meant deleting a `household_items` row that had a mirrored asset
  would fail outright. Fixed with `ON DELETE SET NULL` before the
  dual-write above could make the bug guaranteed rather than latent.
  Found by reading the existing schema, not by running anything.

- Test suite grew from 792 tests across 67 files to **875 across 75**.

### Changed

- **"Mijn spullen" now reads from `property.assets`, not
  `public.household_items` directly, whenever a property has resolved
  for the signed-in workspace.** The list, sort order and every field
  shown are unchanged by design — this is a data-source switch, not a
  feature change — and it falls back to the exact prior behaviour when
  no property has resolved yet, the same fallback discipline every read
  switch since Epic 03 WP 03.11 has used. **Live verification of this
  switch is Pending**: `RECONCILE_ASSETS.sql`, the check this roadmap
  requires before trusting a read-switch, has been written and
  structurally tested but has not run against a real database this
  session. Do not treat this switch as verified in an environment with
  real users until it has.

**Epic 06 — Location Engine.** The roadmap's own highest correctness-risk
item in the physical tier. Nothing here changes what a user sees —
nothing in the product creates a real location yet, so there is nothing
to read or switch.

- **`property.locations`** — a recursive tree, unbounded depth, via a
  materialised `ltree` path (GiST-indexed) kept alongside the
  authoritative parent pointer. Isolation inherits the property's
  current stewardship — a location carries no workspace column of its
  own, reusing Epic 03's existing membership helper through a join.
- **Subtree containment as a first-class operation** — `location_within`,
  `location_ancestors`, `location_descendants` — a single indexed
  operation regardless of tree depth, never a recursive walk.
- **Re-parenting** (`reparent_location()`) rewrites a moved subtree's
  paths and emits `LocationTreeChanged` in the same transaction — the
  event that keeps the Workspace and Search engines' eventual caches and
  indexes from silently going stale, once either exists.
- **A real bug found and fixed before any of this shipped:** every
  `ltree` operator and function lives in Postgres's `extensions` schema,
  not `pg_catalog`, and needed explicit schema qualification to resolve
  under this codebase's `search_path = ''` discipline. Found by reasoning
  through Postgres's own operator resolution rules, not by running
  anything — no database connection was available this session either.

- Test suite grew from 742 tests across 62 files to **792 across 67**.

**Epic 05 — Property Engine.** A property now exists for every Personal
Workspace. Nothing here changes what a user sees — this epic's one
client-facing change adds a field nothing downstream reads yet.

- **`property.properties`** — the property aggregate, with a **mutable
  current-steward pointer** (`steward_workspace_id`) rather than a
  static workspace stamp, because stewardship transfers
  ([ADR-0028](docs/adr/0028-stewardship-current-pointer-and-closed-period-log.md)).
- **`property.stewardship_periods`** — the permanent, genuinely
  append-only log of *closed* stewardships. Empty today: nothing has
  ever transferred.
- **Backfilled**: one property ("My Home") per existing Personal
  Workspace. Professional and Business workspaces get none — nothing in
  the product represents a business's premises yet.
- **The isolation policy and the client resolver both reuse Epic 03's
  existing membership helper directly.** No property-specific resolver
  was built — ADR-0028 found the current-steward pointer is a plain,
  indexed column, the same shape every other workspace-scoped table
  already has.
- **The property engine contract** — `my_properties()` (discovery) and
  `resolve_property()` (detail), mirroring the workspace engine's own
  shape.

### Changed

- `src/lib/homeInventory.js`'s `fetchHomeProfile()` resolves the
  signed-in person's property (id and name); every other field is
  unchanged, and nothing downstream reads the new one yet.
- Test suite grew from 696 tests across 57 files to **742 across 62**.

**Epic 03 — Workspace Engine.** The pivot of the roadmap: workspaces and
memberships exist, every existing person and professional has been
migrated onto them, and the two reads that actually changed — a
customer's own requests and household items — now scope by workspace
with a fallback proven identical to the old behaviour. **Not applied to
production**, and not yet verified against a live, signed-in session
from this session's tooling (see §6 below) — recorded plainly rather
than implied away, the same discipline Epic 02 held itself to.

- **`workspace.workspaces` / `workspace.memberships` /
  `workspace.membership_history`** — the workspace aggregate and its
  mutable-current-plus-append-only-history membership shape
  (`DATABASE_ARCHITECTURE.md` §10).
- **Backfilled**: one Personal Workspace per existing identity ("My
  Home"), one Professional Workspace per existing pro profile (the
  business name, or the person's own name, or "My Business"), idempotent
  and reconciled clean against every real row on staging.
- **The `STABLE` membership helper** (`api.current_workspace_memberships()`)
  — the isolation predicate nearly every later policy depends on,
  evaluated once per statement via an uncorrelated subquery
  ([ADR-0026](docs/adr/0026-membership-helper-lives-in-public.md)).
- **The workspace engine contract** — `resolve_context`, `decide_permission`,
  ADR-0027's twelve-permission vocabulary for workspace lifecycle and
  membership management.
- **A permissive isolation policy on all thirteen workspace-scoped
  tables**, adding to — never replacing — the existing 58 policies
  ([ADR-0025](docs/adr/0025-marketplace-visibility-survives-epic-03.md)
  narrowed this from the roadmap's original "the policies simplify").
- **The workspace switcher** (`WorkspaceSwitcher`), invisible for the
  single-workspace majority and shown only once a person genuinely holds
  two live workspaces — today, an existing professional's Personal and
  Professional pair (`PLATFORM_DOMAIN_MODEL.md` §27).
- **There is no API Gateway, and none was built.** Request context is
  resolved in the database instead, once per statement, called directly
  by the browser
  ([ADR-0024](docs/adr/0024-request-context-resolved-in-the-database.md)) —
  a decision with consequences for every engine still to come.

### Changed

- **A customer's own requests, and their own household items, now read
  by workspace** when one has been resolved, falling back to the
  pre-Epic-03 owner-id filter otherwise — proven identical either way,
  by tests that run both paths over the same row. A professional's own
  offered-services list does the same.
- **Conversations gained an additive third access path** (workspace
  membership, alongside the existing customer and professional sides) —
  not a switch, since a professional's side has no workspace to switch
  to until Epic 12's engagements exist.
- Test suite grew from 561 tests across 42 files to **696 across 57**.

**Epic 02 — Identity Engine.** The platform's identity is now its own,
separate from Supabase Auth, and carries a person reference designed to
outlive the person's data.

- **`identity.identities`** — the person reference every durable record
  will carry, with personal attributes in the one place erasure can
  reach. No foreign key in either direction: erasure must stay a
  redaction rather than becoming a cascade.
- **Backfilled from every existing profile**, idempotently, with
  identifiers minted from each row's own creation time
  ([ADR-0022](docs/adr/0022-backfilled-identifiers-are-uuidv7-minted-in-sql.md)).
- **UUIDv7 generation** (`src/lib/ids.ts`) — monotonic within a
  millisecond, which is the only reason the format is worth choosing.
- **Dual-write on signup**, inside the transaction that creates the auth
  user and the profile. One signup produces exactly one identity, or
  none of the three.
- **A reconciliation that gates the read switch** — and refuses to report
  success against a database with nothing to compare.
- **Erasure by redaction** — personal data removed across all three
  tables that hold it, the reference left valid as a key, history
  untouched, audited per `DATABASE_ARCHITECTURE.md` §33. It deletes
  nothing, because `public.profiles` is the parent of nine cascading
  foreign keys.
- **Staging test accounts** (`supabase/seed/staging_test_accounts.sql`) —
  the seed `ENVIRONMENTS.md` §4.4 has asked for since Epic 00.

### Changed

- **Profile display now reads from the identity engine.** The first
  behaviour change in the implementation roadmap, and it is designed to
  be invisible: the same names, avatars and cities, from a different
  source. Cross-user reads resolve *display information* rather than
  reading the identity row, because that row also holds contact details
  which stay private until a booking exists
  ([ADR-0023](docs/adr/0023-identity-display-resolution-versus-row-visibility.md)).
- Test suite grew from 497 tests across 34 files to **561 across 42**.

**Epic 01 — Schema Foundation & Event Backbone.** Nothing here changes
what a user sees, and nothing here is used yet. The epic is **entirely
additive**: it creates the substrate every later epic needs, applied to
staging only, with `public.domain_events` and its five triggers still the
product's live event path.

- **Ten engine-tier schemas**, and **twelve database roles** whose grants
  make an engine writing another engine's schema fail on privileges
  rather than on review ([ROLES.md](docs/operations/ROLES.md)).
- **`ltree` and `pg_cron`**, installed outside `public`.
- **`platform.events`** — the event outbox. Hash-partitioned by workspace,
  range-partitioned by time, append-only, carrying all thirteen fields of
  the [canonical event envelope](docs/adr/0019-canonical-platform-event-envelope.md).
  Not readable by any client role.
- **`platform.audit_records`** — the audit trail. Range-partitioned,
  append-only, and **writable by no application role at all**, including
  the engine that owns the schema. Records denied attempts, which no
  domain event captures.
- **`platform.emit_event()`** — emits an event inside the caller's
  transaction, so a change without an event is impossible, and assigns
  the next gapless per-subject sequence.
- **Cursor-based consumer scaffolding** — durable per-partition cursors,
  a quarantine that keeps one bad event from halting a stream, and a
  runner proven to resume without gaps and to redeliver at most one event
  after a crash.
- **Six SQL diagnostics** under `supabase/diagnostics/`, because a
  grant's effect, a partition's routing and an append-only guard's
  refusal are all invisible in the SQL that creates them.

**Two decisions the frozen architecture left open are recorded and
`Proposed`, not accepted** —
[ADR-0020](docs/adr/0020-events-partitioning-parameters.md) (eight hash
partitions, yearly ranges, a default range partition) and
[ADR-0021](docs/adr/0021-one-audit-table-with-nullable-workspace.md) (one
audit table with a nullable workspace). Both are cheap to revise while
the tables are empty and expensive afterwards.

**Epic 00 — Engineering Foundations.** Nothing in this epic changes what
a user sees; all of it changes what can be built safely afterwards.

- **CI pipeline** gating every push and pull request on lint, type-check,
  test and build.
- **This changelog**, and the rule that every epic updates it.
- **TypeScript toolchain** alongside JavaScript, `strict` from the start,
  with one leaf module converted as proof. No big-bang migration.
- **A staging environment.** Production is no longer the only environment
  Klussie has ever had. All 17 migrations replayed onto an empty database
  with no file modified — **the first proof that the migration chain can
  rebuild the schema from nothing.**
- **A disaster recovery strategy** that works on the Supabase Free plan
  without Docker: native `pg_dump` over the session pooler, storage via
  the Storage API, four backup cadences, and a stated RPO/RTO
  ([ADR-0017](docs/adr/0017-free-tier-disaster-recovery-strategy.md)).
  Klussie previously had **no working backup mechanism of any kind**.
- **A regression baseline** — a definition of what a behavioural
  regression is, an inventory of all 59 user-facing flows, and automated
  pins on the known defects so none is fixed silently
  ([TESTING.md](docs/engineering/TESTING.md)).

### Changed

- Test suite grew from 404 tests across 22 files to **497 across 34**
  (411/24 at the end of Epic 00).
- `.gitignore` now covers Supabase CLI machine state (`supabase/.temp/`).

### Fixed

- **Unit tests no longer require real Supabase configuration.**
  `src/lib/supabaseClient.js` validated configuration and constructed the
  client as an import side effect, so any module transitively importing
  the data layer — including files that only export pure functions —
  could not be loaded without a configured project. CI, which correctly
  has no credentials, failed on the import rather than on anything a test
  asserted. The client is now created on first use; validation still runs
  at application startup and again before construction, so a misconfigured
  deployment fails exactly as before, with the same message.

### Notes

- **No behaviour changed for users in this epic.** The literal
  escape-text defects and the untranslated `awaiting_pro` status are
  deliberately preserved and now pinned by tests — fixing either is a
  declared change requiring its own entry here.
- The restore procedure is documented and its tooling verified, but **no
  restore drill has been performed** — the Free plan provides two
  projects and neither can be consumed as a target.

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

# Epic 20 — Completion Record

**Epic.** 20 — Search Engine
**Started.** 2026-08-19
**Completed.** 2026-08-19 — all 3 work packages.

Built immediately after Epic 18, on the roadmap's own forward sequencing
("Epic 20 — Search Engine" — `IMPLEMENTATION_ROADMAP.md`'s epic map),
continuing the stacked-branch chain from `epic-18/provider-intelligence-
engine`'s own tip.

---

## 1 · Gates

- [x] Every package built to full standard
- [x] `npm run lint` passes
- [x] `npm test` passes — **1439 tests, 147 files**
- [x] `npm run typecheck` passes
- [x] `npm run build` succeeds
- [ ] CI green — PR to be opened
- [x] Architecture preserved — no frozen document modified; no new ADR
      needed
- [x] Documentation updated (§4)
- [ ] Live verification — Pending. Same standing gap as every epic since
      Epic 03.

## 2 · Acceptance criteria

| Criterion | Met? | Evidence |
|---|---|---|
| Scope is indexed, never post-filtered (`SYSTEM_ARCHITECTURE.md` §10.2/§15) | **Yes, structurally** | `derived.search()`'s scope predicate and text predicate sit in one `where` clause of one statement |
| Nothing enters public indexes implicitly (§15) | **Yes, structurally** | `search_index_published_only_public` forbids `is_published = true` outside `provider`/`global` at the constraint level, not by policy convention |
| Search indexes are Derived/Projection class, rebuildable, hard-delete permitted (`DATABASE_ARCHITECTURE.md` §3, `SUPABASE_ARCHITECTURE.md` §14) | **Yes** | `derived.search_index` carries no guard trigger — the first table this session has built without one |
| Every projection carries its sources' tenancy and the event position it was built to (§14) | **Yes** | `workspace_id`, `source_event_id` on every row |

## 3 · Work packages

| WP | Title | Status |
|---|---|---|
| 20.01 | The search index (`derived.search_index`) | Complete |
| 20.02 | RLS isolation | Complete |
| 20.03 | The search engine contract | Complete |

No backfill work package — the current product has no full-text index of
any kind (`pro_matches_request()` is described in `MASTER_CONTEXT.md`
§12 as "a bare SQL function," and Discover is a client-side filter, per
the roadmap's own Epic 20 one-liner: "Replaces the current client-side
catalogue filter"). Greenfield, the same shape Epic 09 and Epic 19 both
held for the identical reason — there is nothing to migrate INTO,
because indexing today is not database-backed at all.

## 4 · Documentation updated

- [x] `docs/IMPLEMENTATION_ROADMAP.md`
- [x] `docs/MASTER_CONTEXT.md`
- [x] `docs/architecture/ARCHITECTURE.md`
- [x] `CHANGELOG.md`
- [ ] `docs/adr/README.md` — no new ADR; every placement question this
      epic raised was already answered by the frozen documents
      themselves (§5.1)

## 5 · Findings, read before design

### 5.1 · Unlike every epic since 18, the schema AND the role were already
named — nothing to resolve by precedent this time

`SUPABASE_ARCHITECTURE.md` §2's own schema table names `derived` and its
purpose ("all projections — timeline, twin summaries, provider scores,
reputation, inbox, **search support**") explicitly. `docs/operations/
ROLES.md` §2.2 goes further and names the exact role: `klussie_consumer_
search`, "Maintains search support," created by `0019_grants.sql` since
Epic 01, holding `USAGE` on `derived` and nothing else — deliberately
waiting, per ROLES.md's own rule 1 ("a privilege is granted when there
is a real caller needing it"), for the epic that gives it something to
maintain. This epic is that epic. Contrast with Epics 18/19, which each
had to resolve an unnamed placement by precedent; Search's placement was
never ambiguous.

### 5.2 · One polymorphic table, all eight domains — mirroring
`platform.events`' own shape, not inventing a new one

`DATABASE_ARCHITECTURE.md` §30 lists eight search domains sharing one
rule. All eight share the same row shape (a source reference, tenancy,
indexable text, a publication flag), so `derived.search_index` uses a
`domain` discriminator column rather than eight near-identical tables —
the same reasoning `platform.events` itself already uses for every
engine's event types, applied here for the first time to a `derived`
table.

### 5.3 · The first Derived-class, hard-delete-permitted table this
session has built — a real, structural departure from every prior table

Every aggregate this session has built is Historical (append-only) or
immutable-except-named-columns (guarded by a mutation trigger — Epic 11,
18, 19's own tables). `DATABASE_ARCHITECTURE.md` §3 classifies "Search
indexes" as *Projection*, and `SUPABASE_ARCHITECTURE.md` §10/§14 states
projections in `derived` are "hard-delete permitted" and "rebuildable
per workspace" — the opposite obligation. `derived.search_index`
deliberately carries **no guard trigger**: `derived.remove_from_index()`
performs a real, unguarded `delete`, and `derived.reindex_item()`
performs a real `update` on conflict. Neither is a defect the way either
would be on any other table this session has shipped.

### 5.4 · `global` is the only domain with no workspace — refused
structurally, and its event tracking is a named, deliberate gap

Six domains are workspace-scoped; `provider` rows carry the *publishing*
workspace even though they are publicly readable once published; only
`global` (world graph, catalogues) is genuinely platform-scoped, the
same shape Epic 16's own world graph tables already hold.
`search_index_global_has_no_workspace` enforces `workspace_id is null`
if and only if `domain = 'global'`, structurally. `platform.events.
workspace_id` is `not null` — Epic 13's own finding, the table's
partition key — so `mark_index_rebuilt()`/`mark_index_lag_detected()`
both **refuse** a null `p_workspace_id` rather than silently accepting
one. Global-domain rebuild event tracking has no owning workspace to
attribute to and no operator/platform-scoped event path exists yet
(Administration Engine, §12.3, unbuilt) — named here, not built around,
the same shape every other named gap this session has recorded.

### 5.5 · `IndexRebuilt` is canonical; `IndexLagDetected` is derived —
not the same kind of fact, and the first event this session marks
`is_derived => true`

ADR-0019 marks an event `p_is_derived` when it is "produced by a
computation, workflow, or a detected pattern" rather than a direct state
change. A completed rebuild is a first-order fact — `p_is_derived` stays
`false`, the default, matching every canonical event this session has
emitted. Lag is different: `SYSTEM_ARCHITECTURE.md` §10.2 names it
explicitly as *detected*, the exact phrase ADR-0019 uses for the derived
case — `mark_index_lag_detected()` sets `p_is_derived => true`.

### 5.6 · The first background-consumer role this session has granted
`platform.emit_event()` to, rather than an engine role

`0023_emit_event.sql`'s own header: "The consumers are deliberately
absent: a consumer emitting a derived event is a real case (ADR-0019),
but no such consumer exists... a privilege is granted when there is a
real caller needing it." `klussie_consumer_search` is that real caller,
five epics later. `0123_search_contract.sql` grants it `USAGE` on
schema `platform` and `EXECUTE` on `platform.emit_event()` explicitly —
the same discipline Epic 16's own session-spanning USAGE-grant finding
exists to keep from recurring, applied here from the start rather than
found missing later.

### 5.7 · "Scope is indexed, never post-filtered" is enforced as one
`where` clause, not a convention

`derived.search()`'s scope predicate (workspace membership match, or
`is_published` for the two public domains) and its text predicate
(`search_vector @@ websearch_to_tsquery(...)`) sit in the same `where`
clause of the same statement. There is no broader fetch followed by an
application-side filter for a future caller to introduce by mistake —
the rule §15 states in prose is structural here, not merely followed.

### 5.8 · `'simple'` text search configuration, deliberately, not
`'english'`

The first full-text search this codebase has ever implemented. The
platform is multi-locale (catalogue content alone spans eight locales
per `ARCHITECTURE.md`); a stemming configuration tuned to one language
would be actively wrong for the others. `'simple'` (tokenise and
lowercase, no stemming) is the safe, locale-neutral default until a
real per-locale search strategy is designed — named as a deliberate
choice, not an oversight.

## 6 · Platform Discoveries

- **The first epic since 15 with no "unnamed schema/role" gap to
  resolve** — both were already named in the frozen documents,
  specifically for this epic (§5.1).
- **The first Derived-class table this session has built** — hard-delete
  permitted, no guard trigger, the opposite mutability posture from
  every prior table (§5.3).
- **The first background-consumer role granted `platform.emit_event()`**
  rather than an engine role (§5.6) — fulfilling a case `0023_emit_
  event.sql`'s own header predicted and left ungranted at Epic 01.
- **The first event this session marks `is_derived => true`** (§5.5).
- **The fifth epic in a row to mint every `event_type` correctly from
  the start.**

## 7 · Regressions and known issues

**No regression possible.** Nothing in this epic touches any existing
client surface. `pro_matches_request()` and the client-side Discover
filter are both untouched — replacing them is explicitly named in the
roadmap's own Epic 20 one-liner as future work, not this epic's own
scope.

**What was not done: nothing in this epic has been run against any
database** — the same standing gap.

| Issue | Severity | Tracked where |
|---|---|---|
| Nothing in this epic verified against a live database | **Critical** | This section; `MASTER_CONTEXT.md` §12 |
| No live wiring — nothing reacts to another engine's event and calls `reindex_item()` yet; the search index is empty until a real consumer runs | Named, deliberate | This section |
| `authenticated`/`anon` hold no `SELECT` grant on `derived.search_index` yet — `ROLES.md` §2.4's own "Not yet" bucket, opened by whichever epic ships the live client read path (replacing `pro_matches_request()`/the Discover filter) | Named, deliberate (§5.1) | This section |
| Global-domain rebuild event tracking has no owning workspace to attribute to | Named, deliberate (§5.4) | This section |

## 8 · Verification performed

**Automated.** 1414 → **1439 tests**, 144 → **147 files** across this
epic. Every package ran lint, type-check, test and build before moving
to the next; all green. No client-side code changed.

**On staging.** None. No client caller exists to exercise in a browser.

**Not performed.** No SQL diagnostic run. `VERIFY_SEARCH_ENGINE.sql`
proves: indexing an item and finding it only from its own workspace, not
another's; re-indexing the same source item upserts in place rather than
duplicating; removing an item hard-deletes it; `is_published = true`
outside `provider`/`global` is refused structurally; a `global` row with
a non-null `workspace_id` is refused, a null one succeeds and is
publicly searchable once published; a `provider` row is public once
published regardless of the searching workspace; and
`mark_index_rebuilt()`/`mark_index_lag_detected()` both refuse a null
workspace and succeed with a real one. Not executed against a real
Postgres instance.

## 9 · Sign-off

- [x] All three work packages complete
- [x] Repository releasable — nothing in this epic is reachable by any
      client path; it is pure addition
- [ ] **Live verification Pending**, the same gap tracked since Epic 03,
      now twenty epics deep

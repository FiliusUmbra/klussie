-- Epic 20 WP01 — the search index: one polymorphic projection table, all eight domains,
-- in `derived` — the schema and role SYSTEM_ARCHITECTURE.md §10.2/§15 and
-- SUPABASE_ARCHITECTURE.md §2/§14/§15 already name, unlike every "no schema/role named"
-- gap this session has resolved by precedent since Epic 18.
--
-- ONE TABLE, EIGHT DOMAINS — MIRRORING platform.events' OWN SHAPE, NOT INVENTING A NEW ONE
--
-- DATABASE_ARCHITECTURE.md §30 lists eight domains (workspace, property, asset,
-- conversation, document, knowledge, provider, global) sharing one rule: "scope is
-- indexed, never post-filtered." All eight share the exact same row shape — a source
-- reference, tenancy, indexable text, a publication flag — so one table with a `domain`
-- discriminator is the smallest correct slice, the same reasoning `platform.events` itself
-- already uses for every engine's event types. Building eight near-identical tables would
-- duplicate the one rule that actually matters eight times instead of enforcing it once.
--
-- THE FIRST DERIVED-CLASS, HARD-DELETE-PERMITTED TABLE THIS SESSION HAS BUILT
--
-- Every aggregate this session has built is Historical (append-only) or
-- immutable-except-named-columns (guarded by a mutation trigger). DATABASE_ARCHITECTURE.md
-- §3's own classification table marks "Search indexes" as *Projection*, and
-- SUPABASE_ARCHITECTURE.md §10/§14 states projections in `derived` are "hard-delete
-- permitted" and "rebuildable per workspace" — the opposite obligation. Deliberately no
-- guard trigger here: a search row may be freely inserted, updated in place (re-indexed)
-- or hard-deleted (source retired, or a rebuild discards a stale entry), and none of that
-- is a defect the way it would be on any other table this session has shipped.
--
-- GLOBAL IS THE ONLY DOMAIN WITH NO WORKSPACE — STRUCTURAL, NOT AN OVERSIGHT
--
-- Six domains are workspace-scoped. `provider` rows carry the *publishing* workspace's id
-- (§15: "a provider workspace's own properties... are private data that happens to live in
-- a workspace that also publishes a profile") even though they are publicly readable once
-- published. Only `global` (world graph, catalogues, per §15/§30) is genuinely
-- platform-scoped with no owning workspace at all — the same shape Epic 16's world graph
-- tables already hold. `workspace_id is null` is required, structurally, if and only if
-- `domain = 'global'`.
--
-- is_published CANNOT BE TRUE OUTSIDE THE TWO PUBLIC DOMAINS — A STRUCTURAL SAFEGUARD,
-- NOT JUST A POLICY ONE
--
-- §15's own words: "nothing enters public indexes implicitly." The six ordinary domains
-- are gated by workspace membership regardless of is_published, but a check constraint
-- forbidding is_published = true anywhere outside ('provider', 'global') means a future
-- policy bug can never accidentally treat a private row as public — the same "make the
-- mistake unrepresentable rather than merely policed" discipline the Service Record
-- core/annex split (Epic 11) and provider_decisions' outcome-exclusivity check (Epic 18)
-- already use.
--
-- source_event_id: SUPABASE_ARCHITECTURE.md §14 requires "every projection table carries
-- ... the event position it was built to" so lag is measurable and rebuild is resumable.
-- No foreign key to platform.events, matching every other loose event/correlation
-- reference in this schema (platform.events is partitioned and append-only; a cross-schema
-- FK into it is not how any other engine references an event this session).
--
-- 'simple' TEXT SEARCH CONFIGURATION, DELIBERATELY, NOT 'english'
--
-- The platform is multi-locale (catalogue content alone spans eight locales per
-- ARCHITECTURE.md). A stemming configuration tuned to one language would be actively wrong
-- for the others. 'simple' (tokenise and lowercase, no stemming) is the safe,
-- locale-neutral default until a real per-locale search strategy is designed — named here
-- as a deliberate choice, not an oversight, since this is the first full-text search this
-- codebase has ever implemented.

create table if not exists derived.search_index (
  id                uuid                not null,
  domain            text                not null,
  workspace_id      uuid
                    references workspace.workspaces (id),
  location_path     extensions.ltree,
  source_type       text                not null,
  source_id         uuid                not null,
  title             text,
  body              text,
  search_vector     tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'B')
  ) stored,
  is_published      boolean             not null default false,
  indexed_at        timestamptz         not null default now(),
  source_event_id   uuid                not null,

  constraint search_index_pkey primary key (id),
  constraint search_index_one_row_per_source unique (domain, source_type, source_id),
  constraint search_index_domain_valid check (
    domain in ('workspace', 'property', 'asset', 'conversation', 'document', 'knowledge', 'provider', 'global')
  ),
  constraint search_index_global_has_no_workspace check (
    (domain = 'global') = (workspace_id is null)
  ),
  constraint search_index_published_only_public check (
    domain in ('provider', 'global') or is_published = false
  )
);

comment on table derived.search_index is
  'One polymorphic projection, all eight search domains (SYSTEM_ARCHITECTURE.md §15). Derived class: hard-delete permitted, rebuildable per workspace, no guard trigger — the first table this session has built with that posture.';
comment on column derived.search_index.workspace_id is
  'Required for every domain except global (platform-scoped: world graph, catalogues). For provider, this is the PUBLISHING workspace, not a viewer''s.';
comment on column derived.search_index.location_path is
  'Populated only for property/asset domains, "where scoped roles apply" (§15). Null for every other domain.';
comment on column derived.search_index.source_type is
  'The underlying aggregate type this row indexes (e.g. property, asset, message). No foreign key — polymorphic, matching platform.events'' own posture.';
comment on column derived.search_index.is_published is
  'Governs visibility for provider/global only. search_index_published_only_public forbids it from ever being true elsewhere, structurally.';
comment on column derived.search_index.source_event_id is
  'The event this row was built to (SUPABASE_ARCHITECTURE.md §14) — what makes lag measurable and rebuild resumable. No foreign key: platform.events is partitioned and append-only.';

create index if not exists search_index_workspace_domain_idx
  on derived.search_index (workspace_id, domain);
create index if not exists search_index_location_path_gist_idx
  on derived.search_index using gist (location_path extensions.gist_ltree_ops)
  where location_path is not null;
create index if not exists search_index_search_vector_gin_idx
  on derived.search_index using gin (search_vector);
create index if not exists search_index_published_idx
  on derived.search_index (domain, is_published)
  where domain in ('provider', 'global');

-- =========================================================================
-- ACCESS — klussie_consumer_search is the only role with any privilege here at all
-- (ROLES.md §2.2: "Maintains search support"). No engine role touches this table
-- directly, matching §2's own framing that derived is "owned by whichever engine owns
-- each projection" and written by consumers, not engines. authenticated/anon get nothing
-- yet — ROLES.md §2.4's own "Not yet" bucket names this exact grant as future work, opened
-- by whichever epic ships the live read path; WP 20.02's isolation policies are built now
-- so that grant is a one-line change when it comes, not a security review from scratch.

grant select, insert, update, delete on derived.search_index to klussie_consumer_search;
revoke all on derived.search_index from anon, authenticated, service_role;

alter table derived.search_index enable row level security;

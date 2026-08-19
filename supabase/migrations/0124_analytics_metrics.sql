-- Epic 21 WP01 — the two analytics stores. `analytics_ws` and `analytics_pf` already exist
-- (0018_schemas.sql, Epic 01) and `klussie_consumer_analytics` already holds USAGE on both
-- (0019_grants.sql, Epic 01) — the same "schema and role already named, nothing to resolve
-- by precedent" shape Epic 20 found for Search, now a second occurrence.
--
-- A GENUINE INCONSISTENCY BETWEEN THE TWO FROZEN DOCUMENTS, RESOLVED BY KEEPING BOTH
--
-- DATABASE_ARCHITECTURE.md §31 names six domains: Operational, Business, Marketplace,
-- Property, AI, Enterprise. SYSTEM_ARCHITECTURE.md §16 also names six: Operational,
-- Business, Marketplace, AI, Platform, Enterprise. Five agree exactly; the sixth does not
-- — "Property" ("asset and building behaviour over time... that workspace, and memory") and
-- "Platform" ("growth, retention, health") are not the same concept renamed. They are two
-- genuinely different, both legitimate domains: MASTER_CONTEXT.md §14's own KPI table
-- (NPS, customer/professional retention) is exactly "growth, retention, health" and has
-- nothing to do with property behaviour, while property/asset analytics has nothing to do
-- with retention. Rather than silently picking one document over the other — which would
-- contradict whichever one lost — this migration keeps BOTH: seven domains, not six. Named
-- here explicitly as a real cross-document finding, not a silent softening.
--
-- SEVEN DOMAINS, TWO TABLES — THE SAME PRIVACY-BOUNDARY SPLIT §31 ITSELF DEMANDS
--
-- Business, Property and Enterprise contain individual detail and are workspace-scoped:
-- analytics_ws.workspace_metrics. Operational, Marketplace, AI and Platform may hold only
-- promoted aggregates and are platform-scoped: analytics_pf.platform_metrics — which
-- carries NO workspace_id column at all, structurally, the same "no workspace reference
-- anywhere" guarantee Epic 16's own world graph tables already hold, not merely a policy
-- that could be queried around.
--
-- ONE POLYMORPHIC TABLE PER STORE — THE THIRD USE OF platform.events' OWN SHAPE THIS
-- SESSION, AFTER platform.events ITSELF AND Epic 20's derived.search_index
--
-- All three domains sharing analytics_ws have the same row shape (a metric key, a value, a
-- period, dimensional breakdown); the same is true of the four sharing analytics_pf. One
-- `domain` discriminator column per store is the smallest correct slice, the same reasoning
-- applied twice already this session.
--
-- ANALYTICS IS PROJECTION CLASS — THE SECOND HARD-DELETE-PERMITTED TABLE PAIR THIS SESSION
-- HAS BUILT, AFTER Epic 20's SEARCH INDEX
--
-- DATABASE_ARCHITECTURE.md §3 classifies "Analytics" as *Projection*, "All six kinds" (now
-- seven, per this migration's own finding above). SUPABASE_ARCHITECTURE.md §14's rule
-- applies identically to both stores: no guard trigger, freely rebuildable, hard-delete
-- permitted.
--
-- "PROMOTED AGGREGATES" IS §31'S OWN GOVERNING PHRASE — NOT A LIVE MATERIALIZED VIEW YET
--
-- SUPABASE_ARCHITECTURE.md §14 says "materialized views are appropriate in analytics_pf,"
-- but DATABASE_ARCHITECTURE.md §31 point 1 is the more specific rule for THIS migration:
-- platform-scoped analytics "may hold only PROMOTED aggregates... merging them would put
-- the promotion rule at the mercy of a query." Promotion is an explicit, one-way write
-- (WP 21.03's promote_platform_metric()), the same discipline Epic 16's own
-- knowledge.promote_fact() already established for the world graph — not a live SQL
-- recomputation over transactional tables, which would put the aggregate-only guarantee at
-- the mercy of whoever writes the next query. A materialized view fed BY that promoted
-- table is a real future optimisation (§14 is not wrong), just not this migration's job.

create table if not exists analytics_ws.workspace_metrics (
  id                uuid        not null,
  domain            text        not null,
  workspace_id      uuid        not null
                    references workspace.workspaces (id),
  metric_key        text        not null,
  metric_value      numeric     not null,
  dimensions        jsonb       not null default '{}'::jsonb,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  computed_at       timestamptz not null default now(),
  source_event_id   uuid        not null,

  constraint workspace_metrics_pkey primary key (id),
  constraint workspace_metrics_one_row_per_period unique (domain, workspace_id, metric_key, period_start, period_end),
  constraint workspace_metrics_domain_valid check (domain in ('business', 'property', 'enterprise')),
  constraint workspace_metrics_period_valid check (period_end > period_start)
);

comment on table analytics_ws.workspace_metrics is
  'Workspace-scoped analytics: business, property, enterprise (SYSTEM_ARCHITECTURE.md §16 + DATABASE_ARCHITECTURE.md §31, reconciled — see this migration''s own header). Projection class: hard-delete permitted, no guard trigger.';
comment on column analytics_ws.workspace_metrics.dimensions is
  'Free-form breakdown context (e.g. {"site": "..."}) — safe here because this store may hold individual detail (§31).';
comment on column analytics_ws.workspace_metrics.source_event_id is
  'The event this metric was computed from (SUPABASE_ARCHITECTURE.md §14) — makes lag measurable, rebuild resumable, the same posture derived.search_index already holds.';

create index if not exists workspace_metrics_workspace_domain_idx
  on analytics_ws.workspace_metrics (workspace_id, domain, period_start desc);

grant select, insert, update, delete on analytics_ws.workspace_metrics to klussie_consumer_analytics;
revoke all on analytics_ws.workspace_metrics from anon, authenticated, service_role;

alter table analytics_ws.workspace_metrics enable row level security;

-- =========================================================================

create table if not exists analytics_pf.platform_metrics (
  id                uuid        not null,
  domain            text        not null,
  metric_key        text        not null,
  metric_value      numeric     not null,
  dimensions        jsonb       not null default '{}'::jsonb,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  promoted_at       timestamptz not null default now(),

  constraint platform_metrics_pkey primary key (id),
  constraint platform_metrics_one_row_per_period unique (domain, metric_key, period_start, period_end),
  constraint platform_metrics_domain_valid check (domain in ('operational', 'marketplace', 'ai', 'platform')),
  constraint platform_metrics_period_valid check (period_end > period_start)
);

comment on table analytics_pf.platform_metrics is
  'Platform-scoped analytics: operational, marketplace, ai, platform. NO workspace_id column, structurally — the same "no workspace reference anywhere" guarantee Epic 16''s own world graph tables hold (PLATFORM_DOMAIN_MODEL.md §18/§22: "the aggregate must never be a route to an individual workspace''s specifics"). Written only through analytics.promote_platform_metric().';
comment on column analytics_pf.platform_metrics.dimensions is
  'Free-form breakdown context. MUST NEVER carry a workspace or person identifier — this store holds only promoted aggregates (§31). Not mechanically enforceable by a check constraint on jsonb content; enforced by this table having no workspace_id column for a value to hide behind, and by promote_platform_metric() accepting no workspace parameter at all.';

create index if not exists platform_metrics_domain_idx
  on analytics_pf.platform_metrics (domain, period_start desc);

grant select, insert, update, delete on analytics_pf.platform_metrics to klussie_consumer_analytics;
revoke all on analytics_pf.platform_metrics from anon, authenticated, service_role;

alter table analytics_pf.platform_metrics enable row level security;
-- No policy here, deliberately — matching platform.events' own posture. Nothing reads this
-- table directly yet; WP 21.03's platform_metrics_for() is the only access path, granted
-- to klussie_consumer_analytics alone until a real operator-facing surface exists
-- (SUPABASE_ARCHITECTURE.md §17's "two roles" — the read side, not the load side, and
-- ROLES.md §2.4's own "Not yet" bucket).

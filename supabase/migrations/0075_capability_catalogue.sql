-- Epic 04 WP01 — the capability catalogue and its dependency graph.
--
-- BACKFILLING A SKIPPED EPIC — READ THIS BEFORE THE MIGRATION NUMBER LOOKS WRONG
--
-- Epic 04 is Tier 1 in the roadmap's own sequencing diagram (§5): identity, workspace,
-- capability, in that order, before any physical-model epic. It was never built —
-- whichever session sequenced Epic 05 branched straight off Epic 03's tip, with no
-- documented reason found anywhere in MASTER_CONTEXT.md, ARCHITECTURE.md, or a PR. The
-- gap was found and confirmed empty (no branch, no PR, no completion record) while
-- reporting Epic 10's completion, and the product owner asked for it to be built now,
-- properly, rather than left open or merely documented as deferred.
--
-- Building it now means it cannot occupy migration numbers 0039–0074 — every one of
-- those already belongs to real, shipped content in Epics 05–10, each on its own open,
-- stacked PR (#4–#9). Renumbering six PRs' worth of already-reviewed migrations to make
-- room is a far larger and riskier change than the one this epic actually needs to make.
-- This epic's migrations are therefore numbered 0075 onward, continuing after Epic 10,
-- and this branch is stacked on epic-10's tip rather than epic-03's. Nothing built in
-- Epics 05–10 depends on Capability — each epic that touched a capability-shaped concept
-- said so explicitly and left it as a named gap (e.g. Epic 09's "capability-aware...
-- declared but not yet enforced," Epic 10's identical restraint) — so the epic's
-- *conceptual* place in the dependency chain is unaffected by its *literal* position in
-- migration history. Recorded here, in the roadmap, and in
-- implementation/epic-04/COMPLETION.md, not silently reordered.
--
-- PLATFORM_DOMAIN_MODEL.md §6 (Principle 1): "A workspace is not defined by its type. A
-- workspace is defined by the capabilities enabled for it." DATABASE_ARCHITECTURE.md
-- §11: "The capability catalogue is platform-scoped configuration." Lives in `platform`,
-- owned by klussie_engine_platform — the grant aggregate itself (workspace.capability_
-- grants, WP 04.03) lives in `workspace`, owned by klussie_engine_workspace, which is
-- migration 0019's own pairing: "klussie_engine_workspace — Workspace and Capability
-- engines. Owns schema workspace."
--
-- A CAPABILITY IS A CATALOGUE ROW, NOT A FEATURE FLAG — AND THIS TABLE IS DELIBERATELY
-- NOT public.feature_flags
--
-- §6.2, verbatim: "Capabilities are not feature flags... a feature flag is an
-- engineering mechanism for rolling out or rolling back a change, is temporary... A
-- capability is a product and commercial surface, is permanent, and is granted per
-- workspace... They should be built on shared machinery and must never be conflated in
-- meaning." public.feature_flags (migration 0010) is global/country/user-id/percentage
-- rollout configuration with no workspace concept at all, and nothing in the current
-- application reads it. True technical convergence — one shared table — would violate
-- §6.2's own explicit warning, since a rollout percentage and a durable per-workspace
-- entitlement answer different questions. "Convergence... rather than coexistence"
-- (roadmap §10, this epic's own database note) is honoured at the level the domain model
-- actually asks for: this is the one real, permanent, workspace-granted mechanism going
-- forward, and public.feature_flags remains what it already is — an engineering rollout
-- switch — untouched, with the boundary between the two stated here rather than merged.
--
-- ONLY THE DEPENDENCY EDGES THE FROZEN DOCUMENT ACTUALLY STATES ARE SEEDED
--
-- §6.2's own diagram gives Property Management -> Asset Management -> Maintenance
-- Planning -> Preventive Maintenance, and Asset Management -> Compliance. Its prose adds
-- one more: "Compliance depends on Document Intelligence to be worth anything." Five
-- edges, all textually grounded. A plausible-but-unstated edge — Fleet Management on
-- Asset Management, say, which its own description implies but never states as a
-- dependency — is not invented here, the same restraint this session held for
-- workflow_transition_rules.actor_role and every other "declared but not yet real"
-- column across Epics 08–10.
--
-- ONLY THREE PRESETS, NOT FOUR — THE ROADMAP'S OWN ACCEPTANCE CRITERION, CROSS-CHECKED
-- AGAINST workspace.workspaces.type
--
-- §6.8 documents four presets (Personal, Professional, Business, Enterprise), but this
-- epic's own roadmap entry (§10) states acceptance as "Presets exist for Personal,
-- Professional and Business" — three, not four — and workspace.workspaces.type
-- (migration 0030) already constrains to exactly those three values, with no
-- 'enterprise' among them. This matches the roadmap's own "Epics 23–24 are
-- demand-gated... not scheduled" posture for Enterprise generally (§5). WP 04.02 seeds
-- three presets, not four, both because the roadmap says so and because a fourth would
-- describe a workspace type this schema cannot yet create.

-- =========================================================================
-- THE CATALOGUE

create table if not exists platform.capabilities (
  capability_key  text        not null,
  category        text        not null,
  name            text        not null,
  description     text        not null,
  created_at      timestamptz not null default now(),

  constraint capabilities_pkey primary key (capability_key)
);

comment on table platform.capabilities is
  'The declared, coarse-grained units of product behaviour a workspace may hold (PLATFORM_DOMAIN_MODEL.md §6.7) — "a catalogue, not a schema, and explicitly not a fixed list." Platform-scoped configuration, not an aggregate. Seeded below from §6.7''s real catalogue, verbatim.';
comment on column platform.capabilities.category is
  'The six groupings §6.7 itself uses to present the catalogue (demand and supply, the physical world, care over time, knowledge and intelligence, working together, commercial, extension) — informational, never branched on.';

insert into platform.capabilities (capability_key, category, name, description) values
  ('marketplace_consumer',    'demand_and_supply', 'Marketplace Consumer', 'Requesting work from other workspaces; receiving and accepting quotes.'),
  ('marketplace_provider',    'demand_and_supply', 'Marketplace Provider', 'Being discoverable as supply; receiving requests, quoting, performing work, being reviewed.'),
  ('portfolio_reputation',    'demand_and_supply', 'Portfolio & Reputation', 'A public profile, published work, testimonials and the reputation that attaches to a providing workspace.'),
  ('procurement',             'demand_and_supply', 'Procurement', 'Structured buying: approval chains, budget thresholds, purchase orders, preferred-supplier lists.'),
  ('crm',                     'demand_and_supply', 'CRM', 'Managing relationships with customers over time — history, notes, follow-up, repeat-business tracking.'),

  ('property_management',     'physical_world', 'Property Management', 'Holding properties and their location hierarchies. The foundation nearly everything else depends on.'),
  ('asset_management',        'physical_world', 'Asset Management', 'Registering assets, their placement over time, condition and lifecycle.'),
  ('inventory',               'physical_world', 'Inventory', 'Consumables and stock — quantities that deplete, rather than assets that age.'),
  ('fleet_management',        'physical_world', 'Fleet Management', 'Vehicles and mobile plant: assets whose defining attribute is that they move, with usage-based rather than time-based service intervals.'),

  ('maintenance_planning',    'care_over_time', 'Maintenance Planning', 'Recording maintenance, scheduling it, and tracking what is due.'),
  ('preventive_maintenance',  'care_over_time', 'Preventive Maintenance', 'Interval- and condition-driven schedules generated rather than manually entered.'),
  ('compliance',              'care_over_time', 'Compliance', 'Obligations with legal force: statutory inspections, certifications, expiry tracking, evidence.'),
  ('advanced_compliance',     'care_over_time', 'Advanced Compliance', 'Regulated-industry depth — audit-ready evidence chains, retention regimes, tamper-evident records, regulator-facing reporting.'),
  ('scheduling',              'care_over_time', 'Scheduling', 'Time, availability, appointments, dispatch and calendars.'),

  ('property_memory',         'knowledge_and_intelligence', 'Property Memory', 'Accumulated understanding of a specific property.'),
  ('document_intelligence',   'knowledge_and_intelligence', 'Document Intelligence', 'Reading documents to propose structured facts — invoices, manuals, certificates.'),
  ('ai_premium',              'knowledge_and_intelligence', 'AI Premium', 'Deeper reasoning, proactive behaviour, longer horizons, population-scale analysis within a workspace.'),
  ('analytics',               'knowledge_and_intelligence', 'Analytics', 'Aggregated reporting within a workspace.'),

  ('team_collaboration',      'working_together', 'Team Collaboration', 'Multiple members, assignment of work, internal discussion, scoped roles at depth.'),
  ('workflow_automation',     'working_together', 'Workflow Automation', 'Rules that act on events: when this happens, do that, notify them, require approval.'),
  ('notifications',           'working_together', 'Notifications', 'Reaching people across channels, with escalation and rotas at higher volumes.'),

  ('billing',                 'commercial', 'Billing', 'Issuing invoices, terms, accounts, tax handling appropriate to the jurisdiction.'),
  ('payments',                'commercial', 'Payments', 'Moving money — collection, payout, settlement between workspaces.'),

  ('api_access',              'extension', 'API Access', 'Programmatic access to the workspace''s own data and behaviour.'),
  ('enterprise_integrations', 'extension', 'Enterprise Integrations', 'Connections to a customer''s existing systems, and outbound event subscription.'),
  ('federated_identity',      'extension', 'Federated Identity', 'Single sign-on and directory-driven membership.'),
  ('white_label',             'extension', 'White Label', 'The platform presented under another organisation''s brand, taxonomy and terminology.')
on conflict (capability_key) do nothing;

-- =========================================================================
-- THE DEPENDENCY GRAPH — only the edges §6.2 actually states, see header

create table if not exists platform.capability_dependencies (
  capability_key          text not null
                          references platform.capabilities (capability_key),
  requires_capability_key text not null
                          references platform.capabilities (capability_key),

  constraint capability_dependencies_pkey primary key (capability_key, requires_capability_key),
  constraint capability_dependencies_no_self_reference
    check (capability_key <> requires_capability_key)
);

comment on table platform.capability_dependencies is
  '"Capabilities declare dependencies... granting a capability grants what it requires; a capability cannot be withdrawn while something that depends on it is still held" (§6.2). Only the five edges §6.2 itself states are seeded — see this migration''s own header for why an unstated-but-plausible edge is not invented.';

insert into platform.capability_dependencies (capability_key, requires_capability_key) values
  ('asset_management',       'property_management'),
  ('maintenance_planning',   'asset_management'),
  ('preventive_maintenance', 'maintenance_planning'),
  ('compliance',             'asset_management'),
  ('compliance',             'document_intelligence')
on conflict (capability_key, requires_capability_key) do nothing;

-- =========================================================================
-- ACCESS

alter table platform.capabilities enable row level security;
alter table platform.capability_dependencies enable row level security;

-- No policy yet — WP 04.04 adds the real read path once the contract exists to serve it
-- through, the same restraint every catalogue table in this roadmap has held before its
-- first real caller (property.document_types, work.workflow_definitions, and now this).

revoke all on platform.capabilities from anon, authenticated, service_role;
revoke all on platform.capability_dependencies from anon, authenticated, service_role;

-- klussie_engine_workspace needs to read both, to validate grants and resolve dependency
-- chains (WP 04.03/04.05) — the one cross-schema grant this migration adds, named and
-- narrow, per 0019's own rule ("each cross-schema read is granted by the epic that has a
-- real query needing it").
grant usage on schema platform to klussie_engine_workspace;
grant select on platform.capabilities to klussie_engine_workspace;
grant select on platform.capability_dependencies to klussie_engine_workspace;

-- Epic 22 WP01 (part 1) — the plan catalogue: platform-wide configuration, not a workspace
-- aggregate, the same placement Epic 04's own capability catalogue already holds.
--
-- platform.plans, NOT commerce.plans — MIRRORING platform.capabilities' OWN PLACEMENT
-- EXACTLY
--
-- 0075_capability_catalogue.sql put the capability catalogue in `platform` even though
-- Capability itself owns `workspace` — because a catalogue is platform-wide configuration,
-- not a tenant's own data, and SUPABASE_ARCHITECTURE.md §2's schema table names `platform`
-- for exactly this ("taxonomies, catalogues, configuration"). A plan is the same kind of
-- thing: PLATFORM_DOMAIN_MODEL.md §24 is explicit that "no code knows what a tier is" —
-- pricing, packaging and plan design are product work, changed by editing this table, not
-- by shipping code. `commerce.subscriptions` (0128, WP01 part 2) is the actual
-- workspace-scoped aggregate; this table is its catalogue, exactly mirroring the
-- capability/capability-grant split.
--
-- capability_keys IS A DEPENDENCY-ORDERED jsonb ARRAY, NOT A SET — SEEDED FAITHFULLY
-- AGAINST THE REAL 5-EDGE DEPENDENCY TABLE (0075), NOT PLATFORM_DOMAIN_MODEL's PROSE ALONE
--
-- workspace.grant_capability() (Epic 04) refuses to grant a capability before its own
-- dependency, and never auto-cascades. A plan's own bundle must therefore already be
-- ordered so that granting it capability by capability, in array order, always succeeds.
-- Five real plans are seeded, each CUMULATIVE (a subscription's plan_key names the whole
-- bundle it grants, not a diff from the tier below it): personal (the free base — property_
-- management, asset_management, property_memory, marketplace_consumer, notifications);
-- premium_home (personal's base + maintenance_planning, preventive_maintenance,
-- document_intelligence, ai_premium, team_collaboration); professional (personal's base +
-- marketplace_provider, portfolio_reputation, scheduling, billing, payments,
-- fleet_management, crm — a parallel branch off personal, not premium_home, since a
-- professional workspace manages its own assets while also being marketplace supply);
-- business (premium_home's full bundle + compliance, procurement, inventory, analytics —
-- an organisation "managing their own properties... buying externally," which is
-- premium_home's own physical/maintenance/collaboration set, not professional's supply
-- side); enterprise (business's full bundle + advanced_compliance, workflow_automation,
-- api_access, enterprise_integrations, federated_identity). White Label is named "(future)"
-- in §24's own table and is deliberately NOT seeded as a real, purchasable plan here.
--
-- Every dependency check verified against the real edges: asset_management requires
-- property_management (present before it in every bundle that includes it);
-- maintenance_planning requires asset_management; preventive_maintenance requires
-- maintenance_planning; compliance requires BOTH asset_management AND
-- document_intelligence (business's bundle carries both, from premium_home, before
-- compliance). advanced_compliance carries no dependency edge in 0075's own table, despite
-- what its name might suggest — not invented here, since inventing an unenforced
-- dependency this migration cannot actually check would be worse than matching what Epic
-- 04 actually built.

create table if not exists platform.plans (
  plan_key        text        not null,
  name            text        not null,
  tier            text        not null,
  capability_keys jsonb       not null,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),

  constraint plans_pkey primary key (plan_key),
  constraint plans_capability_keys_not_empty check (jsonb_array_length(capability_keys) > 0)
);

comment on table platform.plans is
  'The plan catalogue (PLATFORM_DOMAIN_MODEL.md §24) — platform-wide configuration, not a workspace aggregate, the same placement platform.capabilities already holds. capability_keys is dependency-ordered, not merely a set.';
comment on column platform.plans.capability_keys is
  'Ordered so that granting this plan''s bundle capability-by-capability, in array order, never hits workspace.grant_capability()''s own dependency-not-yet-held refusal.';

insert into platform.plans (plan_key, name, tier, capability_keys) values
  ('personal', 'Personal', 'Personal', jsonb_build_array(
    'property_management', 'asset_management', 'property_memory', 'marketplace_consumer', 'notifications'
  )),
  ('premium_home', 'Premium Home', 'Personal', jsonb_build_array(
    'property_management', 'asset_management', 'property_memory', 'marketplace_consumer', 'notifications',
    'maintenance_planning', 'preventive_maintenance', 'document_intelligence', 'ai_premium', 'team_collaboration'
  )),
  ('professional', 'Professional', 'Professional', jsonb_build_array(
    'property_management', 'asset_management', 'property_memory', 'marketplace_consumer', 'notifications',
    'marketplace_provider', 'portfolio_reputation', 'scheduling', 'billing', 'payments', 'fleet_management', 'crm'
  )),
  ('business', 'Business', 'Business', jsonb_build_array(
    'property_management', 'asset_management', 'property_memory', 'marketplace_consumer', 'notifications',
    'maintenance_planning', 'preventive_maintenance', 'document_intelligence', 'ai_premium', 'team_collaboration',
    'compliance', 'procurement', 'inventory', 'analytics'
  )),
  ('enterprise', 'Enterprise', 'Business', jsonb_build_array(
    'property_management', 'asset_management', 'property_memory', 'marketplace_consumer', 'notifications',
    'maintenance_planning', 'preventive_maintenance', 'document_intelligence', 'ai_premium', 'team_collaboration',
    'compliance', 'procurement', 'inventory', 'analytics',
    'advanced_compliance', 'workflow_automation', 'api_access', 'enterprise_integrations', 'federated_identity'
  ))
on conflict (plan_key) do nothing;

-- =========================================================================
-- ACCESS — the same restraint every catalogue table in this roadmap has held before its
-- first real caller (platform.capabilities, work.workflow_definitions, property.document_types).

alter table platform.plans enable row level security;
-- No policy yet — WP 22.03's own contract is the only access path until a real read
-- surface exists.

revoke all on platform.plans from anon, authenticated, service_role;
grant select on platform.plans to klussie_engine_commerce;

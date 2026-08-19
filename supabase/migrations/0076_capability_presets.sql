-- Epic 04 WP02 — capability presets: named default bundles, three of them.
--
-- PLATFORM_DOMAIN_MODEL.md §6.8: "A preset is a named default bundle. It is a starting
-- point and a convenience, never a constraint — a workspace may hold any combination of
-- capabilities, and presets exist so that the overwhelming majority never have to think
-- about that." Lives in `platform`, alongside the catalogue (0075) — presets are
-- configuration about the catalogue, not a workspace's own data.
--
-- THREE PRESETS, NOT FOUR — SEE 0075's OWN HEADER
--
-- §6.8 documents Personal, Professional, Business and Enterprise. This migration seeds
-- only the first three: the roadmap's own acceptance criterion for this epic reads
-- "Presets exist for Personal, Professional and Business," and
-- workspace.workspaces.type (migration 0030) has no 'enterprise' value to ever apply a
-- fourth preset to — Enterprise is demand-gated, "not scheduled" (roadmap §5, Epic 23),
-- the same posture this migration holds for a preset with no workspace type that could
-- use it yet.
--
-- ● MEANS SEEDED, ○ DOES NOT — TRANSCRIBED EXACTLY FROM §6.8's TABLE
--
-- §6.8's legend: "● granted by default · ○ available, negotiated." Only the ● cells for
-- Personal, Professional and Business are seeded as preset grants below. White Label's ○
-- under Enterprise is moot here (no Enterprise preset exists in this migration at all),
-- recorded so a future reader does not wonder why it is absent.
--
-- WHY THIS TABLE IS DEPENDENCY-CONSISTENT WITH 0075, CHECKED RATHER THAN ASSUMED
--
-- Business grants both Preventive Maintenance and Compliance, whose dependencies
-- (Maintenance Planning; Asset Management and Document Intelligence, respectively,
-- 0075) are all present in the same preset. Personal and Professional grant neither, so
-- their absent dependencies raise no inconsistency. Verified by
-- capabilityPresets.test.js, not merely asserted.

create table if not exists platform.capability_presets (
  preset_key   text        not null,
  name         text        not null,
  created_at   timestamptz not null default now(),

  constraint capability_presets_pkey primary key (preset_key)
);

comment on table platform.capability_presets is
  'A named default bundle (§6.8) — "a starting point and a convenience, never a constraint." Three rows, matching workspace.workspaces.type''s own three values exactly (migration 0030) — see this migration''s own header for why not four.';

insert into platform.capability_presets (preset_key, name) values
  ('personal', 'Personal'),
  ('professional', 'Professional'),
  ('business', 'Business')
on conflict (preset_key) do nothing;

create table if not exists platform.capability_preset_grants (
  preset_key      text not null
                  references platform.capability_presets (preset_key),
  capability_key  text not null
                  references platform.capabilities (capability_key),

  constraint capability_preset_grants_pkey primary key (preset_key, capability_key)
);

comment on table platform.capability_preset_grants is
  'Exactly the ● cells of §6.8''s own table, for the three presets 0076 seeds. work.apply_capability_preset() (WP 04.05) is the only reader that matters — a preset is a starting point applied once, at workspace creation, never re-consulted afterward (§6.8: "never a constraint").';

insert into platform.capability_preset_grants (preset_key, capability_key) values
  -- Personal — five capabilities, every one of them held by every other preset too
  -- (§6.8: "the physical model and Property Memory are in every preset, because they are
  -- the platform").
  ('personal', 'property_management'),
  ('personal', 'asset_management'),
  ('personal', 'property_memory'),
  ('personal', 'marketplace_consumer'),
  ('personal', 'notifications'),

  -- Professional — Personal's five, plus supply-side and operating capabilities.
  ('professional', 'property_management'),
  ('professional', 'asset_management'),
  ('professional', 'property_memory'),
  ('professional', 'marketplace_consumer'),
  ('professional', 'notifications'),
  ('professional', 'maintenance_planning'),
  ('professional', 'marketplace_provider'),
  ('professional', 'portfolio_reputation'),
  ('professional', 'scheduling'),
  ('professional', 'billing'),
  ('professional', 'payments'),
  ('professional', 'fleet_management'),
  ('professional', 'crm'),
  ('professional', 'team_collaboration'),

  -- Business — Professional's operating set minus the supply-side pair (no Marketplace
  -- Provider or Portfolio & Reputation — §6.8's table draws that line exactly), minus
  -- CRM, plus compliance-and-scale capabilities.
  ('business', 'property_management'),
  ('business', 'asset_management'),
  ('business', 'property_memory'),
  ('business', 'marketplace_consumer'),
  ('business', 'notifications'),
  ('business', 'maintenance_planning'),
  ('business', 'scheduling'),
  ('business', 'billing'),
  ('business', 'payments'),
  ('business', 'fleet_management'),
  ('business', 'team_collaboration'),
  ('business', 'preventive_maintenance'),
  ('business', 'compliance'),
  ('business', 'procurement'),
  ('business', 'analytics'),
  ('business', 'inventory'),
  ('business', 'document_intelligence')
on conflict (preset_key, capability_key) do nothing;

-- =========================================================================
-- ACCESS

alter table platform.capability_presets enable row level security;
alter table platform.capability_preset_grants enable row level security;

-- No policy yet — same restraint as 0075.

revoke all on platform.capability_presets from anon, authenticated, service_role;
revoke all on platform.capability_preset_grants from anon, authenticated, service_role;

grant select on platform.capability_presets to klussie_engine_workspace;
grant select on platform.capability_preset_grants to klussie_engine_workspace;

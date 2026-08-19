-- Platform Activation Slice 0, WP 0.3 — the Operations Workspace, per ADR-0030.
--
-- An operator is a person with a second membership, in a real workspace, exactly like
-- anyone else who belongs to more than one workspace. No new access mechanism, no new
-- table, no new column. This migration is the whole of what ADR-0030's design costs in
-- schema: one capability row, one workspace row, one grant of that capability to that
-- workspace. Founding membership rows are deliberately NOT part of this migration — see
-- "WHAT THIS MIGRATION DELIBERATELY DOES NOT DO" below.
--
-- WHY `category = 'internal'`, AN EIGHTH GROUP BESIDE §6.7's SEVEN
--
-- 0075's own comment on platform.capabilities.category calls the existing groups
-- (demand and supply, the physical world, care over time, knowledge and intelligence,
-- working together, commercial, extension) "the groupings §6.7 itself uses to present
-- the catalogue" — all seven customer-facing. platform_operations belongs to none of
-- them, and ADR-0030's own resolution of the §6.2 tension says why: it is the one
-- capability in the catalogue with no customer, ever, by design. A new, honestly-named
-- category makes that visible in the data itself rather than forcing it into a group it
-- does not belong to.
--
-- NO DEPENDENCY ROW — THIS CAPABILITY REQUIRES NOTHING
--
-- Unlike Compliance (-> asset_management, document_intelligence) or the maintenance
-- pair, platform_operations has no physical-model prerequisite — it gates operator
-- tooling, not workspace behaviour built on Property/Asset/Maintenance. No row is added
-- to platform.capability_dependencies for it.
--
-- WHY `type = 'business'`, NOT A FOURTH CHECK-CONSTRAINT VALUE
--
-- ADR-0030's own reasoning, not repeated in full here: workspace.workspaces.type is a
-- three-value check constraint (0030_workspace.sql) documented as "a preset name and a
-- label for humans — nothing more" (§6.1). Extending it for one internal workspace would
-- touch a table every other engine depends on, for a distinction the column is
-- explicitly documented as not carrying. 'business' costs nothing and is the closest
-- existing label.
--
-- DIRECT INSERT, NOT THROUGH workspace.grant_capability() — THE SAME REASONING AS 0080
--
-- 0080's own header: "the contract function is for callers who do not already know the
-- full, correct picture in advance." This migration is the one place, ever, that grants
-- platform_operations, to the one workspace that will ever hold it — exactly the
-- already-known-consistent case 0080 describes, not the live, ongoing write path
-- workspace.grant_capability() protects. No event is emitted, matching 0080's own
-- precedent and 0033's workspace-creation backfill: migration-time seeding does not
-- emit domain events in this codebase's established convention.
--
-- IDENTIFIERS MINTED AT MIGRATION-RUN TIME, NOT HARDCODED
--
-- platform.uuid_v7_at(now()) — the same function every backfill in this roadmap mints
-- identifiers with (ADR-0022), applied here to a genuinely fresh row rather than a
-- backdated one, since there is no prior legacy timestamp to backdate to. This means the
-- Operations Workspace's id differs between staging and production, exactly as every
-- other workspace's id already does — nothing in this platform assumes cross-environment
-- id stability, and inventing an exception for this one workspace would be the actual
-- new pattern, not the safe default.
--
-- HOW A FUTURE FUNCTION FINDS "THE" OPERATIONS WORKSPACE — BY CAPABILITY, NOT BY NAME OR
-- HARDCODED ID
--
-- workspace.workspace_has_capability(workspace_id, 'platform_operations') (0079,
-- already built) is the correct check for "is this workspace allowed to authorize
-- operator actions" — not a name lookup, not an id constant embedded in application
-- code. This composes existing machinery rather than adding a new lookup path, and it is
-- the design WP 0.4's audit-read function (the next work package) uses directly: a
-- caller is an operator if and only if one of their real, active memberships
-- (api.current_workspace_memberships(), 0031) is in a workspace holding this capability.
-- Exactly one workspace should ever hold it — enforced by convention and by this
-- migration's own idempotent guard, not by a database constraint, matching how
-- workspace.capability_grants has never carried a uniqueness constraint on
-- (workspace_id, capability_key) (0077's own header).
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO — NO FOUNDING MEMBERSHIP ROW
--
-- SLICE_0_ACTIVATION_INFRASTRUCTURE.md §3's original wording described the founder's own
-- first membership as "seeded by the migration itself." On reflection, writing a real
-- person's identity into a numbered migration is wrong for the same reason
-- supabase/seed/staging_test_accounts.sql is kept OUTSIDE the numbered migration
-- sequence entirely: a migration must produce an identical structural result in every
-- environment, and a specific person's membership is per-environment operational data,
-- not structure. The workspace and its capability are structural (this migration, every
-- environment, identical shape). Who actually holds a membership in it is not, and is
-- deliberately left to a separate, per-environment seed step — the correct reading of
-- "the same way staging_test_accounts.sql-style seeding already works," taken literally
-- rather than folded into this file.

-- =========================================================================
-- 1 · The capability

insert into platform.capabilities (capability_key, category, name, description)
select 'platform_operations', 'internal', 'Platform Operations',
  'Internal operator tooling — support access, trust & safety, marketplace health, platform configuration. Never granted to any customer-facing plan or preset (ADR-0030); held only by the one Operations Workspace this migration creates.'
where not exists (
  select 1 from platform.capabilities where capability_key = 'platform_operations'
);

-- =========================================================================
-- 2 · The workspace

insert into workspace.workspaces (id, type, name, created_at, updated_at)
select platform.uuid_v7_at(now()), 'business', 'Klussie Operations', now(), now()
where not exists (
  select 1 from workspace.workspaces w
  join workspace.capability_grants g on g.workspace_id = w.id
  where g.capability_key = 'platform_operations' and g.withdrawn_at is null
);

-- =========================================================================
-- 3 · The grant — direct insert, per this file's own header

with target_workspace as (
  select w.id as workspace_id, w.created_at
  from workspace.workspaces w
  where w.name = 'Klussie Operations'
    and w.type = 'business'
    and not exists (
      select 1 from workspace.capability_grants g
      where g.workspace_id = w.id and g.capability_key = 'platform_operations'
    )
  order by w.created_at
  limit 1
),
inserted as (
  insert into workspace.capability_grants (id, workspace_id, capability_key, source, granted_at)
  select platform.uuid_v7_at(tw.created_at), tw.workspace_id, 'platform_operations', 'operator', tw.created_at
  from target_workspace tw
  returning id, workspace_id, capability_key, source, granted_at, withdrawn_at
)
insert into workspace.capability_grant_history
  (id, grant_id, workspace_id, capability_key, source, granted_at, withdrawn_at, changed_at)
select platform.uuid_v7_at(i.granted_at), i.id, i.workspace_id, i.capability_key, i.source, i.granted_at, i.withdrawn_at, i.granted_at
from inserted i;

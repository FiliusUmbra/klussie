-- Epic 04 WP06 — backfill: apply the matching preset to every existing workspace.
--
-- Step 2 of the migration pattern (roadmap §3): the new structure is populated and still
-- unused. Nothing reads capability grants yet — see 0079's own header — so there is
-- nothing to dual-write or switch reads for; this is the whole of what this epic's data
-- migration needs to do. workspace.workspaces.type (migration 0030) already names
-- exactly the three preset_key values 0076 seeded ('personal', 'professional',
-- 'business') — the mapping is the identity function, not a lookup table.
--
-- IDEMPOTENT AND RE-RUNNABLE
--
-- Guarded by `where not exists` per (workspace, capability) pair rather than `on
-- conflict`, because workspace.capability_grants deliberately has no unique constraint
-- on (workspace_id, capability_key) — see 0077's own header. Re-running this file finds
-- every pair already present and inserts nothing.
--
-- BACKDATED TO THE WORKSPACE'S OWN CREATED_AT — THE ONLY DEFENSIBLE READING OF "A
-- PRESET'S GRANT," APPLIED HERE FOR THE FIRST TIME
--
-- A preset is "a starting point... applied so the overwhelming majority never have to
-- think about it" (§6.8) — the capabilities it grants were always the workspace's
-- effective starting bundle, even though no row existed to record that until this
-- migration. granted_at is therefore the workspace's own created_at, the same reasoning
-- every prior backfill in this roadmap has used for its own minted ids
-- (platform.uuid_v7_at(source.created_at), migrations 0026, 0052, 0060) — extended here
-- to the grant's own recorded timestamp, not only its identifier, since a grant genuinely
-- backdates in a way an asset or a document row does not: the workspace could always do
-- these things, this migration is only the first thing to say so structurally.
--
-- DIRECT INSERT, NOT THROUGH workspace.grant_capability()
--
-- The contract function (0079) is deliberately restrictive — refuses if already held,
-- refuses if a dependency is missing, requires a caller-supplied history id per call.
-- All of that exists to protect a live, ongoing write path from an inconsistent request,
-- not to gate a one-time, already-known-consistent backfill (0076's own preset grants
-- were checked dependency-consistent by capabilityPresets.test.js before this migration
-- was written). Every other backfill in this roadmap inserts directly into its target
-- table for the identical reason (0052, 0060) — the contract function is for callers who
-- do not already know the full, correct picture in advance.

with target_grants as (
  select
    w.id as workspace_id,
    pg.capability_key,
    w.created_at
  from workspace.workspaces w
  join platform.capability_preset_grants pg on pg.preset_key = w.type
  where not exists (
    select 1 from workspace.capability_grants g
    where g.workspace_id = w.id
      and g.capability_key = pg.capability_key
  )
),
inserted as (
  insert into workspace.capability_grants (id, workspace_id, capability_key, source, granted_at)
  select platform.uuid_v7_at(tg.created_at), tg.workspace_id, tg.capability_key, 'preset', tg.created_at
  from target_grants tg
  returning id, workspace_id, capability_key, source, granted_at, withdrawn_at
)
insert into workspace.capability_grant_history
  (id, grant_id, workspace_id, capability_key, source, granted_at, withdrawn_at, changed_at)
select platform.uuid_v7_at(i.granted_at), i.id, i.workspace_id, i.capability_key, i.source, i.granted_at, i.withdrawn_at, i.granted_at
from inserted i;

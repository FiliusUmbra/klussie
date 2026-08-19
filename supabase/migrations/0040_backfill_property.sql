-- Epic 05 WP02 — one property ("My Home") per existing Personal Workspace.
--
-- PLATFORM_DOMAIN_MODEL.md §9: "A property is a place in the world that someone is
-- responsible for... everyone has somewhere they live." Step 2 of the six-step migration
-- pattern (roadmap §3): the new structure is populated and still unused. No read path
-- consumes property.properties yet — that is WP 05.06, several packages away.
--
-- ADR-0022 (Accepted): backfilled identifiers are UUIDv7 minted in SQL, from the source
-- row's own creation time, through platform.uuid_v7_at() — the same function migration
-- 0033 used for the Personal Workspace backfill this one continues. A property backfilled
-- today sorts exactly where it would have sorted had it existed the day its workspace did.
--
-- IDEMPOTENT AND RE-RUNNABLE, THE SAME RULE AS EVERY BACKFILL IN THIS ROADMAP
--
-- Re-running inserts nothing and changes nothing. The check is semantic — "does this
-- Personal Workspace already steward a property" — not "did this migration already run".
--
-- ONLY PERSONAL WORKSPACES, DELIBERATELY (roadmap §15's scope note)
--
-- Professional and Business workspaces are not backfilled a property. Nothing in the
-- current product represents a business's premises — no address, no square footage, no
-- data of any kind — and inventing a placeholder property to fill the gap would be a
-- guess dressed as data, exactly what ADR-0022's own precedent warns against for
-- identifiers and applies here to the row itself. A business's first real property
-- arrives the day someone adds one, through whichever UI Epic 06+ builds for it.
--
-- ARCHIVED WORKSPACES ARE EXCLUDED
--
-- An archived Personal Workspace (workspace.workspaces.archived_at not null) is, per
-- PLATFORM_DOMAIN_MODEL.md §9, retired — creating a new property stewarded by a workspace
-- nobody can act through would manufacture an aggregate with no reachable owner. No
-- workspace is archived today (nothing archives one yet), so this excludes zero rows in
-- practice; it is here because the column exists and a backfill that ignores it would be
-- correct only by accident.
--
-- THE NAME
--
-- "My Home", identical to the Personal Workspace's own backfilled name (migration 0033) —
-- the same existing-product naming (ADR-0008) and the same restraint: a stated default,
-- not a personalised one. "Chosen by its members" is a rename this backfill does not
-- attempt, for the property exactly as it was not attempted for the workspace.

with candidates as (
  -- One row per Personal Workspace that does not yet steward a property. The property id
  -- is minted once here from the workspace's own creation time.
  select
    w.id as workspace_id,
    w.created_at,
    platform.uuid_v7_at(w.created_at) as property_id
  from workspace.workspaces w
  where w.type = 'personal'
    and w.archived_at is null
    and not exists (
      select 1 from property.properties p where p.steward_workspace_id = w.id
    )
)
insert into property.properties (id, name, steward_workspace_id, steward_since, created_at, updated_at)
select property_id, 'My Home', workspace_id, created_at, created_at, now()
from candidates;

-- Epic 03 WP03 — one Personal Workspace per existing identity.
--
-- PLATFORM_DOMAIN_MODEL.md §27: "A person creates an account and gets a Personal
-- Workspace, because everyone has somewhere they live." Step 2 of the six-step migration
-- pattern (roadmap §3): the new structure is populated and still unused. No read path
-- consumes workspace.workspaces or workspace.memberships yet — that is WP 03.09 and
-- WP 03.12, both several packages away.
--
-- ADR-0022 (Accepted): backfilled identifiers are UUIDv7 minted in SQL, from the source
-- row's own creation time, through platform.uuid_v7_at() — executable by no application
-- role, only the migration runner. Both the workspace and its membership get identifiers
-- minted this way, so a workspace backfilled today sorts exactly where it would have
-- sorted had it been created the day its owner's identity was.
--
-- IDEMPOTENT AND RE-RUNNABLE, THE SAME RULE AS EVERY BACKFILL IN THIS ROADMAP
--
-- Re-running inserts nothing and changes nothing. The check is semantic — "does this
-- person already have an owner membership in a personal-type workspace" — not "did this
-- migration already run," which is what roadmap §3 asks for: a backfill trusted to be
-- re-run rather than trusted to be run exactly once.
--
-- ERASED IDENTITIES ARE EXCLUDED
--
-- An identity redacted by erasure (migration 0029) is, per §11.4, "ended" in the sense
-- that matters here: creating new structure for a person whose personal data is already
-- gone would be manufacturing a workspace nobody can use, since no auth session can ever
-- resolve to it again. Matches the exclusion migration 0028's resolvers already apply.
--
-- WHY WORKSPACE AND MEMBERSHIP ARE MINTED IN ONE STATEMENT
--
-- A workspace with no owner membership is not a workspace anyone can reach — the domain
-- model's permission grammar has no path to it. Minting both together, from one CTE
-- computing the new workspace id once, means there is no window in which one exists
-- without the other: either both are written, in the same transaction this migration
-- runs in, or neither is.
--
-- THE NAME
--
-- "My Home", matching the existing product's own naming for this exact concept
-- (`docs/product/HOME_OPERATING_SYSTEM.md`, ADR-0008) and PLATFORM_DOMAIN_MODEL.md §27's
-- own illustration ("🏡 My Home"). A stated default, not a personalised one — "chosen by
-- its members" (§5) is a rename this backfill does not attempt.

with candidates as (
  -- One row per identity that does not yet have a personal-type owner membership. The
  -- workspace id is minted once here and reused by both inserts below; the membership's
  -- own id is minted separately, in the final insert, because it is a distinct aggregate.
  select
    i.person_ref,
    i.created_at,
    platform.uuid_v7_at(i.created_at) as workspace_id
  from identity.identities i
  where i.erased_at is null
    and not exists (
      select 1
      from workspace.memberships m
      join workspace.workspaces w on w.id = m.workspace_id
      where m.person_ref = i.person_ref
        and w.type = 'personal'
        and m.role = 'owner'
    )
),
inserted_workspaces as (
  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  select workspace_id, 'personal', 'My Home', created_at, now()
  from candidates
  returning id
)
insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
select
  platform.uuid_v7_at(c.created_at),
  c.workspace_id,
  c.person_ref,
  'owner',
  'active',
  c.created_at,
  now()
from candidates c;

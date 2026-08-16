-- Epic 03 WP04 — one Professional Workspace per existing pro profile.
--
-- Roadmap §14 (03.04): "Every pro_profiles row has a Professional Workspace owned by the
-- same identity, which also retains its Personal Workspace — the dual-role case that
-- motivates the whole model." Step 2 of the six-step migration pattern (roadmap §3),
-- exactly as WP 03.03 was.
--
-- This package changes nothing about a person's Personal Workspace. It adds a second,
-- independent workspace and membership for the same person_ref — the idempotency check
-- below is scoped to type = 'professional' specifically, for the identical reason
-- WP 03.03's own check was scoped to type = 'personal': a check for "any workspace" would
-- skip a dual-role person who already has one kind but still needs the other.
--
-- WHY THE JOIN IS INNER, NOT LEFT
--
-- Every pro_profiles row should have a matching identity — Epic 02's backfill covers every
-- profile, and pro_profiles.profile_id references public.profiles(id), which every
-- identity's auth_user_id was backfilled from. If a pro_profiles row somehow has no
-- matching live identity, silently inventing a workspace for nobody would be worse than
-- surfacing the gap. This migration does not raise on that case — WP 03.07's reconciliation
-- is the package built to catch exactly this kind of discrepancy, read-only and against
-- real data, and duplicating that check here would be a second, weaker version of it.
--
-- THE NAME
--
-- `coalesce(pp.business_name, i.full_name, 'My Business')`. A `business` pro_type requires
-- business_name by its own check constraint (0001_init.sql: business_requires_details); a
-- `flexi` sole trader usually does not have one, and ADR-0023 already found, measuring
-- staging: "business_name is frequently the person's own name" for exactly this case. The
-- person's own name is the more accurate default than a placeholder when there is one to
-- use; the placeholder exists only for the identity with neither.
--
-- WHY pro_profiles.created_at, NOT identity.identities.created_at
--
-- The Professional Workspace's real birth is when the person became a pro, not when their
-- account was first created — PLATFORM_DOMAIN_MODEL.md §27: "Additional workspaces are
-- created when there is something real to put in them." ADR-0022's identifier-minting
-- timestamp follows that same event, so the backfilled workspace sorts where it would have
-- sorted had it been created the day pro_profiles gained the row.

with candidates as (
  select
    i.person_ref,
    pp.created_at,
    coalesce(pp.business_name, i.full_name, 'My Business') as workspace_name,
    platform.uuid_v7_at(pp.created_at) as workspace_id
  from public.pro_profiles pp
  join identity.identities i on i.auth_user_id = pp.profile_id
  where i.erased_at is null
    and not exists (
      select 1
      from workspace.memberships m
      join workspace.workspaces w on w.id = m.workspace_id
      where m.person_ref = i.person_ref
        and w.type = 'professional'
        and m.role = 'owner'
    )
),
inserted_workspaces as (
  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  select workspace_id, 'professional', workspace_name, created_at, now()
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

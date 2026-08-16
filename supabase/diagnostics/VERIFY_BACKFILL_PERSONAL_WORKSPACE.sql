-- Verifies the backfill in 0033_backfill_personal_workspace.sql (Epic 03 WP03).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_BACKFILL_PERSONAL_WORKSPACE.sql
--
-- Check 1 is the acceptance criterion against whatever this environment actually holds —
-- unlike Epic 02's identity backfill, staging is not empty here: five real identities
-- already exist. Checks 2-6 build a synthetic population inside a transaction to prove the
-- mapping precisely, then roll back, exactly as VERIFY_IDENTITY_BACKFILL.sql does for the
-- same reason: five rows is a real proof but not a varied one.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every live identity has exactly one Personal Workspace and an owner membership
--
-- The roadmap's own acceptance criterion for WP 03.03, checked against real data.

do $$
declare
  v_identities bigint;
  v_unbackfilled bigint;
  v_duplicated bigint;
begin
  select count(*) into v_identities from identity.identities where erased_at is null;

  select count(*) into v_unbackfilled
  from identity.identities i
  where i.erased_at is null
    and not exists (
      select 1 from workspace.memberships m
      join workspace.workspaces w on w.id = m.workspace_id
      where m.person_ref = i.person_ref and w.type = 'personal' and m.role = 'owner'
    );

  if v_unbackfilled > 0 then
    raise exception '% live identit(y/ies) have no Personal Workspace', v_unbackfilled;
  end if;

  select count(*) into v_duplicated
  from (
    select m.person_ref
    from workspace.memberships m
    join workspace.workspaces w on w.id = m.workspace_id
    where w.type = 'personal' and m.role = 'owner'
    group by m.person_ref
    having count(*) > 1
  ) d;

  if v_duplicated > 0 then
    raise exception '% person(s) have more than one Personal Workspace owner membership', v_duplicated;
  end if;

  raise notice '1 · every live identity has exactly one Personal Workspace and owner membership (% identities)', v_identities;
end;
$$;

-- =========================================================================
-- 2 · A real population, mapped correctly — synthetic, rolled back

begin;

insert into identity.identities (person_ref, auth_user_id, full_name, locale, created_at, updated_at) values
  ('01930000-0000-7000-8000-00000000c001', gen_random_uuid(), 'Wp Probe One',   'nl', '2024-05-01 08:00:00+00', now()),
  ('01930000-0000-7000-8000-00000000c002', gen_random_uuid(), 'Wp Probe Two',   'fr', '2025-09-10 14:30:00+00', now());

-- An erased identity: must be excluded entirely.
insert into identity.identities (person_ref, auth_user_id, full_name, locale, created_at, updated_at, erased_at) values
  ('01930000-0000-7000-8000-00000000c003', gen_random_uuid(), null, 'en', '2023-01-01 00:00:00+00', now(), now());

with candidates as (
  select
    i.person_ref, i.created_at,
    platform.uuid_v7_at(i.created_at) as workspace_id
  from identity.identities i
  where i.erased_at is null
    and not exists (
      select 1 from workspace.memberships m
      join workspace.workspaces w on w.id = m.workspace_id
      where m.person_ref = i.person_ref and w.type = 'personal' and m.role = 'owner'
    )
),
inserted_workspaces as (
  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  select workspace_id, 'personal', 'My Home', created_at, now()
  from candidates
  returning id
)
insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
select platform.uuid_v7_at(c.created_at), c.workspace_id, c.person_ref, 'owner', 'active', c.created_at, now()
from candidates c;

do $$
declare
  v_ws1 workspace.workspaces;
  v_mem1 workspace.memberships;
  v_ws3_count bigint;
begin
  select w.* into v_ws1
  from workspace.workspaces w
  join workspace.memberships m on m.workspace_id = w.id
  where m.person_ref = '01930000-0000-7000-8000-00000000c001';

  if v_ws1.id is null then
    raise exception 'Probe one has no Personal Workspace';
  end if;
  if v_ws1.type <> 'personal' or v_ws1.name <> 'My Home' then
    raise exception 'Probe one''s workspace is wrong: type=%, name=%', v_ws1.type, v_ws1.name;
  end if;
  if v_ws1.created_at <> '2024-05-01 08:00:00+00'::timestamptz then
    raise exception 'Workspace created_at was defaulted rather than preserved: %', v_ws1.created_at;
  end if;
  if pg_catalog.substr(v_ws1.id::text, 15, 1) <> '7' then
    raise exception 'The backfilled workspace id is not a UUIDv7';
  end if;

  select m.* into v_mem1 from workspace.memberships m where m.workspace_id = v_ws1.id;
  if v_mem1.role <> 'owner' or v_mem1.state <> 'active' then
    raise exception 'Probe one''s membership is wrong: role=%, state=%', v_mem1.role, v_mem1.state;
  end if;
  if v_mem1.id = v_ws1.id then
    raise exception 'The membership reused the workspace''s identifier instead of minting its own';
  end if;

  -- The erased identity got nothing.
  select count(*) into v_ws3_count
  from workspace.memberships m
  where m.person_ref = '01930000-0000-7000-8000-00000000c003';
  if v_ws3_count > 0 then
    raise exception 'An erased identity was backfilled a Personal Workspace';
  end if;

  -- Backfilled workspace identifiers sort by the identity's own age.
  if not (
    (select w.id from workspace.workspaces w join workspace.memberships m on m.workspace_id = w.id
       where m.person_ref = '01930000-0000-7000-8000-00000000c001')
    <
    (select w.id from workspace.workspaces w join workspace.memberships m on m.workspace_id = w.id
       where m.person_ref = '01930000-0000-7000-8000-00000000c002')
  ) then
    raise exception 'Backfilled workspace identifiers are not ordered by the identity creation time they encode';
  end if;

  raise notice '2 · two identities correctly backfilled, one erased identity correctly skipped';
end;
$$;

-- =========================================================================
-- 3 · Re-running is a no-op

do $$
declare
  v_before uuid[];
  v_after uuid[];
begin
  select array_agg(w.id order by w.id) into v_before
  from workspace.workspaces w
  join workspace.memberships m on m.workspace_id = w.id
  where m.person_ref in ('01930000-0000-7000-8000-00000000c001', '01930000-0000-7000-8000-00000000c002');

  with candidates as (
    select
      i.person_ref, i.created_at,
      platform.uuid_v7_at(i.created_at) as workspace_id
    from identity.identities i
    where i.erased_at is null
      and not exists (
        select 1 from workspace.memberships m
        join workspace.workspaces w on w.id = m.workspace_id
        where m.person_ref = i.person_ref and w.type = 'personal' and m.role = 'owner'
      )
  ),
  inserted_workspaces as (
    insert into workspace.workspaces (id, type, name, created_at, updated_at)
    select workspace_id, 'personal', 'My Home', created_at, now()
    from candidates
    returning id
  )
  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  select platform.uuid_v7_at(c.created_at), c.workspace_id, c.person_ref, 'owner', 'active', c.created_at, now()
  from candidates c;

  select array_agg(w.id order by w.id) into v_after
  from workspace.workspaces w
  join workspace.memberships m on m.workspace_id = w.id
  where m.person_ref in ('01930000-0000-7000-8000-00000000c001', '01930000-0000-7000-8000-00000000c002');

  if v_before is distinct from v_after then
    raise exception 'Re-running changed the backfilled workspaces — it should have inserted nothing';
  end if;

  raise notice '3 · re-running inserted nothing and re-minted nothing';
end;
$$;

rollback;

-- =========================================================================
-- 4 · Nothing was left behind

do $$
declare
  v_synthetic bigint;
begin
  select count(*) into v_synthetic from identity.identities
  where person_ref::text like '01930000-0000-7000-8000-00000000c%';

  if v_synthetic > 0 then
    raise exception 'The verification left % synthetic identity row(s) behind', v_synthetic;
  end if;

  raise notice '4 · no synthetic rows remain';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_BACKFILL_PERSONAL_WORKSPACE: all checks passed';
end;
$$;

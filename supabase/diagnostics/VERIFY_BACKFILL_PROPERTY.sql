-- Verifies the backfill in 0040_backfill_property.sql (Epic 05 WP02).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_BACKFILL_PROPERTY.sql
--
-- Check 1 is the acceptance criterion against whatever this environment actually holds.
-- Checks 2-4 build a synthetic population inside a transaction to prove the mapping
-- precisely, then roll back, the same shape VERIFY_BACKFILL_PERSONAL_WORKSPACE.sql uses
-- for the same reason: real data is a real proof but not a varied one.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every live Personal Workspace stewards exactly one property

do $$
declare
  v_workspaces bigint;
  v_unbackfilled bigint;
  v_duplicated bigint;
begin
  select count(*) into v_workspaces
  from workspace.workspaces where type = 'personal' and archived_at is null;

  select count(*) into v_unbackfilled
  from workspace.workspaces w
  where w.type = 'personal' and w.archived_at is null
    and not exists (select 1 from property.properties p where p.steward_workspace_id = w.id);

  if v_unbackfilled > 0 then
    raise exception '% live Personal Workspace(s) steward no property', v_unbackfilled;
  end if;

  select count(*) into v_duplicated
  from (
    select steward_workspace_id
    from property.properties
    group by steward_workspace_id
    having count(*) > 1
  ) d;

  if v_duplicated > 0 then
    raise exception '% workspace(s) steward more than one backfilled property', v_duplicated;
  end if;

  raise notice '1 · every live Personal Workspace stewards exactly one property (% workspaces)', v_workspaces;
end;
$$;

-- =========================================================================
-- 2 · A real population, mapped correctly — synthetic, rolled back

begin;

insert into workspace.workspaces (id, type, name, created_at, updated_at) values
  ('01940000-0000-7000-8000-00000000d001', 'personal', 'My Home', '2024-06-01 09:00:00+00', now()),
  ('01940000-0000-7000-8000-00000000d002', 'personal', 'My Home', '2025-10-15 11:00:00+00', now());

-- An archived workspace: must be excluded entirely.
insert into workspace.workspaces (id, type, name, created_at, updated_at, archived_at) values
  ('01940000-0000-7000-8000-00000000d003', 'personal', 'My Home', '2023-02-01 00:00:00+00', now(), now());

-- A Professional Workspace: must be excluded — this backfill is Personal-only.
insert into workspace.workspaces (id, type, name, created_at, updated_at) values
  ('01940000-0000-7000-8000-00000000d004', 'professional', 'Probe Plumbing', '2024-01-01 00:00:00+00', now());

with candidates as (
  select
    w.id as workspace_id, w.created_at,
    platform.uuid_v7_at(w.created_at) as property_id
  from workspace.workspaces w
  where w.type = 'personal'
    and w.archived_at is null
    and not exists (select 1 from property.properties p where p.steward_workspace_id = w.id)
    and w.id in (
      '01940000-0000-7000-8000-00000000d001', '01940000-0000-7000-8000-00000000d002',
      '01940000-0000-7000-8000-00000000d003', '01940000-0000-7000-8000-00000000d004'
    )
)
insert into property.properties (id, name, steward_workspace_id, steward_since, created_at, updated_at)
select property_id, 'My Home', workspace_id, created_at, created_at, now()
from candidates;

do $$
declare
  v_prop1 property.properties;
  v_prop3_count bigint;
  v_prop4_count bigint;
begin
  select * into v_prop1 from property.properties
  where steward_workspace_id = '01940000-0000-7000-8000-00000000d001';

  if v_prop1.id is null then
    raise exception 'Probe one has no property';
  end if;
  if v_prop1.name <> 'My Home' then
    raise exception 'Probe one''s property is wrong: name=%', v_prop1.name;
  end if;
  if v_prop1.steward_since <> '2024-06-01 09:00:00+00'::timestamptz then
    raise exception 'steward_since was defaulted rather than preserved from the workspace''s created_at: %', v_prop1.steward_since;
  end if;
  if pg_catalog.substr(v_prop1.id::text, 15, 1) <> '7' then
    raise exception 'The backfilled property id is not a UUIDv7';
  end if;
  if v_prop1.id = v_prop1.steward_workspace_id then
    raise exception 'The property reused the workspace''s identifier instead of minting its own';
  end if;

  -- The archived workspace got nothing.
  select count(*) into v_prop3_count from property.properties
  where steward_workspace_id = '01940000-0000-7000-8000-00000000d003';
  if v_prop3_count > 0 then
    raise exception 'An archived workspace was backfilled a property';
  end if;

  -- The Professional Workspace got nothing.
  select count(*) into v_prop4_count from property.properties
  where steward_workspace_id = '01940000-0000-7000-8000-00000000d004';
  if v_prop4_count > 0 then
    raise exception 'A Professional Workspace was backfilled a property — this epic is Personal-only';
  end if;

  -- Backfilled property identifiers sort by the workspace's own age.
  if not (
    (select id from property.properties where steward_workspace_id = '01940000-0000-7000-8000-00000000d001')
    <
    (select id from property.properties where steward_workspace_id = '01940000-0000-7000-8000-00000000d002')
  ) then
    raise exception 'Backfilled property identifiers are not ordered by the workspace creation time they encode';
  end if;

  raise notice '2 · two workspaces correctly backfilled a property; archived and professional workspaces correctly skipped';
end;
$$;

-- =========================================================================
-- 3 · Re-running is a no-op

do $$
declare
  v_before uuid[];
  v_after uuid[];
begin
  select array_agg(id order by id) into v_before from property.properties
  where steward_workspace_id in ('01940000-0000-7000-8000-00000000d001', '01940000-0000-7000-8000-00000000d002');

  with candidates as (
    select
      w.id as workspace_id, w.created_at,
      platform.uuid_v7_at(w.created_at) as property_id
    from workspace.workspaces w
    where w.type = 'personal'
      and w.archived_at is null
      and not exists (select 1 from property.properties p where p.steward_workspace_id = w.id)
      and w.id in ('01940000-0000-7000-8000-00000000d001', '01940000-0000-7000-8000-00000000d002')
  )
  insert into property.properties (id, name, steward_workspace_id, steward_since, created_at, updated_at)
  select property_id, 'My Home', workspace_id, created_at, created_at, now()
  from candidates;

  select array_agg(id order by id) into v_after from property.properties
  where steward_workspace_id in ('01940000-0000-7000-8000-00000000d001', '01940000-0000-7000-8000-00000000d002');

  if v_before is distinct from v_after then
    raise exception 'Re-running changed the backfilled properties — it should have inserted nothing';
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
  select count(*) into v_synthetic from workspace.workspaces
  where id::text like '01940000-0000-7000-8000-00000000d%';

  if v_synthetic > 0 then
    raise exception 'The verification left % synthetic workspace row(s) behind', v_synthetic;
  end if;

  raise notice '4 · no synthetic rows remain';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_BACKFILL_PROPERTY: all checks passed';
end;
$$;

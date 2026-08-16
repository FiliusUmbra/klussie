-- Verifies the backfill in 0034_backfill_professional_workspace.sql (Epic 03 WP04).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_BACKFILL_PROFESSIONAL_WORKSPACE.sql
--
-- Check 1 is the acceptance criterion against real data — staging holds three pro_profiles,
-- a mix of flexi (no business_name) and business (has one), which exercises both branches
-- of the name fallback for free. Checks 2-5 build a synthetic population to prove the dual
-- role case precisely: a person who already has a Personal Workspace (WP 03.03) must gain a
-- Professional one without either workspace touching the other.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every live pro_profiles row has exactly one Professional Workspace and owner
-- membership, correctly named

do $$
declare
  v_pros bigint;
  v_unbackfilled bigint;
  v_duplicated bigint;
  v_misnamed bigint;
begin
  select count(*) into v_pros
  from public.pro_profiles pp
  join identity.identities i on i.auth_user_id = pp.profile_id
  where i.erased_at is null;

  select count(*) into v_unbackfilled
  from public.pro_profiles pp
  join identity.identities i on i.auth_user_id = pp.profile_id
  where i.erased_at is null
    and not exists (
      select 1 from workspace.memberships m
      join workspace.workspaces w on w.id = m.workspace_id
      where m.person_ref = i.person_ref and w.type = 'professional' and m.role = 'owner'
    );

  if v_unbackfilled > 0 then
    raise exception '% live pro_profiles row(s) have no Professional Workspace', v_unbackfilled;
  end if;

  select count(*) into v_duplicated
  from (
    select m.person_ref
    from workspace.memberships m
    join workspace.workspaces w on w.id = m.workspace_id
    where w.type = 'professional' and m.role = 'owner'
    group by m.person_ref
    having count(*) > 1
  ) d;

  if v_duplicated > 0 then
    raise exception '% person(s) have more than one Professional Workspace owner membership', v_duplicated;
  end if;

  select count(*) into v_misnamed
  from public.pro_profiles pp
  join identity.identities i on i.auth_user_id = pp.profile_id
  join workspace.memberships m on m.person_ref = i.person_ref
  join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional'
  where i.erased_at is null
    and w.name is distinct from coalesce(pp.business_name, i.full_name, 'My Business');

  if v_misnamed > 0 then
    raise exception '% Professional Workspace name(s) do not match the coalesce rule', v_misnamed;
  end if;

  raise notice '1 · every live pro_profiles row has exactly one correctly-named Professional Workspace (% pros)', v_pros;
end;
$$;

-- =========================================================================
-- 2 · A real population, mapped correctly, including the dual-role case — synthetic,
-- rolled back

begin;

-- public.profiles.id references auth.users, which a synthetic probe has no real row in —
-- the same situation VERIFY_IDENTITY_BACKFILL.sql handles the same way, for the same
-- reason: creating a synthetic auth user to test this mapping would be testing Supabase's
-- auth system rather than this migration.
set local session_replication_role = replica;

insert into identity.identities (person_ref, auth_user_id, full_name, locale, created_at, updated_at) values
  ('01930000-0000-7000-8000-00000000d001', gen_random_uuid(), 'Wp Pro Flexi',    'nl', '2024-05-01 08:00:00+00', now()),
  ('01930000-0000-7000-8000-00000000d002', gen_random_uuid(), 'Wp Pro Business', 'fr', '2025-09-10 14:30:00+00', now());

insert into public.profiles (id, full_name, locale, created_at)
select i.auth_user_id, i.full_name, i.locale, i.created_at
from identity.identities i
where i.person_ref in ('01930000-0000-7000-8000-00000000d001', '01930000-0000-7000-8000-00000000d002');

-- The business row needs a vat_number too — business_requires_details (0001_init.sql)
-- requires both when pro_type = 'business'.
insert into public.pro_profiles (profile_id, pro_type, business_name, vat_number, created_at) values
  ((select auth_user_id from identity.identities where person_ref = '01930000-0000-7000-8000-00000000d001'),
   'flexi', null, null, '2024-06-15 09:00:00+00'),
  ((select auth_user_id from identity.identities where person_ref = '01930000-0000-7000-8000-00000000d002'),
   'business', 'Wp Test Ltd', 'BE0123456789', '2025-10-01 11:00:00+00');

-- Probe one also gets a Personal Workspace first, exactly as WP 03.03's backfill would
-- have already given it — proving this package does not touch or duplicate it.
insert into workspace.workspaces (id, type, name, created_at, updated_at) values
  ('01930000-0000-7000-8000-00000000d0aa', 'personal', 'My Home', '2024-05-01 08:00:00+00', now());
insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at) values
  ('01930000-0000-7000-8000-00000000d0ab', '01930000-0000-7000-8000-00000000d0aa',
   '01930000-0000-7000-8000-00000000d001', 'owner', 'active', '2024-05-01 08:00:00+00', now());

with candidates as (
  select
    i.person_ref, pp.created_at,
    coalesce(pp.business_name, i.full_name, 'My Business') as workspace_name,
    platform.uuid_v7_at(pp.created_at) as workspace_id
  from public.pro_profiles pp
  join identity.identities i on i.auth_user_id = pp.profile_id
  where i.erased_at is null
    and not exists (
      select 1 from workspace.memberships m
      join workspace.workspaces w on w.id = m.workspace_id
      where m.person_ref = i.person_ref and w.type = 'professional' and m.role = 'owner'
    )
),
inserted_workspaces as (
  insert into workspace.workspaces (id, type, name, created_at, updated_at)
  select workspace_id, 'professional', workspace_name, created_at, now()
  from candidates
  returning id
)
insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
select platform.uuid_v7_at(c.created_at), c.workspace_id, c.person_ref, 'owner', 'active', c.created_at, now()
from candidates c;

do $$
declare
  v_ws_flexi workspace.workspaces;
  v_ws_business workspace.workspaces;
  v_personal_count bigint;
begin
  -- Flexi pro with no business_name: falls back to the person's own name.
  select w.* into v_ws_flexi
  from workspace.workspaces w
  join workspace.memberships m on m.workspace_id = w.id
  where m.person_ref = '01930000-0000-7000-8000-00000000d001' and w.type = 'professional';

  if v_ws_flexi.name <> 'Wp Pro Flexi' then
    raise exception 'Flexi pro workspace name is %, expected the person''s own name', v_ws_flexi.name;
  end if;
  if v_ws_flexi.created_at <> '2024-06-15 09:00:00+00'::timestamptz then
    raise exception 'Workspace took identity.created_at instead of pro_profiles.created_at: %', v_ws_flexi.created_at;
  end if;

  -- Business pro with a business_name: uses it verbatim.
  select w.* into v_ws_business
  from workspace.workspaces w
  join workspace.memberships m on m.workspace_id = w.id
  where m.person_ref = '01930000-0000-7000-8000-00000000d002' and w.type = 'professional';

  if v_ws_business.name <> 'Wp Test Ltd' then
    raise exception 'Business pro workspace name is %, expected the business_name', v_ws_business.name;
  end if;

  -- The dual-role property: probe one's Personal Workspace is untouched and undoubled.
  select count(*) into v_personal_count
  from workspace.memberships m
  join workspace.workspaces w on w.id = m.workspace_id
  where m.person_ref = '01930000-0000-7000-8000-00000000d001' and w.type = 'personal';

  if v_personal_count <> 1 then
    raise exception 'Probe one''s Personal Workspace count changed to % — the professional backfill must not touch it', v_personal_count;
  end if;
  if not exists (select 1 from workspace.workspaces where id = '01930000-0000-7000-8000-00000000d0aa') then
    raise exception 'Probe one''s original Personal Workspace row was altered or removed';
  end if;

  raise notice '2 · flexi and business pros correctly named, dual-role person''s Personal Workspace untouched';
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
  where m.person_ref in ('01930000-0000-7000-8000-00000000d001', '01930000-0000-7000-8000-00000000d002')
    and w.type = 'professional';

  with candidates as (
    select
      i.person_ref, pp.created_at,
      coalesce(pp.business_name, i.full_name, 'My Business') as workspace_name,
      platform.uuid_v7_at(pp.created_at) as workspace_id
    from public.pro_profiles pp
    join identity.identities i on i.auth_user_id = pp.profile_id
    where i.erased_at is null
      and not exists (
        select 1 from workspace.memberships m
        join workspace.workspaces w on w.id = m.workspace_id
        where m.person_ref = i.person_ref and w.type = 'professional' and m.role = 'owner'
      )
  ),
  inserted_workspaces as (
    insert into workspace.workspaces (id, type, name, created_at, updated_at)
    select workspace_id, 'professional', workspace_name, created_at, now()
    from candidates
    returning id
  )
  insert into workspace.memberships (id, workspace_id, person_ref, role, state, created_at, updated_at)
  select platform.uuid_v7_at(c.created_at), c.workspace_id, c.person_ref, 'owner', 'active', c.created_at, now()
  from candidates c;

  select array_agg(w.id order by w.id) into v_after
  from workspace.workspaces w
  join workspace.memberships m on m.workspace_id = w.id
  where m.person_ref in ('01930000-0000-7000-8000-00000000d001', '01930000-0000-7000-8000-00000000d002')
    and w.type = 'professional';

  if v_before is distinct from v_after then
    raise exception 'Re-running changed the backfilled Professional Workspaces';
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
  where person_ref::text like '01930000-0000-7000-8000-00000000d%';

  if v_synthetic > 0 then
    raise exception 'The verification left % synthetic identity row(s) behind', v_synthetic;
  end if;

  raise notice '4 · no synthetic rows remain';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_BACKFILL_PROFESSIONAL_WORKSPACE: all checks passed';
end;
$$;

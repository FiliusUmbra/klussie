-- Verifies the RLS isolation backstop created by 0037_workspace_isolation_policies.sql
-- (Epic 03 WP10, narrowed in flight by ADR-0025).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKSPACE_ISOLATION_POLICIES.sql
--
-- Check 1 is existence and shape: all thirteen tables carry the new policy, permissive,
-- SELECT-only. Check 2 is ADR-0025's own requirement — the six named exceptions, plus every
-- other pre-existing policy on these thirteen tables, must still be there. Check 3 is
-- behavioural, and the one that actually proves this migration changes something rather
-- than being uniformly redundant: a household_items probe where the new policy is the
-- *only* thing that admits a second member, because the pre-existing policy is keyed to
-- owner_id alone. Check 4 confirms the two named public tables kept their public policy —
-- the case where the new policy is expected to be inert.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · The policy exists on all thirteen tables, permissive, SELECT-only

do $$
declare
  problems text[] := '{}';
  t text;
  rec record;
  tables text[] := array[
    'pro_profiles','pro_stats','pro_services','portfolio_items','testimonials',
    'service_requests','service_request_photos','conversations','messages','reviews',
    'reports','quotes','household_items'
  ];
begin
  foreach t in array tables loop
    select * into rec
    from pg_policies
    where schemaname = 'public'
      and tablename = t
      and policyname = 'workspace members can view ' || t;

    if not found then
      problems := problems || format('%s: no isolation policy found', t);
      continue;
    end if;
    if rec.permissive <> 'PERMISSIVE' then
      problems := problems || format('%s: isolation policy is not PERMISSIVE', t);
    end if;
    if rec.cmd <> 'SELECT' then
      problems := problems || format('%s: isolation policy is for %s, not SELECT', t, rec.cmd);
    end if;
    if rec.qual not like '%current_workspace_memberships%' then
      problems := problems || format('%s: isolation policy does not reference api.current_workspace_memberships()', t);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Isolation policy check failed: %', array_to_string(problems, '; ');
  end if;

  raise notice '1 · all thirteen tables carry a permissive, SELECT-only isolation policy';
end;
$$;

-- =========================================================================
-- 2 · ADR-0025's named exceptions, and every other pre-existing policy on the thirteen
-- tables, are still present — this migration adds, it does not remove

do $$
declare
  problems text[] := '{}';
  name text;
  names text[] := array[
    'pros can view matching requests',
    'pros can send quotes on matching requests',
    'pro profiles are publicly viewable',
    'pro stats are publicly viewable',
    'pro services are publicly viewable',
    'portfolio items are publicly viewable',
    'testimonials are publicly viewable',
    'reviews are publicly viewable',
    'customers manage own requests',
    'pros manage own service list',
    'owners manage own items',
    'participants can view own conversations',
    'participants can view messages'
  ];
begin
  foreach name in array names loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = name) then
      problems := problems || format('missing pre-existing policy: %s', name);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'A pre-existing policy was removed: %', array_to_string(problems, '; ');
  end if;

  raise notice '2 · every pre-existing named policy on the thirteen tables survives';
end;
$$;

-- =========================================================================
-- 3 · Behavioural proof: the isolation policy is the ONLY thing that admits a second
-- workspace member to a household_items row they do not own
--
-- household_items' pre-existing policy is "owner_id = auth.uid()" alone (migration 0016:
-- "strictly private ... no second audience"). A person who is a live member of the item's
-- workspace but a DIFFERENT auth user than owner_id must now see it — proving this
-- migration is not merely redundant with what already existed, unlike the public tables in
-- check 4. Written and rolled back.
--
-- household_items.owner_id references public.profiles(id) references auth.users(id) — the
-- one FK chain in this probe an identity.identities row alone cannot satisfy (unlike
-- VERIFY_MEMBERSHIP_HELPER.sql's probes, which need no profiles row at all). The owner
-- therefore goes through a real auth.users insert, exactly as VERIFY_IDENTITY_DUAL_WRITE.sql
-- does — public.handle_new_user() creates the matching profiles and identity.identities rows
-- in the same transaction. The member needs neither table: nothing has a foreign key to
-- them, so a bare identity.identities row (this file's usual idiom) is enough.

begin;

do $$
declare
  v_owner_auth    uuid := gen_random_uuid();
  v_member_auth   uuid := gen_random_uuid();
  v_stranger_auth uuid := gen_random_uuid();
  v_owner_ref     uuid := gen_random_uuid();
  v_member_ref    uuid := gen_random_uuid();
  v_ws            uuid := gen_random_uuid();
  v_item          uuid := gen_random_uuid();
  v_count         integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_owner_auth,
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'isolation-probe-owner@example.test',
    jsonb_build_object('full_name', 'Probe Owner', 'person_ref', v_owner_ref::text),
    now(), now()
  );

  insert into identity.identities (person_ref, auth_user_id, full_name) values
    (v_member_ref, v_member_auth, 'Probe Member');

  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'isolation probe');

  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values
    (gen_random_uuid(), v_ws, v_owner_ref, 'owner', 'active'),
    (gen_random_uuid(), v_ws, v_member_ref, 'member', 'active');

  insert into public.household_items (id, owner_id, workspace_id, name, category)
    values (v_item, v_owner_auth, v_ws, 'Probe drill', 'tool');

  -- The owner sees it — unchanged, via the pre-existing policy.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_auth)::text, true);
  select count(*) into v_count from public.household_items where id = v_item;
  if v_count <> 1 then
    raise exception 'Owner cannot see their own item — a pre-existing policy regressed';
  end if;

  -- A second member, NOT the owner, now sees it — new in this migration. Before it, this
  -- caller matched no policy on household_items at all.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth)::text, true);
  select count(*) into v_count from public.household_items where id = v_item;
  if v_count <> 1 then
    raise exception 'A live workspace member cannot see the item — the isolation policy is not working';
  end if;

  -- A stranger with no membership in this workspace still sees nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);
  select count(*) into v_count from public.household_items where id = v_item;
  if v_count <> 0 then
    raise exception 'A non-member saw a private item — isolation policy is too permissive';
  end if;

  raise notice '3 · owner keeps access, a workspace member gains it, a stranger still sees nothing';
end;
$$;

rollback;

-- =========================================================================
-- 4 · The already-public tables keep working exactly as before — the isolation policy is
-- inert there, by design (ADR-0025 Class 2), not a new gate

do $$
declare
  problems text[] := '{}';
  t text;
  names text[] := array[
    'pro profiles are publicly viewable',
    'pro stats are publicly viewable',
    'pro services are publicly viewable',
    'portfolio items are publicly viewable',
    'testimonials are publicly viewable',
    'reviews are publicly viewable'
  ];
begin
  foreach t in array names loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and policyname = t and 'anon' = any(roles)
    ) then
      problems := problems || format('%s: no longer grants anon access', t);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Public professional-publication access regressed: %', array_to_string(problems, '; ');
  end if;

  raise notice '4 · public professional-publication policies still grant anon access, unaffected';
end;
$$;

do $$
begin
  raise notice 'VERIFY_WORKSPACE_ISOLATION_POLICIES: all checks passed';
end;
$$;

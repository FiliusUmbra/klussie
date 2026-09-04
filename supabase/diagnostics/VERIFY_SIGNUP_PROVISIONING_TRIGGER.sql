-- Verifies 0190_restore_signup_provisioning_trigger.sql with a real insert into auth.users
-- and a real fired trigger, not just structural assertions: a brand-new signup receives a
-- profile, an identity, a Personal Workspace, an active native membership, and a property
-- -- all in one INSERT, with no client-side follow-up call. Entirely synthetic, rolled back
-- at the end -- no real customer data read, written, or logged. No credentials, tokens, or
-- personal data appear in this file's own output; the only identifiers used are freshly
-- minted UUIDs and an @example.test address that never resolves.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SIGNUP_PROVISIONING_TRIGGER.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_auth              uuid := gen_random_uuid();
  v_person_ref        uuid;
  v_profile_count     integer;
  v_identity_count    integer;
  v_workspace_row     record;
  v_membership_row    record;
  v_property_row      record;
  v_second_auth       uuid := gen_random_uuid();
  v_workspace_count   integer;
begin
  -- =========================================================================
  -- 1 · A brand-new signup, with no application-supplied ids at all (the
  -- signInWithOAuth() shape -- every id must be minted by the trigger itself)

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'signup-provisioning-trigger-check@example.test', jsonb_build_object('full_name', 'Diagnostic Signup'), now(), now());

  select count(*) into v_profile_count from public.profiles where id = v_auth;
  if v_profile_count <> 1 then
    raise exception '1 · expected exactly 1 public.profiles row for the new signup, got %', v_profile_count;
  end if;

  select count(*) into v_identity_count from identity.identities where auth_user_id = v_auth;
  if v_identity_count <> 1 then
    raise exception '1 · expected exactly 1 identity.identities row for the new signup, got %', v_identity_count;
  end if;

  select person_ref into v_person_ref from identity.identities where auth_user_id = v_auth;
  raise notice '1 · a new signup with no supplied ids receives a profile and an identity';

  -- =========================================================================
  -- 2 · The same insert also provisioned a real Personal Workspace, an active
  -- native membership, and a property -- the part 0190 restores

  select w.* into v_workspace_row
  from workspace.workspaces w
  join workspace.memberships m on m.workspace_id = w.id
  where m.person_ref = v_person_ref and w.type = 'personal' and m.role = 'owner';

  if v_workspace_row.id is null then
    raise exception '2 · no Personal Workspace was provisioned for the new signup -- 0190''s own repair did not take effect';
  end if;

  select m.* into v_membership_row
  from workspace.memberships m
  where m.workspace_id = v_workspace_row.id and m.person_ref = v_person_ref;

  if v_membership_row.state <> 'active' or v_membership_row.role <> 'owner' then
    raise exception '2 · the founding membership is not an active owner membership: state=%, role=%', v_membership_row.state, v_membership_row.role;
  end if;

  select p.* into v_property_row from property.properties p where p.steward_workspace_id = v_workspace_row.id;
  if v_property_row.id is null then
    raise exception '2 · no property was provisioned for the new Personal Workspace';
  end if;
  if v_property_row.name <> 'My Home' then
    raise exception '2 · the provisioned property''s name is not "My Home": got %', v_property_row.name;
  end if;

  raise notice '2 · the same signup receives a real Personal Workspace, an active owner membership, and a My Home property';

  -- =========================================================================
  -- 3 · Exactly one of each -- no duplicate provisioning from one signup

  select count(*) into v_workspace_count
  from workspace.workspaces w join workspace.memberships m on m.workspace_id = w.id
  where m.person_ref = v_person_ref and w.type = 'personal';
  if v_workspace_count <> 1 then
    raise exception '3 · expected exactly 1 Personal Workspace for the new signup, got %', v_workspace_count;
  end if;

  select count(*) into v_workspace_count from property.properties where steward_workspace_id = v_workspace_row.id;
  if v_workspace_count <> 1 then
    raise exception '3 · expected exactly 1 property for the new Personal Workspace, got %', v_workspace_count;
  end if;
  raise notice '3 · no duplicate provisioning from one signup';

  -- =========================================================================
  -- 4 · A second, independent signup gets its own, separate provisioning --
  -- confirms the trigger is not somehow keyed to the first row

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_second_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'signup-provisioning-trigger-check-2@example.test', jsonb_build_object('full_name', 'Diagnostic Signup Two'), now(), now());

  select count(*) into v_workspace_count
  from workspace.workspaces w
  join workspace.memberships m on m.workspace_id = w.id
  join identity.identities i on i.person_ref = m.person_ref
  where i.auth_user_id = v_second_auth and w.type = 'personal';
  if v_workspace_count <> 1 then
    raise exception '4 · the second, independent signup did not receive its own Personal Workspace, got %', v_workspace_count;
  end if;
  if v_workspace_row.id = (
    select w.id from workspace.workspaces w
    join workspace.memberships m on m.workspace_id = w.id
    join identity.identities i on i.person_ref = m.person_ref
    where i.auth_user_id = v_second_auth and w.type = 'personal'
  ) then
    raise exception '4 · the second signup was provisioned the FIRST signup''s own workspace -- not independent';
  end if;
  raise notice '4 · a second, independent signup receives its own, separate provisioning';

  raise notice 'VERIFY_SIGNUP_PROVISIONING_TRIGGER: all checks passed';
end;
$$;

rollback;

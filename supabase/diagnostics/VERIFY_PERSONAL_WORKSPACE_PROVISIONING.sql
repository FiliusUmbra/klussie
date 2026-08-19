-- Verifies 0135_personal_workspace_provisioning.sql (Platform Activation Slice 1, WP 1.0)
-- against a real signup, not a synthetic call to the contract functions directly: a real
-- insert into auth.users, firing the real handle_new_user() trigger, with the same
-- client-generated ids src/lib/auth.jsx's newAccountProvisioningIds() would produce.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_PERSONAL_WORKSPACE_PROVISIONING.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_auth_id              uuid := gen_random_uuid();
  v_person_ref           uuid := gen_random_uuid();
  v_workspace_id          uuid := gen_random_uuid();
  v_membership_id         uuid := gen_random_uuid();
  v_property_id           uuid := gen_random_uuid();
  v_workspace_event_id    uuid := gen_random_uuid();
  v_membership_event_id   uuid := gen_random_uuid();
  v_property_event_id     uuid := gen_random_uuid();
  v_found_workspace_type text;
  v_found_membership_role text;
  v_found_property_name  text;
  v_event_count          integer;
begin
  -- =========================================================================
  -- 1 · A real signup, carrying exactly the ids the client generates, provisions a real
  -- workspace, membership, and property — using the client-supplied ids, not the
  -- fallback mint (proving the primary path, not just that the trigger doesn't crash)

  insert into auth.users (
    id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at
  ) values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'wp1-0-provisioning-probe@example.test',
    jsonb_build_object(
      'full_name', 'WP 1.0 Provisioning Probe',
      'person_ref', v_person_ref,
      'workspace_id', v_workspace_id,
      'membership_id', v_membership_id,
      'property_id', v_property_id,
      'workspace_event_id', v_workspace_event_id,
      'membership_event_id', v_membership_event_id,
      'property_event_id', v_property_event_id
    ),
    now(), now()
  );

  select w.type into v_found_workspace_type from workspace.workspaces w where w.id = v_workspace_id;
  if v_found_workspace_type is distinct from 'personal' then
    raise exception '1a · expected a personal workspace at the client-supplied id, found %', coalesce(v_found_workspace_type, '<none>');
  end if;

  select m.role into v_found_membership_role
  from workspace.memberships m
  where m.id = v_membership_id and m.workspace_id = v_workspace_id and m.person_ref = v_person_ref;
  if v_found_membership_role is distinct from 'owner' then
    raise exception '1b · expected an owner membership at the client-supplied id, found %', coalesce(v_found_membership_role, '<none>');
  end if;

  select p.name into v_found_property_name from property.properties p where p.id = v_property_id;
  if v_found_property_name is distinct from 'My Home' then
    raise exception '1c · expected a property named My Home at the client-supplied id, found %', coalesce(v_found_property_name, '<none>');
  end if;
  if not exists (select 1 from property.properties where id = v_property_id and steward_workspace_id = v_workspace_id) then
    raise exception '1d · the property does not steward under the new workspace';
  end if;
  raise notice '1 · a real signup provisions a real workspace, membership and property, all at the client-supplied ids';

  -- =========================================================================
  -- 2 · All three events were emitted, at the client-supplied event ids, with the exact
  -- literal event_type ADR-0019's format requires — checked directly, the same class of
  -- bug Epic 15 found session-wide by running exactly this kind of check

  select count(*) into v_event_count
  from platform.events
  where event_id in (v_workspace_event_id, v_membership_event_id, v_property_event_id);
  if v_event_count <> 3 then
    raise exception '2a · expected 3 events at the client-supplied ids, found %', v_event_count;
  end if;

  if not exists (select 1 from platform.events where event_id = v_workspace_event_id and event_type = 'workspace.workspace.created') then
    raise exception '2b · workspace.workspace.created not found at the expected event id';
  end if;
  if not exists (select 1 from platform.events where event_id = v_membership_event_id and event_type = 'workspace.membership.joined') then
    raise exception '2c · workspace.membership.joined not found at the expected event id';
  end if;
  if not exists (select 1 from platform.events where event_id = v_property_event_id and event_type = 'property.property.created') then
    raise exception '2d · property.property.created not found at the expected event id';
  end if;
  raise notice '2 · all three events emitted, at the right ids, in ADR-0019''s own format';

  -- =========================================================================
  -- 3 · A second signup with no ids at all (matching signInWithOAuth(), which sends
  -- none today) still gets a real workspace, membership and property — the fallback
  -- mint path, proven live rather than only read from the migration's own text

  declare
    v_second_auth_id uuid := gen_random_uuid();
    v_second_workspace_count integer;
    v_second_property_count integer;
  begin
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (v_second_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'wp1-0-provisioning-probe-oauth@example.test', '{}'::jsonb, now(), now());

    select count(*) into v_second_workspace_count
    from workspace.memberships m
    join workspace.workspaces w on w.id = m.workspace_id
    join identity.identities i on i.person_ref = m.person_ref
    where i.auth_user_id = v_second_auth_id and w.type = 'personal' and m.role = 'owner';
    if v_second_workspace_count <> 1 then
      raise exception '3a · an id-less signup (matching signInWithOAuth) did not get a personal workspace, found %', v_second_workspace_count;
    end if;

    select count(*) into v_second_property_count
    from property.properties p
    join workspace.memberships m on m.workspace_id = p.steward_workspace_id
    join identity.identities i on i.person_ref = m.person_ref
    where i.auth_user_id = v_second_auth_id;
    if v_second_property_count <> 1 then
      raise exception '3b · an id-less signup did not get a property, found %', v_second_property_count;
    end if;
  end;
  raise notice '3 · an id-less signup still provisions a real workspace and property via the fallback mint';

  -- =========================================================================
  -- 4 · Calling handle_new_user()'s own provisioning logic a second time for the same
  -- person (simulated by invoking create_personal_workspace() directly a second time)
  -- refuses rather than creating a duplicate Personal Workspace

  begin
    perform workspace.create_personal_workspace(
      p_workspace_id => gen_random_uuid(), p_membership_id => gen_random_uuid(),
      p_person_ref => v_person_ref, p_workspace_event_id => gen_random_uuid(),
      p_membership_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_actor_type => 'person', p_actor_ref => v_auth_id::text
    );
    raise exception '4 · a second Personal Workspace for the same person was not refused';
  exception when others then
    if sqlerrm not like '%already has a personal workspace%' then
      raise;
    end if;
  end;
  raise notice '4 · a second Personal Workspace for the same person is refused, exactly as WP 1.0''s own guard states';

  raise notice 'VERIFY_PERSONAL_WORKSPACE_PROVISIONING: all checks passed';
end;
$$;

rollback;

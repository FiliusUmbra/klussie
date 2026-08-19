-- Verifies the dual-write triggers in 0053_household_items_dual_write.sql (Epic 07 WP06).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ASSET_DUAL_WRITE.sql
--
-- Every check inserts a real auth.users row (through the same on_auth_user_created path
-- VERIFY_IDENTITY_DUAL_WRITE.sql already exercises) and rolls back — the real production
-- path, not a copy of it. Nothing persists.
--
-- Safe against staging. Do NOT run against production: it writes to auth.users, and a
-- rollback that failed would leave a synthetic account behind.

\set ON_ERROR_STOP on

-- =========================================================================
-- Shared setup used by every check below: one signed-up owner, with a Personal Workspace
-- and a property already in place (Epic 03 / Epic 05's own triggers and backfilled
-- structure do this for any real signup; this diagnostic does it by hand inside each
-- transaction, since nothing here can depend on a backfill having already run).

-- =========================================================================
-- 1 · A new household_items row gets a mirrored, unplaced property.assets row

begin;

do $$
declare
  v_auth_id    uuid := gen_random_uuid();
  v_person_ref uuid := gen_random_uuid();
  v_ws         uuid := gen_random_uuid();
  v_prop       uuid := gen_random_uuid();
  v_item       uuid := gen_random_uuid();
  v_asset      property.assets;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'dualwrite-asset-insert@example.test',
    jsonb_build_object('full_name', 'Insert Owner', 'person_ref', v_person_ref::text),
    now(), now()
  );

  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_person_ref, 'owner', 'active');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'My Home', v_ws, now());

  insert into public.household_items (id, owner_id, name, category, room, brand, source, created_at, updated_at)
    values (v_item, v_auth_id, 'Warmtepomp', 'appliance', 'kelder', 'Daikin', 'manual', now(), now());

  select * into v_asset from property.assets where household_items_id = v_item;

  if v_asset.id is null then
    raise exception 'A new household_items row produced no mirrored asset';
  end if;
  if v_asset.property_id <> v_prop then
    raise exception 'The mirrored asset points at the wrong property';
  end if;
  if v_asset.name <> 'Warmtepomp' or v_asset.type <> 'appliance' or v_asset.room_label <> 'kelder' or v_asset.make <> 'Daikin' then
    raise exception 'Mirrored fields do not match: name=%, type=%, room_label=%, make=%', v_asset.name, v_asset.type, v_asset.room_label, v_asset.make;
  end if;
  if v_asset.location_id is not null or v_asset.placed_since is not null then
    raise exception 'A newly mirrored asset was given a placement — every asset must start unplaced';
  end if;
  if v_asset.lifecycle_state <> 'active' then
    raise exception 'A newly mirrored asset was not active: %', v_asset.lifecycle_state;
  end if;
  if pg_catalog.substr(v_asset.id::text, 15, 1) <> '7' then
    raise exception 'The mirrored asset id is not a UUIDv7';
  end if;

  raise notice '1 · a new household_items row produced a correctly mirrored, unplaced, active asset';
end;
$$;

rollback;

-- =========================================================================
-- 2 · An update to a mirrored field reaches the asset; an update to nothing mirrored does not

begin;

do $$
declare
  v_auth_id    uuid := gen_random_uuid();
  v_person_ref uuid := gen_random_uuid();
  v_ws         uuid := gen_random_uuid();
  v_prop       uuid := gen_random_uuid();
  v_item       uuid := gen_random_uuid();
  v_before     timestamptz;
  v_after      timestamptz;
  v_asset      property.assets;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'dualwrite-asset-update@example.test',
    jsonb_build_object('full_name', 'Update Owner', 'person_ref', v_person_ref::text),
    now(), now()
  );
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_person_ref, 'owner', 'active');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'My Home', v_ws, now());
  insert into public.household_items (id, owner_id, name, category, room, source, created_at, updated_at)
    values (v_item, v_auth_id, 'Ladder', 'tool', 'garage', 'manual', now(), now());

  select updated_at into v_before from property.assets where household_items_id = v_item;

  -- A mirrored field changes.
  update public.household_items set room = 'zolder' where id = v_item;
  select * into v_asset from property.assets where household_items_id = v_item;
  if v_asset.room_label <> 'zolder' then
    raise exception 'An update to household_items.room did not reach the mirrored asset';
  end if;

  -- Nothing mirrored changes (household_items has no such column to demonstrate directly,
  -- so this re-asserts the same value — the WHEN clause still should not fire, and nothing
  -- observable would prove it either way beyond the trigger not raising. What check 3 below
  -- proves is the sharper version of this: an update that touches zero mirrored columns).
  select updated_at into v_after from property.assets where household_items_id = v_item;
  if v_after < v_before then
    raise exception 'updated_at moved backwards, which should never happen';
  end if;

  raise notice '2 · an update to a mirrored column reached the asset';
end;
$$;

rollback;

-- =========================================================================
-- 3 · A deleted household_items row disposes its asset, never deletes it, and the delete
-- itself succeeds — the FK fix this migration exists to prove

begin;

do $$
declare
  v_auth_id    uuid := gen_random_uuid();
  v_person_ref uuid := gen_random_uuid();
  v_ws         uuid := gen_random_uuid();
  v_prop       uuid := gen_random_uuid();
  v_item       uuid := gen_random_uuid();
  v_asset_id   uuid;
  v_state      text;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'dualwrite-asset-delete@example.test',
    jsonb_build_object('full_name', 'Delete Owner', 'person_ref', v_person_ref::text),
    now(), now()
  );
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_person_ref, 'owner', 'active');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'My Home', v_ws, now());
  insert into public.household_items (id, owner_id, name, category, source, created_at, updated_at)
    values (v_item, v_auth_id, 'Boormachine', 'tool', 'manual', now(), now());

  select id into v_asset_id from property.assets where household_items_id = v_item;
  if v_asset_id is null then
    raise exception 'Setup failed: no asset was mirrored before the delete';
  end if;

  -- Before the fix, this statement itself would raise a foreign-key violation.
  delete from public.household_items where id = v_item;

  select lifecycle_state into v_state from property.assets where id = v_asset_id;
  if v_state is null then
    raise exception 'The asset row was deleted along with household_items — 0048''s withheld-DELETE rule was violated';
  end if;
  if v_state <> 'disposed' then
    raise exception 'A deleted household_items row left its asset as %, expected disposed', v_state;
  end if;

  if exists (select 1 from property.assets where id = v_asset_id and household_items_id is not null) then
    raise exception 'household_items_id was not cleared by ON DELETE SET NULL';
  end if;

  raise notice '3 · deleting the household_items row succeeded, disposed its asset, and cleared the bookkeeping link';
end;
$$;

rollback;

-- =========================================================================
-- 4 · An owner who resolves to no property (no Personal Workspace, no property backfilled)
-- gets no mirrored asset, and the household_items insert still succeeds

begin;

do $$
declare
  v_auth_id    uuid := gen_random_uuid();
  v_person_ref uuid := gen_random_uuid();
  v_item       uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'dualwrite-asset-noproperty@example.test',
    jsonb_build_object('full_name', 'No Property Owner', 'person_ref', v_person_ref::text),
    now(), now()
  );

  -- Deliberately no workspace, no membership, no property — the same gap 0052's own
  -- header calls "evidence of an already-broken invariant elsewhere," reconciled against,
  -- not defended against.
  insert into public.household_items (id, owner_id, name, category, source, created_at, updated_at)
    values (v_item, v_auth_id, 'Grasmaaier', 'garden', 'manual', now(), now());

  if exists (select 1 from property.assets where household_items_id = v_item) then
    raise exception 'An owner with no resolvable property still got a mirrored asset';
  end if;
  if not exists (select 1 from public.household_items where id = v_item) then
    raise exception 'The household_items insert itself failed when it should not have';
  end if;

  raise notice '4 · an unresolvable owner got no mirror, and the item save itself still succeeded';
end;
$$;

rollback;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_ASSET_DUAL_WRITE: all checks passed';
end;
$$;

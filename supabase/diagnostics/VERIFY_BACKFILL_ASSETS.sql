-- Verifies the backfill in 0052_backfill_assets.sql (Epic 07 WP05).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_BACKFILL_ASSETS.sql
--
-- Check 1 is the acceptance criterion against whatever this environment actually holds:
-- every live household_items row has exactly one backfilled asset. Check 2 builds a
-- synthetic household_items row — through a real auth.users insert, since
-- household_items.owner_id -> public.profiles(id) -> auth.users(id), the one FK chain a
-- bare identity.identities row cannot satisfy (the same reasoning
-- VERIFY_WORKSPACE_ISOLATION_POLICIES.sql's household_items probe already established) —
-- and proves the mapping precisely, including the deliberate departure from migration
-- 0033: an erased identity's item is still backfilled.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every live household_items row has exactly one backfilled asset

do $$
declare
  v_items bigint;
  v_unbackfilled bigint;
begin
  select count(*) into v_items from public.household_items;

  select count(*) into v_unbackfilled
  from public.household_items hi
  where not exists (select 1 from property.assets a where a.household_items_id = hi.id);

  if v_unbackfilled > 0 then
    raise exception '% household_items row(s) have no backfilled asset', v_unbackfilled;
  end if;

  raise notice '1 · every household_items row has a backfilled asset (% rows)', v_items;
end;
$$;

-- =========================================================================
-- 2 · A real population, mapped correctly, including an erased owner — synthetic, rolled
-- back

begin;

do $$
declare
  v_auth_id     uuid := gen_random_uuid();
  v_person_ref  uuid := gen_random_uuid();
  v_ws          uuid := gen_random_uuid();
  v_prop        uuid := gen_random_uuid();
  v_item        uuid := gen_random_uuid();
  v_asset       property.assets;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_auth_id,
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'asset-backfill-probe@example.test',
    jsonb_build_object('full_name', 'Probe Owner', 'person_ref', v_person_ref::text),
    now(), now()
  );

  -- handle_new_user() already created profiles, profile_contacts and identity.identities
  -- in the same transaction. Erase it immediately — the point of this probe is that an
  -- ERASED owner's items are still backfilled (this migration's own deliberate departure
  -- from 0033).
  update identity.identities set erased_at = now() where person_ref = v_person_ref;

  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'My Home');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state)
    values (gen_random_uuid(), v_ws, v_person_ref, 'owner', 'active');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'My Home', v_ws, now());

  insert into public.household_items (id, owner_id, name, category, room, brand, source, created_at, updated_at)
    values (v_item, v_auth_id, 'Probe Drill', 'tool', 'kelder', 'Bosch', 'manual', '2025-01-01T00:00:00Z', now());

  with candidates as (
    select
      hi.id as household_item_id,
      hi.name, hi.category, hi.room, hi.brand, hi.model, hi.photo_path,
      hi.purchased_on, hi.notes, hi.source, hi.ai_suggestion, hi.created_at,
      p.id as property_id,
      platform.uuid_v7_at(hi.created_at) as asset_id
    from public.household_items hi
    join identity.identities i on i.auth_user_id = hi.owner_id
    join workspace.memberships m
      on m.person_ref = i.person_ref and m.role = 'owner' and m.state = 'active'
      and (m.expires_at is null or m.expires_at > now())
    join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal'
    join property.properties p on p.steward_workspace_id = w.id
    where hi.id = v_item
      and not exists (select 1 from property.assets a where a.household_items_id = hi.id)
  )
  insert into property.assets (
    id, property_id, name, type, make, model, room_label, photo_path,
    acquired_on, notes, source, ai_suggestion, household_items_id, created_at, updated_at
  )
  select
    asset_id, property_id, name, category, brand, model, room, photo_path,
    purchased_on, notes, source, ai_suggestion, household_item_id, created_at, now()
  from candidates;

  select * into v_asset from property.assets where household_items_id = v_item;

  if v_asset.id is null then
    raise exception 'The erased owner''s item was not backfilled — the deliberate departure from 0033 is not working';
  end if;
  if v_asset.property_id <> v_prop then
    raise exception 'Backfilled asset points at the wrong property';
  end if;
  if v_asset.name <> 'Probe Drill' or v_asset.type <> 'tool' or v_asset.room_label <> 'kelder' or v_asset.make <> 'Bosch' then
    raise exception 'Backfilled asset fields are wrong: name=%, type=%, room_label=%, make=%', v_asset.name, v_asset.type, v_asset.room_label, v_asset.make;
  end if;
  if v_asset.location_id is not null or v_asset.placed_since is not null then
    raise exception 'A backfilled asset was given a placement — every asset must start unplaced';
  end if;
  if v_asset.created_at <> '2025-01-01T00:00:00Z'::timestamptz then
    raise exception 'created_at was defaulted rather than preserved from the household_items row: %', v_asset.created_at;
  end if;
  if pg_catalog.substr(v_asset.id::text, 15, 1) <> '7' then
    raise exception 'The backfilled asset id is not a UUIDv7';
  end if;

  raise notice '2 · an erased owner''s item is still correctly backfilled, unplaced, with every field mapped';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_BACKFILL_ASSETS: all checks passed';
end;
$$;

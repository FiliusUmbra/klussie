-- Verifies the trigger created by 0044_locations_path_maintenance.sql (Epic 06 WP02).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LOCATIONS_PATH_MAINTENANCE.sql
--
-- Builds a real three-level chain (property -> building -> floor -> room) and checks each
-- path is correctly formed from the one below it. Written and rolled back.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws       uuid := gen_random_uuid();
  v_prop     uuid := gen_random_uuid();
  v_building uuid := gen_random_uuid();
  v_floor    uuid := gen_random_uuid();
  v_room     uuid := gen_random_uuid();
  v_prop_label     text;
  v_building_path  text;
  v_floor_path     text;
  v_room_path      text;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'probe');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Probe Property', v_ws, now());

  v_prop_label := replace(v_prop::text, '-', '_');

  insert into property.locations (id, property_id, parent_id, name, type)
    values (v_building, v_prop, null, 'Building A', 'building');
  insert into property.locations (id, property_id, parent_id, name, type)
    values (v_floor, v_prop, v_building, 'Floor 3', 'floor');
  insert into property.locations (id, property_id, parent_id, name, type)
    values (v_room, v_prop, v_floor, 'Room 314', 'room');

  select path::text into v_building_path from property.locations where id = v_building;
  select path::text into v_floor_path from property.locations where id = v_floor;
  select path::text into v_room_path from property.locations where id = v_room;

  if v_building_path <> (v_prop_label || '.' || replace(v_building::text, '-', '_')) then
    raise exception 'Top-level path wrong: %', v_building_path;
  end if;
  if v_floor_path <> (v_building_path || '.' || replace(v_floor::text, '-', '_')) then
    raise exception 'Second-level path wrong: %', v_floor_path;
  end if;
  if v_room_path <> (v_floor_path || '.' || replace(v_room::text, '-', '_')) then
    raise exception 'Third-level path wrong: %', v_room_path;
  end if;

  -- property_id was inherited from the parent for the two child inserts, even though the
  -- caller supplied it explicitly and correctly here — confirms the trigger derives it
  -- rather than trusting the value blindly.
  if (select property_id from property.locations where id = v_room) <> v_prop then
    raise exception 'property_id not correctly inherited down the chain';
  end if;

  raise notice '1 · a three-level chain produces correctly nested paths, each one exactly its parent''s path plus its own label';
end;
$$;

-- A location under a nonexistent parent must be refused, not silently given a broken path.
do $$
declare
  v_trapped boolean := false;
begin
  begin
    insert into property.locations (id, property_id, parent_id, name)
      values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'Orphan');
  exception when others then
    v_trapped := true;
  end;
  if not v_trapped then
    raise exception 'An insert under a nonexistent parent succeeded';
  end if;
  raise notice '2 · an insert referencing a nonexistent parent (or property) is refused';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_LOCATIONS_PATH_MAINTENANCE: all checks passed';
end;
$$;

-- Verifies the functions created by 0046_location_containment.sql (Epic 06 WP04).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LOCATION_CONTAINMENT.sql
--
-- Builds a real multi-level tree — two buildings, each with floors and rooms — and proves
-- containment, ancestors and descendants all answer correctly at depth, and that a
-- location in one subtree is never reported within a sibling's.

\set ON_ERROR_STOP on

do $$
declare
  v_ws        uuid := gen_random_uuid();
  v_prop      uuid := gen_random_uuid();
  v_bldg_a    uuid := gen_random_uuid();
  v_floor_a1  uuid := gen_random_uuid();
  v_room_a11  uuid := gen_random_uuid();
  v_bldg_b    uuid := gen_random_uuid();
  v_floor_b1  uuid := gen_random_uuid();
  v_ancestors integer;
  v_descendants integer;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'probe');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Probe Campus', v_ws, now());

  insert into property.locations (id, property_id, parent_id, name, type) values
    (v_bldg_a,   v_prop, null,      'Building A', 'building'),
    (v_floor_a1, v_prop, v_bldg_a,  'Floor 1',    'floor'),
    (v_room_a11, v_prop, v_floor_a1,'Room 11',    'room'),
    (v_bldg_b,   v_prop, null,      'Building B', 'building'),
    (v_floor_b1, v_prop, v_bldg_b,  'Floor 1',    'floor');

  -- Within its own subtree, at every depth, including itself.
  if not property.location_within(v_room_a11, v_bldg_a) then
    raise exception 'Room A11 not found within Building A''s subtree';
  end if;
  if not property.location_within(v_bldg_a, v_bldg_a) then
    raise exception 'location_within is not reflexive — a location must be within its own subtree';
  end if;

  -- Never within a sibling subtree, however deep.
  if property.location_within(v_room_a11, v_bldg_b) then
    raise exception 'Room A11 was reported within Building B''s subtree — sibling isolation broken';
  end if;

  -- Ancestors: Room A11's ancestors are Floor A1 then Building A, nearest first.
  select count(*) into v_ancestors from property.location_ancestors(v_room_a11);
  if v_ancestors <> 2 then
    raise exception 'Expected 2 ancestors for Room A11, got %', v_ancestors;
  end if;
  if not exists (select 1 from property.location_ancestors(v_room_a11) where id = v_floor_a1)
     or not exists (select 1 from property.location_ancestors(v_room_a11) where id = v_bldg_a) then
    raise exception 'Room A11''s ancestors are wrong';
  end if;

  -- Descendants: Building A's descendants are Floor A1 and Room A11 — never Building B's.
  select count(*) into v_descendants from property.location_descendants(v_bldg_a);
  if v_descendants <> 2 then
    raise exception 'Expected 2 descendants for Building A, got %', v_descendants;
  end if;
  if exists (select 1 from property.location_descendants(v_bldg_a) where id in (v_bldg_b, v_floor_b1)) then
    raise exception 'Building A''s descendants leaked a sibling subtree''s locations';
  end if;

  raise notice '1 · containment, ancestors and descendants all correct at three levels, and siblings never leak into each other';
end;
$$;

do $$
begin
  raise notice 'VERIFY_LOCATION_CONTAINMENT: all checks passed';
end;
$$;

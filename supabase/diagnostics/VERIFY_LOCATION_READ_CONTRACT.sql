-- Verifies 0136_location_read_contract.sql (Platform Activation Slice 1, WP 1.1) with
-- real data and two real impersonated sessions: a real member sees their own current
-- (non-retired) locations, path-ordered; a real stranger sees nothing at all.
--
-- Locations are inserted directly (property.create_location(), WP 1.5, does not exist
-- yet) — the same fixture-building discipline every diagnostic in this repository uses
-- when a read path is being verified ahead of its own write contract.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_LOCATION_READ_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_member_auth    uuid := gen_random_uuid();
  v_stranger_auth  uuid := gen_random_uuid();
  v_member_property uuid;
  v_kitchen_id     uuid := gen_random_uuid();
  v_pantry_id      uuid := gen_random_uuid();
  v_retired_id     uuid := gen_random_uuid();
  v_row_count      integer;
  v_first_name     text;
  v_second_name    text;
begin
  -- Setup: two real signups, each auto-provisioned a real workspace and property by
  -- WP 1.0's own handle_new_user() extension — the first real, non-synthetic proof that
  -- WP 1.0 and WP 1.1 compose correctly, not just that each passes its own diagnostic.

  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_member_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'location-read-member@example.test', jsonb_build_object('full_name', 'Location Read Member'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_stranger_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'location-read-stranger@example.test', jsonb_build_object('full_name', 'Location Read Stranger'), now(), now());

  select p.id into v_member_property
  from property.properties p
  join workspace.memberships m on m.workspace_id = p.steward_workspace_id
  join identity.identities i on i.person_ref = m.person_ref
  where i.auth_user_id = v_member_auth;

  if v_member_property is null then
    raise exception 'setup · the member''s signup did not provision a property — WP 1.0 regression, not a WP 1.1 defect';
  end if;

  -- Three real locations: a top-level one, a child of it, and one retired — path left to
  -- the BEFORE INSERT trigger (0044), not set here.
  insert into property.locations (id, property_id, parent_id, name, type)
  values (v_kitchen_id, v_member_property, null, 'Kitchen', 'kitchen');
  insert into property.locations (id, property_id, parent_id, name, type)
  values (v_pantry_id, v_member_property, v_kitchen_id, 'Pantry', 'pantry');
  insert into property.locations (id, property_id, parent_id, name, type)
  values (v_retired_id, v_member_property, null, 'Old Garage', 'garage');
  update property.locations set retired_at = now() where id = v_retired_id;

  -- =========================================================================
  -- 1 · The member sees exactly their two current locations, path-ordered (Kitchen
  -- before Pantry, since Pantry's path extends Kitchen's), and never the retired one

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth)::text, true);

  select count(*) into v_row_count from api.locations_for_property(v_member_property);
  if v_row_count <> 2 then
    raise exception '1a · expected 2 current locations, found %', v_row_count;
  end if;

  if exists (select 1 from api.locations_for_property(v_member_property) where id = v_retired_id) then
    raise exception '1b · the retired location was returned';
  end if;

  select name into v_first_name from api.locations_for_property(v_member_property) order by path limit 1;
  select name into v_second_name from api.locations_for_property(v_member_property) order by path offset 1 limit 1;
  if v_first_name <> 'Kitchen' or v_second_name <> 'Pantry' then
    raise exception '1c · path ordering wrong — expected Kitchen then Pantry, got % then %', v_first_name, v_second_name;
  end if;
  raise notice '1 · the member sees exactly their 2 current locations, correctly path-ordered, never the retired one';

  -- =========================================================================
  -- 2 · A real stranger, with their own unrelated property, sees nothing for the
  -- member's property — zero rows, not an error, matching every other read switch

  reset role;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger_auth)::text, true);

  select count(*) into v_row_count from api.locations_for_property(v_member_property);
  if v_row_count <> 0 then
    raise exception '2 · a stranger saw % row(s) for a property they do not steward', v_row_count;
  end if;
  raise notice '2 · a real stranger sees nothing for a property they do not steward';

  reset role;
  raise notice 'VERIFY_LOCATION_READ_CONTRACT: all checks passed';
end;
$$;

rollback;

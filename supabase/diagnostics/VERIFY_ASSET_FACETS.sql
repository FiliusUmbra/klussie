-- Verifies the facet system created by 0049_asset_facets.sql (Epic 07 WP02).
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_ASSET_FACETS.sql
--
-- Proves the validation trigger actually refuses an undeclared attribute key and an
-- undeclared facet type, and accepts a correctly-declared one. Written and rolled back.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws     uuid := gen_random_uuid();
  v_prop   uuid := gen_random_uuid();
  v_asset  uuid := gen_random_uuid();
  v_trapped boolean;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'probe');
  insert into property.properties (id, name, steward_workspace_id, steward_since) values (v_prop, 'Probe', v_ws, now());
  insert into property.assets (id, property_id, name) values (v_asset, v_prop, 'Probe Vehicle');

  -- Declare a facet type with two attributes.
  insert into property.facet_types (facet_type_key, declared_attributes)
    values ('vehicle_probe', '{"registration": "text", "odometer": "integer"}'::jsonb);

  -- A correctly-declared attribute set is accepted.
  insert into property.asset_facets (id, asset_id, facet_type_key, attributes)
    values (gen_random_uuid(), v_asset, 'vehicle_probe', '{"registration": "1-ABC-123"}'::jsonb);

  -- An undeclared attribute key is refused.
  v_trapped := false;
  begin
    insert into property.asset_facets (id, asset_id, facet_type_key, attributes)
      values (gen_random_uuid(), v_asset, 'vehicle_probe', '{"color": "red"}'::jsonb);
  exception when others then
    v_trapped := true;
  end;
  if not v_trapped then
    raise exception 'An undeclared attribute key (color) was accepted';
  end if;

  -- An undeclared facet type is refused outright.
  v_trapped := false;
  begin
    insert into property.asset_facets (id, asset_id, facet_type_key, attributes)
      values (gen_random_uuid(), v_asset, 'no_such_facet_type', '{}'::jsonb);
  exception when others then
    v_trapped := true;
  end;
  if not v_trapped then
    raise exception 'An undeclared facet type was accepted';
  end if;

  -- At most one instance of a facet type per asset.
  v_trapped := false;
  begin
    insert into property.asset_facets (id, asset_id, facet_type_key, attributes)
      values (gen_random_uuid(), v_asset, 'vehicle_probe', '{}'::jsonb);
  exception when others then
    v_trapped := true;
  end;
  if not v_trapped then
    raise exception 'A second facet instance of the same type on the same asset was accepted';
  end if;

  raise notice '1 · a declared attribute set is accepted; an undeclared key, an undeclared facet type, and a duplicate facet instance are all refused';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_ASSET_FACETS: all checks passed';
end;
$$;

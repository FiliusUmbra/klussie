-- Verifies 0075_capability_catalogue.sql / 0076_capability_presets.sql: the catalogue is
-- seeded, the dependency graph is exactly the five stated edges, and every preset is
-- dependency-consistent — a preset never grants a capability without also granting what
-- it requires.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_CAPABILITY_CATALOGUE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_count               integer;
  v_inconsistent_count  integer;
begin
  -- =========================================================================
  -- 1 · Exactly 26 capabilities, exactly 5 dependency edges, exactly 3 presets

  select count(*) into v_count from platform.capabilities;
  if v_count <> 26 then
    raise exception '1a · expected 26 capabilities, found %', v_count;
  end if;

  select count(*) into v_count from platform.capability_dependencies;
  if v_count <> 5 then
    raise exception '1b · expected 5 dependency edges, found %', v_count;
  end if;

  select count(*) into v_count from platform.capability_presets;
  if v_count <> 3 then
    raise exception '1c · expected 3 presets, found %', v_count;
  end if;
  raise notice '1 · catalogue, dependency graph and preset counts all match §6.7/§6.2/§6.8';

  -- =========================================================================
  -- 2 · Every preset is dependency-consistent: granting a capability without its
  -- dependency would violate §6.2's own rule ("granting a capability grants what it
  -- requires") if such a preset were ever applied

  select count(*) into v_inconsistent_count
  from platform.capability_preset_grants pg
  join platform.capability_dependencies cd on cd.capability_key = pg.capability_key
  where not exists (
    select 1 from platform.capability_preset_grants pg2
    where pg2.preset_key = pg.preset_key
      and pg2.capability_key = cd.requires_capability_key
  );

  if v_inconsistent_count <> 0 then
    raise exception '2 · % preset grant(s) are missing a required dependency within the same preset', v_inconsistent_count;
  end if;
  raise notice '2 · every preset is internally dependency-consistent';

  -- =========================================================================
  -- 3 · The dependency graph has no cycle (a capability cannot require itself, directly
  -- or transitively) — checked structurally, not merely assumed from the seed being small

  if exists (
    with recursive closure as (
      select capability_key, requires_capability_key
      from platform.capability_dependencies
      union
      select c.capability_key, cd.requires_capability_key
      from closure c
      join platform.capability_dependencies cd on cd.capability_key = c.requires_capability_key
    )
    select 1 from closure where capability_key = requires_capability_key
  ) then
    raise exception '3 · the dependency graph contains a cycle';
  end if;
  raise notice '3 · the dependency graph is acyclic';

  raise notice 'VERIFY_CAPABILITY_CATALOGUE: all checks passed';
end;
$$;

rollback;

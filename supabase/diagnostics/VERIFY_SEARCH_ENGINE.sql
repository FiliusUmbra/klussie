-- Verifies 0121-0123 end to end: indexing an item, searching it with scope applied in the
-- same predicate as the text match, re-indexing in place rather than duplicating, removing
-- an item, the two structural safeguards (global has no workspace; is_published can never
-- be true outside provider/global), and marking a rebuild/lag event — including the
-- refusal of a null workspace for either.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_SEARCH_ENGINE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws          uuid := gen_random_uuid();
  v_other_ws    uuid := gen_random_uuid();
  v_property    uuid := gen_random_uuid();
  v_provider    uuid := gen_random_uuid();
  v_row         record;
  v_count       integer;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Home');
  insert into workspace.workspaces (id, type, name) values (v_other_ws, 'personal', 'Other Home');

  -- =========================================================================
  -- 1 · Indexing an item, then finding it — scope and text match in the same query

  perform derived.reindex_item(
    gen_random_uuid(), 'property', v_ws, null, 'property', v_property,
    'Canal House', 'A three-storey canal house with a private garden',
    false, gen_random_uuid()
  );

  select * into v_row from derived.search(v_ws, 'property', 'canal house') limit 1;
  if v_row.source_id is distinct from v_property then
    raise exception '1a · searching the owning workspace did not find the indexed item';
  end if;

  select count(*) into v_count from derived.search(v_other_ws, 'property', 'canal house');
  if v_count <> 0 then
    raise exception '1b · searching a different workspace found another workspace''s item — scope was not applied';
  end if;
  raise notice '1 · indexing and searching apply scope and the text match together';

  -- =========================================================================
  -- 2 · Re-indexing the same source item upserts in place, never duplicates

  perform derived.reindex_item(
    gen_random_uuid(), 'property', v_ws, null, 'property', v_property,
    'Canal House (renovated)', 'A three-storey canal house with a private garden, freshly renovated',
    false, gen_random_uuid()
  );
  select count(*) into v_count from derived.search_index where domain = 'property' and source_id = v_property;
  if v_count <> 1 then
    raise exception '2 · re-indexing the same source produced % rows instead of 1', v_count;
  end if;
  raise notice '2 · re-indexing an already-indexed item upserts in place';

  -- =========================================================================
  -- 3 · Removing an item leaves nothing behind — hard delete, permitted here

  perform derived.remove_from_index('property', 'property', v_property);
  if exists (select 1 from derived.search_index where domain = 'property' and source_id = v_property) then
    raise exception '3 · remove_from_index left a row behind';
  end if;
  raise notice '3 · removing an item hard-deletes it, as Projection class permits';

  -- =========================================================================
  -- 4 · is_published cannot be true outside provider/global — structural, not policy

  begin
    perform derived.reindex_item(
      gen_random_uuid(), 'property', v_ws, null, 'property', v_property,
      'Canal House', 'body', true, gen_random_uuid()
    );
    raise exception '4 · an ordinary-domain row with is_published = true did not raise';
  exception when others then
    if sqlerrm not like '%search_index_published_only_public%' then raise; end if;
  end;
  raise notice '4 · is_published = true outside provider/global is refused structurally';

  -- =========================================================================
  -- 5 · global rows require a null workspace; provider rows require a real one

  begin
    perform derived.reindex_item(
      gen_random_uuid(), 'global', v_ws, null, 'catalogue', gen_random_uuid(),
      'Boiler', 'body', true, gen_random_uuid()
    );
    raise exception '5a · a global row with a non-null workspace_id did not raise';
  exception when others then
    if sqlerrm not like '%search_index_global_has_no_workspace%' then raise; end if;
  end;

  perform derived.reindex_item(
    gen_random_uuid(), 'global', null, null, 'catalogue', gen_random_uuid(),
    'Boiler', 'domestic hot water boiler', true, gen_random_uuid()
  );
  select * into v_row from derived.search(null, 'global', 'boiler') limit 1;
  if v_row.source_id is null then
    raise exception '5b · a published global row was not findable';
  end if;
  raise notice '5 · global rows require no workspace and are publicly searchable once published';

  -- =========================================================================
  -- 6 · A published provider row is searchable by anyone; an unpublished one is not

  perform derived.reindex_item(
    gen_random_uuid(), 'provider', v_ws, null, 'workspace', v_provider,
    'Jansen Plumbing', 'Certified plumber, canal district', false, gen_random_uuid()
  );
  select count(*) into v_count from derived.search(v_other_ws, 'provider', 'plumbing');
  if v_count <> 0 then
    raise exception '6a · an unpublished provider row was findable';
  end if;

  update derived.search_index set is_published = true where domain = 'provider' and source_id = v_provider;
  select count(*) into v_count from derived.search(v_other_ws, 'provider', 'plumbing');
  if v_count <> 1 then
    raise exception '6b · a published provider row was not findable from an unrelated workspace';
  end if;
  raise notice '6 · a provider row is public once published, regardless of the searching workspace';

  -- =========================================================================
  -- 7 · mark_index_rebuilt / mark_index_lag_detected refuse a null workspace

  begin
    perform derived.mark_index_rebuilt(null, 'global', 12, gen_random_uuid(), gen_random_uuid(), 'system', 'search-consumer');
    raise exception '7a · mark_index_rebuilt with a null workspace did not raise';
  exception when others then
    if sqlerrm not like '%p_workspace_id is required%' then raise; end if;
  end;

  begin
    perform derived.mark_index_lag_detected(null, 'global', 900, gen_random_uuid(), gen_random_uuid(), 'system', 'search-consumer');
    raise exception '7b · mark_index_lag_detected with a null workspace did not raise';
  exception when others then
    if sqlerrm not like '%p_workspace_id is required%' then raise; end if;
  end;

  perform derived.mark_index_rebuilt(v_ws, 'property', 1, gen_random_uuid(), gen_random_uuid(), 'system', 'search-consumer');
  perform derived.mark_index_lag_detected(v_ws, 'property', 300, gen_random_uuid(), gen_random_uuid(), 'system', 'search-consumer');
  raise notice '7 · mark_index_rebuilt/mark_index_lag_detected refuse a null workspace and succeed with a real one';

  raise notice 'VERIFY_SEARCH_ENGINE: all checks passed';
end;
$$;

rollback;

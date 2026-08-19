-- Epic 20 WP03 — the search engine contract: index one item, remove one item, search
-- within a domain with scope applied, and mark a rebuild/lag event.
--
-- event_type FOLLOWS ADR-0019's OWN FORMAT FROM THE START — THE FIFTH EPIC IN A ROW
--
-- SYSTEM_ARCHITECTURE.md §10.2's own produced-event list decomposes directly: IndexRebuilt
-- -> search.index.rebuilt; IndexLagDetected -> search.index.lag_detected. Engine token is
-- `search`, the snake_case of §10.2's own section title. Aggregate token is `index` — there
-- is no dedicated "index" row per rebuild (each search_index row is per SOURCE ITEM, not
-- per batch), but every prior event-only action this session has built (Epic 17's four,
-- Epic 19's two) names the natural subject of the action rather than requiring a table row
-- to exist first, and `index` is that subject here: the thing being rebuilt.
--
-- THE FIRST CONSUMER ROLE THIS SESSION HAS GRANTED platform.emit_event() TO, NOT AN ENGINE
--
-- 0023_emit_event.sql's own header: "The consumers are deliberately absent: a consumer
-- emitting a derived event is a real case (ADR-0019), but no such consumer exists... a
-- privilege is granted when there is a real caller needing it." klussie_consumer_search is
-- that real caller, five epics later. It needs its own USAGE on schema platform and its
-- own EXECUTE grant, exactly like the seven engine roles already hold, added here rather
-- than assumed — the direct discipline Epic 16's own session-spanning USAGE-grant finding
-- (§12 debt table) exists to prevent from recurring.
--
-- IndexRebuilt IS CANONICAL; IndexLagDetected IS DERIVED — NOT THE SAME KIND OF FACT
--
-- ADR-0019 marks an event p_is_derived when it is "produced by a computation, workflow, or
-- a detected pattern" rather than a direct state change. A completed rebuild is a real,
-- first-order fact ("this consumer really did rebuild this index just now") — p_is_derived
-- stays false, the default, matching every canonical event this session has emitted. Lag
-- is different: SYSTEM_ARCHITECTURE.md §10.2 names it explicitly as *detected*, the exact
-- phrase ADR-0019 uses for the derived case — mark_index_lag_detected() sets
-- p_is_derived => true, the first event this session marks that way.
--
-- GLOBAL-DOMAIN REBUILD TRACKING IS A NAMED, DELIBERATE GAP
--
-- platform.events.workspace_id is not null — Epic 13's own finding, the table's partition
-- key. The six ordinary domains and provider all carry a real owning/publishing workspace
-- to attribute a rebuild event to; global (world graph, catalogues) structurally does not
-- (0121's own search_index_global_has_no_workspace constraint). mark_index_rebuilt() and
-- mark_index_lag_detected() both refuse a null p_workspace_id rather than silently
-- accepting one — global-domain rebuild event tracking has no owning workspace to attribute
-- to and no operator/platform-scoped event path exists yet (Administration Engine, §12.3,
-- unbuilt). Named here rather than built around.
--
-- "SCOPE IS INDEXED, NEVER POST-FILTERED" IS ONE where CLAUSE, NOT TWO QUERIES
--
-- derived.search()'s scope predicate (workspace membership, or is_published for the two
-- public domains) and its text predicate (search_vector @@ websearch_to_tsquery(...)) sit
-- in the same where clause of the same statement — there is no broader fetch followed by
-- an application-side filter for this function to violate the rule with, structurally, not
-- just by convention.

-- =========================================================================
-- THE LOGIC — write

create or replace function derived.reindex_item(
  p_id              uuid,
  p_domain          text,
  p_workspace_id    uuid,
  p_location_path   extensions.ltree,
  p_source_type     text,
  p_source_id       uuid,
  p_title           text,
  p_body            text,
  p_is_published    boolean,
  p_source_event_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into derived.search_index (
    id, domain, workspace_id, location_path, source_type, source_id, title, body,
    is_published, source_event_id
  ) values (
    p_id, p_domain, p_workspace_id, p_location_path, p_source_type, p_source_id, p_title, p_body,
    p_is_published, p_source_event_id
  )
  on conflict (domain, source_type, source_id) do update
    set workspace_id    = excluded.workspace_id,
        location_path   = excluded.location_path,
        title           = excluded.title,
        body            = excluded.body,
        is_published    = excluded.is_published,
        indexed_at      = now(),
        source_event_id = excluded.source_event_id;
end;
$$;

comment on function derived.reindex_item(uuid, text, uuid, extensions.ltree, text, uuid, text, text, boolean, uuid) is
  'Upserts one search_index row, keyed on (domain, source_type, source_id) — a re-index of an already-indexed item updates in place and keeps its own id. No event: indexing one item is a routine reaction to another engine''s own event, not itself a fact worth a second one.';

create or replace function derived.remove_from_index(
  p_domain      text,
  p_source_type text,
  p_source_id   uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from derived.search_index
  where domain = p_domain and source_type = p_source_type and source_id = p_source_id;
end;
$$;

comment on function derived.remove_from_index(text, text, uuid) is
  'Hard-deletes one search_index row — permitted, unlike every other table this session has built, because Search indexes are Projection class (DATABASE_ARCHITECTURE.md §3): a source item retired or removed leaves nothing worth keeping a trail of here.';

-- =========================================================================
-- THE LOGIC — read

create or replace function derived.search(
  p_workspace_id uuid,
  p_domain       text,
  p_query        text,
  p_limit        integer default 25
)
returns table (
  id          uuid,
  source_type text,
  source_id   uuid,
  title       text,
  body        text,
  rank        real
)
language sql
stable
set search_path = ''
as $$
  select
    i.id, i.source_type, i.source_id, i.title, i.body,
    ts_rank(i.search_vector, websearch_to_tsquery('simple', p_query)) as rank
  from derived.search_index i
  where i.domain = p_domain
    and (
      (p_domain not in ('provider', 'global') and i.workspace_id = p_workspace_id)
      or (p_domain in ('provider', 'global') and i.is_published = true)
    )
    and i.search_vector @@ websearch_to_tsquery('simple', p_query)
  order by rank desc
  limit greatest(p_limit, 0);
$$;

comment on function derived.search(uuid, text, text, integer) is
  'Full-text search within one domain, scope applied in the same where clause as the text match (SYSTEM_ARCHITECTURE.md §10.2: "scope is indexed, never post-filtered"). p_workspace_id is ignored for provider/global — those rows are scoped by is_published, not membership.';

-- =========================================================================
-- THE LOGIC — mark

create or replace function derived.mark_index_rebuilt(
  p_workspace_id    uuid,
  p_domain          text,
  p_indexed_count   integer,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_workspace_id is null then
    raise exception
      'derived.mark_index_rebuilt: p_workspace_id is required — global-domain rebuild event attribution has no owning workspace and is a named, deliberate gap pending the Administration Engine (unbuilt)'
      using errcode = 'not_null_violation';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'search.index.rebuilt',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'index',
    p_subject_id     => p_workspace_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('domain', p_domain, 'indexedCount', p_indexed_count)
  );
end;
$$;

comment on function derived.mark_index_rebuilt(uuid, text, integer, uuid, uuid, platform.actor_type, text) is
  'Records that a rebuild of one workspace''s one domain completed. Canonical, not derived — a rebuild having happened is a first-order fact, not a computed signal.';

create or replace function derived.mark_index_lag_detected(
  p_workspace_id    uuid,
  p_domain          text,
  p_lag_seconds     integer,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_workspace_id is null then
    raise exception
      'derived.mark_index_lag_detected: p_workspace_id is required — global-domain rebuild event attribution has no owning workspace and is a named, deliberate gap pending the Administration Engine (unbuilt)'
      using errcode = 'not_null_violation';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'search.index.lag_detected',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'index',
    p_subject_id     => p_workspace_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('domain', p_domain, 'lagSeconds', p_lag_seconds),
    p_is_derived     => true
  );
end;
$$;

comment on function derived.mark_index_lag_detected(uuid, text, integer, uuid, uuid, platform.actor_type, text) is
  'Records a detected staleness condition. p_is_derived => true — ADR-0019''s own "detected pattern" case, the first event this session marks that way.';

-- =========================================================================
-- ACCESS — klussie_consumer_search only. No api.* delegate — the fifteenth occurrence.

grant usage on schema platform to klussie_consumer_search;

do $$
begin
  execute pg_catalog.format(
    'grant execute on function platform.emit_event(
       uuid, text, uuid, platform.actor_type, text, text, uuid, uuid,
       jsonb, uuid, smallint, boolean, timestamptz
     ) to %I', 'klussie_consumer_search'
  );
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'derived.reindex_item(uuid, text, uuid, extensions.ltree, text, uuid, text, text, boolean, uuid)',
    'derived.remove_from_index(text, text, uuid)',
    'derived.search(uuid, text, text, integer)',
    'derived.mark_index_rebuilt(uuid, text, integer, uuid, uuid, platform.actor_type, text)',
    'derived.mark_index_lag_detected(uuid, text, integer, uuid, uuid, platform.actor_type, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute pg_catalog.format('grant execute on function %s to klussie_consumer_search', fn);
  end loop;
end;
$$;

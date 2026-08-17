-- Epic 06 WP05 — re-parenting: the path rewrite and LocationTreeChanged in one transaction.
--
-- event_type CORRECTED TO ADR-0019's OWN FORMAT — FOUND DURING EPIC 15
--
-- ADR-0019 requires `event_type` as `<engine>.<aggregate>.<past-participle>`, enforced by
-- platform.events' own `events_type_format` check (0021). The first draft of this migration
-- used the bare PascalCase name SYSTEM_ARCHITECTURE.md §7.2 gives the CONCEPT
-- ("LocationTreeChanged") as if it were the literal column value — a conflation caught
-- session-wide while building Epic 15's own diagnostic (`implementation/epic-15/
-- COMPLETION.md` §6). Corrected here to `location.location.tree_changed`: engine = Location
-- (§7.2's own section), aggregate = location (the row being moved), participle = tree_changed
-- (this is the one location event that describes the whole subtree, not one row).
--
-- This is the epic's actual risk. SUPABASE_ARCHITECTURE.md §11.2: "The path rewrite and
-- the event are one transaction. A path rewritten without an event leaves stale scopes and
-- stale indexes, silently." SYSTEM_ARCHITECTURE.md §7.2 calls this "the single easiest
-- place to implement a correct architecture incorrectly."
--
-- ONE STATEMENT REWRITES THE WHOLE MOVED SUBTREE, NOT A ROW AT A TIME
--
-- `where path <@ v_old_path` selects the moved location AND every descendant in one UPDATE
-- — §11.2's "rewrites the moved subtree only" is a single indexed prefix match, the same
-- operator migration 0046's containment functions use, not a loop and not a recursive CTE.
--
-- EVERY ltree OPERATOR IS SCHEMA-QUALIFIED — `set search_path = ''` REACHES THEM TOO
--
-- Migration 0046's own header names the reason: ltree's operators and functions live in
-- `extensions`, not pg_catalog, so `<@` and `||` need `OPERATOR(extensions.<op>)` and
-- `nlevel`/`subpath` need `extensions.` to resolve under an empty search_path. The one
-- place this migration uses plain text `||` instead (building a fresh path from a known
-- non-empty parent plus this location's own label) is deliberate: both operands are
-- guaranteed non-empty there, so text concatenation is exact and needs no qualification.
-- The subtree rewrite below cannot use that shortcut — a descendant's remaining suffix
-- after stripping the old prefix is legitimately empty for the moved location itself, and
-- text-joining an empty remainder with a `.` separator would write an invalid path (a
-- trailing dot). ltree's own `||` operator is defined to concatenate correctly with an
-- empty operand; text concatenation is not, which is why that one line uses
-- `OPERATOR(extensions.||)` rather than the same text trick migration 0044 uses throughout.
--
-- EVENT IDENTIFIERS ARE SUPPLIED BY THE CALLER, NOT MINTED HERE
--
-- platform.uuid_v7_at() is "For BACKFILLS ONLY (ADR-0022) — executable by no application
-- role" (migration 0026's own comment, and its grant proves it: revoked from everyone but
-- the migration runner). A re-parent is a live operation, not a backfill, so this function
-- takes p_event_id and p_correlation_id as required parameters — SUPABASE_ARCHITECTURE.md
-- §3 puts runtime identifier generation in the application, and the eventual real caller
-- (once one exists) mints both with src/lib/ids.js's uuidv7(), the same as every other
-- live write path in this platform.
--
-- CYCLE GUARD
--
-- A location cannot become its own descendant's child — checked via the same <@ operator
-- containment already uses: the new parent's path must not already be within the moved
-- location's current subtree.
--
-- NO CROSS-PROPERTY MOVES IN THIS EPIC
--
-- Re-parenting to a location under a different property is refused outright. Moving a
-- location's property is a materially different operation — every service record,
-- maintenance schedule and document attached to it or its descendants would need to
-- reconsider which property's stewardship governs them — and inventing that behaviour here,
-- with no real caller and no stated requirement for it, would be exactly the speculative
-- structure ADR-0010 rules out.
--
-- NO PERMISSION CHECK INSIDE THIS FUNCTION, DELIBERATELY
--
-- ADR-0027 scoped the workspace permission vocabulary to workspace lifecycle and
-- membership management only; re-parenting a location is a property/location-engine
-- business action with no vocabulary of its own yet, the same restraint WP 05.04 held for
-- property. Whichever future work package builds this function's first real caller must
-- decide the caller checks permission (via whatever the Capability/Workspace layer offers
-- by then) before calling this — not this function, which trusts its caller the same way
-- platform.emit_event() trusts the engine that calls it.

create or replace function property.reparent_location(
  p_location_id     uuid,
  p_new_parent_id   uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text,
  p_event_id        uuid,
  p_correlation_id  uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_old_path         extensions.ltree;
  v_old_parent_id    uuid;
  v_property_id      uuid;
  v_new_parent_path  extensions.ltree;
  v_new_property_id  uuid;
  v_new_path         extensions.ltree;
  v_own_label        text := replace(p_location_id::text, '-', '_');
  v_affected         integer;
  v_steward          uuid;
begin
  select path, parent_id, property_id
    into v_old_path, v_old_parent_id, v_property_id
  from property.locations
  where id = p_location_id;

  if v_old_path is null then
    raise exception 'location % does not exist', p_location_id;
  end if;

  if p_new_parent_id is not distinct from v_old_parent_id then
    -- Already there. A no-op re-parent emits nothing — an event that changed nothing
    -- would mislead every consumer into re-evaluating scope or a search index for
    -- nothing (§11.2's invalidation obligation is for CHANGES, not requests).
    return;
  end if;

  if p_new_parent_id is null then
    -- Moving to top-level, under the same property. subpath(path, 0, 1) is the path's own
    -- first segment — the property's own label (migration 0044) — reused as the new
    -- top-level path's root. Both operands are known non-empty, so plain text
    -- concatenation is exact here (see this migration's header).
    v_new_path := (extensions.subpath(v_old_path, 0, 1)::text || '.' || v_own_label)::extensions.ltree;
    v_new_property_id := v_property_id;
  else
    select path, property_id into v_new_parent_path, v_new_property_id
    from property.locations
    where id = p_new_parent_id;

    if v_new_parent_path is null then
      raise exception 'parent location % does not exist', p_new_parent_id;
    end if;

    if v_new_property_id <> v_property_id then
      raise exception
        'cannot re-parent location % across properties (from % to %) — not supported in this epic',
        p_location_id, v_property_id, v_new_property_id;
    end if;

    if v_new_parent_path OPERATOR(extensions.<@) v_old_path then
      raise exception
        'cannot re-parent location % under % — % is within % ''s own subtree',
        p_location_id, p_new_parent_id, p_new_parent_id, p_location_id;
    end if;

    v_new_path := (v_new_parent_path::text || '.' || v_own_label)::extensions.ltree;
  end if;

  -- THE REWRITE — the moved location and every descendant, one statement. subpath(path,
  -- nlevel(v_old_path)) strips the moved location's OLD prefix from each row's path,
  -- leaving only what is below it; concatenating v_new_path onto that remainder reattaches
  -- it under the new position. For the moved location itself, the remainder is empty and
  -- the result is exactly v_new_path — ltree's own || operator handles that correctly,
  -- which is why this line uses it instead of the text-and-dot shortcut used above.
  with moved as (
    update property.locations
    set parent_id  = case when id = p_location_id then p_new_parent_id else parent_id end,
        path        = v_new_path OPERATOR(extensions.||) extensions.subpath(path, extensions.nlevel(v_old_path)),
        updated_at  = now()
    where path OPERATOR(extensions.<@) v_old_path
    returning id
  )
  select pg_catalog.count(*) into v_affected from moved;

  select steward_workspace_id into v_steward
  from property.properties
  where id = v_property_id;

  -- THE EVENT — same transaction, no window in which the tree changed and nothing
  -- describes it (§11.2's whole point).
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'location.location.tree_changed',
    p_workspace_id   => v_steward,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'location',
    p_subject_id     => p_location_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object(
      'property_id', v_property_id,
      'old_parent_id', v_old_parent_id,
      'new_parent_id', p_new_parent_id,
      'old_path', v_old_path::text,
      'new_path', v_new_path::text,
      'affected_location_count', v_affected
    )
  );
end;
$$;

comment on function property.reparent_location(uuid, uuid, platform.actor_type, text, uuid, uuid) is
  'Moves a location (and its whole subtree) to a new parent within the same property, rewriting every affected path in one statement and emitting LocationTreeChanged in the same transaction (SUPABASE_ARCHITECTURE.md §11.2). No caller exists yet in this epic — event identifiers are required parameters because runtime identifier generation belongs in the application (ADR-0022), never minted here.';

-- =========================================================================
-- ACCESS
--
-- The property engine's own write contract for its own aggregate — the same posture
-- platform.emit_event() already holds for every engine (migration 0023): granted to the
-- owning role now, even though no real caller exists yet, rather than withheld the way
-- migration 0046's cross-engine containment functions are (those wait for a consuming
-- engine that isn't this one).

revoke all on function property.reparent_location(uuid, uuid, platform.actor_type, text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function property.reparent_location(uuid, uuid, platform.actor_type, text, uuid, uuid)
  to klussie_engine_property;

-- Epic 07 WP07 — reconciles the property.assets rows mirrored by 0053's dual-write triggers
-- (and originally populated by 0052's backfill) against the rule both state, for every live
-- household_items row.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/RECONCILE_ASSETS.sql
--
-- Step 4 of the migration pattern (IMPLEMENTATION_ROADMAP.md §3), and a **hard gate**: §3
-- says "a read-switch without a passing reconciliation is not permitted," and this is the
-- evidence WP 07.08 needs before src/lib/householdItems.js may read from property.assets.
--
-- READ-ONLY. It writes nothing.
--
-- WHAT COUNTS AS A DISCREPANCY, AND WHAT DOES NOT
--
-- "The stored value must equal what property.resolve_property_for_owner() and 0053's own
-- field mapping compute fresh, right now" — not "a mirror exists." A household_items row
-- whose owner resolves to no property (RECONCILE_WORKSPACE.sql's own precedent: "reconciled
-- against, not defended against") is reported separately, informationally, in §2 — the same
-- restraint 0052's backfill and 0053's insert trigger both already take. Only a row that
-- SHOULD have a mirror (its owner resolves to a real property) and does not, or has one
-- that disagrees with the rule, fails this gate.
--
-- ZERO ROWS IS NOT EVIDENCE
--
-- Same principle RECONCILE_IDENTITY.sql and RECONCILE_WORKSPACE.sql both state. §0 prints
-- real counts so a thin environment is visible, not hidden behind a silent pass.

\set ON_ERROR_STOP on

-- =========================================================================
-- 0 · Real row counts — informational, not fatal

do $$
declare
  v_items bigint;
  v_assets bigint;
  v_mirrored bigint;
  v_disposed bigint;
begin
  select count(*) into v_items from public.household_items;
  select count(*) into v_assets from property.assets;
  select count(*) into v_mirrored from property.assets where household_items_id is not null;
  select count(*) into v_disposed from property.assets where lifecycle_state = 'disposed';

  raise notice '--- household_items=% property.assets=% (mirrored=%, disposed=%) ---',
    v_items, v_assets, v_mirrored, v_disposed;
end;
$$;

-- =========================================================================
-- 1 · Every live household_items row whose owner resolves to a property has exactly one
-- mirrored property.assets row

do $$
declare
  v_missing bigint;
  v_resolvable bigint;
begin
  select count(*) into v_resolvable
  from public.household_items hi
  where property.resolve_property_for_owner(hi.owner_id) is not null;

  select count(*) into v_missing
  from public.household_items hi
  where property.resolve_property_for_owner(hi.owner_id) is not null
    and not exists (select 1 from property.assets a where a.household_items_id = hi.id);

  if v_missing > 0 then
    raise exception 'DISCREPANCY: % household_items row(s) resolve to a real property but have no mirrored asset', v_missing;
  end if;

  raise notice '1 · every resolvable household_items row has a mirrored asset (% row(s) resolvable and compared)', v_resolvable;
end;
$$;

-- =========================================================================
-- 2 · household_items rows whose owner resolves to no property — informational, matching
-- 0052's and 0053's own posture, not a failure

do $$
declare
  v_unresolvable bigint;
begin
  select count(*) into v_unresolvable
  from public.household_items hi
  where property.resolve_property_for_owner(hi.owner_id) is null;

  raise notice '2 · % household_items row(s) have no resolvable property (expected gap, not reconciled against)', v_unresolvable;
end;
$$;

-- =========================================================================
-- 3 · Every mirrored asset's fields agree with a fresh derivation from its household_items
-- row, per 0053's own mapping (identical to 0052's backfill mapping)

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared
  from property.assets a
  join public.household_items hi on hi.id = a.household_items_id;

  select count(*) into v_wrong
  from property.assets a
  join public.household_items hi on hi.id = a.household_items_id
  where a.name is distinct from hi.name
     or a.type is distinct from hi.category
     or a.make is distinct from hi.brand
     or a.model is distinct from hi.model
     or a.room_label is distinct from hi.room
     or a.photo_path is distinct from hi.photo_path
     or a.acquired_on is distinct from hi.purchased_on
     or a.notes is distinct from hi.notes
     or a.source is distinct from hi.source
     or a.ai_suggestion is distinct from hi.ai_suggestion;

  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % mirrored asset(s) disagree with their household_items row on a mapped field', v_wrong;
  end if;

  raise notice '3 · every mirrored asset agrees with its household_items row on every mapped field (% row(s) compared)', v_compared;
end;
$$;

-- =========================================================================
-- 4 · Every mirrored asset's property_id agrees with a fresh resolution, right now

do $$
declare
  v_wrong bigint;
  v_compared bigint;
begin
  select count(*) into v_compared
  from property.assets a
  join public.household_items hi on hi.id = a.household_items_id;

  select count(*) into v_wrong
  from property.assets a
  join public.household_items hi on hi.id = a.household_items_id
  where a.property_id is distinct from property.resolve_property_for_owner(hi.owner_id);

  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % mirrored asset(s) point at a property that does not match a fresh resolution of their owner', v_wrong;
  end if;

  raise notice '4 · every mirrored asset''s property_id agrees with a fresh resolution (% row(s) compared)', v_compared;
end;
$$;

-- =========================================================================
-- 5 · A disposed asset's source item is genuinely gone, never still live
--
-- household_items_id is null on a disposed asset once its source row is actually deleted
-- (0053's ON DELETE SET NULL) — this checks the narrower, more dangerous case: an asset
-- disposed while its household_items_id link was somehow left in place, which would mean
-- something disposed an asset without its item having been deleted at all.

do $$
declare
  v_wrong bigint;
begin
  select count(*) into v_wrong
  from property.assets a
  where a.lifecycle_state = 'disposed'
    and a.household_items_id is not null
    and exists (select 1 from public.household_items hi where hi.id = a.household_items_id);

  if v_wrong > 0 then
    raise exception 'DISCREPANCY: % disposed asset(s) still point at a household_items row that still exists', v_wrong;
  end if;

  raise notice '5 · no disposed asset points at a household_items row that still exists';
end;
$$;

-- =========================================================================

do $$
declare
  v_total bigint;
begin
  select count(*) into v_total from public.household_items;
  raise notice 'RECONCILE_ASSETS: PASSED over % household_items row(s)', v_total;

  if v_total < 10 then
    raise notice
      'NOTE: real coverage is thin (% rows). This is the same known, documented gap RECONCILE_WORKSPACE.sql already reports for this environment — a valid pass over what exists, not a substitute for seeding real data before WP 07.08 relies on it at scale.',
      v_total;
  end if;
end;
$$;

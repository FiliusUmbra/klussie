-- Item Detail & Property Memory vertical slice — closing the two real gaps the audit
-- found: an item can never be moved to another room (the schema was built ready for it
-- and nothing writes to it), and a service record can never be listed for one specific
-- item (the column exists, the list function never surfaced it).

-- =========================================================================
-- PART 1 — property.move_asset_for_caller() / api.move_asset()
--
-- property.asset_placements (0048) is ADR-0028's shape, already built and already
-- documented as unused: "Empty until an asset is moved and a placement closes — nothing
-- does that yet." property.assets.location_id/.placed_since is the mutable current
-- pointer; asset_placements holds only CLOSED placements, both began_at and ended_at
-- known at insert. This migration is the first real writer.
--
-- p_location_id IS NULLABLE — AN ITEM CAN BE UNPLACED, NOT ONLY MOVED
--
-- create_asset() already allows a null location_id (an item with no assigned room yet);
-- move_asset() mirrors that rather than forcing every move to land somewhere.
--
-- THE TARGET LOCATION MUST BELONG TO THE SAME PROPERTY THE ASSET IS ALREADY IN
--
-- Moving an asset to a room in a different property is a distinct, larger question this
-- slice does not open (whose steward workspace would the moved asset belong to, what
-- happens to its existing documents and service records) — refused outright with the
-- same generic exception this function already uses for "not yours," rather than quietly
-- reassigning stewardship as a side effect of a room picker.
--
-- SAME MEMBERSHIP CHECK AS EVERY OTHER ASSET/LOCATION WRITE THIS SESSION HAS USED
create or replace function property.move_asset_for_caller(
  p_asset_id        uuid,
  p_location_id     uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward_workspace_id uuid;
  v_asset_property_id    uuid;
  v_target_property_id   uuid;
  v_previous_location_id uuid;
  v_previous_placed_since timestamptz;
begin
  select a.property_id, a.location_id, a.placed_since
  into v_asset_property_id, v_previous_location_id, v_previous_placed_since
  from property.assets a
  where a.id = p_asset_id;

  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = v_asset_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.move_asset_for_caller: caller may not move asset %', p_asset_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_location_id is not null then
    select l.property_id into v_target_property_id
    from property.locations l
    where l.id = p_location_id;

    if v_target_property_id is distinct from v_asset_property_id then
      raise exception
        'property.move_asset_for_caller: target room does not belong to this item''s own home'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Close the current placement into history, only when there was a real one to close —
  -- an item moving from unplaced into its first real room has no prior placement to
  -- record (asset_placements.location_id is not null, 0048's own constraint).
  --
  -- clock_timestamp(), NOT now(), FOR began_at/ended_at — A REAL BUG THE DIAGNOSTIC
  -- CAUGHT, NOT A STYLE CHOICE
  --
  -- now() is frozen for the whole transaction (matching every other timestamp column in
  -- this codebase, which is the right default for created_at/updated_at bookkeeping).
  -- asset_placements_ended_after_began (0048) requires ended_at strictly greater than
  -- began_at, but a second move within the same transaction as the placement it is
  -- closing — proven live by VERIFY_ITEM_DETAIL_CONTRACT.sql's own move-then-unplace
  -- sequence — would set began_at (this asset's own placed_since, itself written by an
  -- earlier now() in the same transaction) and ended_at to the identical frozen value,
  -- violating the constraint. clock_timestamp() reads the real, always-advancing instant
  -- at each call, which is what a Historical table recording actual elapsed duration
  -- needs regardless of transaction boundaries.
  if v_previous_location_id is not null and v_previous_location_id is distinct from p_location_id then
    insert into property.asset_placements (id, asset_id, location_id, began_at, ended_at)
    values (gen_random_uuid(), p_asset_id, v_previous_location_id, v_previous_placed_since, clock_timestamp());
  end if;

  update property.assets
  set location_id = p_location_id,
      placed_since = case when p_location_id is not null then clock_timestamp() else null end,
      updated_at = now()
  where id = p_asset_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.asset.moved',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'asset',
    p_subject_id     => p_asset_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('fromLocationId', v_previous_location_id, 'toLocationId', p_location_id)
  );
end;
$$;

comment on function property.move_asset_for_caller(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Moves an asset to another room in the same property, or unplaces it (p_location_id null) — 0201, the first real writer of property.asset_placements (0048), closing the gap that migration''s own header named. Checks caller membership over the asset''s own property; refuses a target room outside that property. Emits property.asset.moved.';

create or replace function api.move_asset(
  p_asset_id        uuid,
  p_location_id     uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select property.move_asset_for_caller(p_asset_id, p_location_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.move_asset(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.move_asset_for_caller() (ADR-0026''s split).';

revoke all on function property.move_asset_for_caller(uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function api.move_asset(uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.move_asset(uuid, uuid, uuid, uuid, platform.actor_type, text)
  to authenticated;

-- =========================================================================
-- PART 2 — work.my_service_records() / api.my_service_records() gain an asset filter
--
-- work.service_records.asset_id (0081) has always existed; my_service_records() never
-- returned it, so an item's own service history could never be listed, only a whole
-- workspace's. p_asset_id is optional (default null, preserving every existing
-- workspace-wide call site unchanged) and additionally narrows the same predicate
-- 0083's own RLS policy already expresses — a caller cannot see more records than before,
-- only fewer. asset_id and warranty_until are added to the row shape so Item Detail's own
-- history list needs no N+1 resolve_service_record() call per row.

create or replace function work.my_service_records(p_workspace_id uuid, p_asset_id uuid default null)
returns table (
  id uuid, property_id uuid, asset_id uuid, performing_workspace_id uuid,
  performed_at timestamptz, work_performed text, warranty_until date
)
language sql
stable
set search_path = ''
as $$
  select sr.id, sr.property_id, sr.asset_id, sr.performing_workspace_id, sr.performed_at, sr.work_performed, sr.warranty_until
  from work.service_records sr
  where (
    sr.performing_workspace_id = p_workspace_id
    or sr.property_id in (
      select p.id from property.properties p where p.steward_workspace_id = p_workspace_id
    )
  )
  and (p_asset_id is null or sr.asset_id = p_asset_id);
$$;

comment on function work.my_service_records(uuid, uuid) is
  'Every service record one workspace can see, via either path, optionally narrowed to one asset (0201 — the read side of the asset_id column 0081 always carried). Not SECURITY DEFINER, granted to nobody, reachable only from api.my_service_records().';

create or replace function api.my_service_records(p_workspace_id uuid, p_asset_id uuid default null)
returns table (
  id uuid, property_id uuid, asset_id uuid, performing_workspace_id uuid,
  performed_at timestamptz, work_performed text, warranty_until date
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_service_records(p_workspace_id, p_asset_id);
$$;

comment on function api.my_service_records(uuid, uuid) is
  'Delegate for work.my_service_records() (ADR-0026''s split). Every service record the caller''s workspace can see, optionally narrowed to one asset.';

drop function if exists work.my_service_records(uuid);
drop function if exists api.my_service_records(uuid);

revoke all on function work.my_service_records(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_service_records(uuid, uuid) from public, anon, service_role;
grant execute on function api.my_service_records(uuid, uuid) to authenticated;

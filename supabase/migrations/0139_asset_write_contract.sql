-- Platform Activation Slice 1, WP 1.4 — the asset write contract: create, update, and
-- the two real lifecycle-state transitions (active -> retired, active/retired ->
-- disposed). §1.2 of SLICE_1_PROPERTY_ASSET_ACTIVATION.md found this genuinely missing:
-- "there is no create_property(), create_asset(), create_location(), or
-- create_document() anywhere" (before WP 1.0 built the first of those four). This is the
-- second.
--
-- THE FIRST END-USER-FACING WRITE CONTRACT IN THIS ENGINE — UNLIKE EVERY "CREATE"
-- FUNCTION BUILT SO FAR
--
-- property.create_property() (0135) is called only from inside handle_new_user()'s
-- trigger, already a trusted, privileged context — no caller-membership check of its
-- own. work.create_maintenance_schedule()/create_maintenance_obligation() (0074) are
-- engine-internal entry points, granted directly to klussie_engine_work, meant to be
-- called by another trusted part of the system with p_workspace_id already known to be
-- correct. api.create_asset() is different: WP 1.8 (not this work package — client
-- wiring is its own later pass, matching every other Tier 2 package's own sequencing)
-- will call it directly from ItemFormSheet.jsx, an ordinary authenticated customer
-- acting on their own account. Every function below therefore carries a REAL
-- authorization check of its own, the same JOIN property.my_assets() (0051) already
-- performs for reads — but as a gate that raises, not a silent zero-row result, because
-- a write has no "return nothing" option a client can read as "try something else."
--
-- ONE EXCEPTION, ONE MESSAGE, REGARDLESS OF *WHY* — NO EXISTENCE LEAK ON A WRITE PATH
-- EITHER
--
-- property.my_assets()'s own read-side EXISTS check already makes "no such property" and
-- "a property that exists but isn't yours" indistinguishable — a stranger sees zero rows
-- either way. The four functions below hold that same restraint: one query joins the
-- target (property, for create; asset -> its property, for the other three) to
-- workspace.current_memberships(), and a single generic exception covers both "does not
-- exist" and "exists, but you may not touch it." Splitting that into two different
-- messages would let a caller learn whether an id is real by the wording of the error.
--
-- WHAT update_asset() DELIBERATELY DOES NOT TOUCH
--
-- Three things, named rather than silently omitted:
--   1. lifecycle_state — its own dedicated functions below, the same restraint
--      workspace.memberships draws between a role rename (plain UPDATE) and a state
--      transition (its own gated operation, checked invariants, its own event).
--   2. source / ai_suggestion — provenance facts about how the row came to exist, not
--      properties of the thing itself; nothing rewrites how a row was created after the
--      fact.
--   3. location_id / placed_since — property.assets' own header (0048) names this "the
--      CURRENT placement, mutable, per ADR-0028's shape," the identical pattern
--      property.properties.steward_workspace_id already carries: changing it means
--      closing a period into property.asset_placements (Historical, append-only), not a
--      plain field overwrite. WP 1.4's own scope names only "update and lifecycle-state
--      functions" — building the placement-history mechanism now would be inventing a
--      "move asset" operation nobody asked this work package for. A brand-new asset MAY
--      still be created already placed somewhere (create_asset() accepts p_location_id)
--      because that has no prior period to close; moving an EXISTING asset is deferred,
--      named here rather than silently dropped.
--
-- RETIRE AND DISPOSE ARE TWO SEPARATE FUNCTIONS, NOT ONE update_asset() TOGGLE
--
-- The Programme's own WP 1.4 entry names "update and lifecycle-state functions
-- (retire_asset(), matching lifecycle_state's existing active|retired|disposed states)"
-- — plural functions, retire_asset() given as the example. property.assets.lifecycle_state
-- (0048) is a real three-state machine, not an open taxonomy (the same distinction that
-- migration draws against .type/.condition); each transition gets its own gated
-- operation, its own invariant (retire only from active; dispose from active or
-- retired, never from an already-disposed asset), and its own event, the same shape
-- workspace.membership state changes and work.maintenance_obligations' complete/cancel
-- pair already hold themselves to. No "reactivate" — nothing in this work package's
-- scope asks for one, and inventing a state transition nobody named is exactly the
-- restraint this codebase already holds itself to elsewhere (ADR-0010).

-- =========================================================================
-- THE LOGIC — property.create_asset()

create or replace function property.create_asset(
  p_asset_id                      uuid,
  p_property_id                   uuid,
  p_name                          text,
  p_type                          text,
  p_make                          text,
  p_model                         text,
  p_serial_number                 text,
  p_parent_asset_id               uuid,
  p_location_id                   uuid,
  p_room_label                    text,
  p_acquired_on                   date,
  p_installed_on                  date,
  p_expected_service_life_months  integer,
  p_warranty_expires_on           date,
  p_condition                     text,
  p_photo_path                    text,
  p_notes                         text,
  p_source                        text,
  p_ai_suggestion                 jsonb,
  p_event_id                      uuid,
  p_correlation_id                uuid,
  p_actor_type                    platform.actor_type,
  p_actor_ref                     text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward_workspace_id uuid;
begin
  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = p_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.create_asset: caller may not create an asset under property %', p_property_id
      using errcode = 'insufficient_privilege';
  end if;

  insert into property.assets
    (id, property_id, name, type, make, model, serial_number, parent_asset_id,
     location_id, placed_since, room_label, acquired_on, installed_on,
     expected_service_life_months, warranty_expires_on, condition, photo_path, notes,
     source, ai_suggestion, created_at, updated_at)
  values
    (p_asset_id, p_property_id, p_name, p_type, p_make, p_model, p_serial_number, p_parent_asset_id,
     p_location_id, case when p_location_id is not null then now() end, p_room_label,
     p_acquired_on, p_installed_on, p_expected_service_life_months, p_warranty_expires_on,
     p_condition, p_photo_path, p_notes,
     coalesce(p_source, 'manual'), p_ai_suggestion, now(), now());

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.asset.created',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'asset',
    p_subject_id     => p_asset_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('name', p_name, 'propertyId', p_property_id)
  );
end;
$$;

comment on function property.create_asset(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text, date, date, integer, date,
  text, text, text, text, jsonb, uuid, uuid, platform.actor_type, text
) is
  'Creates an asset under a property the caller has a live membership in (WP 1.4) — one EXISTS-shaped check, one generic exception for both "no such property" and "not yours," matching property.my_assets()''s own read-side restraint. Emits property.asset.created. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_asset().';

-- =========================================================================
-- THE LOGIC — property.update_asset()

create or replace function property.update_asset(
  p_asset_id                      uuid,
  p_name                          text,
  p_type                          text,
  p_make                          text,
  p_model                         text,
  p_serial_number                 text,
  p_parent_asset_id               uuid,
  p_room_label                    text,
  p_acquired_on                   date,
  p_installed_on                  date,
  p_expected_service_life_months  integer,
  p_warranty_expires_on           date,
  p_condition                     text,
  p_photo_path                    text,
  p_notes                         text,
  p_event_id                      uuid,
  p_correlation_id                uuid,
  p_actor_type                    platform.actor_type,
  p_actor_ref                     text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward_workspace_id uuid;
begin
  select p.steward_workspace_id into v_steward_workspace_id
  from property.assets a
  join property.properties p on p.id = a.property_id
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where a.id = p_asset_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.update_asset: caller may not modify asset %', p_asset_id
      using errcode = 'insufficient_privilege';
  end if;

  update property.assets
  set name = p_name,
      type = p_type,
      make = p_make,
      model = p_model,
      serial_number = p_serial_number,
      parent_asset_id = p_parent_asset_id,
      room_label = p_room_label,
      acquired_on = p_acquired_on,
      installed_on = p_installed_on,
      expected_service_life_months = p_expected_service_life_months,
      warranty_expires_on = p_warranty_expires_on,
      condition = p_condition,
      photo_path = p_photo_path,
      notes = p_notes,
      updated_at = now()
  where id = p_asset_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.asset.updated',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'asset',
    p_subject_id     => p_asset_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('name', p_name)
  );
end;
$$;

comment on function property.update_asset(
  uuid, text, text, text, text, text, uuid, text, date, date, integer, date, text, text,
  text, uuid, uuid, platform.actor_type, text
) is
  'Updates an asset''s descriptive fields (WP 1.4) — never lifecycle_state (see retire_asset()/dispose_asset() below), never source/ai_suggestion (provenance, immutable after creation), never location_id/placed_since (a period change per ADR-0028''s shape, deferred — see this migration''s own header). Same one-check, one-exception authorization shape as create_asset(). Emits property.asset.updated. Not SECURITY DEFINER, granted to nobody, reachable only from api.update_asset().';

-- =========================================================================
-- THE LOGIC — property.retire_asset()

create or replace function property.retire_asset(
  p_asset_id        uuid,
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
  v_lifecycle_state      text;
begin
  select p.steward_workspace_id, a.lifecycle_state
    into v_steward_workspace_id, v_lifecycle_state
  from property.assets a
  join property.properties p on p.id = a.property_id
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where a.id = p_asset_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.retire_asset: caller may not modify asset %', p_asset_id
      using errcode = 'insufficient_privilege';
  end if;

  if v_lifecycle_state <> 'active' then
    raise exception
      'property.retire_asset: asset % is % already, not active', p_asset_id, v_lifecycle_state
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update property.assets set lifecycle_state = 'retired', updated_at = now() where id = p_asset_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.asset.retired',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'asset',
    p_subject_id     => p_asset_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function property.retire_asset(uuid, uuid, uuid, platform.actor_type, text) is
  'active -> retired, and only from active (WP 1.4) — never a hard delete (0048''s own "retired, never deleted" placement-over-time framing). Same authorization shape as create_asset()/update_asset(). Emits property.asset.retired. Not SECURITY DEFINER, granted to nobody, reachable only from api.retire_asset().';

-- =========================================================================
-- THE LOGIC — property.dispose_asset()

create or replace function property.dispose_asset(
  p_asset_id        uuid,
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
  v_lifecycle_state      text;
begin
  select p.steward_workspace_id, a.lifecycle_state
    into v_steward_workspace_id, v_lifecycle_state
  from property.assets a
  join property.properties p on p.id = a.property_id
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where a.id = p_asset_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.dispose_asset: caller may not modify asset %', p_asset_id
      using errcode = 'insufficient_privilege';
  end if;

  if v_lifecycle_state = 'disposed' then
    raise exception
      'property.dispose_asset: asset % is already disposed', p_asset_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update property.assets set lifecycle_state = 'disposed', updated_at = now() where id = p_asset_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.asset.disposed',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'asset',
    p_subject_id     => p_asset_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('previousState', v_lifecycle_state)
  );
end;
$$;

comment on function property.dispose_asset(uuid, uuid, uuid, platform.actor_type, text) is
  'active or retired -> disposed (WP 1.4) — a thing can be thrown away without ever being formally retired first, so both starting states are valid; only an already-disposed asset is rejected. Same authorization shape as the other three. Emits property.asset.disposed. Not SECURITY DEFINER, granted to nobody, reachable only from api.dispose_asset().';

-- =========================================================================
-- THE DELEGATES

create or replace function api.create_asset(
  p_asset_id                      uuid,
  p_property_id                   uuid,
  p_name                          text,
  p_type                          text,
  p_make                          text,
  p_model                         text,
  p_serial_number                 text,
  p_parent_asset_id               uuid,
  p_location_id                   uuid,
  p_room_label                    text,
  p_acquired_on                   date,
  p_installed_on                  date,
  p_expected_service_life_months  integer,
  p_warranty_expires_on           date,
  p_condition                     text,
  p_photo_path                    text,
  p_notes                         text,
  p_source                        text,
  p_ai_suggestion                 jsonb,
  p_event_id                      uuid,
  p_correlation_id                uuid,
  p_actor_type                    platform.actor_type,
  p_actor_ref                     text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select property.create_asset(
    p_asset_id, p_property_id, p_name, p_type, p_make, p_model, p_serial_number,
    p_parent_asset_id, p_location_id, p_room_label, p_acquired_on, p_installed_on,
    p_expected_service_life_months, p_warranty_expires_on, p_condition, p_photo_path,
    p_notes, p_source, p_ai_suggestion, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_asset(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text, date, date, integer, date,
  text, text, text, text, jsonb, uuid, uuid, platform.actor_type, text
) is
  'Delegate for property.create_asset() (ADR-0026''s split). Creates an asset under a property the caller has a live membership in.';

create or replace function api.update_asset(
  p_asset_id                      uuid,
  p_name                          text,
  p_type                          text,
  p_make                          text,
  p_model                         text,
  p_serial_number                 text,
  p_parent_asset_id               uuid,
  p_room_label                    text,
  p_acquired_on                   date,
  p_installed_on                  date,
  p_expected_service_life_months  integer,
  p_warranty_expires_on           date,
  p_condition                     text,
  p_photo_path                    text,
  p_notes                         text,
  p_event_id                      uuid,
  p_correlation_id                uuid,
  p_actor_type                    platform.actor_type,
  p_actor_ref                     text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select property.update_asset(
    p_asset_id, p_name, p_type, p_make, p_model, p_serial_number, p_parent_asset_id,
    p_room_label, p_acquired_on, p_installed_on, p_expected_service_life_months,
    p_warranty_expires_on, p_condition, p_photo_path, p_notes,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.update_asset(
  uuid, text, text, text, text, text, uuid, text, date, date, integer, date, text, text,
  text, uuid, uuid, platform.actor_type, text
) is
  'Delegate for property.update_asset() (ADR-0026''s split). Updates an asset''s descriptive fields.';

create or replace function api.retire_asset(
  p_asset_id        uuid,
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
  select property.retire_asset(p_asset_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.retire_asset(uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.retire_asset() (ADR-0026''s split). active -> retired.';

create or replace function api.dispose_asset(
  p_asset_id        uuid,
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
  select property.dispose_asset(p_asset_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.dispose_asset(uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for property.dispose_asset() (ADR-0026''s split). active or retired -> disposed.';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed (ADR-0026 property 4), the
-- same discipline every prior api.* delegate in this codebase follows.

revoke all on function property.create_asset(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text, date, date, integer, date,
  text, text, text, text, jsonb, uuid, uuid, platform.actor_type, text
) from public, anon, authenticated, service_role;
revoke all on function property.update_asset(
  uuid, text, text, text, text, text, uuid, text, date, date, integer, date, text, text,
  text, uuid, uuid, platform.actor_type, text
) from public, anon, authenticated, service_role;
revoke all on function property.retire_asset(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function property.dispose_asset(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

revoke all on function api.create_asset(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text, date, date, integer, date,
  text, text, text, text, jsonb, uuid, uuid, platform.actor_type, text
) from public, anon, service_role;
revoke all on function api.update_asset(
  uuid, text, text, text, text, text, uuid, text, date, date, integer, date, text, text,
  text, uuid, uuid, platform.actor_type, text
) from public, anon, service_role;
revoke all on function api.retire_asset(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
revoke all on function api.dispose_asset(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;

grant execute on function api.create_asset(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text, date, date, integer, date,
  text, text, text, text, jsonb, uuid, uuid, platform.actor_type, text
) to authenticated;
grant execute on function api.update_asset(
  uuid, text, text, text, text, text, uuid, text, date, date, integer, date, text, text,
  text, uuid, uuid, platform.actor_type, text
) to authenticated;
grant execute on function api.retire_asset(uuid, uuid, uuid, platform.actor_type, text)
  to authenticated;
grant execute on function api.dispose_asset(uuid, uuid, uuid, platform.actor_type, text)
  to authenticated;

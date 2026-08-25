-- Fix: every real write function in the Property engine authorized on "does the caller
-- hold ANY live membership in this workspace" — no role check. Continuing the write-path
-- role audit SUPPORT_ACCESS_DESIGN.md §1.3(b) names as real, ongoing work (0173 began it
-- for the two highest-stakes marketplace writes; this migration covers the Property
-- engine, the one ROADMAP_C_PLATFORM_OPERATIONS.md §3.2 itself names as what a support
-- session actually needs to look at — "capabilities held... property count... recent
-- activity" — making it the single highest-value engine to close this gap in next.
--
-- EIGHT FUNCTIONS, ONE MECHANICAL FIX EACH — NOT A RESTRUCTURE
--
-- Every one of the eight below is otherwise byte-for-byte identical to its last shipped
-- version; each gains exactly one `and m.role <> 'support'` (or, for
-- create_document_for_service_record's own `IN (subquery)` shape, `where role <>
-- 'support'` inside it) on its own existing membership check. Verified mechanically by a
-- byte-for-byte body comparison in this migration's own test, the same discipline 0173
-- already established.
--
-- create_asset() / update_asset() / retire_asset() / dispose_asset() (0139) — a support
-- session could otherwise fabricate, edit, retire or dispose of a customer's own
-- belongings in their property twin.
-- create_location() (0140) — could otherwise restructure a customer's own home's
-- location tree.
-- create_document() / create_document_for_request() / create_document_for_service_record()
-- (0141/0149/0165) — could otherwise attach a document to a customer's property, request
-- or service record as if it were their own upload.
--
-- STILL OPEN, NAMED EXPLICITLY
--
-- This migration does not touch Service Records' own write contract
-- (work.create_service_record_for_caller() and its siblings, 0163) or the marketplace
-- request functions (work.create_request_for_caller() and its siblings, 0146/0154/0156)
-- — both real, both checked and confirmed vulnerable during this same audit pass, both
-- fixed in the migrations immediately following this one, not folded into this file to
-- keep each migration's own blast radius reviewable and its own test suite focused on
-- one engine at a time.

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
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id and m.role <> 'support'
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
  'Creates an asset under a property the caller has a live, non-support membership in (WP 1.4, 0174) — one EXISTS-shaped check, one generic exception for both "no such property" and "not yours," matching property.my_assets()''s own read-side restraint. Emits property.asset.created. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_asset().';

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
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id and m.role <> 'support'
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
  'Updates an asset''s descriptive fields (WP 1.4, 0174) — never lifecycle_state (see retire_asset()/dispose_asset() below), never source/ai_suggestion (provenance, immutable after creation), never location_id/placed_since (a period change per ADR-0028''s shape, deferred — see 0139''s own header). Same one-check, one-exception, non-support authorization shape as create_asset(). Emits property.asset.updated. Not SECURITY DEFINER, granted to nobody, reachable only from api.update_asset().';

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
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id and m.role <> 'support'
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
  'active -> retired, and only from active (WP 1.4, 0174) — never a hard delete (0048''s own "retired, never deleted" placement-over-time framing). Same non-support authorization shape as create_asset()/update_asset(). Emits property.asset.retired. Not SECURITY DEFINER, granted to nobody, reachable only from api.retire_asset().';

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
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id and m.role <> 'support'
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
  'active or retired -> disposed (WP 1.4, 0174) — a thing can be thrown away without ever being formally retired first, so both starting states are valid; only an already-disposed asset is rejected. Same non-support authorization shape as the other three. Emits property.asset.disposed. Not SECURITY DEFINER, granted to nobody, reachable only from api.dispose_asset().';

create or replace function property.create_location(
  p_location_id     uuid,
  p_property_id     uuid,
  p_parent_id       uuid,
  p_name            text,
  p_type            text,
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
  v_target_property_id   uuid;
  v_steward_workspace_id uuid;
begin
  if p_parent_id is not null then
    select l.property_id into v_target_property_id
    from property.locations l
    where l.id = p_parent_id;
  else
    v_target_property_id := p_property_id;
  end if;

  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id and m.role <> 'support'
  where p.id = v_target_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.create_location: caller may not create a location here'
      using errcode = 'insufficient_privilege';
  end if;

  insert into property.locations (id, property_id, parent_id, name, type, created_at, updated_at)
  values (p_location_id, v_target_property_id, p_parent_id, p_name, p_type, now(), now());

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.location.created',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'location',
    p_subject_id     => p_location_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('name', p_name, 'propertyId', v_target_property_id, 'parentId', p_parent_id)
  );
end;
$$;

comment on function property.create_location(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'Creates a location under a property the caller has a live, non-support membership in (WP 1.5, 0174) — resolved from p_parent_id''s own property when a parent is given, never trusted from p_property_id alone. path is computed by property.locations_maintain_path() (0044)''s own trigger, not here. One generic exception for both "no such target" and "not yours," matching property.create_asset()''s own restraint. Emits property.location.created. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_location().';

create or replace function property.create_document(
  p_document_id     uuid,
  p_attachment_id   uuid,
  p_property_id     uuid,
  p_type_key        text,
  p_storage_path    text,
  p_issuer          text,
  p_valid_from      date,
  p_valid_until     date,
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
begin
  select p.steward_workspace_id into v_steward_workspace_id
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id and m.role <> 'support'
  where p.id = p_property_id;

  if v_steward_workspace_id is null then
    raise exception
      'property.create_document: caller may not create a document under property %', p_property_id
      using errcode = 'insufficient_privilege';
  end if;

  if not pg_catalog.starts_with(p_storage_path, v_steward_workspace_id::text || '/') then
    raise exception
      'property.create_document: storage_path must be rooted under the caller''s own workspace folder'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into property.documents
    (id, owning_workspace_id, type_key, storage_bucket, storage_path, issuer, valid_from, valid_until, version_since, created_at, updated_at)
  values
    (p_document_id, v_steward_workspace_id, p_type_key, 'documents', p_storage_path, p_issuer, p_valid_from, p_valid_until, now(), now(), now());

  insert into property.document_attachments (id, document_id, property_id)
  values (p_attachment_id, p_document_id, p_property_id);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.document.created',
    p_workspace_id   => v_steward_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'document',
    p_subject_id     => p_document_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('typeKey', p_type_key, 'propertyId', p_property_id, 'attachmentId', p_attachment_id)
  );
end;
$$;

comment on function property.create_document(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text) is
  'Creates a document owned by a property''s steward workspace and attaches it to that property (WP 1.6, 0174) — property-level attachment only, matching WP 1.3''s own read-side scope. storage_bucket is always ''documents''; storage_path must be rooted under the caller''s own resolved workspace folder, matching the Storage policy that gates it. One generic exception for both "no such property" and "not yours," matching create_asset()/create_location()''s own restraint. Emits property.document.created. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_document().';

create or replace function property.create_document_for_request(
  p_document_id     uuid,
  p_attachment_id   uuid,
  p_request_id      uuid,
  p_type_key        text,
  p_storage_path    text,
  p_issuer          text,
  p_valid_from      date,
  p_valid_until     date,
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
  v_requesting_ws uuid;
begin
  select r.requesting_workspace_id into v_requesting_ws
  from work.requests r
  join workspace.current_memberships() m on m.workspace_id = r.requesting_workspace_id and m.role <> 'support'
  where r.id = p_request_id;

  if v_requesting_ws is null then
    raise exception
      'property.create_document_for_request: caller may not create a document under request %', p_request_id
      using errcode = 'insufficient_privilege';
  end if;

  if not pg_catalog.starts_with(p_storage_path, v_requesting_ws::text || '/') then
    raise exception
      'property.create_document_for_request: storage_path must be rooted under the caller''s own workspace folder'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into property.documents
    (id, owning_workspace_id, type_key, storage_bucket, storage_path, issuer, valid_from, valid_until, version_since, created_at, updated_at)
  values
    (p_document_id, v_requesting_ws, p_type_key, 'documents', p_storage_path, p_issuer, p_valid_from, p_valid_until, now(), now(), now());

  insert into property.document_attachments (id, document_id, request_id)
  values (p_attachment_id, p_document_id, p_request_id);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.document.created',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'document',
    p_subject_id     => p_document_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('typeKey', p_type_key, 'requestId', p_request_id)
  );
end;
$$;

comment on function property.create_document_for_request(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform.actor_type, text) is
  'Creates a document for a caller with a real, active, non-support membership in the request''s own requesting workspace (0174), attached to it — the request-photo write path (WP 2.6), matching create_document()''s own shape but checked against a request''s requesting workspace, never a property''s stewardship. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_document_for_request().';

create or replace function property.create_document_for_service_record(
  p_document_id        uuid,
  p_attachment_id      uuid,
  p_service_record_id  uuid,
  p_storage_path       text,
  p_event_id           uuid,
  p_correlation_id     uuid,
  p_actor_type         platform.actor_type,
  p_actor_ref          text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_performing_ws  uuid;
  v_requesting_ws  uuid;
  v_request_id     uuid;
begin
  select e.performing_workspace_id, e.requesting_workspace_id, e.request_id
  into v_performing_ws, v_requesting_ws, v_request_id
  from work.engagements e
  where e.service_record_id = p_service_record_id
    and e.performing_workspace_id in (select workspace_id from workspace.current_memberships() where role <> 'support');

  if v_performing_ws is null then
    raise exception
      'property.create_document_for_service_record: caller may not attach evidence to service record %', p_service_record_id
      using errcode = 'insufficient_privilege';
  end if;

  if not pg_catalog.starts_with(p_storage_path, v_performing_ws::text || '/') then
    raise exception
      'property.create_document_for_service_record: storage_path must be rooted under the caller''s own workspace folder'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into property.documents
    (id, owning_workspace_id, type_key, storage_bucket, storage_path, issuer, valid_from, valid_until, version_since, created_at, updated_at)
  values
    (p_document_id, v_performing_ws, 'service_evidence', 'documents', p_storage_path, null, null, null, now(), now(), now());

  insert into property.document_attachments (id, document_id, request_id)
  values (p_attachment_id, p_document_id, v_request_id);

  insert into property.document_shares (id, document_id, shared_with_workspace_id)
  values (gen_random_uuid(), p_document_id, v_requesting_ws);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'property.document.created',
    p_workspace_id   => v_performing_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'document',
    p_subject_id     => p_document_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('typeKey', 'service_evidence', 'serviceRecordId', p_service_record_id, 'requestId', v_request_id)
  );
end;
$$;

comment on function property.create_document_for_service_record(uuid, uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'Creates a service_evidence document for a caller with a real, active, non-support membership in the service record''s own performing workspace (0174) — resolved from work.engagements.service_record_id, never trusted from the caller. type_key is hardcoded, not a parameter. Attached under the record''s own originating request_id, mirrors property.create_document_for_request()''s shape but checked against the PERFORMING side. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_document_for_service_record().';

-- No grant/revoke changes — every function's own access posture (reachable only through
-- its existing api.* delegate) is untouched.

-- Fix: continuing the write-path role audit begun in 0173/0174/0175/0176. Every real
-- Service Record write function authorized on "does the caller hold ANY live membership
-- in this workspace" — no role check. A support-access grant (0172) is unscoped within
-- the one workspace it names, so without this fix it would have been sufficient to
-- create a service record, approve one, write either annex, or amend a record's own
-- field — real professional/steward decisions, not merely reads.
--
-- Fixes five functions, each redefined with its own body otherwise byte-for-byte
-- identical to its last shipped version (0163) — only the membership check gains one
-- additional guard clause:
--
--   work.create_service_record_for_caller()
--   work.record_service_record_approval_for_caller()
--   work.write_performing_annex_for_caller()
--   work.write_property_annex_for_caller()
--   work.amend_service_record_for_caller() — two checks already; the membership half of
--     the first gains the guard, the second half (workspace must be one of the two the
--     record is visible to) is unaffected since a support membership can never itself be
--     v_performing_ws or v_steward.
--
-- Workflow remains unaudited — a real, separate, still-open piece of work (see 0173's,
-- 0174's, 0175's and 0176's own headers).

create or replace function work.create_service_record_for_caller(
  p_service_record_id  uuid,
  p_engagement_id       uuid,
  p_performed_at         timestamptz,
  p_work_performed        text,
  p_agreed_price           numeric,
  p_price_currency          text,
  p_warranty_until           date,
  p_ai_summary                 text,
  p_recommendations             text,
  p_content                      jsonb,
  p_event_id                      uuid,
  p_warranty_event_id               uuid,
  p_correlation_id                   uuid,
  p_actor_type                        platform.actor_type,
  p_actor_ref                          text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_performing_ws  uuid;
  v_request_id      uuid;
  v_existing_record   uuid;
  v_property_id         uuid;
  v_asset_id             uuid;
  v_location_id           uuid;
begin
  select e.performing_workspace_id, e.request_id, e.service_record_id
    into v_performing_ws, v_request_id, v_existing_record
  from work.engagements e
  where e.id = p_engagement_id;

  if v_request_id is null then
    raise exception
      'work.create_service_record_for_caller: engagement % does not exist', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_existing_record is not null then
    raise exception
      'work.create_service_record_for_caller: engagement % already has a service record', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_performing_ws and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(
    r.property_id,
    (select a.property_id from property.assets a where a.id = r.asset_id),
    (select l.property_id from property.locations l where l.id = r.location_id)
  ), r.asset_id, r.location_id
    into v_property_id, v_asset_id, v_location_id
  from work.requests r
  where r.id = v_request_id;

  if v_property_id is null then
    raise exception
      'work.create_service_record_for_caller: request % has no property/asset/location — nowhere for a service record to attach', v_request_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform work.create_service_record(
    p_service_record_id => p_service_record_id, p_property_id => v_property_id,
    p_asset_id => v_asset_id, p_location_id => v_location_id,
    p_performing_workspace_id => v_performing_ws, p_performed_at => p_performed_at,
    p_work_performed => p_work_performed, p_agreed_price => p_agreed_price,
    p_price_currency => p_price_currency, p_warranty_until => p_warranty_until,
    p_ai_summary => p_ai_summary, p_recommendations => p_recommendations, p_content => p_content,
    p_event_id => p_event_id, p_warranty_event_id => p_warranty_event_id,
    p_correlation_id => p_correlation_id, p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  update work.engagements set service_record_id = p_service_record_id where id = p_engagement_id;

  return p_service_record_id;
end;
$$;

comment on function work.create_service_record_for_caller(uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text) is
  'Resolves property/asset/location and performing_workspace_id from the engagement itself (0162''s own coalesce shape) rather than trusting a caller-supplied triple — closes 0087''s own named gap by setting work.engagements.service_record_id in the same transaction. Refuses, not skips, when the request has no physical subject at all (property_id is NOT NULL on work.service_records, unlike WP 2.4''s own scoped grant). 0177: a support-access grant, migration 0172, must never be sufficient to author a service record on someone else''s behalf.';

create or replace function work.record_service_record_approval_for_caller(
  p_service_record_id  uuid,
  p_event_id             uuid,
  p_correlation_id        uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref               text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward uuid;
begin
  select p.steward_workspace_id into v_steward
  from work.service_records sr
  join property.properties p on p.id = sr.property_id
  where sr.id = p_service_record_id;

  if v_steward is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_steward and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.record_service_record_approval(
    p_service_record_id => p_service_record_id, p_event_id => p_event_id,
    p_correlation_id => p_correlation_id, p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.record_service_record_approval_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Approval is the property''s own current steward''s decision (§17) — checked live against property.properties.steward_workspace_id, the same "current, not frozen" rule 0083''s own RLS policy already enforces for reads. 0177: excludes a support-access grant from counting as the steward''s own approval.';

create or replace function work.write_performing_annex_for_caller(
  p_annex_id            uuid,
  p_service_record_id   uuid,
  p_internal_cost       numeric,
  p_margin              numeric,
  p_supplier_used       text,
  p_supplier_price      numeric,
  p_scheduling_notes    text,
  p_internal_commentary text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_performing_ws uuid;
begin
  select sr.performing_workspace_id into v_performing_ws
  from work.service_records sr where sr.id = p_service_record_id;

  if v_performing_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_performing_ws and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.write_performing_annex(
    p_annex_id => p_annex_id, p_service_record_id => p_service_record_id,
    p_internal_cost => p_internal_cost, p_margin => p_margin, p_supplier_used => p_supplier_used,
    p_supplier_price => p_supplier_price, p_scheduling_notes => p_scheduling_notes,
    p_internal_commentary => p_internal_commentary
  );
end;
$$;

comment on function work.write_performing_annex_for_caller(uuid, uuid, numeric, numeric, text, numeric, text, text) is
  'Performing-workspace membership only — "a business''s cost base is its own information" (§13.2), the identical rule 0083''s own RLS policy on this annex already enforces for reads, checked again here because this is a write with no policy to lean on. 0177: excludes a support-access grant from counting as that business''s own membership.';

create or replace function work.write_property_annex_for_caller(
  p_annex_id           uuid,
  p_service_record_id  uuid,
  p_annotations        text,
  p_internal_approvals text,
  p_budget_context     text,
  p_private_assessment text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_steward uuid;
begin
  select p.steward_workspace_id into v_steward
  from work.service_records sr
  join property.properties p on p.id = sr.property_id
  where sr.id = p_service_record_id;

  if v_steward is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_steward and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.write_property_annex(
    p_annex_id => p_annex_id, p_service_record_id => p_service_record_id,
    p_annotations => p_annotations, p_internal_approvals => p_internal_approvals,
    p_budget_context => p_budget_context, p_private_assessment => p_private_assessment
  );
end;
$$;

comment on function work.write_property_annex_for_caller(uuid, uuid, text, text, text, text) is
  'Current stewardship, checked live, same as the approval wrapper above — work.write_property_annex() itself separately freezes owning_workspace_id on first write (0084''s own comment); this check is the caller-side gate, that freeze is the row''s own permanent record. 0177: excludes a support-access grant from counting as the steward''s own membership.';

create or replace function work.amend_service_record_for_caller(
  p_amendment_id             uuid,
  p_service_record_id        uuid,
  p_authored_by_workspace_id uuid,
  p_field_key                text,
  p_previous_value           text,
  p_corrected_value          text,
  p_reason                   text,
  p_event_id                 uuid,
  p_correlation_id           uuid,
  p_actor_type               platform.actor_type,
  p_actor_ref                text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_performing_ws uuid;
  v_steward        uuid;
begin
  select sr.performing_workspace_id, p.steward_workspace_id
    into v_performing_ws, v_steward
  from work.service_records sr
  join property.properties p on p.id = sr.property_id
  where sr.id = p_service_record_id;

  if v_performing_ws is null then
    raise exception
      'work.amend_service_record_for_caller: service record % does not exist', p_service_record_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Visible to whoever can see the parent core (0083's own combined predicate) may amend
  -- it — but only AS a workspace the caller genuinely belongs to, never an arbitrary
  -- claimed p_authored_by_workspace_id. Both checks, not one: the caller must hold real,
  -- non-support membership in the workspace they claim authored this (0177), and that
  -- workspace must be one of the two the record is actually visible to.
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_authored_by_workspace_id and m.role <> 'support'
  ) or p_authored_by_workspace_id not in (v_performing_ws, v_steward) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.amend_service_record(
    p_amendment_id => p_amendment_id, p_service_record_id => p_service_record_id,
    p_authored_by_workspace_id => p_authored_by_workspace_id, p_field_key => p_field_key,
    p_previous_value => p_previous_value, p_corrected_value => p_corrected_value, p_reason => p_reason,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.amend_service_record_for_caller(uuid, uuid, uuid, text, text, text, text, uuid, uuid, platform.actor_type, text) is
  'Two checks, not one: the caller must hold real, active, non-support membership in the workspace they claim as author (0177), AND that workspace must be one of the two the record''s own combined visibility predicate (0083) already names. Refuses a real member of an unrelated workspace claiming authorship exactly as it refuses a stranger.';

-- No grant/revoke changes — every function's own access posture (0163's own revoke-all-
-- then-delegate-only-through-api.* shape) is untouched.

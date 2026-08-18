-- Epic 11 WP04 — the service record engine contract: create, approve, author an annex,
-- amend, and read.
--
-- event_type CORRECTED TO ADR-0019's OWN FORMAT — FOUND DURING EPIC 15
--
-- ADR-0019 requires `event_type` as `<engine>.<aggregate>.<past-participle>`, enforced by
-- platform.events' own `events_type_format` check (0021). Every call below used a bare
-- PascalCase name, conflating SYSTEM_ARCHITECTURE.md §8.2's own CONCEPTUAL event names
-- with the literal serialized column value — a mistake caught session-wide while building
-- Epic 15's own diagnostic (`implementation/epic-15/COMPLETION.md` §6). Corrected: engine
-- = service_record (§8.2's own section), aggregate = service_record throughout (every one
-- of these four already carries `subject_type => 'service_record'`). `ServiceRecordCreated`
-- -> `service_record.service_record.created`; `WarrantyArising` -> `service_record.
-- service_record.warranty_arising`; `ApprovalRecorded` -> `service_record.service_record.
-- approval_recorded`; `ServiceRecordAmended` -> `service_record.service_record.amended`.
--
-- NO api.* DELEGATE — property.reparent_location()'s PRECEDENT, NOW A FIFTH TIME
--
-- No client caller exists yet — nothing in the current product creates a service record
-- (Marketplace, Epic 12, and Maintenance-driven completion, Epic 10's own named gap,
-- both produce the first real callers later). All ten functions below are granted to
-- klussie_engine_work only.
--
-- write_property_annex() RESOLVES THE CURRENT STEWARD ITSELF — IT DOES NOT TRUST A
-- CALLER-SUPPLIED WORKSPACE ID FOR THE ONE VALUE THIS EPIC MUST GET EXACTLY RIGHT
--
-- 0082's own header explains why the property annex freezes owning_workspace_id at
-- creation rather than following the property live, the way the core does. That freeze
-- has to happen against the REAL current steward at the moment of the call, resolved by
-- this function itself from property.properties.steward_workspace_id via the service
-- record's own property_id — never accepted as a parameter a caller could pass
-- incorrectly (by accident or otherwise) for the single table in this epic where §17
-- names the exact failure mode a wrong value would cause: "a household's private notes
-- to a contractor" reads the wrong direction, but "the wrong steward's private notes to
-- the wrong steward" is the same class of mistake, on the property side instead.
--
-- APPROVAL AND AMENDMENT BOTH GIVE A FRIENDLY ERROR BEFORE THE CORE'S OWN GUARD TRIGGER
-- WOULD RAISE A RAWER ONE
--
-- work.service_records_guard_mutation() (0081) already refuses moving customer_approved
-- from true back to false, and refuses any other column changing at all — this
-- function's own pre-checks exist so a caller sees "already approved" or "does not
-- exist" rather than a bare constraint-violation message, the same layering property.
-- documents_guard_deletion() and its callers already use.
--
-- ONE FUNCTION WRITES THE CORE; THE ANNEXES AND AMENDMENTS ARE SEPARATE FUNCTIONS,
-- MATCHING THE AUTHORSHIP SPLIT §17 ITSELF DRAWS
--
-- There is no single "update service record" entry point. work.create_service_record()
-- is the performing workspace's one and only write to the core's work content.
-- work.record_service_record_approval() is the property side's one narrow write.
-- work.write_performing_annex()/write_property_annex() are each one workspace's own
-- private data, never the other's. Collapsing these into one generic function would
-- reintroduce exactly the "who may write what" ambiguity §17 spends its own opening
-- paragraph refusing to allow.
--
-- p_warranty_event_id IS REQUIRED, NEVER MINTED — EVEN THOUGH IT IS SOMETIMES UNUSED
--
-- create_service_record() may emit a second event, WarrantyArising, conditional on
-- p_warranty_until being set. The first draft of this function minted that second id
-- internally via gen_random_uuid() when the condition was true — the identical mistake
-- Epic 04's own grant_capability() made and had to fix (implementation/epic-04/
-- COMPLETION.md §5.4), caught here before it shipped rather than after. p_warranty_
-- event_id is instead a required parameter on every call, used only when p_warranty_
-- until is not null and otherwise ignored — the caller always knows, in the same call,
-- whether it is setting a warranty date, so supplying an id it may not need costs it
-- nothing and keeps identifier generation entirely in the application (ADR-0022), with
-- no exception anywhere in this migration.

-- =========================================================================
-- THE LOGIC — create

create or replace function work.create_service_record(
  p_service_record_id       uuid,
  p_property_id             uuid,
  p_asset_id                uuid,
  p_location_id             uuid,
  p_performing_workspace_id uuid,
  p_performed_at            timestamptz,
  p_work_performed          text,
  p_agreed_price            numeric,
  p_price_currency          text,
  p_warranty_until          date,
  p_ai_summary              text,
  p_recommendations         text,
  p_content                 jsonb,
  p_event_id                uuid,
  p_warranty_event_id       uuid,
  p_correlation_id          uuid,
  p_actor_type              platform.actor_type,
  p_actor_ref               text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into work.service_records (
    id, property_id, asset_id, location_id, performing_workspace_id,
    performed_at, work_performed, agreed_price, price_currency, warranty_until,
    ai_summary, recommendations, content
  ) values (
    p_service_record_id, p_property_id, p_asset_id, p_location_id, p_performing_workspace_id,
    p_performed_at, p_work_performed, p_agreed_price, p_price_currency, p_warranty_until,
    p_ai_summary, p_recommendations, coalesce(p_content, '{}'::jsonb)
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'service_record.service_record.created',
    p_workspace_id   => p_performing_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'service_record',
    p_subject_id     => p_service_record_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('propertyId', p_property_id, 'performingWorkspaceId', p_performing_workspace_id)
  );

  -- WarrantyArising is conditional and real — "Warranties arising are already core
  -- content with validity periods" (§17) — fired only when this record actually carries
  -- one, in the same transaction, never a second call a caller could forget. Its id is
  -- p_warranty_event_id, supplied on every call whether or not this branch runs — see
  -- this migration's own header for why that parameter is never defaulted or minted.
  if p_warranty_until is not null then
    perform platform.emit_event(
      p_event_id       => p_warranty_event_id,
      p_event_type     => 'service_record.service_record.warranty_arising',
      p_workspace_id   => p_performing_workspace_id,
      p_actor_type     => p_actor_type,
      p_actor_ref      => p_actor_ref,
      p_subject_type   => 'service_record',
      p_subject_id     => p_service_record_id,
      p_correlation_id => p_correlation_id,
      p_payload        => jsonb_build_object('warrantyUntil', p_warranty_until)
    );
  end if;
end;
$$;

comment on function work.create_service_record(uuid, uuid, uuid, uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text) is
  'The performing workspace''s one and only write to a service record''s core content — records are created already complete (§17: "the permanent record of... work performed," past tense), never drafted then finalised. Emits service_record.service_record.created always, service_record.service_record.warranty_arising when warranty_until is set, using the caller-supplied p_warranty_event_id — never minted here, see this migration''s own header.';

-- =========================================================================
-- THE LOGIC — approval

create or replace function work.record_service_record_approval(
  p_service_record_id  uuid,
  p_event_id            uuid,
  p_correlation_id       uuid,
  p_actor_type          platform.actor_type,
  p_actor_ref           text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_already_approved  boolean;
  v_performing_ws     uuid;
begin
  select customer_approved, performing_workspace_id
    into v_already_approved, v_performing_ws
  from work.service_records
  where id = p_service_record_id;

  if v_performing_ws is null then
    raise exception
      'work.record_service_record_approval: service record % does not exist', p_service_record_id
      using errcode = 'invalid_parameter_value';
  end if;

  if v_already_approved then
    raise exception
      'work.record_service_record_approval: service record % is already approved', p_service_record_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update work.service_records
  set customer_approved = true, customer_approved_at = now()
  where id = p_service_record_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'service_record.service_record.approval_recorded',
    p_workspace_id   => v_performing_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'service_record',
    p_subject_id     => p_service_record_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function work.record_service_record_approval(uuid, uuid, uuid, platform.actor_type, text) is
  'The property side''s one narrow write to the core (§17: "the property''s workspace authors its approval"). One-way, not idempotent — refuses if already approved rather than silently succeeding twice, the same posture work.cancel_maintenance_schedule() (Epic 10) already holds for its own one-way transition.';

-- =========================================================================
-- THE LOGIC — annexes, each an upsert on its own unique (service_record_id)

create or replace function work.write_performing_annex(
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
begin
  insert into work.service_record_performing_annexes (
    id, service_record_id, internal_cost, margin, supplier_used, supplier_price,
    scheduling_notes, internal_commentary
  ) values (
    p_annex_id, p_service_record_id, p_internal_cost, p_margin, p_supplier_used, p_supplier_price,
    p_scheduling_notes, p_internal_commentary
  )
  on conflict (service_record_id) do update
  set internal_cost = excluded.internal_cost,
      margin = excluded.margin,
      supplier_used = excluded.supplier_used,
      supplier_price = excluded.supplier_price,
      scheduling_notes = excluded.scheduling_notes,
      internal_commentary = excluded.internal_commentary,
      updated_at = now();
end;
$$;

comment on function work.write_performing_annex(uuid, uuid, numeric, numeric, text, numeric, text, text) is
  'The performing workspace''s own private context — ordinary mutable data (0082''s own header), not amended. p_annex_id is only used on first insert; an update reuses the row''s existing id, matching the "at most one per record" unique constraint (0082).';

create or replace function work.write_property_annex(
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
  v_current_steward uuid;
begin
  select p.steward_workspace_id into v_current_steward
  from work.service_records sr
  join property.properties p on p.id = sr.property_id
  where sr.id = p_service_record_id;

  if v_current_steward is null then
    raise exception
      'work.write_property_annex: service record % does not exist', p_service_record_id
      using errcode = 'invalid_parameter_value';
  end if;

  insert into work.service_record_property_annexes (
    id, service_record_id, owning_workspace_id, annotations, internal_approvals,
    budget_context, private_assessment
  ) values (
    p_annex_id, p_service_record_id, v_current_steward, p_annotations, p_internal_approvals,
    p_budget_context, p_private_assessment
  )
  on conflict (service_record_id) do update
  set annotations = excluded.annotations,
      internal_approvals = excluded.internal_approvals,
      budget_context = excluded.budget_context,
      private_assessment = excluded.private_assessment,
      updated_at = now();
  -- owning_workspace_id is deliberately absent from the update set — see this
  -- migration's own header. The first write freezes it; nothing ever re-resolves it.
end;
$$;

comment on function work.write_property_annex(uuid, uuid, text, text, text, text) is
  'Resolves and freezes the CURRENT steward itself, on first write only — see this migration''s own header for why this is the one value in the whole epic this function does not trust a caller to supply. A later call (an update) never touches owning_workspace_id again, even if the steward has since changed.';

-- =========================================================================
-- THE LOGIC — amend

create or replace function work.amend_service_record(
  p_amendment_id            uuid,
  p_service_record_id       uuid,
  p_authored_by_workspace_id uuid,
  p_field_key               text,
  p_previous_value          text,
  p_corrected_value         text,
  p_reason                  text,
  p_event_id                uuid,
  p_correlation_id          uuid,
  p_actor_type              platform.actor_type,
  p_actor_ref               text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception
      'work.amend_service_record: a reason is required'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into work.service_record_amendments (
    id, service_record_id, authored_by_workspace_id, field_key, previous_value, corrected_value, reason
  ) values (
    p_amendment_id, p_service_record_id, p_authored_by_workspace_id, p_field_key, p_previous_value, p_corrected_value, p_reason
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'service_record.service_record.amended',
    p_workspace_id   => p_authored_by_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'service_record',
    p_subject_id     => p_service_record_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('fieldKey', p_field_key, 'reason', p_reason)
  );
end;
$$;

comment on function work.amend_service_record(uuid, uuid, uuid, text, text, text, text, uuid, uuid, platform.actor_type, text) is
  '§17: "Corrections are amendments carrying their own author, time and reason, appended to the record." Never touches work.service_records itself — the guard trigger (0081) would refuse it anyway.';

-- =========================================================================
-- THE LOGIC — reads

create or replace function work.resolve_service_record(p_service_record_id uuid)
returns table (
  id                      uuid,
  property_id             uuid,
  asset_id                uuid,
  location_id             uuid,
  performing_workspace_id uuid,
  performed_at            timestamptz,
  work_performed          text,
  agreed_price            numeric,
  price_currency          text,
  warranty_until          date,
  customer_approved       boolean,
  customer_approved_at    timestamptz,
  ai_summary              text,
  recommendations         text,
  content                 jsonb,
  created_at              timestamptz
)
language sql
stable
set search_path = ''
as $$
  select sr.id, sr.property_id, sr.asset_id, sr.location_id, sr.performing_workspace_id,
         sr.performed_at, sr.work_performed, sr.agreed_price, sr.price_currency, sr.warranty_until,
         sr.customer_approved, sr.customer_approved_at, sr.ai_summary, sr.recommendations,
         sr.content, sr.created_at
  from work.service_records sr
  where sr.id = p_service_record_id;
$$;

comment on function work.resolve_service_record(uuid) is
  'The shared core, unfiltered — every field here carries the same visibility rule (§13.2: shared, visible to both parties). Neither annex is included; those are separate reads below, each visible to one side only.';

create or replace function work.my_service_records(p_workspace_id uuid)
returns table (id uuid, property_id uuid, performing_workspace_id uuid, performed_at timestamptz, work_performed text)
language sql
stable
set search_path = ''
as $$
  select sr.id, sr.property_id, sr.performing_workspace_id, sr.performed_at, sr.work_performed
  from work.service_records sr
  where sr.performing_workspace_id = p_workspace_id
     or sr.property_id in (
       select p.id from property.properties p where p.steward_workspace_id = p_workspace_id
     );
$$;

comment on function work.my_service_records(uuid) is
  'Every service record one workspace can see, via either path — the same combined predicate 0083''s own RLS policy expresses, restated in plain SQL rather than relied on through RLS (this function is not SECURITY DEFINER-invoked through RLS the way a client read would be).';

create or replace function work.my_performing_annex(p_service_record_id uuid)
returns table (internal_cost numeric, margin numeric, supplier_used text, supplier_price numeric, scheduling_notes text, internal_commentary text, updated_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.internal_cost, a.margin, a.supplier_used, a.supplier_price, a.scheduling_notes, a.internal_commentary, a.updated_at
  from work.service_record_performing_annexes a
  where a.service_record_id = p_service_record_id;
$$;

comment on function work.my_performing_annex(uuid) is
  'The performing annex for one record, if it has been written — never the property annex. Caller supplies the record id; visibility is the caller''s own responsibility (no client caller yet — see this migration''s own header).';

create or replace function work.my_property_annex(p_service_record_id uuid)
returns table (annotations text, internal_approvals text, budget_context text, private_assessment text, owning_workspace_id uuid, updated_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.annotations, a.internal_approvals, a.budget_context, a.private_assessment, a.owning_workspace_id, a.updated_at
  from work.service_record_property_annexes a
  where a.service_record_id = p_service_record_id;
$$;

comment on function work.my_property_annex(uuid) is
  'The property annex for one record, if it has been written — frozen to whoever was steward at the time (0082), never the current one.';

create or replace function work.service_record_history(p_service_record_id uuid)
returns table (id uuid, authored_by_workspace_id uuid, field_key text, previous_value text, corrected_value text, reason text, amended_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select am.id, am.authored_by_workspace_id, am.field_key, am.previous_value, am.corrected_value, am.reason, am.amended_at
  from work.service_record_amendments am
  where am.service_record_id = p_service_record_id
  order by am.amended_at, am.id;
$$;

comment on function work.service_record_history(uuid) is
  '§17: "The current reading of a record is the core plus its amendment chain." Oldest first, occurred_at then id (UUIDv7, time-ordered) breaking any same-timestamp tie, the same shape work.workflow_instance_history() (Epic 09) already uses.';

-- =========================================================================
-- ACCESS

revoke all on function work.create_service_record(uuid, uuid, uuid, uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.record_service_record_approval(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.write_performing_annex(uuid, uuid, numeric, numeric, text, numeric, text, text)
  from public, anon, authenticated, service_role;
revoke all on function work.write_property_annex(uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function work.amend_service_record(uuid, uuid, uuid, text, text, text, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.resolve_service_record(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.my_service_records(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.my_performing_annex(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.my_property_annex(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.service_record_history(uuid)
  from public, anon, authenticated, service_role;

grant execute on function work.create_service_record(uuid, uuid, uuid, uuid, uuid, timestamptz, text, numeric, text, date, text, text, jsonb, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.record_service_record_approval(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.write_performing_annex(uuid, uuid, numeric, numeric, text, numeric, text, text)
  to klussie_engine_work;
grant execute on function work.write_property_annex(uuid, uuid, text, text, text, text)
  to klussie_engine_work;
grant execute on function work.amend_service_record(uuid, uuid, uuid, text, text, text, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.resolve_service_record(uuid)
  to klussie_engine_work;
grant execute on function work.my_service_records(uuid)
  to klussie_engine_work;
grant execute on function work.my_performing_annex(uuid)
  to klussie_engine_work;
grant execute on function work.my_property_annex(uuid)
  to klussie_engine_work;
grant execute on function work.service_record_history(uuid)
  to klussie_engine_work;

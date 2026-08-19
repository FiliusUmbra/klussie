-- Epic 10 WP04 — the maintenance engine contract: create and resolve schedules, create
-- and close obligations, and generate an obligation from a due schedule.
--
-- event_type CORRECTED TO ADR-0019's OWN FORMAT — FOUND DURING EPIC 15
--
-- ADR-0019 requires `event_type` as `<engine>.<aggregate>.<past-participle>`, enforced by
-- platform.events' own `events_type_format` check (0021). Every call below used a bare
-- PascalCase name, conflating SYSTEM_ARCHITECTURE.md §8.1's own CONCEPTUAL event names
-- with the literal serialized column value — a mistake caught session-wide while building
-- Epic 15's own diagnostic (`implementation/epic-15/COMPLETION.md` §6). Corrected: engine
-- = maintenance (§8.1's own section); `ScheduleChanged` -> `maintenance.maintenance_
-- schedule.changed` (both create and cancel emit the one type §8.1 names — the payload's
-- own `action` field distinguishes them, unchanged here); `ObligationCreated` ->
-- `maintenance.maintenance_obligation.created`; `ObligationClosed` -> `maintenance.
-- maintenance_obligation.closed`; `ObligationCancelled` -> `maintenance.maintenance_
-- obligation.cancelled`.
--
-- NO api.* DELEGATE — property.reparent_location()'s OWN PRECEDENT, A THIRD TIME
--
-- No client caller exists yet for this engine, the same posture Epic 09's own contract
-- held for the identical reason (migration 0069's own header). All eight functions below
-- are granted to klussie_engine_work only.
--
-- work.generate_due_obligation() DOES NOT MINT ITS OWN IDS FOR MULTIPLE ROWS, AND THAT
-- IS THE WHOLE REASON IT HANDLES EXACTLY ONE SCHEDULE, ONE OBLIGATION, PER CALL
--
-- A tempting shape for "catch a schedule up" is a single function that loops while
-- next_due_on <= today, minting a fresh id per generated obligation via
-- platform.uuid_v7_at(now()). That function is exactly what 0026's own header rules out:
-- platform.uuid_v7_at() is "For BACKFILLS ONLY (ADR-0022)... executable by no
-- application role, because SUPABASE_ARCHITECTURE.md §3 puts runtime identifier
-- generation in the application." Generating new obligations on an ongoing basis is
-- runtime generation, not a backfill, however deep inside a SECURITY DEFINER function it
-- happens — the identifier still needs to originate from the application, not be minted
-- in the database because doing so was convenient. work.generate_due_obligation()
-- therefore takes p_obligation_id as a required parameter and advances a schedule by
-- exactly one period per call. A schedule several periods behind is caught up by calling
-- this once per missed period — the caller (a future scheduled job, once one exists,
-- or an operator) decides how many obligations to generate and supplies a real
-- identifier for each, never this function.
--
-- NO pg_cron WIRING IN THIS EPIC — A NAMED, DELIBERATE GAP
--
-- pg_cron is real infrastructure (migration 0020) but nothing calls
-- work.generate_due_obligation() automatically. Scheduling its cadence is an operational
-- decision (SUPABASE_ARCHITECTURE.md §12's "not an engine... a shared contract" framing
-- applies just as well to a cron trigger as to the event backbone) belonging to whichever
-- future work actually needs obligations generated unattended — recorded here and in
-- implementation/epic-10/COMPLETION.md, not silently built around.

-- =========================================================================
-- THE LOGIC — schedules

create or replace function work.create_maintenance_schedule(
  p_schedule_id     uuid,
  p_workspace_id    uuid,
  p_asset_id        uuid,
  p_location_id     uuid,
  p_title           text,
  p_description     text,
  p_recurrence      interval,
  p_first_due_on    date,
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
  insert into work.maintenance_schedules
    (id, workspace_id, asset_id, location_id, title, description, recurrence, next_due_on)
  values
    (p_schedule_id, p_workspace_id, p_asset_id, p_location_id, p_title, p_description, p_recurrence, p_first_due_on);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'maintenance.maintenance_schedule.changed',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => coalesce(case when p_asset_id is not null then 'asset' end, 'location'),
    p_subject_id     => coalesce(p_asset_id, p_location_id),
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('scheduleId', p_schedule_id, 'action', 'created', 'nextDueOn', p_first_due_on)
  );
end;
$$;

comment on function work.create_maintenance_schedule(uuid, uuid, uuid, uuid, text, text, interval, date, uuid, uuid, platform.actor_type, text) is
  'Creates a recurring schedule and emits maintenance.maintenance_schedule.changed in the same transaction. p_asset_id/p_location_id: exactly one non-null, enforced by the table (0071).';

create or replace function work.cancel_maintenance_schedule(
  p_schedule_id     uuid,
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
  v_workspace_id  uuid;
  v_asset_id      uuid;
  v_location_id   uuid;
begin
  update work.maintenance_schedules
  set active = false, cancelled_at = now()
  where id = p_schedule_id and active
  returning workspace_id, asset_id, location_id into v_workspace_id, v_asset_id, v_location_id;

  if v_workspace_id is null then
    raise exception
      'work.cancel_maintenance_schedule: schedule % does not exist or is already cancelled', p_schedule_id
      using errcode = 'invalid_parameter_value';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'maintenance.maintenance_schedule.changed',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => coalesce(case when v_asset_id is not null then 'asset' end, 'location'),
    p_subject_id     => coalesce(v_asset_id, v_location_id),
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('scheduleId', p_schedule_id, 'action', 'cancelled')
  );
end;
$$;

comment on function work.cancel_maintenance_schedule(uuid, uuid, uuid, platform.actor_type, text) is
  'Stops a schedule from generating further obligations without deleting it (§16). Raises if already cancelled — cancellation is a one-way transition, not idempotent, so a caller retrying blind does not silently succeed twice.';

-- =========================================================================
-- THE LOGIC — obligations

create or replace function work.create_maintenance_obligation(
  p_obligation_id   uuid,
  p_workspace_id    uuid,
  p_asset_id        uuid,
  p_location_id     uuid,
  p_schedule_id     uuid,
  p_title           text,
  p_description     text,
  p_source          text,
  p_due_on          date,
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
  insert into work.maintenance_obligations
    (id, workspace_id, asset_id, location_id, schedule_id, title, description, source, due_on)
  values
    (p_obligation_id, p_workspace_id, p_asset_id, p_location_id, p_schedule_id, p_title, p_description, p_source, p_due_on);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'maintenance.maintenance_obligation.created',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => coalesce(case when p_asset_id is not null then 'asset' end, 'location'),
    p_subject_id     => coalesce(p_asset_id, p_location_id),
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('obligationId', p_obligation_id, 'source', p_source, 'dueOn', p_due_on)
  );
end;
$$;

comment on function work.create_maintenance_obligation(uuid, uuid, uuid, uuid, uuid, text, text, text, date, uuid, uuid, platform.actor_type, text) is
  'The one write path for a new obligation, regardless of source (''manual'', ''compliance'' and ''prediction'' call this directly; ''schedule'' reaches it through work.generate_due_obligation() below). Table constraints (0072) enforce schedule_id iff source = ''schedule'' and the one-subject rule.';

create or replace function work.complete_maintenance_obligation(
  p_obligation_id   uuid,
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
  v_workspace_id  uuid;
  v_asset_id      uuid;
  v_location_id   uuid;
begin
  update work.maintenance_obligations
  set status = 'completed', completed_at = now()
  where id = p_obligation_id and status = 'open'
  returning workspace_id, asset_id, location_id into v_workspace_id, v_asset_id, v_location_id;

  if v_workspace_id is null then
    raise exception
      'work.complete_maintenance_obligation: obligation % does not exist or is not open', p_obligation_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'maintenance.maintenance_obligation.closed',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => coalesce(case when v_asset_id is not null then 'asset' end, 'location'),
    p_subject_id     => coalesce(v_asset_id, v_location_id),
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('obligationId', p_obligation_id, 'outcome', 'completed')
  );
end;
$$;

comment on function work.complete_maintenance_obligation(uuid, uuid, uuid, platform.actor_type, text) is
  'Closes an obligation as done. §8.1 names ServiceRecordCompleted as the event that will eventually drive this automatically — that consumer does not exist yet (Epic 11), so this is a direct call for now, the same named gap 0072''s own header states for "produces workflow instances."';

create or replace function work.cancel_maintenance_obligation(
  p_obligation_id   uuid,
  p_reason          text,
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
  v_workspace_id  uuid;
  v_asset_id      uuid;
  v_location_id   uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception
      'work.cancel_maintenance_obligation: a cancellation reason is required'
      using errcode = 'invalid_parameter_value';
  end if;

  update work.maintenance_obligations
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
  where id = p_obligation_id and status = 'open'
  returning workspace_id, asset_id, location_id into v_workspace_id, v_asset_id, v_location_id;

  if v_workspace_id is null then
    raise exception
      'work.cancel_maintenance_obligation: obligation % does not exist or is not open', p_obligation_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'maintenance.maintenance_obligation.cancelled',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => coalesce(case when v_asset_id is not null then 'asset' end, 'location'),
    p_subject_id     => coalesce(v_asset_id, v_location_id),
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('obligationId', p_obligation_id, 'outcome', 'cancelled', 'reason', p_reason)
  );
end;
$$;

comment on function work.cancel_maintenance_obligation(uuid, text, uuid, uuid, platform.actor_type, text) is
  '§16: "Cancelled ones retain their cancellation and its reason." The reason is required here, at the call boundary, in addition to the table''s own not-null-when-cancelled check (0072) — a caller gets a clear error before the insert, not a bare constraint violation.';

-- =========================================================================
-- THE LOGIC — schedule-driven generation, one obligation per call (see header)

create or replace function work.generate_due_obligation(
  p_schedule_id     uuid,
  p_obligation_id   uuid,
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
  v_workspace_id  uuid;
  v_asset_id      uuid;
  v_location_id   uuid;
  v_title         text;
  v_description   text;
  v_recurrence    interval;
  v_next_due_on   date;
begin
  select workspace_id, asset_id, location_id, title, description, recurrence, next_due_on
    into v_workspace_id, v_asset_id, v_location_id, v_title, v_description, v_recurrence, v_next_due_on
  from work.maintenance_schedules
  where id = p_schedule_id and active
  for update;

  if v_workspace_id is null then
    raise exception
      'work.generate_due_obligation: schedule % does not exist or is not active', p_schedule_id
      using errcode = 'invalid_parameter_value';
  end if;

  if v_next_due_on > current_date then
    raise exception
      'work.generate_due_obligation: schedule % is not due until %', p_schedule_id, v_next_due_on
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform work.create_maintenance_obligation(
    p_obligation_id   => p_obligation_id,
    p_workspace_id    => v_workspace_id,
    p_asset_id        => v_asset_id,
    p_location_id     => v_location_id,
    p_schedule_id     => p_schedule_id,
    p_title           => v_title,
    p_description     => v_description,
    p_source          => 'schedule',
    p_due_on          => v_next_due_on,
    p_event_id        => p_event_id,
    p_correlation_id  => p_correlation_id,
    p_actor_type      => p_actor_type,
    p_actor_ref       => p_actor_ref
  );

  update work.maintenance_schedules
  set next_due_on = v_next_due_on + v_recurrence
  where id = p_schedule_id;
end;
$$;

comment on function work.generate_due_obligation(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Generates exactly one obligation from one due schedule and advances next_due_on by one recurrence period — never a loop minting several ids itself. See this migration''s own header for why. A schedule several periods behind is caught up by calling this once per missed period, each with its own application-generated obligation id.';

-- =========================================================================
-- THE LOGIC — reads

create or replace function work.my_maintenance_schedules(p_workspace_id uuid)
returns table (
  id            uuid,
  asset_id      uuid,
  location_id   uuid,
  title         text,
  description   text,
  recurrence    interval,
  next_due_on   date,
  active        boolean
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.asset_id, s.location_id, s.title, s.description, s.recurrence, s.next_due_on, s.active
  from work.maintenance_schedules s
  where s.workspace_id = p_workspace_id;
$$;

comment on function work.my_maintenance_schedules(uuid) is
  'Every schedule, active or cancelled, owned by one workspace. No client caller yet — see this migration''s own header.';

create or replace function work.my_maintenance_obligations(p_workspace_id uuid)
returns table (
  id             uuid,
  asset_id       uuid,
  location_id    uuid,
  schedule_id    uuid,
  title          text,
  description    text,
  source         text,
  due_on         date,
  status         text,
  is_overdue     boolean,
  completed_at   timestamptz,
  cancelled_at   timestamptz
)
language sql
stable
set search_path = ''
as $$
  select o.id, o.asset_id, o.location_id, o.schedule_id, o.title, o.description, o.source, o.due_on, o.status,
         (o.status = 'open' and o.due_on < current_date) as is_overdue,
         o.completed_at, o.cancelled_at
  from work.maintenance_obligations o
  where o.workspace_id = p_workspace_id;
$$;

comment on function work.my_maintenance_obligations(uuid) is
  'Every obligation owned by one workspace. is_overdue is computed here, at read time, from due_on and status — see 0072''s own header for why it is not a stored column.';

-- =========================================================================
-- ACCESS

revoke all on function work.create_maintenance_schedule(uuid, uuid, uuid, uuid, text, text, interval, date, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.cancel_maintenance_schedule(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.create_maintenance_obligation(uuid, uuid, uuid, uuid, uuid, text, text, text, date, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.complete_maintenance_obligation(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.cancel_maintenance_obligation(uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.generate_due_obligation(uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.my_maintenance_schedules(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.my_maintenance_obligations(uuid)
  from public, anon, authenticated, service_role;

grant execute on function work.create_maintenance_schedule(uuid, uuid, uuid, uuid, text, text, interval, date, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.cancel_maintenance_schedule(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.create_maintenance_obligation(uuid, uuid, uuid, uuid, uuid, text, text, text, date, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.complete_maintenance_obligation(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.cancel_maintenance_obligation(uuid, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.generate_due_obligation(uuid, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.my_maintenance_schedules(uuid)
  to klussie_engine_work;
grant execute on function work.my_maintenance_obligations(uuid)
  to klussie_engine_work;

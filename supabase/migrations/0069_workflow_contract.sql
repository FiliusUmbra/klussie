-- Epic 09 WP04 — the workflow engine contract: start an instance, transition it, and
-- read both back.
--
-- event_type CORRECTED TO ADR-0019's OWN FORMAT — FOUND DURING EPIC 15
--
-- ADR-0019 requires `event_type` as `<engine>.<aggregate>.<past-participle>`, enforced by
-- platform.events' own `events_type_format` check (0021). The first draft of both calls
-- below used a bare PascalCase name, conflating SYSTEM_ARCHITECTURE.md §8.3's own
-- CONCEPTUAL event names with the literal serialized column value — a mistake caught
-- session-wide while building Epic 15's own diagnostic (`implementation/epic-15/
-- COMPLETION.md` §6). Two further corrections beyond pure reformatting: §8.3's own frozen
-- list names these events `WorkflowStarted`/`WorkflowTransitioned`, not `WorkflowInstance
-- Started`/`WorkflowInstanceTransitioned` — the first draft added a word the domain model
-- never used. The dotted form keeps `workflow_instance` as its aggregate segment anyway
-- (matching `work.workflow_instances`, the real table these rows write to, and
-- distinguishing them from `work.workflow_definitions`' own not-yet-built lifecycle
-- events) — `workflow.workflow_instance.started` and
-- `workflow.workflow_instance.transitioned`.
--
-- THE FIRST ENGINE IN THIS ROADMAP WITH NO PREDECESSOR DATA TO MIRROR — SO ITS WRITE
-- PATH IS REAL, NOT A LEGACY-TRIGGER SHADOW
--
-- Every write contract before this one (property.reparent_location, migration 0047, its
-- nearest neighbour) exists ahead of a real client caller. This one is no different —
-- see 0066's header for why nothing in this codebase can be a real subject yet — but
-- unlike a read contract sitting in front of already-migrated data, work.start_workflow_
-- instance() and work.transition_workflow_instance() are the ONLY way any instance or
-- transition row can ever come to exist. There is no backfill or dual-write trigger
-- upstream of them, because there is no legacy table to write instances FROM.
--
-- IDENTIFIERS ARE ALL REQUIRED PARAMETERS, NONE MINTED HERE — THE SAME DISCIPLINE
-- property.reparent_location AND platform.emit_event ALREADY HOLD
--
-- Three application-generated ids per call in the worst case (the instance, its opening
-- transition, and the event) — not simplified to fewer, because ADR-0022 puts identifier
-- generation in the application and platform.emit_event() already refuses to default
-- p_event_id for the identical reason. A function that minted its own would silently
-- create a second convention the moment a real caller needed to correlate its own
-- generated id with what actually got written.
--
-- NO api.* DELEGATE FOR ANY OF THE FOUR FUNCTIONS BELOW — THE SAME RESTRAINT
-- property.reparent_location HELD, NOT A DIFFERENT ONE
--
-- "No real caller exists yet — event identifiers are required parameters... granted to
-- the owning role now... rather than withheld" is 0047's own reasoning for skipping a
-- client-facing wrapper while still shipping a real, callable function. Applied
-- identically here: all four functions below are granted to klussie_engine_work only.
-- Whichever future epic gives this engine its first real subject (most likely Epic 12,
-- pinning a marketplace engagement to a workflow instance) decides the permission check
-- its own caller needs before reaching these — the same responsibility split 0047's own
-- header already states for reparent_location, and property.document_shares' own "no
-- mutation function yet" restraint (Epic 08) held for the identical reason.
--
-- RESOLVING "THE LATEST DEFINITION" — ONE SIMPLIFICATION, STATED
--
-- work.start_workflow_instance() resolves definition_key to its highest-versioned,
-- non-deprecated row. Two published versions active at once with genuinely ambiguous
-- precedence isn't a case this engine's own first definition (WP 09.05) produces — the
-- simplification is recorded here rather than building version-selection policy no
-- definition yet needs.

-- =========================================================================
-- THE LOGIC — work.start_workflow_instance()

create or replace function work.start_workflow_instance(
  p_instance_id     uuid,
  p_transition_id   uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_workspace_id    uuid,
  p_definition_key  text,
  p_subject_type    text,
  p_subject_id      uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text,
  p_payload         jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_definition_id  uuid;
  v_to_stage       text;
  v_event_key      text;
begin
  select id into v_definition_id
  from work.workflow_definitions
  where definition_key = p_definition_key
    and deprecated_at is null
  order by version desc
  limit 1;

  if v_definition_id is null then
    raise exception
      'work.start_workflow_instance: no published, non-deprecated definition for key %', p_definition_key
      using errcode = 'invalid_parameter_value';
  end if;

  select to_stage, event_key into v_to_stage, v_event_key
  from work.workflow_transition_rules
  where definition_id = v_definition_id
    and from_stage is null
  limit 1;

  if v_to_stage is null then
    raise exception
      'work.start_workflow_instance: definition % has no start rule (a from_stage-null row)', p_definition_key
      using errcode = 'data_exception';
  end if;

  insert into work.workflow_instances
    (id, workspace_id, definition_id, subject_type, subject_id, current_stage, started_at)
  values
    (p_instance_id, p_workspace_id, v_definition_id, p_subject_type, p_subject_id, v_to_stage, now());

  insert into work.workflow_transitions
    (id, instance_id, definition_id, from_stage, to_stage, event_key, actor_type, actor_ref, payload, occurred_at)
  values
    (p_transition_id, p_instance_id, v_definition_id, null, v_to_stage, v_event_key, p_actor_type, p_actor_ref, p_payload, now());

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'workflow.workflow_instance.started',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => p_subject_type,
    p_subject_id     => p_subject_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object(
                           'instanceId', p_instance_id,
                           'definitionId', v_definition_id,
                           'stage', v_to_stage
                         )
  );
end;
$$;

comment on function work.start_workflow_instance(uuid, uuid, uuid, uuid, uuid, text, text, uuid, platform.actor_type, text, jsonb) is
  'Pins a new instance to definition_key''s latest published, non-deprecated version (§18: "References the exact definition version it started under, permanently"), records the opening transition, and emits workflow.workflow_instance.started in the same transaction as both writes. No client caller yet — see this migration''s own header.';

-- =========================================================================
-- THE LOGIC — work.transition_workflow_instance()

create or replace function work.transition_workflow_instance(
  p_transition_id   uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_instance_id     uuid,
  p_event_key       text,
  p_actor_type      platform.actor_type,
  p_actor_ref       text,
  p_payload         jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_definition_id  uuid;
  v_current_stage  text;
  v_ended_at       timestamptz;
  v_workspace_id   uuid;
  v_subject_type   text;
  v_subject_id     uuid;
  v_to_stage       text;
  v_is_terminal    boolean;
begin
  select definition_id, current_stage, ended_at, workspace_id, subject_type, subject_id
    into v_definition_id, v_current_stage, v_ended_at, v_workspace_id, v_subject_type, v_subject_id
  from work.workflow_instances
  where id = p_instance_id
  for update;

  if v_definition_id is null then
    raise exception
      'work.transition_workflow_instance: instance % does not exist', p_instance_id
      using errcode = 'invalid_parameter_value';
  end if;

  if v_ended_at is not null then
    raise exception
      'work.transition_workflow_instance: instance % has already ended', p_instance_id
      using
        hint = 'A terminal stage has no outgoing transition rule, by construction — this instance is done.',
        errcode = 'object_not_in_prerequisite_state';
  end if;

  -- THE DISTINGUISHING TEST, ENFORCED HERE: an event this definition did not name from
  -- this exact stage is refused, not guessed at or silently ignored. Conflict 3's own
  -- resolution — "does this trigger make a decision, or refuse an impossibility?" — this
  -- is the refusal.
  select to_stage into v_to_stage
  from work.workflow_transition_rules
  where definition_id = v_definition_id
    and from_stage = v_current_stage
    and event_key = p_event_key;

  if v_to_stage is null then
    raise exception
      'work.transition_workflow_instance: % from % is not permitted by definition %', p_event_key, v_current_stage, v_definition_id
      using
        hint = 'work.workflow_transition_rules has no row for this (stage, event) pair.',
        errcode = 'object_not_in_prerequisite_state';
  end if;

  select is_terminal into v_is_terminal
  from work.workflow_stages
  where definition_id = v_definition_id
    and stage_key = v_to_stage;

  insert into work.workflow_transitions
    (id, instance_id, definition_id, from_stage, to_stage, event_key, actor_type, actor_ref, payload, occurred_at)
  values
    (p_transition_id, p_instance_id, v_definition_id, v_current_stage, v_to_stage, p_event_key, p_actor_type, p_actor_ref, p_payload, now());

  update work.workflow_instances
  set current_stage = v_to_stage,
      ended_at = case when v_is_terminal then now() else null end
  where id = p_instance_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'workflow.workflow_instance.transitioned',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => v_subject_type,
    p_subject_id     => v_subject_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object(
                           'instanceId', p_instance_id,
                           'fromStage', v_current_stage,
                           'toStage', v_to_stage,
                           'eventKey', p_event_key
                         )
  );
end;
$$;

comment on function work.transition_workflow_instance(uuid, uuid, uuid, uuid, text, platform.actor_type, text, jsonb) is
  'Applies exactly one workflow_transition_rules-permitted event to an open instance: appends the transition, updates the maintained current_stage (setting ended_at if the target stage is terminal), and emits workflow.workflow_instance.transitioned — all in one transaction. Raises rather than guessing when the (current_stage, event_key) pair names no rule, per Conflict 3''s own distinguishing test.';

-- =========================================================================
-- THE LOGIC — reads

create or replace function work.my_workflow_instances(p_workspace_id uuid)
returns table (
  id             uuid,
  definition_id  uuid,
  subject_type   text,
  subject_id     uuid,
  current_stage  text,
  started_at     timestamptz,
  ended_at       timestamptz
)
language sql
stable
set search_path = ''
as $$
  select i.id, i.definition_id, i.subject_type, i.subject_id, i.current_stage, i.started_at, i.ended_at
  from work.workflow_instances i
  where i.workspace_id = p_workspace_id;
$$;

comment on function work.my_workflow_instances(uuid) is
  'Every workflow instance owned by one workspace. No client caller yet — see this migration''s own header.';

create or replace function work.resolve_workflow_instance(p_instance_id uuid)
returns table (
  id             uuid,
  workspace_id   uuid,
  definition_id  uuid,
  subject_type   text,
  subject_id     uuid,
  current_stage  text,
  started_at     timestamptz,
  ended_at       timestamptz
)
language sql
stable
set search_path = ''
as $$
  select i.id, i.workspace_id, i.definition_id, i.subject_type, i.subject_id, i.current_stage, i.started_at, i.ended_at
  from work.workflow_instances i
  where i.id = p_instance_id;
$$;

comment on function work.resolve_workflow_instance(uuid) is
  'One instance''s current state. Its full transition history is work.workflow_instance_history() below, kept as a separate function rather than an embedded array — the same "one row, one concern" shape every other resolve_* function in this schema holds.';

create or replace function work.workflow_instance_history(p_instance_id uuid)
returns table (
  id           uuid,
  from_stage   text,
  to_stage     text,
  event_key    text,
  actor_type   platform.actor_type,
  actor_ref    text,
  payload      jsonb,
  occurred_at  timestamptz
)
language sql
stable
set search_path = ''
as $$
  select t.id, t.from_stage, t.to_stage, t.event_key, t.actor_type, t.actor_ref, t.payload, t.occurred_at
  from work.workflow_transitions t
  where t.instance_id = p_instance_id
  order by t.occurred_at, t.id;
$$;

comment on function work.workflow_instance_history(uuid) is
  'One instance''s full transition log, oldest first — §18: "An instance''s transition log is append-only and is the truth." occurred_at then id (UUIDv7, time-ordered) breaks any same-timestamp tie deterministically.';

-- =========================================================================
-- ACCESS
--
-- All four functions: the workflow engine's own contract for its own aggregates, granted
-- to the owning role now even though no real caller exists yet — property.reparent_
-- location's own precedent (migration 0047), not property.my_documents' (that one has a
-- real near-term caller and so gets an api.* delegate; this engine does not, yet).

revoke all on function work.start_workflow_instance(uuid, uuid, uuid, uuid, uuid, text, text, uuid, platform.actor_type, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function work.transition_workflow_instance(uuid, uuid, uuid, uuid, text, platform.actor_type, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function work.my_workflow_instances(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.resolve_workflow_instance(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.workflow_instance_history(uuid)
  from public, anon, authenticated, service_role;

grant execute on function work.start_workflow_instance(uuid, uuid, uuid, uuid, uuid, text, text, uuid, platform.actor_type, text, jsonb)
  to klussie_engine_work;
grant execute on function work.transition_workflow_instance(uuid, uuid, uuid, uuid, text, platform.actor_type, text, jsonb)
  to klussie_engine_work;
grant execute on function work.my_workflow_instances(uuid)
  to klussie_engine_work;
grant execute on function work.resolve_workflow_instance(uuid)
  to klussie_engine_work;
grant execute on function work.workflow_instance_history(uuid)
  to klussie_engine_work;

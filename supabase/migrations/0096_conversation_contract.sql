-- Epic 13 WP06 — the conversation engine contract: open, manage participation, send,
-- translate, read, close.
--
-- event_type CORRECTED TO ADR-0019's OWN FORMAT — FOUND DURING EPIC 15
--
-- ADR-0019 requires `event_type` as `<engine>.<aggregate>.<past-participle>`, enforced by
-- platform.events' own `events_type_format` check (0021). Every call below used a bare
-- PascalCase name, conflating SYSTEM_ARCHITECTURE.md §8.5's own CONCEPTUAL event names
-- with the literal serialized column value — a mistake caught session-wide while building
-- Epic 15's own diagnostic (`implementation/epic-15/COMPLETION.md` §6). Corrected: engine
-- = conversation (§8.5's own section); `ConversationOpened`/`ConversationClosed` ->
-- `conversation.conversation.opened`/`.closed` (matching `subject_type => 'conversation'`);
-- `ParticipantAdded`/`ParticipantRemoved` -> `conversation.conversation_participant.
-- added`/`.removed` — `work.conversation_participants` is the real table, "participant"
-- alone would leave the aggregate ambiguous; `MessageSent`/`MessageTranslated` ->
-- `conversation.message.sent`/`.translated` (matching `subject_type => 'message'`).
--
-- NO api.* DELEGATE — property.reparent_location()'s PRECEDENT, NOW A SEVENTH TIME
--
-- No client caller exists yet — this epic does not switch the live messaging surface
-- (the same restraint every engine epic has held since Epic 09). All eleven functions below
-- are granted to klussie_engine_work only.
--
-- add_participant() REACTIVATES ON CONFLICT RATHER THAN INSERTING A SECOND ROW
--
-- work.conversation_participants has a real unique constraint on (conversation_id,
-- person_ref) (migration 0092) — a removed-then-re-added participant updates the same
-- row (clearing left_at), never accumulates a second one. joined_at is deliberately left
-- untouched on reactivation — it answers "when did this person first join," not "when
-- were they last active."
--
-- work.resolve_conversation_home_workspace() EXISTS BECAUSE platform.events.workspace_id
-- IS NOT NULL AND IS THE TABLE'S OWN PARTITION KEY
--
-- close_conversation() has no acting-workspace parameter the way add_participant()/
-- send_message() do — the first draft passed p_workspace_id => null to platform.
-- emit_event(), which would have failed outright: migration 0021 declares platform.
-- events.workspace_id `not null`, and it is the table's own hash-partition key,
-- checked before this shipped rather than discovered at runtime. Three of the five real
-- subjects (asset, maintenance obligation, property) carry no workspace column of their
-- own — this helper resolves each subject type to its real owning workspace (asset and
-- property both resolve through property.properties.steward_workspace_id, the current
-- steward; maintenance obligations and workspace-subject conversations already carry
-- one directly; engagement resolves to its own requesting_workspace_id, the same "home"
-- reasoning work.service_records gives the property side).
--
-- mark_conversation_read() EMITS NOTHING — READ STATE IS NOT A PRODUCED EVENT
--
-- SYSTEM_ARCHITECTURE.md §8.5's own produced-event list has no "message read" event, and
-- work.conversation_participants.last_read_at (0092) is deliberately a private fact
-- about one participant's own view of a thread, not a fact the platform broadcasts.

-- =========================================================================
-- THE LOGIC — resolving a real workspace from any of the five subjects

create or replace function work.resolve_conversation_home_workspace(p_conversation_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_workspace_id  uuid;
begin
  select
    coalesce(
      e.requesting_workspace_id,
      pa_prop.steward_workspace_id,
      mo.workspace_id,
      p_prop.steward_workspace_id,
      c.workspace_id
    )
  into v_workspace_id
  from work.conversations c
  left join work.engagements e on e.id = c.engagement_id
  left join property.assets pa on pa.id = c.asset_id
  left join property.properties pa_prop on pa_prop.id = pa.property_id
  left join work.maintenance_obligations mo on mo.id = c.maintenance_obligation_id
  left join property.properties p_prop on p_prop.id = c.property_id
  where c.id = p_conversation_id;

  return v_workspace_id;
end;
$$;

comment on function work.resolve_conversation_home_workspace(uuid) is
  'Resolves any of the five real subjects (0091) to a real owning workspace — see this migration''s own header for why platform.events.workspace_id being not null (and the table''s own partition key) makes this a real requirement, not a convenience.';

-- =========================================================================
-- THE LOGIC — open

create or replace function work.open_conversation(
  p_conversation_id            uuid,
  p_engagement_id              uuid,
  p_asset_id                   uuid,
  p_maintenance_obligation_id  uuid,
  p_property_id                uuid,
  p_workspace_id               uuid,
  p_event_id                   uuid,
  p_correlation_id             uuid,
  p_actor_type                 platform.actor_type,
  p_actor_ref                  text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_subject_type   text;
  v_subject_id     uuid;
  v_home_workspace uuid;
begin
  insert into work.conversations (
    id, engagement_id, asset_id, maintenance_obligation_id, property_id, workspace_id
  ) values (
    p_conversation_id, p_engagement_id, p_asset_id, p_maintenance_obligation_id, p_property_id, p_workspace_id
  );

  v_subject_type := case
    when p_engagement_id is not null then 'engagement'
    when p_asset_id is not null then 'asset'
    when p_maintenance_obligation_id is not null then 'maintenance_obligation'
    when p_property_id is not null then 'property'
    else 'workspace'
  end;
  v_subject_id := coalesce(p_engagement_id, p_asset_id, p_maintenance_obligation_id, p_property_id, p_workspace_id);

  -- The event's own workspace_id must be a REAL workspace — never the subject's own id,
  -- which for asset/maintenance_obligation/property is a different kind of thing
  -- entirely. Resolved via the same helper close_conversation() below uses, now that the
  -- row above exists to resolve from. The first draft of this function used
  -- coalesce(p_workspace_id, v_subject_id) here, which would have silently recorded an
  -- asset or property id as if it were a workspace id — caught before shipping, the
  -- identical class of mistake this migration's own header explains for
  -- close_conversation().
  v_home_workspace := work.resolve_conversation_home_workspace(p_conversation_id);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'conversation.conversation.opened',
    p_workspace_id   => v_home_workspace,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'conversation',
    p_subject_id     => p_conversation_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('boundToType', v_subject_type, 'boundToId', v_subject_id)
  );
end;
$$;

comment on function work.open_conversation(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Opens a conversation on exactly one of the five real subjects (§15) — the table''s own check constraint (0091) enforces exactly one of the five parameters is non-null.';

-- =========================================================================
-- THE LOGIC — participation

create or replace function work.add_participant(
  p_participant_id   uuid,
  p_conversation_id   uuid,
  p_person_ref        uuid,
  p_workspace_id       uuid,
  p_event_id           uuid,
  p_correlation_id     uuid,
  p_actor_type         platform.actor_type,
  p_actor_ref          text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into work.conversation_participants (id, conversation_id, person_ref, workspace_id)
  values (p_participant_id, p_conversation_id, p_person_ref, p_workspace_id)
  on conflict (conversation_id, person_ref) do update
  set left_at = null, workspace_id = excluded.workspace_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'conversation.conversation_participant.added',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'conversation',
    p_subject_id     => p_conversation_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('personRef', p_person_ref)
  );
end;
$$;

comment on function work.add_participant(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Adds a participant, or reactivates one who previously left (on conflict, clearing left_at) — never a second row, see this migration''s own header.';

create or replace function work.remove_participant(
  p_conversation_id  uuid,
  p_person_ref        uuid,
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
  v_workspace_id  uuid;
begin
  update work.conversation_participants
  set left_at = now()
  where conversation_id = p_conversation_id and person_ref = p_person_ref and left_at is null
  returning workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception
      'work.remove_participant: % is not an active participant of conversation %', p_person_ref, p_conversation_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'conversation.conversation_participant.removed',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'conversation',
    p_subject_id     => p_conversation_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('personRef', p_person_ref)
  );
end;
$$;

comment on function work.remove_participant(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Ends one participant''s access going forward (§20) — their prior messages remain, unaffected, per the guard triggers in 0091/0093. Refuses if not currently an active participant.';

-- =========================================================================
-- THE LOGIC — messaging

create or replace function work.send_message(
  p_message_id           uuid,
  p_conversation_id       uuid,
  p_sender_person_ref      uuid,
  p_sender_workspace_id     uuid,
  p_body                    text,
  p_original_locale         text,
  p_reference_type          text,
  p_reference_id            uuid,
  p_event_id                uuid,
  p_correlation_id           uuid,
  p_actor_type               platform.actor_type,
  p_actor_ref                text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into work.messages (
    id, conversation_id, sender_person_ref, sender_workspace_id, body, original_locale,
    reference_type, reference_id
  ) values (
    p_message_id, p_conversation_id, p_sender_person_ref, p_sender_workspace_id, p_body, p_original_locale,
    p_reference_type, p_reference_id
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'conversation.message.sent',
    p_workspace_id   => p_sender_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'conversation',
    p_subject_id     => p_conversation_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('messageId', p_message_id, 'referenceType', p_reference_type)
  );
end;
$$;

comment on function work.send_message(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) is
  'p_reference_type/p_reference_id are both null for an ordinary message — see 0093''s own header for the structured-moment shape when they are not.';

create or replace function work.save_message_translation(
  p_message_id  uuid,
  p_locale      text,
  p_text        text,
  p_event_id     uuid,
  p_correlation_id uuid,
  p_actor_type    platform.actor_type,
  p_actor_ref     text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_conversation_id  uuid;
  v_workspace_id      uuid;
begin
  update work.messages
  set translations = translations || jsonb_build_object(p_locale, p_text)
  where id = p_message_id
  returning conversation_id into v_conversation_id;

  if v_conversation_id is null then
    raise exception
      'work.save_message_translation: message % does not exist', p_message_id
      using errcode = 'invalid_parameter_value';
  end if;

  select sender_workspace_id into v_workspace_id from work.messages where id = p_message_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'conversation.message.translated',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'message',
    p_subject_id     => p_message_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('locale', p_locale)
  );
end;
$$;

comment on function work.save_message_translation(uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'Read-modify-write into the translations jsonb column, matching legacy saveMessageTranslation()''s own shape (src/lib/messages.js) exactly — lazy, per-locale, on-demand. The guard trigger (0093) permits this column alone to change.';

create or replace function work.mark_conversation_read(
  p_conversation_id  uuid,
  p_person_ref        uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update work.conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id and person_ref = p_person_ref and left_at is null;
end;
$$;

comment on function work.mark_conversation_read(uuid, uuid) is
  'No event emitted — read state is a private fact, not a produced event (§8.5''s own list has none). See this migration''s own header.';

create or replace function work.close_conversation(
  p_conversation_id  uuid,
  p_event_id           uuid,
  p_correlation_id      uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref            text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_already_closed  boolean;
  v_workspace_id     uuid;
begin
  select closed_at is not null into v_already_closed
  from work.conversations where id = p_conversation_id;

  if v_already_closed is null then
    raise exception
      'work.close_conversation: conversation % does not exist', p_conversation_id
      using errcode = 'invalid_parameter_value';
  end if;

  if v_already_closed then
    raise exception
      'work.close_conversation: conversation % is already closed', p_conversation_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  v_workspace_id := work.resolve_conversation_home_workspace(p_conversation_id);

  update work.conversations set closed_at = now() where id = p_conversation_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'conversation.conversation.closed',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'conversation',
    p_subject_id     => p_conversation_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function work.close_conversation(uuid, uuid, uuid, platform.actor_type, text) is
  'One-way, not idempotent — refuses if already closed, matching work.record_service_record_approval()''s own posture (Epic 11). p_workspace_id is null in the emitted event: a conversation may be bound to a property or an asset with no single owning workspace column of its own (0091) — a future consumer resolves the real workspace through the subject, the same indirection this schema already accepts for property.assets'' own workspace-less shape.';

-- =========================================================================
-- THE LOGIC — reads

create or replace function work.my_conversations(p_person_ref uuid)
returns table (id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid, workspace_id uuid, closed_at timestamptz, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select c.id, c.engagement_id, c.asset_id, c.maintenance_obligation_id, c.property_id, c.workspace_id, c.closed_at, c.created_at
  from work.conversations c
  join work.conversation_participants cp on cp.conversation_id = c.id
  where cp.person_ref = p_person_ref and cp.left_at is null;
$$;

create or replace function work.conversation_messages(p_conversation_id uuid)
returns table (id uuid, sender_person_ref uuid, sender_workspace_id uuid, body text, original_locale text, translations jsonb, reference_type text, reference_id uuid, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select m.id, m.sender_person_ref, m.sender_workspace_id, m.body, m.original_locale, m.translations, m.reference_type, m.reference_id, m.created_at
  from work.messages m
  where m.conversation_id = p_conversation_id
  order by m.created_at, m.id;
$$;

create or replace function work.conversation_roster(p_conversation_id uuid)
returns table (person_ref uuid, workspace_id uuid, joined_at timestamptz, left_at timestamptz, last_read_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select cp.person_ref, cp.workspace_id, cp.joined_at, cp.left_at, cp.last_read_at
  from work.conversation_participants cp
  where cp.conversation_id = p_conversation_id;
$$;

-- =========================================================================
-- ACCESS

revoke all on function work.resolve_conversation_home_workspace(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.open_conversation(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.add_participant(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.remove_participant(uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.send_message(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.save_message_translation(uuid, text, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.mark_conversation_read(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.close_conversation(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.my_conversations(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.conversation_messages(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.conversation_roster(uuid)
  from public, anon, authenticated, service_role;

grant execute on function work.resolve_conversation_home_workspace(uuid)
  to klussie_engine_work;
grant execute on function work.open_conversation(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.add_participant(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.remove_participant(uuid, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.send_message(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.save_message_translation(uuid, text, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.mark_conversation_read(uuid, uuid)
  to klussie_engine_work;
grant execute on function work.close_conversation(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.my_conversations(uuid)
  to klussie_engine_work;
grant execute on function work.conversation_messages(uuid)
  to klussie_engine_work;
grant execute on function work.conversation_roster(uuid)
  to klussie_engine_work;

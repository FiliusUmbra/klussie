-- Platform Activation Slice 2, WP 2.6 (Conversations) — the caller-checked contract for
-- the five conversation functions the client actually needs.
--
-- WHY ONLY FIVE OF ELEVEN GET A CALLER-CHECKED WRAPPER
--
-- 0096's own eleven functions split into two real groups. `send_message()`,
-- `save_message_translation()`, `mark_conversation_read()`, `my_conversations()`,
-- `conversation_messages()` are what a real person, in a real session, does inside a
-- conversation they are already on — these five get the wrapper shape below.
-- `open_conversation()`/`add_participant()` have no direct client caller today or ever,
-- per this session's own finding building WP 2.6: legacy's own on_quote_accepted trigger
-- is the only thing that has ever created a conversation (checked directly — no
-- src/lib/messages.js export inserts into public.conversations at all), so the new
-- schema's equivalent is a system-initiated cascade from work.accept_quote_for_caller()
-- (this slice's own next work package), not a client action. `remove_participant()`/
-- `close_conversation()`/`conversation_roster()` have no current UI at all — leaving a
-- thread or closing one are real capabilities this engine supports that the product does
-- not yet expose. Building a caller-checked wrapper for a function with no real caller,
-- current or planned, is exactly the speculative work this session's own established
-- restraint (ADR-0010, cited repeatedly across this codebase) rules out. All five are
-- left exactly as 0096 shipped them — no api.* delegate, matching
-- property.reparent_location()'s own precedent for internal-only functions.
--
-- IDENTITY IS NEVER CALLER-SUPPLIED — THE ONE RULE EVERY WRAPPER BELOW HOLDS
--
-- my_conversations()/mark_conversation_read() both take p_person_ref as a parameter in
-- 0096's own signature. A caller-checked wrapper that simply verified "is this the
-- caller's own person_ref" would still trust the caller to supply it correctly — the
-- wrappers below take NO p_person_ref parameter at all, resolving it internally via
-- public.current_identity() (migration 0028), the exact resolver 0094's own isolation
-- policies already use for this schema. There is no path through either wrapper for one
-- person to read or mark-read as if they were someone else.
--
-- send_message()/conversation_messages()/save_message_translation() PORT 0094's OWN
-- ISOLATION PREDICATE, NOT A RE-DERIVED ONE
--
-- "conversation_id in (select cp.conversation_id from work.conversation_participants cp
-- where cp.person_ref in (select person_ref from public.current_identity()) and
-- cp.left_at is null)" — 0094's own words, reused verbatim as the membership check here,
-- the same "port the RLS predicate, don't re-derive it" discipline WP 2.1 already
-- established for the marketplace engine's own two-sided check.

-- =========================================================================
-- 1 · send_message_for_caller() — the caller must be an active participant

create or replace function work.send_message_for_caller(
  p_message_id           uuid,
  p_conversation_id       uuid,
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
declare
  v_sender_person_ref uuid;
begin
  select person_ref into v_sender_person_ref from public.current_identity();

  if v_sender_person_ref is null or not exists (
    select 1 from work.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.person_ref = v_sender_person_ref
      and cp.left_at is null
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.send_message(
    p_message_id => p_message_id, p_conversation_id => p_conversation_id,
    p_sender_person_ref => v_sender_person_ref, p_sender_workspace_id => p_sender_workspace_id,
    p_body => p_body, p_original_locale => p_original_locale,
    p_reference_type => p_reference_type, p_reference_id => p_reference_id,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.send_message_for_caller(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) is
  'Sends a message for a caller who is a real, active participant of the conversation, resolved from public.current_identity() — never a caller-supplied sender. Delegates entirely to the unmodified work.send_message().';

-- =========================================================================
-- 2 · save_message_translation_for_caller() — the caller must be an active participant
-- of the message's own conversation

create or replace function work.save_message_translation_for_caller(
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
  v_person_ref uuid;
  v_conversation_id uuid;
begin
  select person_ref into v_person_ref from public.current_identity();
  select conversation_id into v_conversation_id from work.messages where id = p_message_id;

  if v_person_ref is null or v_conversation_id is null or not exists (
    select 1 from work.conversation_participants cp
    where cp.conversation_id = v_conversation_id
      and cp.person_ref = v_person_ref
      and cp.left_at is null
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.save_message_translation(
    p_message_id => p_message_id, p_locale => p_locale, p_text => p_text,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.save_message_translation_for_caller(uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'Saves a translation for a caller who is a real, active participant of the message''s own conversation, resolved from the row before checking. Delegates entirely to the unmodified work.save_message_translation().';

-- =========================================================================
-- 3 · mark_conversation_read_for_caller() — no p_person_ref parameter; resolved
-- internally, never caller-supplied

create or replace function work.mark_conversation_read_for_caller(
  p_conversation_id  uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_person_ref uuid;
begin
  select person_ref into v_person_ref from public.current_identity();
  if v_person_ref is null then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.mark_conversation_read(p_conversation_id => p_conversation_id, p_person_ref => v_person_ref);
end;
$$;

comment on function work.mark_conversation_read_for_caller(uuid) is
  'Marks a conversation read for the calling person, resolved from public.current_identity() — 0096''s own p_person_ref parameter is not exposed here at all, so there is no path for one person to mark-read as someone else. Delegates entirely to the unmodified work.mark_conversation_read(), which itself only touches a row where person_ref already matches.';

-- =========================================================================
-- 4 · my_conversations_for_caller() — no p_person_ref parameter; resolved internally

create or replace function work.my_conversations_for_caller()
returns table (id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid, workspace_id uuid, closed_at timestamptz, created_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_person_ref uuid;
begin
  select person_ref into v_person_ref from public.current_identity();
  if v_person_ref is null then
    return;
  end if;
  return query select * from work.my_conversations(v_person_ref);
end;
$$;

comment on function work.my_conversations_for_caller() is
  'Every conversation the calling person actively participates in, resolved from public.current_identity() — never a caller-supplied person_ref. A session with no real identity gets an empty result, not an error, matching this schema''s own "fail toward nothing shown" idiom for a read.';

-- =========================================================================
-- 5 · conversation_messages_for_caller() — the caller must be an active participant

create or replace function work.conversation_messages_for_caller(p_conversation_id uuid)
returns table (id uuid, sender_person_ref uuid, sender_workspace_id uuid, body text, original_locale text, translations jsonb, reference_type text, reference_id uuid, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select m.id, m.sender_person_ref, m.sender_workspace_id, m.body, m.original_locale, m.translations, m.reference_type, m.reference_id, m.created_at
  from work.messages m
  where m.conversation_id = p_conversation_id
    and m.conversation_id in (
      select cp.conversation_id from work.conversation_participants cp
      where cp.person_ref in (select person_ref from public.current_identity())
        and cp.left_at is null
    )
  order by m.created_at, m.id;
$$;

comment on function work.conversation_messages_for_caller(uuid) is
  'Every message in a conversation, for a caller who is a real, active participant of it — 0094''s own isolation predicate, ported rather than re-derived.';

-- =========================================================================
-- API DELEGATES — thin SECURITY DEFINER pass-throughs, the same shape every prior
-- contract in this session uses.

create or replace function api.send_message(
  p_message_id uuid, p_conversation_id uuid, p_sender_workspace_id uuid, p_body text,
  p_original_locale text, p_reference_type text, p_reference_id uuid,
  p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.send_message_for_caller(
    p_message_id, p_conversation_id, p_sender_workspace_id, p_body,
    p_original_locale, p_reference_type, p_reference_id,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

create or replace function api.save_message_translation(
  p_message_id uuid, p_locale text, p_text text,
  p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.save_message_translation_for_caller(p_message_id, p_locale, p_text, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.mark_conversation_read_for_caller(p_conversation_id);
$$;

create or replace function api.my_conversations()
returns table (id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid, workspace_id uuid, closed_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_conversations_for_caller();
$$;

create or replace function api.conversation_messages(p_conversation_id uuid)
returns table (id uuid, sender_person_ref uuid, sender_workspace_id uuid, body text, original_locale text, translations jsonb, reference_type text, reference_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.conversation_messages_for_caller(p_conversation_id);
$$;

comment on function api.send_message(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) is
  'The Conversation engine''s client-facing delegate for sending a message (WP 2.6). Delegates entirely to work.send_message_for_caller(), which holds all the logic.';
comment on function api.save_message_translation(uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'The Conversation engine''s client-facing delegate for saving a translation (WP 2.6). Delegates entirely to work.save_message_translation_for_caller(), which holds all the logic.';
comment on function api.mark_conversation_read(uuid) is
  'The Conversation engine''s client-facing delegate for marking a conversation read (WP 2.6). Delegates entirely to work.mark_conversation_read_for_caller(), which holds all the logic.';
comment on function api.my_conversations() is
  'The Conversation engine''s client-facing delegate for the caller''s own conversations (WP 2.6). Delegates entirely to work.my_conversations_for_caller(), which holds all the logic.';
comment on function api.conversation_messages(uuid) is
  'The Conversation engine''s client-facing delegate for one conversation''s messages (WP 2.6). Delegates entirely to work.conversation_messages_for_caller(), which holds all the logic.';

-- =========================================================================
-- ACCESS

revoke all on function work.send_message_for_caller(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.save_message_translation_for_caller(uuid, text, text, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.mark_conversation_read_for_caller(uuid) from public, anon, authenticated, service_role;
revoke all on function work.my_conversations_for_caller() from public, anon, authenticated, service_role;
revoke all on function work.conversation_messages_for_caller(uuid) from public, anon, authenticated, service_role;

revoke all on function api.send_message(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.save_message_translation(uuid, text, text, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.mark_conversation_read(uuid) from public, anon, service_role;
revoke all on function api.my_conversations() from public, anon, service_role;
revoke all on function api.conversation_messages(uuid) from public, anon, service_role;

grant execute on function api.send_message(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.save_message_translation(uuid, text, text, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.mark_conversation_read(uuid) to authenticated;
grant execute on function api.my_conversations() to authenticated;
grant execute on function api.conversation_messages(uuid) to authenticated;

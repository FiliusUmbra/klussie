-- Beta-blocking context-isolation defect: conversation authorization was person-scoped
-- only, never workspace-scoped, despite work.conversation_participants already carrying
-- workspace_id (not null) on every row since this table's own creation. A person who
-- participates through two different workspaces -- the ordinary case of someone who is
-- both a customer and a professional on the platform -- saw every one of their
-- conversations from BOTH workspaces at once, regardless of which one a given
-- conversation actually represents them through.
--
-- Reproduced live before writing this fix: the real customer-side test account sent a
-- message to a pro from its Personal workspace; the identical thread, with the identical
-- message, was immediately visible from that same account's own Professional workspace's
-- Berichten tab -- a conversation with nothing to do with that workspace's own business.
--
-- WHY THIS CONTRADICTS THE DOCUMENTED ARCHITECTURE, NOT JUST INTUITION
--
-- docs/architecture/DATABASE_ARCHITECTURE.md §6's own Crossing Registry table: a
-- Conversation's home partition is "the engagement or subject it is bound to," and the
-- other party sees "their own participation and the shared thread" -- bounded by
-- "Participation." §20: "Bilateral conversations are homed with their subject." A
-- conversation_participants row already records exactly which (person_ref, workspace_id)
-- pair that participation is -- the schema was always three-columns-wide on purpose; the
-- read/write/auth functions built on it simply never used the third column.
--
-- WHY THIS IS NOT JUST A SINGLE-PERSON UX QUIRK
--
-- Checked live before writing this: no workspace on staging currently has more than one
-- member, but 5 real people each hold active membership in two different workspaces --
-- the same pattern the reproduction above used. And multi-member workspaces are a real,
-- designed-for feature (0037/0195's own household-visibility backstop) -- once a real
-- shared household or business workspace exists, this same mechanism would let one
-- member's unrelated personal conversations become visible to every other member of
-- their shared workspace. This is a genuine cross-person disclosure waiting on scale, not
-- merely a confusing single-person display bug.
--
-- THE FIX, BY LAYER
--
-- RLS on work.conversations/conversation_participants/messages STAYS person-scoped,
-- unchanged, still built on api.my_active_conversation_ids() -- deliberately retained as
-- defense in depth (it already correctly blocks a total stranger, and a co-member of a
-- shared workspace who is not themselves a participant, from ever reaching a row via the
-- one direct client path that exists: authenticated already holds real SELECT + schema
-- USAGE on these three tables specifically so Realtime's postgres_changes can work,
-- confirmed live before writing this -- RLS is the only backend gate on that path, and it
-- cannot be made workspace-aware without a per-connection JWT claim keyed to "currently
-- active workspace," which does not exist in this project's auth model and is not
-- introduced here). What RLS was never meant to be the ONLY gate for -- distinguishing
-- which of a SINGLE person's own several workspaces is the active one for a given call --
-- moves to the api.* contract boundary, the one this platform's every other read/write
-- delegate already authorizes at: every function a client calls to list, read, send,
-- mark read, or translate now takes an explicit active-workspace parameter, resolves the
-- caller's own person_ref server-side (never trusts a caller-supplied one -- unchanged),
-- verifies that workspace is a genuine current membership of the caller
-- (workspace.current_memberships()), AND separately verifies a real, active
-- conversation_participants row exists for the EXACT (conversation, person, workspace)
-- triple -- membership in the workspace alone is never treated as authorization to read
-- someone else's participation in it, matching this migration's own explicit constraint
-- that conversation_participants.workspace_id records one participant's own
-- representation, not a grant to the workspace's entire roster.
--
-- work.send_message_for_caller() already took p_sender_workspace_id as a parameter --
-- its own signature is unchanged here -- but never validated it against a real
-- participant row at all, and never checked it against the caller's own real
-- memberships either; a caller could previously have the message recorded under ANY
-- workspace id, including one they do not even belong to. Only the body's authorization
-- logic changes.
--
-- Every dropped function below is immediately recreated with a corrected signature in
-- this same file; nothing is left with a stale, wrong-shaped overload. Ownership, fixed
-- empty search_path, STABLE/VOLATILE marking, and SECURITY DEFINER posture are preserved
-- exactly. Grants are re-issued explicitly after every drop, since a signature change
-- (unlike CREATE OR REPLACE on an unchanged signature) does not carry old grants forward.

-- =========================================================================
-- 1 · work.my_conversations() -- adds the workspace half of the tuple

drop function if exists work.my_conversations(uuid);

create function work.my_conversations(p_person_ref uuid, p_workspace_id uuid)
returns table (id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid, workspace_id uuid, closed_at timestamptz, created_at timestamptz, service_id uuid, request_id uuid, counterpart_workspace_id uuid, last_read_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select
    c.id, c.engagement_id, c.asset_id, c.maintenance_obligation_id, c.property_id,
    c.workspace_id, c.closed_at, c.created_at,
    r.service_id, e.request_id,
    (
      select cp_other.workspace_id
      from work.conversation_participants cp_other
      where cp_other.conversation_id = c.id
        and cp_other.person_ref <> p_person_ref
        and cp_other.left_at is null
      limit 1
    ) as counterpart_workspace_id,
    cp.last_read_at
  from work.conversations c
  join work.conversation_participants cp on cp.conversation_id = c.id
  left join work.engagements e on e.id = c.engagement_id
  left join work.requests r on r.id = e.request_id
  where cp.person_ref = p_person_ref
    and cp.workspace_id = p_workspace_id
    and cp.left_at is null;
$$;

comment on function work.my_conversations(uuid, uuid) is
  'Every conversation the given person participates in as the given workspace, and only that workspace -- the (person_ref, workspace_id) tuple conversation_participants has always carried. Extended (Beta context-isolation fix) from person-only, which surfaced a conversation to every workspace a person holds, not only the one representing them in it.';

-- =========================================================================
-- 2 · work.my_conversations_for_caller() -- resolves person server-side (unchanged),
-- now also requires and validates an explicit active workspace

drop function if exists work.my_conversations_for_caller();

create function work.my_conversations_for_caller(p_workspace_id uuid)
returns table (id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid, workspace_id uuid, closed_at timestamptz, created_at timestamptz, service_id uuid, request_id uuid, counterpart_workspace_id uuid, last_read_at timestamptz)
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

  -- The supplied workspace must be one of the caller's own real, active memberships --
  -- checked here, separately from and in addition to the per-conversation participant
  -- check my_conversations() itself performs. Neither check alone is conversation
  -- authorization; both are required.
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  return query select * from work.my_conversations(v_person_ref, p_workspace_id);
end;
$$;

-- =========================================================================
-- 3 · api.my_conversations() -- thin delegate, now takes the active workspace

drop function if exists api.my_conversations();

create function api.my_conversations(p_workspace_id uuid)
returns table (id uuid, engagement_id uuid, asset_id uuid, maintenance_obligation_id uuid, property_id uuid, workspace_id uuid, closed_at timestamptz, created_at timestamptz, service_id uuid, request_id uuid, counterpart_workspace_id uuid, last_read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.my_conversations_for_caller(p_workspace_id);
$$;

revoke all on function api.my_conversations(uuid) from public, anon, service_role;
grant execute on function api.my_conversations(uuid) to authenticated;

-- =========================================================================
-- 4 · work.conversation_messages_for_caller() -- the read-tuple check gains the
-- workspace half; work.conversation_messages() itself (the unauthorized data fetch)
-- is untouched, exactly as its own callers already trusted it to be pre-authorized

drop function if exists work.conversation_messages_for_caller(uuid);

create function work.conversation_messages_for_caller(p_conversation_id uuid, p_workspace_id uuid)
returns table (id uuid, sender_person_ref uuid, sender_workspace_id uuid, sender_auth_user_id uuid, body text, original_locale text, translations jsonb, reference_type text, reference_id uuid, created_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_person_ref uuid;
begin
  select person_ref into v_person_ref from public.current_identity();

  if v_person_ref is null
     or not exists (select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id)
     or not exists (
       select 1 from work.conversation_participants cp
       where cp.conversation_id = p_conversation_id
         and cp.person_ref = v_person_ref
         and cp.workspace_id = p_workspace_id
         and cp.left_at is null
     )
  then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  return query select * from work.conversation_messages(p_conversation_id);
end;
$$;

-- =========================================================================
-- 5 · api.conversation_messages() -- thin delegate, now takes the active workspace

drop function if exists api.conversation_messages(uuid);

create function api.conversation_messages(p_conversation_id uuid, p_workspace_id uuid)
returns table (id uuid, sender_person_ref uuid, sender_workspace_id uuid, sender_auth_user_id uuid, body text, original_locale text, translations jsonb, reference_type text, reference_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.conversation_messages_for_caller(p_conversation_id, p_workspace_id);
$$;

revoke all on function api.conversation_messages(uuid, uuid) from public, anon, service_role;
grant execute on function api.conversation_messages(uuid, uuid) to authenticated;

-- =========================================================================
-- 6 · work.mark_conversation_read() -- the update itself narrows to the exact
-- (conversation, person, workspace) row, not every row that person happens to hold

drop function if exists work.mark_conversation_read(uuid, uuid);

create function work.mark_conversation_read(p_conversation_id uuid, p_person_ref uuid, p_workspace_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update work.conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and person_ref = p_person_ref
    and workspace_id = p_workspace_id
    and left_at is null;
end;
$$;

-- =========================================================================
-- 7 · work.mark_conversation_read_for_caller() -- membership AND the exact participant
-- tuple, both checked explicitly. Checking membership alone and then letting the
-- targeted UPDATE below silently affect zero rows would not raise for a wrong-workspace
-- caller -- no state changes and nothing leaks, but it is a silent no-op where every
-- other authorized call in this file raises insufficient_privilege; explicit here too.

drop function if exists work.mark_conversation_read_for_caller(uuid);

create function work.mark_conversation_read_for_caller(p_conversation_id uuid, p_workspace_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_person_ref uuid;
begin
  select person_ref into v_person_ref from public.current_identity();

  if v_person_ref is null
     or not exists (select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id)
     or not exists (
       select 1 from work.conversation_participants cp
       where cp.conversation_id = p_conversation_id
         and cp.person_ref = v_person_ref
         and cp.workspace_id = p_workspace_id
         and cp.left_at is null
     )
  then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.mark_conversation_read(
    p_conversation_id => p_conversation_id, p_person_ref => v_person_ref, p_workspace_id => p_workspace_id
  );
end;
$$;

-- =========================================================================
-- 8 · api.mark_conversation_read() -- thin delegate, now takes the active workspace

drop function if exists api.mark_conversation_read(uuid);

create function api.mark_conversation_read(p_conversation_id uuid, p_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.mark_conversation_read_for_caller(p_conversation_id, p_workspace_id);
$$;

revoke all on function api.mark_conversation_read(uuid, uuid) from public, anon, service_role;
grant execute on function api.mark_conversation_read(uuid, uuid) to authenticated;

-- =========================================================================
-- 9 · work.send_message_for_caller() -- SAME SIGNATURE. It already took
-- p_sender_workspace_id; it never validated it. Now it does, against the caller's real
-- memberships AND against a genuine participant row for that exact tuple -- a caller can
-- no longer record a message under a workspace id they merely typed.

create or replace function work.send_message_for_caller(p_message_id uuid, p_conversation_id uuid, p_sender_workspace_id uuid, p_body text, p_original_locale text, p_reference_type text, p_reference_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sender_person_ref uuid;
begin
  select person_ref into v_sender_person_ref from public.current_identity();

  if v_sender_person_ref is null
     or not exists (select 1 from workspace.current_memberships() m where m.workspace_id = p_sender_workspace_id)
     or not exists (
       select 1 from work.conversation_participants cp
       where cp.conversation_id = p_conversation_id
         and cp.person_ref = v_sender_person_ref
         and cp.workspace_id = p_sender_workspace_id
         and cp.left_at is null
     )
  then
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

-- api.send_message()'s own signature and body are already exactly this shape and need no
-- change -- only the work.* body it delegates to gained the tuple check above.

-- =========================================================================
-- 10 · work.save_message_translation_for_caller() -- gains the same tuple check; the
-- underlying work.save_message_translation() (the unauthorized read-modify-write) is
-- untouched, same pattern as conversation_messages() above

drop function if exists work.save_message_translation_for_caller(uuid, text, text, uuid, uuid, platform.actor_type, text);

create function work.save_message_translation_for_caller(p_message_id uuid, p_locale text, p_text text, p_workspace_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text)
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

  if v_person_ref is null
     or v_conversation_id is null
     or not exists (select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id)
     or not exists (
       select 1 from work.conversation_participants cp
       where cp.conversation_id = v_conversation_id
         and cp.person_ref = v_person_ref
         and cp.workspace_id = p_workspace_id
         and cp.left_at is null
     )
  then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.save_message_translation(
    p_message_id => p_message_id, p_locale => p_locale, p_text => p_text,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

-- =========================================================================
-- 11 · api.save_message_translation() -- thin delegate, now takes the active workspace

drop function if exists api.save_message_translation(uuid, text, text, uuid, uuid, platform.actor_type, text);

create function api.save_message_translation(p_message_id uuid, p_locale text, p_text text, p_workspace_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.save_message_translation_for_caller(
    p_message_id, p_locale, p_text, p_workspace_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

revoke all on function api.save_message_translation(uuid, text, text, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.save_message_translation(uuid, text, text, uuid, uuid, uuid, platform.actor_type, text) to authenticated;

-- =========================================================================
-- 12 · work.resolve_conversation_counterpart_auth_ids() -- the caller's OWN side of the
-- shared conversation must also be workspace-exact, not merely "any workspace of mine
-- shares any conversation with any workspace in p_workspace_ids"

drop function if exists work.resolve_conversation_counterpart_auth_ids(uuid[]);

create function work.resolve_conversation_counterpart_auth_ids(p_workspace_ids uuid[], p_my_workspace_id uuid)
returns table (workspace_id uuid, auth_user_id uuid)
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

  if not exists (select 1 from workspace.current_memberships() m where m.workspace_id = p_my_workspace_id) then
    return;
  end if;

  return query
  select distinct cp_other.workspace_id, i.auth_user_id
  from work.conversation_participants cp_mine
  join work.conversation_participants cp_other
    on cp_other.conversation_id = cp_mine.conversation_id
    and cp_other.workspace_id = any(p_workspace_ids)
    and cp_other.left_at is null
  join identity.identities i on i.person_ref = cp_other.person_ref
  where cp_mine.person_ref = v_person_ref
    and cp_mine.workspace_id = p_my_workspace_id
    and cp_mine.left_at is null
    and i.auth_user_id is not null
    and i.erased_at is null;
end;
$$;

comment on function work.resolve_conversation_counterpart_auth_ids(uuid[], uuid) is
  'The real auth ids behind a batch of counterpart workspace ids, for a caller genuinely co-participating with each one -- gated on the caller''s own exact (person, active workspace) tuple, not merely any workspace they hold. Extended (Beta context-isolation fix) from person-only.';

-- =========================================================================
-- 13 · api.resolve_conversation_counterpart_auth_ids() -- thin delegate, now takes the
-- caller's own active workspace too

drop function if exists api.resolve_conversation_counterpart_auth_ids(uuid[]);

create function api.resolve_conversation_counterpart_auth_ids(p_workspace_ids uuid[], p_my_workspace_id uuid)
returns table (workspace_id uuid, auth_user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select * from work.resolve_conversation_counterpart_auth_ids(p_workspace_ids, p_my_workspace_id);
$$;

revoke all on function api.resolve_conversation_counterpart_auth_ids(uuid[], uuid) from public, anon, service_role;
grant execute on function api.resolve_conversation_counterpart_auth_ids(uuid[], uuid) to authenticated;

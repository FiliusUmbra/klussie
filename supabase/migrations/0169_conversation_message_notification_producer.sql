-- Slice 4, WP 4.1 — the notification engine's first real producer: a background
-- consumer that raises a notification for the other participant(s) on every new
-- conversation message.
--
-- WHY THIS EXISTS — WP 4.0'S OWN "EMPTY INBOX FOREVER" WARNING
--
-- WP 4.0 (0166) shipped a complete, correct read/write contract onto Epic 19's own
-- notification backend — but a contract with nothing producing notifications is an
-- empty inbox forever, the identical two-part shape Slice 3 opened with (a real engine,
-- reached by nothing). This migration is that producer: `work.send_message()`'s own
-- write path already emits `conversation.message.sent` (checked directly, 0096) — a
-- real, existing substrate this consumer reads.
--
-- THE SHAPE — workspace.consume_engagement_access_grants()'s OWN REFERENCE PATTERN
-- (WP 2.4, 0162), NOT A NEW FRAMEWORK
--
-- A per-hash-partition cursor over platform.events, dispatching on one event_type and
-- skipping (advancing past, not stalling on) everything else, quarantining what it
-- cannot process. The consumer LOOP is SECURITY INVOKER, running as a genuinely new
-- sixth consumer role (klussie_consumer_notification — SUPABASE_ARCHITECTURE.md §9:
-- "each get their own service role," the same reasoning 0162 applied creating the
-- fifth); the one privileged write it needs crosses into `platform`'s own aggregate
-- through a narrow SECURITY DEFINER delegate, never a direct table grant — the same
-- boundary work.accept_quote() crosses calling platform.emit_event(), and
-- workspace.grant_engagement_access() crosses calling platform.uuid_v7_at().
--
-- ONE platform.raise_notification() CALL PER RECIPIENT, NOT ONE PER MESSAGE — A REAL
-- SCHEMA CONSTRAINT, NOT A STYLE CHOICE
--
-- platform.notifications.workspace_id is a single column (0115) — a notification is
-- inherently scoped to ONE workspace, and platform.my_inbox() (0117) only surfaces a
-- delivery to a caller who holds a LIVE membership in that exact workspace. A
-- conversation's own participants are frequently in DIFFERENT workspaces (§20's own
-- isolation model — a customer's Personal Workspace, a pro's Professional Workspace);
-- one shared notification row could satisfy at most one side's own inbox query, not
-- both. The delegate below therefore calls raise_notification() once per OTHER
-- participant, each scoped to that recipient's own workspace_id, exactly as
-- work.conversation_participants (0092) already denormalises it per row — correct
-- modelling for this schema, not a workaround.
--
-- THE HEADLINE NAMES THE SENDER, IN ENGLISH ONLY — A REAL, NAMED GAP, NOT AN OVERSIGHT
--
-- public.profiles.full_name is resolved and included ("New message from {name}") —
-- genuinely more useful than a bare "New message," and no privacy concern: the
-- recipient is already a participant on the thread, so the sender's name is nothing
-- they don't already know. But it is not localized to the recipient's own
-- public.profiles.locale — no server-side translation table exists anywhere in this
-- codebase (every `t.` string is a client-side JS module, src/lib/*Strings.js), and
-- building one is real, separate scope this migration does not take on silently. WP
-- 4.2 (client inbox surface, not yet built) is where this gets decided for real: either
-- trust this stored headline verbatim, or re-derive fully localized display text
-- client-side from category/subject_type/subject_id and treat the stored headline as a
-- fallback only. Named here so that decision is made on purpose, not inherited by
-- accident.
--
-- IDEMPOTENT PER RECIPIENT, NOT MERELY PER EVENT
--
-- At-least-once delivery means the same conversation.message.sent event may be
-- processed more than once. The existence check below is keyed on
-- (source_event_id, workspace_id) — one per recipient's own notification row — so a
-- retry after a partial failure (e.g. quarantined after raising Alice's notification
-- but before Bob's) resumes correctly rather than double-notifying Alice.
--
-- NO PREFERENCE FILTERING YET — A NAMED SCOPE LIMIT, MATCHING 0117'S OWN "CALLER
-- RESOLVES AND FILTERS" DESIGN
--
-- 0117's own header names filtering the recipient list by
-- notification_preferences_for_membership() as the caller's job. This producer does
-- not do it — every live participant gets notified, unconditionally. A real, deliberate
-- simplification for the first producer onto this engine, not a bug: preferences exist
-- and are settable via WP 4.0's own contract, they are simply not consulted here yet.

-- =========================================================================
-- 1 · THE SIXTH CONSUMER ROLE

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'klussie_consumer_notification') then
    create role klussie_consumer_notification nologin;
  end if;
end;
$$;

comment on role klussie_consumer_notification is
  'Background consumer: raises a notification for the other participant(s) on every new conversation message (WP 4.1), reading conversation.message.sent from platform.events. Sixth consumer role, following workspace.consume_engagement_access_grants()''s own reference shape (0162).';

grant klussie_consumer_notification to postgres with set true;

grant usage on schema platform to klussie_consumer_notification;
grant select, insert, update on platform.consumer_cursors to klussie_consumer_notification;
grant select, insert, update on platform.consumer_quarantine to klussie_consumer_notification;
grant select on platform.events to klussie_consumer_notification;

revoke all on platform.consumer_cursors from anon, authenticated, service_role;
revoke all on platform.consumer_quarantine from anon, authenticated, service_role;

-- Extending the existing full-stream read policy (0102, extended again by 0162) — a
-- policy cannot gain a role via ALTER, only drop-and-recreate with the complete list.
drop policy if exists events_engine_read on platform.events;
create policy events_engine_read on platform.events
  for select
  to klussie_consumer_delivery, klussie_engine_property, klussie_consumer_workspace, klussie_consumer_notification
  using (true);

comment on policy events_engine_read on platform.events is
  'Full-stream read for the trusted internal roles named in platform.events'' own original comment ("background consumers on §7''s elevated path"). Extended a third time (0102 added klussie_engine_property, 0162 added klussie_consumer_workspace; this migration adds klussie_consumer_notification, WP 4.1) — still not a per-caller isolation predicate: anon/authenticated/service_role remain fully revoked, unchanged.';

-- Same extension for the two bookkeeping tables' own consumer-access policies (0162).
drop policy if exists consumer_cursors_consumer_access on platform.consumer_cursors;
create policy consumer_cursors_consumer_access on platform.consumer_cursors
  for all
  to klussie_consumer_projection, klussie_consumer_delivery, klussie_consumer_search,
     klussie_consumer_analytics, klussie_consumer_workspace, klussie_consumer_notification
  using (true)
  with check (true);

drop policy if exists consumer_quarantine_consumer_access on platform.consumer_quarantine;
create policy consumer_quarantine_consumer_access on platform.consumer_quarantine
  for all
  to klussie_consumer_projection, klussie_consumer_delivery, klussie_consumer_search,
     klussie_consumer_analytics, klussie_consumer_workspace, klussie_consumer_notification
  using (true)
  with check (true);

comment on policy consumer_cursors_consumer_access on platform.consumer_cursors is
  'Extended a second time (0162 first added klussie_consumer_workspace; this migration adds klussie_consumer_notification, WP 4.1). Not per-caller: the table-level GRANT already gives every consumer role identical reach into every other consumer''s cursor row.';
comment on policy consumer_quarantine_consumer_access on platform.consumer_quarantine is
  'Same extension, same reason, as consumer_cursors_consumer_access on the sibling table.';

-- =========================================================================
-- 2 · platform.raise_conversation_message_notification() — THE SECURITY DEFINER
-- DELEGATE. Owned by postgres, so its nested reads into work/identity/public and its
-- call to platform.uuid_v7_at() all run as the function owner — the identical shape
-- workspace.grant_engagement_access() (0162) already established. Not granted to
-- anyone but klussie_consumer_notification.

create or replace function platform.raise_conversation_message_notification(
  p_message_sent_event_id  uuid,
  p_conversation_id        uuid,
  p_message_id             uuid,
  p_correlation_id         uuid,
  p_causation_id           uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_person_ref  uuid;
  v_sender_name        text;
  v_headline           text;
  v_recipient          record;
  v_notification_id    uuid;
  v_delivery_id        uuid;
  v_event_id           uuid;
begin
  select sender_person_ref into v_sender_person_ref
  from work.messages
  where id = p_message_id;

  if v_sender_person_ref is null then
    raise exception
      'platform.raise_conversation_message_notification: message % does not exist', p_message_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select p.full_name into v_sender_name
  from identity.identities i
  join public.profiles p on p.id = i.auth_user_id
  where i.person_ref = v_sender_person_ref
    and i.erased_at is null;

  v_headline := 'New message from ' || coalesce(v_sender_name, 'a Klussie user');

  for v_recipient in
    select person_ref, workspace_id
    from work.conversation_participants
    where conversation_id = p_conversation_id
      and person_ref <> v_sender_person_ref
      and left_at is null
  loop
    -- Idempotent per (event, recipient workspace) — see this migration's own header.
    if exists (
      select 1 from platform.notifications
      where source_event_id = p_message_sent_event_id
        and workspace_id = v_recipient.workspace_id
    ) then
      continue;
    end if;

    v_notification_id := platform.uuid_v7_at(now());
    v_delivery_id := platform.uuid_v7_at(now());
    v_event_id := platform.uuid_v7_at(now());

    perform platform.raise_notification(
      p_notification_id => v_notification_id,
      p_workspace_id    => v_recipient.workspace_id,
      p_category        => 'conversation.message',
      p_headline        => v_headline,
      p_subject_type    => 'conversation',
      p_subject_id      => p_conversation_id,
      p_source_event_id => p_message_sent_event_id,
      p_recipients      => jsonb_build_array(
        jsonb_build_object('personRef', v_recipient.person_ref, 'deliveryId', v_delivery_id, 'channel', 'in_app')
      ),
      p_event_id        => v_event_id,
      p_correlation_id  => p_correlation_id,
      p_actor_type      => 'system',
      p_actor_ref       => 'conversation_message_notification_producer'
    );
  end loop;
end;
$$;

comment on function platform.raise_conversation_message_notification(uuid, uuid, uuid, uuid, uuid) is
  'The SECURITY DEFINER delegate that actually raises one notification per other live participant on a new conversation message (WP 4.1). One raise_notification() call per recipient, each scoped to that recipient''s own workspace_id (platform.notifications is single-workspace-scoped — see this migration''s own header). Idempotent per (source_event_id, workspace_id). Headline names the sender, English only — see this migration''s own header for why full localization is a named, deferred decision, not built here.';

revoke all on function platform.raise_conversation_message_notification(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function platform.raise_conversation_message_notification(uuid, uuid, uuid, uuid, uuid) to klussie_consumer_notification;

-- =========================================================================
-- 3 · platform.consume_conversation_message_notifications() — THE CURSOR LOOP ITSELF.
-- SECURITY INVOKER (the default), running as klussie_consumer_notification via the
-- pg_cron job below, using that role's own direct grants for its own bookkeeping and
-- the SECURITY DEFINER delegate above for the one privileged write. Same
-- satisfies_hash_partition()-against-the-parent shape workspace.
-- consume_engagement_access_grants() (0162) already established, for the identical
-- reason: a GRANT/RLS policy on a partitioned parent does not inherit to a query
-- naming a child partition table directly.

create or replace function platform.consume_conversation_message_notifications(p_batch_size integer default 200)
returns table (
  out_partition_index       smallint,
  out_events_read           integer,
  out_events_processed      integer,
  out_events_skipped        integer,
  out_events_quarantined    integer
)
language plpgsql
set search_path = ''
as $$
declare
  v_consumer_name     constant text := 'platform_conversation_message';
  v_partition          smallint;
  v_last_occurred_at    timestamptz;
  v_last_event_id        uuid;
  v_row                    record;
  v_events_read             integer;
  v_events_processed         integer;
  v_events_skipped            integer;
  v_events_quarantined         integer;
begin
  for v_partition in 0..7 loop
    v_events_read := 0;
    v_events_processed := 0;
    v_events_skipped := 0;
    v_events_quarantined := 0;

    select cc.last_occurred_at, cc.last_event_id
      into v_last_occurred_at, v_last_event_id
    from platform.consumer_cursors cc
    where cc.consumer_name = v_consumer_name and cc.partition_index = v_partition;

    v_last_occurred_at := coalesce(v_last_occurred_at, '-infinity'::timestamptz);
    v_last_event_id := coalesce(v_last_event_id, '00000000-0000-0000-0000-000000000000'::uuid);

    for v_row in
      select event_id, event_type, workspace_id, subject_type, subject_id, correlation_id, occurred_at, payload
      from platform.events
      where satisfies_hash_partition('platform.events'::regclass, 8, v_partition, workspace_id)
        and (occurred_at, event_id) > (v_last_occurred_at, v_last_event_id)
      order by occurred_at, event_id
      limit p_batch_size
    loop
      begin
        if v_row.event_type = 'conversation.message.sent' then
          if v_row.subject_type <> 'conversation' then
            raise exception
              'unexpected subject_type % for conversation.message.sent (event %)',
              v_row.subject_type, v_row.event_id;
          end if;

          -- No id minted here — the delegate mints its own notification_id/delivery_id/
          -- event_id internally (see that function's own comment): this loop runs as
          -- klussie_consumer_notification, which platform.uuid_v7_at() correctly refuses.
          perform platform.raise_conversation_message_notification(
            p_message_sent_event_id => v_row.event_id,
            p_conversation_id       => v_row.subject_id,
            p_message_id            => (v_row.payload ->> 'messageId')::uuid,
            p_correlation_id        => v_row.correlation_id,
            p_causation_id          => v_row.event_id
          );

          v_events_processed := v_events_processed + 1;
        else
          -- Positional cursor, not a filtered subscription — see 0162's own header,
          -- the precedent this migration follows. Every other event type is a
          -- deliberate, silent skip, not a failure.
          v_events_skipped := v_events_skipped + 1;
        end if;

      exception when others then
        v_events_quarantined := v_events_quarantined + 1;
        insert into platform.consumer_quarantine (
          consumer_name, event_id, occurred_at, workspace_id, failure_reason,
          attempts, first_failed_at, last_failed_at
        ) values (
          v_consumer_name, v_row.event_id, v_row.occurred_at, v_row.workspace_id, sqlerrm,
          1, now(), now()
        )
        on conflict (consumer_name, event_id) do update
          set attempts = platform.consumer_quarantine.attempts + 1,
              last_failed_at = now(),
              failure_reason = excluded.failure_reason;
      end;

      v_events_read := v_events_read + 1;
      v_last_occurred_at := v_row.occurred_at;
      v_last_event_id := v_row.event_id;
    end loop;

    if v_events_read > 0 then
      insert into platform.consumer_cursors (
        consumer_name, partition_index, last_occurred_at, last_event_id, updated_at
      ) values (
        v_consumer_name, v_partition, v_last_occurred_at, v_last_event_id, now()
      )
      on conflict (consumer_name, partition_index) do update
        set last_occurred_at = excluded.last_occurred_at,
            last_event_id = excluded.last_event_id,
            updated_at = now();
    end if;

    out_partition_index := v_partition;
    out_events_read := v_events_read;
    out_events_processed := v_events_processed;
    out_events_skipped := v_events_skipped;
    out_events_quarantined := v_events_quarantined;
    return next;
  end loop;
end;
$$;

comment on function platform.consume_conversation_message_notifications(integer) is
  'The per-hash-partition cursor over platform.events (WP 4.1), dispatching only on conversation.message.sent and skipping (advancing past, not stalling on) everything else, quarantining what it cannot process. Follows workspace.consume_engagement_access_grants()''s own reference shape (0162) exactly. Returns one row per partition for observability.';

revoke all on function platform.consume_conversation_message_notifications(integer) from public, anon, authenticated, service_role;
grant execute on function platform.consume_conversation_message_notifications(integer) to klussie_consumer_notification;

-- =========================================================================
-- 4 · SCHEDULING — EVERY MINUTE, RUNNING AS klussie_consumer_notification VIA `set role`
--
-- Same mechanism 0162's own header verified directly against this project (`set role`
-- inside the job body, not cron.schedule_in_database's username parameter — postgres on
-- this hosting platform is not a real superuser). cron.schedule() upserts by job name,
-- safe to run this migration again.

select cron.schedule(
  'conversation-message-notifications',
  '* * * * *',
  $job$set role klussie_consumer_notification; select platform.consume_conversation_message_notifications(); reset role;$job$
);

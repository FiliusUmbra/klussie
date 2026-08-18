-- Epic 19 WP03 — the notification engine contract: raise a notification with its
-- resolved recipients, record delivery/seen/acted-upon, escalate an unacknowledged item,
-- set preferences per membership, and compose the identity-scoped inbox at read time.
--
-- event_type FOLLOWS ADR-0019's OWN FORMAT FROM THE START — THE THIRD EPIC IN A ROW
--
-- SYSTEM_ARCHITECTURE.md §10.1's own produced-event list decomposes directly:
-- NotificationRaised -> platform.notification.raised; NotificationDelivered ->
-- platform.notification.delivered; NotificationSeen -> platform.notification.seen;
-- NotificationEscalated -> platform.notification.escalated. `platform.notification.
-- acted_on` is a named, deliberate extension beyond that list — see mark_acted()'s own
-- comment below.
--
-- raise_notification() TAKES ITS RECIPIENTS AS A CALLER-SUPPLIED jsonb ARRAY, NEVER
-- RESOLVES "WHO IS CURRENTLY A MEMBER" ITSELF
--
-- Fanning out one workspace-scoped notification to N delivery receipts means minting N
-- new row identifiers — a number this function cannot know until it resolves "who
-- currently holds a live membership in this workspace," which ADR-0022 forbids doing
-- with a runtime-generated id (platform.uuid_v7_at() is backfill-only). The identical
-- shape the "compose, don't duplicate" and "single required conditional id" patterns
-- already solve elsewhere in this session does not apply here either — those solve ONE
-- extra id for a conditional branch, not an unbounded set. So this function does what
-- every other identifier-generation conflict in this codebase resolves to: identifiers
-- come from the application. The caller resolves the recipient list (and, per §10.1's own
-- "Deciding what warrants attention," filters it by each candidate's own preferences,
-- read via notification_preferences_for_membership() below) and supplies
-- {personRef, deliveryId, channel} triples already minted. A single bulk INSERT ... SELECT
-- FROM jsonb_array_elements() writes them all in one statement, no per-row PL/pgSQL loop.
--
-- mark_acted() EMITS A NAMED EXTENSION BEYOND §10.1's OWN EVENT LIST
--
-- §10.1 lists NotificationRaised/Delivered/Seen/Escalated — no "Acted" event, even though
-- "Recording... acted-upon" is named as a real responsibility one sentence earlier, and
-- notification_deliveries.acted_at (0115) exists structurally to hold it. The same
-- pragmatic gap-fill commerce.fail_payment()'s billing.payout.failed already established
-- (Epic 14), knowledge.retract_edge()'s knowledge.workspace_edge.retracted (Epic 16):
-- emit platform.notification.acted_on anyway, a minimal, consistent extension, recorded
-- here rather than silently left unrecorded.
--
-- my_inbox() IS THE READ-TIME COMPOSITION §10.1/§32 BOTH REQUIRE, NEVER A MATERIALISED
-- COPY
--
-- "The inbox is composed on read, never materialised as copies outside the workspace
-- boundary" (§10.1's own "Scale" line). Joins notifications -> deliveries -> the caller's
-- own live memberships via workspace.current_memberships() (0031) — the same reused,
-- not-reinvented membership predicate every self-enforcing read in this codebase already
-- uses. "Revoking a membership removes its items" falls out of the join itself: a
-- workspace with no live membership row simply does not appear, with no separate
-- invalidation step required.
--
-- CROSS-SCHEMA ACCESS THIS MIGRATION NEEDS, NAMED AND NARROW
--
-- klussie_engine_platform has never held anything on schema workspace or schema identity
-- before this epic. my_inbox() needs workspace.current_memberships() (for live-membership
-- filtering) and identity.identities (to resolve the caller's own person_ref from
-- auth.uid(), the identical join workspace.current_memberships() itself performs
-- internally — reused here because my_inbox() also filters delivery rows by person_ref
-- directly, one join workspace.current_memberships() alone does not reach).
-- set_notification_preference()/notification_preferences_for_membership() need
-- workspace.memberships directly, to verify a membership_id is real. Granted here,
-- narrowly, for the three real queries this migration performs.

grant usage on schema workspace to klussie_engine_platform;
grant select on workspace.memberships to klussie_engine_platform;
grant execute on function workspace.current_memberships() to klussie_engine_platform;

grant usage on schema identity to klussie_engine_platform;
grant select on identity.identities to klussie_engine_platform;

-- =========================================================================
-- THE LOGIC — raise

create or replace function platform.raise_notification(
  p_notification_id  uuid,
  p_workspace_id     uuid,
  p_category         text,
  p_headline         text,
  p_subject_type     text,
  p_subject_id       uuid,
  p_source_event_id  uuid,
  p_recipients       jsonb,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into platform.notifications (
    id, workspace_id, category, headline, subject_type, subject_id, source_event_id
  ) values (
    p_notification_id, p_workspace_id, p_category, p_headline, p_subject_type, p_subject_id, p_source_event_id
  );

  -- One bulk statement for however many recipients the caller resolved — see this
  -- migration's own header for why no id is minted here.
  insert into platform.notification_deliveries (id, notification_id, person_ref, channel)
  select
    (r ->> 'deliveryId')::uuid,
    p_notification_id,
    (r ->> 'personRef')::uuid,
    r ->> 'channel'
  from jsonb_array_elements(p_recipients) as r;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'platform.notification.raised',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'notification',
    p_subject_id     => p_notification_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('category', p_category, 'recipientCount', jsonb_array_length(p_recipients))
  );
end;
$$;

comment on function platform.raise_notification(uuid, uuid, text, text, text, uuid, uuid, jsonb, uuid, uuid, platform.actor_type, text) is
  'Raises a workspace-scoped notification and fans it out to the caller-resolved recipient list in one bulk insert. p_recipients: [{"personRef": uuid, "deliveryId": uuid, "channel": text}, ...] — every id caller-supplied (ADR-0022), never minted here.';

-- =========================================================================
-- THE LOGIC — delivered / seen / acted / escalated

create or replace function platform.mark_notification_delivered(
  p_delivery_id     uuid,
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
  v_workspace_id uuid;
begin
  update platform.notification_deliveries d
  set delivered_at = now()
  from platform.notifications n
  where d.id = p_delivery_id and d.notification_id = n.id and d.delivered_at is null
  returning n.workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception
      'platform.mark_notification_delivered: delivery % does not exist or is already delivered', p_delivery_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'platform.notification.delivered',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'notification_delivery',
    p_subject_id     => p_delivery_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function platform.mark_notification_delivered(uuid, uuid, uuid, platform.actor_type, text) is
  'Records that one delivery receipt was actually sent on its channel. Refuses if the receipt does not exist or is already marked delivered.';

create or replace function platform.mark_notification_seen(
  p_delivery_id     uuid,
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
  v_workspace_id uuid;
begin
  update platform.notification_deliveries d
  set seen_at = now()
  from platform.notifications n
  where d.id = p_delivery_id and d.notification_id = n.id and d.seen_at is null
  returning n.workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception
      'platform.mark_notification_seen: delivery % does not exist or is already seen', p_delivery_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'platform.notification.seen',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'notification_delivery',
    p_subject_id     => p_delivery_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function platform.mark_notification_seen(uuid, uuid, uuid, platform.actor_type, text) is
  'Records that one recipient has seen their delivered notification. Refuses if the receipt does not exist or is already marked seen.';

create or replace function platform.mark_notification_acted(
  p_delivery_id     uuid,
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
  v_workspace_id uuid;
begin
  update platform.notification_deliveries d
  set acted_at = now()
  from platform.notifications n
  where d.id = p_delivery_id and d.notification_id = n.id and d.acted_at is null
  returning n.workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception
      'platform.mark_notification_acted: delivery % does not exist or is already acted on', p_delivery_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- platform.notification.acted_on is a named extension beyond §10.1's own event list —
  -- see this migration's own header.
  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'platform.notification.acted_on',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'notification_delivery',
    p_subject_id     => p_delivery_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function platform.mark_notification_acted(uuid, uuid, uuid, platform.actor_type, text) is
  'Records that one recipient acted on their notification. Emits platform.notification.acted_on, a named extension beyond §10.1''s own list — see this migration''s own header for why.';

create or replace function platform.escalate_notification(
  p_delivery_id     uuid,
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
  v_workspace_id uuid;
begin
  select n.workspace_id into v_workspace_id
  from platform.notification_deliveries d
  join platform.notifications n on n.id = d.notification_id
  where d.id = p_delivery_id and d.acted_at is null;

  if v_workspace_id is null then
    raise exception
      'platform.escalate_notification: delivery % does not exist or has already been acted on', p_delivery_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'platform.notification.escalated',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'notification_delivery',
    p_subject_id     => p_delivery_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('reason', p_reason)
  );
end;
$$;

comment on function platform.escalate_notification(uuid, text, uuid, uuid, platform.actor_type, text) is
  '"Escalating when urgent items go unacknowledged" (§10.1) — no dedicated escalation table, an event only, refused once the item has been acted on.';

-- =========================================================================
-- THE LOGIC — preferences

create or replace function platform.set_notification_preference(
  p_preference_id   uuid,
  p_membership_id   uuid,
  p_preferences     jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from workspace.memberships where id = p_membership_id) then
    raise exception
      'platform.set_notification_preference: membership % does not exist', p_membership_id
      using errcode = 'invalid_parameter_value';
  end if;

  insert into platform.notification_preferences (id, membership_id, preferences)
  values (p_preference_id, p_membership_id, p_preferences)
  on conflict (membership_id) do update
    set preferences = excluded.preferences, updated_at = now();
end;
$$;

comment on function platform.set_notification_preference(uuid, uuid, jsonb) is
  'Sets (or replaces) one membership''s notification preferences, upserting on membership_id — the one genuinely mutable table this session has built (0116''s own header). p_preference_id is only used the first time a membership sets a preference; a later call updates the existing row in place, no new event — preferences are not a decision worth an audit trail the way a declared rule is (0116''s own header).';

revoke all on function platform.set_notification_preference(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function platform.set_notification_preference(uuid, uuid, jsonb) to klussie_engine_platform;

create or replace function platform.notification_preferences_for_membership(p_membership_id uuid)
returns table (preferences jsonb)
language sql
stable
set search_path = ''
as $$
  select p.preferences
  from platform.notification_preferences p
  where p.membership_id = p_membership_id;
$$;

comment on function platform.notification_preferences_for_membership(uuid) is
  'One membership''s current preferences, or no row if never set — callers resolving raise_notification()''s own recipient list read this first to decide who to include, per §10.1''s "Deciding what warrants attention."';

revoke all on function platform.notification_preferences_for_membership(uuid) from public, anon, authenticated, service_role;
grant execute on function platform.notification_preferences_for_membership(uuid) to klussie_engine_platform;

-- =========================================================================
-- THE LOGIC — the inbox

create or replace function platform.my_inbox()
returns table (
  notification_id  uuid,
  delivery_id      uuid,
  workspace_id     uuid,
  category         text,
  headline         text,
  subject_type     text,
  subject_id       uuid,
  raised_at        timestamptz,
  channel          text,
  delivered_at     timestamptz,
  seen_at          timestamptz,
  acted_at         timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    n.id, d.id, n.workspace_id, n.category, n.headline, n.subject_type, n.subject_id,
    n.raised_at, d.channel, d.delivered_at, d.seen_at, d.acted_at
  from platform.notification_deliveries d
  join platform.notifications n on n.id = d.notification_id
  join identity.identities i on i.person_ref = d.person_ref
  join workspace.current_memberships() m on m.workspace_id = n.workspace_id
  where i.auth_user_id = auth.uid()
    and i.erased_at is null
  order by n.raised_at desc;
$$;

comment on function platform.my_inbox() is
  'The identity-scoped inbox, composed at read time across every workspace the caller currently holds a live membership in (§10.1/§32) — never materialised. A workspace whose membership has ended simply does not appear; no separate invalidation step exists or is needed.';

revoke all on function platform.my_inbox() from public, anon, authenticated, service_role;
grant execute on function platform.my_inbox() to klussie_engine_platform;

-- =========================================================================
-- ACCESS — no api.* delegate, the same posture every engine contract has held since
-- Epic 09, now a thirteenth occurrence.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'platform.raise_notification(uuid, uuid, text, text, text, uuid, uuid, jsonb, uuid, uuid, platform.actor_type, text)',
    'platform.mark_notification_delivered(uuid, uuid, uuid, platform.actor_type, text)',
    'platform.mark_notification_seen(uuid, uuid, uuid, platform.actor_type, text)',
    'platform.mark_notification_acted(uuid, uuid, uuid, platform.actor_type, text)',
    'platform.escalate_notification(uuid, text, uuid, uuid, platform.actor_type, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute pg_catalog.format('grant execute on function %s to klussie_engine_platform', fn);
  end loop;
end;
$$;

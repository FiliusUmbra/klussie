-- Platform Activation Slice 4, WP 4.0 — the Notification engine's read/write contract.
--
-- Epic 19 (0115-0118) built a complete, real backend — platform.notifications /
-- notification_deliveries (the two-table shared/private split §32 requires),
-- notification_preferences, and a full write contract (raise/deliver/seen/acted/
-- escalate/set_preference) — that zero client code anywhere references. Unlike Service
-- Records (Slice 3), this backend is not merely unreached: nothing anywhere calls
-- platform.raise_notification() either (checked directly — grep finds only its own
-- definition). This migration is the contract half only (WP 4.0); a real producer
-- (WP 4.1) and a real client UI (WP 4.2) are named, not built, in
-- SLICE_4_CONVERSATION_NOTIFICATION_ACTIVATION.md.
--
-- platform.my_inbox() NEEDS NO WRAPPER LOGIC — IT WAS ALREADY BUILT RIGHT
--
-- 0117's own comment: "composed at read time... scoped to auth.uid() across every
-- workspace the caller currently holds a live membership in." That is exactly the shape
-- a client read needs already; api.my_inbox() below is a pure pass-through, the same
-- shape api.resolve_service_record() (0163) already is for an equally-correct raw read.
--
-- mark_notification_seen()/mark_notification_acted() DO NO CALLER-AUTHORIZATION AT
-- ALL — THE IDENTICAL GAP WP 3.0 FOUND AND CLOSED FOR SERVICE RECORDS
--
-- 0117's own raw functions trust p_delivery_id outright — there was no client caller to
-- check against yet. The two platform.*_for_caller() wrappers below add exactly that:
-- the delivery's own person_ref must resolve to the caller's own identity (the same join
-- platform.my_inbox() itself already performs), or the call is refused.
--
-- set_notification_preference()/notification_preferences_for_membership() NEED THE
-- IDENTICAL CHECK, AGAINST MEMBERSHIP RATHER THAN DELIVERY
--
-- workspace.current_memberships() already returns membership_id on every row (0031) —
-- checking p_membership_id against it is the one-line check 0117's own raw functions
-- never added, because nothing called them yet either.
--
-- raise_notification()/escalate_notification()/mark_notification_delivered() STAY
-- ENGINE-ONLY, DELIBERATELY — NOT AN OVERSIGHT
--
-- A person does not raise their own notification, so raise_notification() has no
-- legitimate client caller at all. escalate_notification()'s own comment frames
-- escalation as an automatic response to an unacknowledged item — a future consumer's
-- job (WP 4.1's own extension, not scoped here), never a button. mark_notification_
-- delivered() stays engine-only for the one channel this slice's UI will use ('in_app'):
-- "delivered" and "seen" collapse into the same real moment (opening the inbox), so
-- there is no distinct client action to wire it to yet — a future 'push'/'email' channel
-- would need it, and can gain a _for_caller wrapper then, not preemptively now.

-- =========================================================================
-- 1 · WRITE CONTRACT — platform.*_for_caller() wrappers, real caller checks 0117's own
-- raw functions never had

create or replace function platform.mark_notification_seen_for_caller(
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
  v_owns boolean;
begin
  select exists (
    select 1
    from platform.notification_deliveries d
    join identity.identities i on i.person_ref = d.person_ref
    where d.id = p_delivery_id
      and i.auth_user_id = auth.uid()
      and i.erased_at is null
  ) into v_owns;

  if not v_owns then
    raise exception
      'platform.mark_notification_seen_for_caller: delivery % does not belong to the caller', p_delivery_id
      using errcode = 'insufficient_privilege';
  end if;

  perform platform.mark_notification_seen(p_delivery_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
end;
$$;

comment on function platform.mark_notification_seen_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Real caller check 0117''s own mark_notification_seen() never had: the delivery''s own person_ref must resolve to the caller''s own identity, the same join platform.my_inbox() itself performs. Not SECURITY DEFINER, granted to nobody, reachable only from api.mark_notification_seen().';

create or replace function platform.mark_notification_acted_for_caller(
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
  v_owns boolean;
begin
  select exists (
    select 1
    from platform.notification_deliveries d
    join identity.identities i on i.person_ref = d.person_ref
    where d.id = p_delivery_id
      and i.auth_user_id = auth.uid()
      and i.erased_at is null
  ) into v_owns;

  if not v_owns then
    raise exception
      'platform.mark_notification_acted_for_caller: delivery % does not belong to the caller', p_delivery_id
      using errcode = 'insufficient_privilege';
  end if;

  perform platform.mark_notification_acted(p_delivery_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
end;
$$;

comment on function platform.mark_notification_acted_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'Real caller check 0117''s own mark_notification_acted() never had, identical shape to mark_notification_seen_for_caller() above. Not SECURITY DEFINER, granted to nobody, reachable only from api.mark_notification_acted().';

create or replace function platform.set_notification_preference_for_caller(
  p_preference_id  uuid,
  p_membership_id  uuid,
  p_preferences    jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_membership_id not in (select membership_id from workspace.current_memberships()) then
    raise exception
      'platform.set_notification_preference_for_caller: membership % is not the caller''s own', p_membership_id
      using errcode = 'insufficient_privilege';
  end if;

  perform platform.set_notification_preference(p_preference_id, p_membership_id, p_preferences);
end;
$$;

comment on function platform.set_notification_preference_for_caller(uuid, uuid, jsonb) is
  'Real caller check 0117''s own set_notification_preference() never had: p_membership_id must be one of the caller''s own real, active memberships (workspace.current_memberships(), 0031). Not SECURITY DEFINER, granted to nobody, reachable only from api.set_notification_preference().';

create or replace function platform.notification_preferences_for_caller(p_membership_id uuid)
returns table (preferences jsonb)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_membership_id not in (select membership_id from workspace.current_memberships()) then
    raise exception
      'platform.notification_preferences_for_caller: membership % is not the caller''s own', p_membership_id
      using errcode = 'insufficient_privilege';
  end if;

  return query select * from platform.notification_preferences_for_membership(p_membership_id);
end;
$$;

comment on function platform.notification_preferences_for_caller(uuid) is
  'Real caller check 0117''s own notification_preferences_for_membership() never had, identical shape to set_notification_preference_for_caller() above. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_notification_preferences().';

revoke all on function platform.mark_notification_seen_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function platform.mark_notification_acted_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function platform.set_notification_preference_for_caller(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function platform.notification_preferences_for_caller(uuid) from public, anon, authenticated, service_role;

-- =========================================================================
-- 2 · api.* DELEGATES — thin SECURITY DEFINER pass-throughs. my_inbox() needs no
-- _for_caller wrapper first (0117's own platform.my_inbox() is already correctly
-- auth.uid()-scoped); the other four call their own _for_caller wrapper by name.

create or replace function api.my_inbox()
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
security definer
set search_path = ''
as $$
  select * from platform.my_inbox();
$$;

comment on function api.my_inbox() is
  'Delegate for platform.my_inbox() (WP 4.0). Already correctly auth.uid()-scoped, composed at read time — no _for_caller wrapper needed, the same shape api.resolve_service_record() (0163) already is for an equally pre-correct raw read.';

create or replace function api.mark_notification_seen(
  p_delivery_id     uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select platform.mark_notification_seen_for_caller(p_delivery_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.mark_notification_seen(uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for platform.mark_notification_seen_for_caller() (WP 4.0). The inbox''s own "mark read" action.';

create or replace function api.mark_notification_acted(
  p_delivery_id     uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select platform.mark_notification_acted_for_caller(p_delivery_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.mark_notification_acted(uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for platform.mark_notification_acted_for_caller() (WP 4.0). The inbox''s own "acted on this" action — e.g. tapping through to the conversation a message notification names.';

create or replace function api.set_notification_preference(
  p_preference_id  uuid,
  p_membership_id  uuid,
  p_preferences    jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  select platform.set_notification_preference_for_caller(p_preference_id, p_membership_id, p_preferences);
$$;

comment on function api.set_notification_preference(uuid, uuid, jsonb) is
  'Delegate for platform.set_notification_preference_for_caller() (WP 4.0).';

create or replace function api.my_notification_preferences(p_membership_id uuid)
returns table (preferences jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select * from platform.notification_preferences_for_caller(p_membership_id);
$$;

comment on function api.my_notification_preferences(uuid) is
  'Delegate for platform.notification_preferences_for_caller() (WP 4.0).';

revoke all on function api.my_inbox() from public, anon, service_role;
revoke all on function api.mark_notification_seen(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.mark_notification_acted(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.set_notification_preference(uuid, uuid, jsonb) from public, anon, service_role;
revoke all on function api.my_notification_preferences(uuid) from public, anon, service_role;

grant execute on function api.my_inbox() to authenticated;
grant execute on function api.mark_notification_seen(uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.mark_notification_acted(uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.set_notification_preference(uuid, uuid, jsonb) to authenticated;
grant execute on function api.my_notification_preferences(uuid) to authenticated;

-- =========================================================================
-- 3 · authenticated GAINS NO NEW TABLE GRANTS — every read/write above goes through a
-- SECURITY DEFINER api.* delegate whose nested calls execute as the function owner
-- (the same empirically-confirmed behaviour 0165's own document_shares write already
-- relies on this session), not as `authenticated` directly. platform.notifications and
-- platform.notification_deliveries keep 0115's own "RLS enabled, no policy" posture —
-- correct now, not a gap: no caller ever reaches those tables except through this
-- contract's own already-checked functions.

-- =========================================================================
-- 4 · postgres GAINS THE SET OPTION ON klussie_engine_platform — the identical PG16
-- fix 0162's own pg_cron consumer already needed (grant klussie_consumer_workspace to
-- postgres with set true;): CREATE ROLE auto-grants ADMIN, but PostgreSQL 16 split
-- ADMIN/INHERIT/SET, and only SET lets a session actually `set role klussie_engine_
-- platform` to call platform.raise_notification() as the engine — the shape WP 4.1's
-- own future consumer (pg_cron, running as postgres) will need, and the one this
-- migration's own live verification needed to seed a real notification to check
-- against. Idempotent, harmless to grant now even though WP 4.1 isn't built yet — the
-- alternative is re-discovering this exact gap live when WP 4.1 ships, the same way
-- 0162's own version was found.
grant klussie_engine_platform to postgres with set true;

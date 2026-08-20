-- Platform Activation Slice 2, WP 2.6 — the engagement -> conversation cascade,
-- replacing on_quote_accepted's own conversation-opening half (0001/0012) with a direct
-- call, matching the auto-accept cascade's own precedent (0146) rather than a trigger.
--
-- WHY THIS TOUCHES BOTH work.accept_quote_for_caller() AND
-- work.submit_quote_for_caller(), NOT JUST ONE
--
-- An engagement is created two ways in this schema: a manual accept
-- (accept_quote_for_caller(), 0146) and the ADR-0012 auto-accept cascade inside
-- submit_quote_for_caller() (0146), which calls the raw, unwrapped work.accept_quote()
-- directly rather than routing back through accept_quote_for_caller(). Putting the
-- conversation-opening logic inside accept_quote_for_caller() alone would silently skip
-- it for every directed, auto-accepted booking — exactly the kind of asymmetry a
-- structural test below exists to catch. Both call sites now open a conversation, via
-- the same shared helper, every time an engagement is actually created — never
-- conditionally, since every accepted quote creates exactly one engagement and, from
-- this migration forward, exactly one conversation, together.
--
-- workspace.resolve_owner_person_ref() IS A NEW, SMALL, REUSABLE RESOLVER
--
-- Every real workspace built anywhere in this platform (personal, professional,
-- business) has exactly one 'owner' membership — WP 0.3's own "exactly one workspace
-- should ever hold [a capability]" convention and every backfill in this roadmap
-- (0033/0034) mint precisely one. This resolver answers "which real person does this
-- workspace's owner membership represent" — the missing inverse of
-- workspace.resolve_public_professional_workspace() (0065), which already answers the
-- opposite direction (a person's auth id -> their Professional Workspace). Needed here to
-- turn requesting_workspace_id/performing_workspace_id into the two person_ref values
-- work.add_participant() requires; reused again by this slice's own next work package to
-- resolve a quote's offering workspace back to a displayable pro identity.
--
-- SIX NEW REQUIRED PARAMETERS ON EACH FUNCTION — THE SAME "CONDITIONAL, ALWAYS-REQUIRED
-- ID" IDIOM ALREADY ESTABLISHED FOUR TIMES IN THIS CODEBASE
--
-- p_conversation_id, p_customer_participant_id, p_pro_participant_id and their three
-- matching event ids. Not optional: every successful acceptance opens exactly one
-- conversation with exactly two participants, so the caller always mints these,
-- matching work.accept_quote()'s own p_declined_event_id precedent (0090) rather than
-- inventing a nullable-parameter branch for something that always happens.

-- =========================================================================
-- 1 · workspace.resolve_owner_person_ref() — the missing inverse of
-- workspace.resolve_public_professional_workspace() (0065)

create or replace function workspace.resolve_owner_person_ref(p_workspace_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select m.person_ref
  from workspace.memberships m
  where m.workspace_id = p_workspace_id
    and m.role = 'owner'
    and m.state = 'active'
  order by m.created_at
  limit 1;
$$;

comment on function workspace.resolve_owner_person_ref(uuid) is
  'The real person behind a workspace''s own owner membership — every real workspace in this platform has exactly one (WP 0.3''s own convention). Not SECURITY DEFINER, granted to nobody, reachable only as a nested call — matching workspace.resolve_public_professional_workspace()''s own posture (0065), the opposite direction of the same question.';

revoke all on function workspace.resolve_owner_person_ref(uuid) from public, anon, authenticated, service_role;

-- =========================================================================
-- 2 · work.open_conversation_for_engagement() — the shared cascade helper

create or replace function work.open_conversation_for_engagement(
  p_engagement_id                    uuid,
  p_conversation_id                  uuid,
  p_customer_participant_id          uuid,
  p_pro_participant_id               uuid,
  p_conversation_event_id            uuid,
  p_customer_participant_event_id    uuid,
  p_pro_participant_event_id         uuid,
  p_correlation_id                   uuid,
  p_actor_type                       platform.actor_type,
  p_actor_ref                        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_requesting_ws        uuid;
  v_performing_ws        uuid;
  v_customer_person_ref  uuid;
  v_pro_person_ref       uuid;
begin
  select requesting_workspace_id, performing_workspace_id
    into v_requesting_ws, v_performing_ws
  from work.engagements where id = p_engagement_id;

  perform work.open_conversation(
    p_conversation_id => p_conversation_id, p_engagement_id => p_engagement_id,
    p_asset_id => null, p_maintenance_obligation_id => null, p_property_id => null, p_workspace_id => null,
    p_event_id => p_conversation_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  v_customer_person_ref := workspace.resolve_owner_person_ref(v_requesting_ws);
  v_pro_person_ref := workspace.resolve_owner_person_ref(v_performing_ws);

  -- A workspace with no real owner membership (should not exist, per this migration's
  -- own header) opens the conversation with fewer participants rather than failing the
  -- whole acceptance — the same "reconciled against, not defended against" restraint
  -- 0052's backfill already takes for a comparably impossible-in-practice case.
  if v_customer_person_ref is not null then
    perform work.add_participant(
      p_participant_id => p_customer_participant_id, p_conversation_id => p_conversation_id,
      p_person_ref => v_customer_person_ref, p_workspace_id => v_requesting_ws,
      p_event_id => p_customer_participant_event_id, p_correlation_id => p_correlation_id,
      p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
    );
  end if;

  if v_pro_person_ref is not null then
    perform work.add_participant(
      p_participant_id => p_pro_participant_id, p_conversation_id => p_conversation_id,
      p_person_ref => v_pro_person_ref, p_workspace_id => v_performing_ws,
      p_event_id => p_pro_participant_event_id, p_correlation_id => p_correlation_id,
      p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
    );
  end if;
end;
$$;

comment on function work.open_conversation_for_engagement(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Opens a conversation bound to a real engagement and adds both real parties as participants, resolved via workspace.resolve_owner_person_ref() — the shared cascade both accept_quote_for_caller() and submit_quote_for_caller()''s own auto-accept branch call, so neither acceptance path can silently skip it. Replaces on_quote_accepted''s (0001/0012) own conversation-opening half with a direct call, matching this schema''s own no-triggers convention.';

revoke all on function work.open_conversation_for_engagement(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;

-- =========================================================================
-- 3 · work.accept_quote_for_caller() — redefined in place to also open the conversation.
-- Zero other trusted callers exist besides api.accept_quote() (updated below in the
-- same migration) — safe to change the signature, the same reasoning WP 2.1's own five
-- reads relied on.
--
-- DROP FIRST, NOT ONLY "CREATE OR REPLACE" — A REAL DISTINCTION, NOT CEREMONY
--
-- CREATE OR REPLACE FUNCTION replaces a function of the SAME argument-type signature; a
-- changed parameter list is a different signature entirely; Postgres would create a
-- second, distinct overload rather than replace the first, leaving 0146's own
-- 8-parameter version behind as an unreachable zombie once api.accept_quote() (updated
-- below) only ever calls the 14-parameter one. Every changed-signature function below is
-- dropped first, by 0146's own exact signature, so exactly one version of each exists
-- after this migration — checked directly before shipping, not assumed.

drop function if exists work.accept_quote_for_caller(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text);

create or replace function work.accept_quote_for_caller(
  p_quote_id                        uuid,
  p_engagement_id                    uuid,
  p_event_id                         uuid,
  p_engagement_event_id              uuid,
  p_declined_event_id                uuid,
  p_conversation_id                  uuid,
  p_customer_participant_id          uuid,
  p_pro_participant_id               uuid,
  p_conversation_event_id            uuid,
  p_customer_participant_event_id    uuid,
  p_pro_participant_event_id         uuid,
  p_correlation_id                   uuid,
  p_actor_type                       platform.actor_type,
  p_actor_ref                        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_requesting_ws uuid;
begin
  select r.requesting_workspace_id into v_requesting_ws
  from work.quotes q join work.requests r on r.id = q.request_id
  where q.id = p_quote_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.accept_quote(
    p_quote_id => p_quote_id, p_engagement_id => p_engagement_id,
    p_event_id => p_event_id, p_engagement_event_id => p_engagement_event_id, p_declined_event_id => p_declined_event_id,
    p_correlation_id => p_correlation_id, p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  perform work.open_conversation_for_engagement(
    p_engagement_id => p_engagement_id,
    p_conversation_id => p_conversation_id,
    p_customer_participant_id => p_customer_participant_id, p_pro_participant_id => p_pro_participant_id,
    p_conversation_event_id => p_conversation_event_id,
    p_customer_participant_event_id => p_customer_participant_event_id,
    p_pro_participant_event_id => p_pro_participant_event_id,
    p_correlation_id => p_correlation_id, p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );
end;
$$;

comment on function work.accept_quote_for_caller(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Accepts a quote for a caller with a real, active membership in the requesting workspace (unchanged from 0146), then opens the engagement''s conversation via the shared cascade (WP 2.6) — see this migration''s own header for why both acceptance paths call it.';

-- =========================================================================
-- 4 · work.submit_quote_for_caller() — redefined in place: the auto-accept branch now
-- also opens the conversation, via the same shared helper. Dropped first, by 0146's own
-- exact signature — see §3's own header for why.

drop function if exists work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text);

create or replace function work.submit_quote_for_caller(
  p_quote_id                         uuid,
  p_request_id                       uuid,
  p_offering_workspace_id            uuid,
  p_price                            numeric,
  p_message                          text,
  p_event_id                         uuid,
  p_correlation_id                   uuid,
  p_auto_accept_engagement_id        uuid,
  p_auto_accept_event_id             uuid,
  p_auto_accept_engagement_event_id  uuid,
  p_auto_accept_conversation_id                 uuid,
  p_auto_accept_customer_participant_id         uuid,
  p_auto_accept_pro_participant_id              uuid,
  p_auto_accept_conversation_event_id           uuid,
  p_auto_accept_customer_participant_event_id   uuid,
  p_auto_accept_pro_participant_event_id        uuid,
  p_actor_type                       platform.actor_type,
  p_actor_ref                        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_directed_ws     uuid;
  v_directed_until  timestamptz;
  v_auto_accept_max numeric;
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_offering_workspace_id
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.submit_quote(
    p_quote_id => p_quote_id, p_request_id => p_request_id, p_offering_workspace_id => p_offering_workspace_id,
    p_price => p_price, p_message => p_message,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  select r.directed_workspace_id, r.directed_until, r.auto_accept_max
    into v_directed_ws, v_directed_until, v_auto_accept_max
  from work.requests r where r.id = p_request_id;

  if v_directed_ws is not null
     and v_directed_ws = p_offering_workspace_id
     and v_directed_until > now()
     and p_price <= v_auto_accept_max
  then
    perform work.accept_quote(
      p_quote_id => p_quote_id, p_engagement_id => p_auto_accept_engagement_id,
      p_event_id => p_auto_accept_event_id, p_engagement_event_id => p_auto_accept_engagement_event_id,
      p_declined_event_id => null,
      p_correlation_id => p_correlation_id, p_actor_type => 'system', p_actor_ref => 'directed_booking_auto_accept'
    );

    perform work.open_conversation_for_engagement(
      p_engagement_id => p_auto_accept_engagement_id,
      p_conversation_id => p_auto_accept_conversation_id,
      p_customer_participant_id => p_auto_accept_customer_participant_id,
      p_pro_participant_id => p_auto_accept_pro_participant_id,
      p_conversation_event_id => p_auto_accept_conversation_event_id,
      p_customer_participant_event_id => p_auto_accept_customer_participant_event_id,
      p_pro_participant_event_id => p_auto_accept_pro_participant_event_id,
      p_correlation_id => p_correlation_id, p_actor_type => 'system', p_actor_ref => 'directed_booking_auto_accept'
    );
  end if;
end;
$$;

comment on function work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Submits a quote (unchanged from 0146), then runs the ADR-0012 auto-accept cascade when every legacy condition holds — now also opening the engagement''s conversation via the shared cascade helper (WP 2.6) when it does, matching accept_quote_for_caller()''s own equivalent addition. The six p_auto_accept_conversation_*/p_auto_accept_*_participant_* ids are only actually used when the cascade fires; always required, matching this codebase''s own established idiom.';

-- =========================================================================
-- 5 · api.accept_quote()/api.submit_quote() — redefined to pass the new parameters
-- through, unchanged in every other respect. Dropped first, by 0146's own exact
-- signature — see §3's own header for why.

drop function if exists api.accept_quote(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text);
drop function if exists api.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text);

create or replace function api.accept_quote(
  p_quote_id uuid, p_engagement_id uuid, p_event_id uuid, p_engagement_event_id uuid, p_declined_event_id uuid,
  p_conversation_id uuid, p_customer_participant_id uuid, p_pro_participant_id uuid,
  p_conversation_event_id uuid, p_customer_participant_event_id uuid, p_pro_participant_event_id uuid,
  p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.accept_quote_for_caller(
    p_quote_id, p_engagement_id, p_event_id, p_engagement_event_id, p_declined_event_id,
    p_conversation_id, p_customer_participant_id, p_pro_participant_id,
    p_conversation_event_id, p_customer_participant_event_id, p_pro_participant_event_id,
    p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

create or replace function api.submit_quote(
  p_quote_id uuid, p_request_id uuid, p_offering_workspace_id uuid, p_price numeric, p_message text,
  p_event_id uuid, p_correlation_id uuid,
  p_auto_accept_engagement_id uuid, p_auto_accept_event_id uuid, p_auto_accept_engagement_event_id uuid,
  p_auto_accept_conversation_id uuid, p_auto_accept_customer_participant_id uuid, p_auto_accept_pro_participant_id uuid,
  p_auto_accept_conversation_event_id uuid, p_auto_accept_customer_participant_event_id uuid, p_auto_accept_pro_participant_event_id uuid,
  p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.submit_quote_for_caller(
    p_quote_id, p_request_id, p_offering_workspace_id, p_price, p_message,
    p_event_id, p_correlation_id,
    p_auto_accept_engagement_id, p_auto_accept_event_id, p_auto_accept_engagement_event_id,
    p_auto_accept_conversation_id, p_auto_accept_customer_participant_id, p_auto_accept_pro_participant_id,
    p_auto_accept_conversation_event_id, p_auto_accept_customer_participant_event_id, p_auto_accept_pro_participant_event_id,
    p_actor_type, p_actor_ref
  );
$$;

-- =========================================================================
-- ACCESS
--
-- DROP FUNCTION removes any grants that existed on the dropped signature — unlike a true
-- CREATE OR REPLACE (which preserves grants), a drop-then-create starts the new function
-- with none. Every function whose signature changed above needs its grants restated
-- here explicitly; the two genuinely new functions (workspace.resolve_owner_person_ref(),
-- work.open_conversation_for_engagement()) already have their own revoke, next to their
-- own definitions, and need nothing further — both are reachable only as nested calls.

revoke all on function work.accept_quote_for_caller(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;

revoke all on function api.accept_quote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;

grant execute on function api.accept_quote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;

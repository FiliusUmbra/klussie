-- Fix: work.accept_quote_for_caller()/work.submit_quote_for_caller() both authorized on
-- "does the caller hold ANY live membership in this workspace" — no role check — the
-- exact real risk SUPPORT_ACCESS_DESIGN.md §1.3 named and migration 0172 (Support
-- access, WP S.0) deliberately built its own new read function to avoid, but did not by
-- itself fix anywhere else. Found by checking, not assumed: this migration is the first
-- concrete instance of the "audit every existing write path" work SUPPORT_ACCESS_DESIGN.md
-- §1.3(b)/§3 names as real, separate, non-blocking future work — begun here, not
-- finished here.
--
-- WHY THESE TWO, TONIGHT, NOT THE WHOLE CODEBASE
--
-- Checked directly: a support-access grant (role = 'support', scope = null — unscoped
-- within the one workspace it names, migration 0172) sits in workspace.memberships
-- exactly like any other membership, and workspace.current_memberships() returns it
-- indistinguishably from a real member's own row to any caller that does not explicitly
-- filter role. work.accept_quote_for_caller() (0148) and work.submit_quote_for_caller()
-- (0150) are the two highest-stakes, most concretely verified instances: without this
-- fix, an operator on a support session could accept a quote or submit one — a real
-- financial/contractual action taken as the customer or the professional, not merely a
-- read — on either side of the marketplace. Not every write path in this codebase was
-- audited tonight; these two were checked directly, confirmed vulnerable, and fixed.
-- work.send_message_for_caller() (0147), checked in the same pass, is NOT vulnerable to
-- this — it authorizes on work.conversation_participants membership by person_ref, never
-- on workspace.current_memberships() at all, so a support grant confers no message-
-- sending ability by itself. The remaining engines (property/asset/document writes,
-- service records, workflow) were not re-checked in this pass and should not be assumed
-- safe or unsafe either way — a real, separate, still-open piece of work.
--
-- role <> 'support' IS THE MINIMAL, SURGICAL FIX — NOT A RESTRUCTURE
--
-- Both functions are redefined with their own bodies otherwise byte-for-byte identical
-- to their last shipped version (0148/0150 respectively) — only the membership EXISTS
-- check itself gains one additional AND clause. Nothing about the auto-accept cascade,
-- the dual-write bridge, or the conversation-opening side effect changes.

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
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws and m.role <> 'support'
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
  'Accepts a quote for a caller with a real, active, non-support membership in the requesting workspace (0173 — a support-access grant, migration 0172, must never be sufficient to accept a quote on someone else''s behalf), then opens the engagement''s conversation via the shared cascade (WP 2.6).';

create or replace function work.submit_quote_for_caller(
  p_quote_id                         uuid,
  p_request_id                       uuid,
  p_offering_workspace_id            uuid,
  p_price                            numeric,
  p_message                          text,
  p_legacy_quote_id                  uuid,
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
    select 1 from workspace.current_memberships() m where m.workspace_id = p_offering_workspace_id and m.role <> 'support'
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  perform work.submit_quote(
    p_quote_id => p_quote_id, p_request_id => p_request_id, p_offering_workspace_id => p_offering_workspace_id,
    p_price => p_price, p_message => p_message,
    p_event_id => p_event_id, p_correlation_id => p_correlation_id,
    p_actor_type => p_actor_type, p_actor_ref => p_actor_ref
  );

  if p_legacy_quote_id is not null then
    update work.quotes set legacy_quote_id = p_legacy_quote_id where id = p_quote_id;
  end if;

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

comment on function work.submit_quote_for_caller(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Submits a quote for a caller with a real, active, non-support membership in the offering workspace (0173 — a support-access grant, migration 0172, must never be sufficient to submit a quote as someone else''s business), runs the auto-accept cascade when directed. p_legacy_quote_id, when given, correlates this row to a legacy quotes row created in the same client action (WP 2.6''s own dual-write).';

-- No grant/revoke changes — both functions' own access posture (reachable only through
-- their existing api.* delegate, api.accept_quote()/api.submit_quote()) is untouched.

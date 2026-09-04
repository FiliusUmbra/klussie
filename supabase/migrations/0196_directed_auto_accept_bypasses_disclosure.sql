-- Founder decision (2026-09-04, resuming the negative-authorization probe queue): a
-- directed request's auto-accept cascade should NOT require the customer's own live
-- api.approve_location_disclosure() call -- the customer already consented to disclosure
-- when they configured the auto-accept rule itself (directed_workspace_id/auto_accept_max/
-- directed_until on the request), naming exactly which workspace, at what price ceiling,
-- within what window, gets to book automatically. Requiring a second, separate live
-- approval for something they already authorized in advance would be redundant, not
-- protective.
--
-- WHY THIS NEEDED A FIX AT ALL
--
-- WP 2.8's disclosure-consent redesign (0181-0184) changed work.accept_quote() itself to
-- always land in 'pending_disclosure' -- a blanket change that never distinguished manual
-- acceptance (which correctly needs a fresh customer decision) from the auto-accept
-- cascade (work.submit_quote_for_caller(), called from inside the PRO's own submit_quote
-- request -- there is no live customer session at this point in the call chain for
-- api.approve_location_disclosure() to run as). Found via VERIFY_MARKETPLACE_WRITE_
-- CONTRACT.sql's own check 2b: a directed request's auto-accept currently stalls at
-- 'accepted_pending_location_approval' and never reaches 'booked', because nothing in the
-- auto-accept path ever approves the disclosure it's now gated behind.
--
-- THE FIX -- A NEW, INTERNAL-ONLY HELPER, NOT A SIGNATURE CHANGE
--
-- work.engagements_guard_disclosure_before_active() (0182's own trigger) requires a real,
-- matching work.location_disclosures row before an engagement can reach 'active' -- so the
-- auto-accept cascade must still create one, just without a live customer session to
-- attribute it to. work.auto_approve_location_disclosure_for_directed_booking() below does
-- exactly what work.approve_location_disclosure() does (insert the disclosure row, flip
-- the engagement to active, book the request, emit the same marketplace.engagement.created
-- event 0162's own consumer already expects), except: no auth.uid()-based caller check
-- (there is no caller session here), and `approved_by` resolves to the requesting
-- workspace's own real, active owner -- not the live session's person_ref, since there
-- isn't one -- attributing the auto-approval to the actual customer whose own
-- pre-configured rule authorized it.
--
-- Deliberately generates its own disclosure id via gen_random_uuid() rather than taking
-- one as a parameter: adding a new caller-supplied uuid would mean growing
-- work.submit_quote_for_caller()'s and api.submit_quote()'s own public signatures, which
-- cascades to src/lib/requests.js's sendQuote() (checked directly: it already eagerly
-- generates every other auto-accept id on every call, directed or not, so a new required
-- parameter would need a client change too) and every diagnostic/test asserting either
-- signature. Safe without one: work.location_disclosures carries `unique (request_id,
-- quote_id)` (0182), so even a retried call fails closed on that constraint rather than
-- silently duplicating -- the same safety a caller-supplied id would have given, without
-- the blast radius of changing two public contracts for it.
--
-- Granted to nobody -- reachable only from work.submit_quote_for_caller() itself, the
-- same posture as work.approve_location_disclosure() and every internal engine-schema
-- function in this codebase.

create or replace function work.auto_approve_location_disclosure_for_directed_booking(
  p_engagement_id uuid,
  p_engagement_event_id uuid,
  p_correlation_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_request_id     uuid;
  v_quote_id       uuid;
  v_requesting_ws  uuid;
  v_performing_ws  uuid;
  v_approver       uuid;
begin
  select e.request_id, e.quote_id, e.requesting_workspace_id, e.performing_workspace_id
    into v_request_id, v_quote_id, v_requesting_ws, v_performing_ws
  from work.engagements e
  where e.id = p_engagement_id;

  if v_request_id is null then
    raise exception
      'work.auto_approve_location_disclosure_for_directed_booking: engagement % does not exist', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- The requesting workspace's own real, active owner -- the actual customer whose
  -- pre-configured auto-accept rule is standing in for a live approval. Every Personal
  -- Workspace has exactly one (handle_new_user()'s own provisioning); a workspace with
  -- none fails closed below rather than silently attributing the approval to no one.
  select m.person_ref into v_approver
  from workspace.memberships m
  where m.workspace_id = v_requesting_ws and m.role = 'owner' and m.state = 'active'
  order by m.created_at asc
  limit 1;

  if v_approver is null then
    raise exception
      'work.auto_approve_location_disclosure_for_directed_booking: requesting workspace % has no active owner to attribute auto-approval to', v_requesting_ws
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- The audit record and the enforcement gate, one insert -- same as work.
  -- approve_location_disclosure(), 0182's own trigger checks for exactly this row before
  -- allowing the status update three lines below to succeed.
  insert into work.location_disclosures (
    id, request_id, quote_id, disclosing_workspace_id, receiving_workspace_id, approved_by
  ) values (
    gen_random_uuid(), v_request_id, v_quote_id, v_requesting_ws, v_performing_ws, v_approver
  );

  update work.engagements set status = 'active' where id = p_engagement_id;

  update work.requests set status = 'booked', updated_at = now() where id = v_request_id;

  -- Same event type, same payload shape work.approve_location_disclosure() emits --
  -- 0162's own consumer needs no change at all.
  perform platform.emit_event(
    p_event_id       => p_engagement_event_id,
    p_event_type     => 'marketplace.engagement.created',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => 'system',
    p_actor_ref      => 'directed_booking_auto_accept',
    p_subject_type   => 'engagement',
    p_subject_id     => p_engagement_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('requestId', v_request_id, 'performingWorkspaceId', v_performing_ws)
  );
end;
$$;

comment on function work.auto_approve_location_disclosure_for_directed_booking(uuid, uuid, uuid) is
  'Founder decision: a directed request''s pre-configured auto-accept rule IS the customer''s disclosure consent -- no separate live approval required. Does what work.approve_location_disclosure() does, minus the live-caller check, attributed to the requesting workspace''s own real owner instead of a session that does not exist at this point in the call chain. Reachable only from work.submit_quote_for_caller(), granted to nobody.';

revoke all on function work.auto_approve_location_disclosure_for_directed_booking(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- work.submit_quote_for_caller() -- unchanged signature, one new call added to the
-- auto-accept branch, immediately after work.accept_quote() and before the conversation
-- is opened. p_auto_accept_engagement_event_id is reused as the new call's own
-- p_engagement_event_id -- exactly the id work.accept_quote()'s own comment already says
-- is "reused as the engagement-creation event's own id when disclosure is approved";
-- nothing new needed from the caller.

create or replace function work.submit_quote_for_caller(p_quote_id uuid, p_request_id uuid, p_offering_workspace_id uuid, p_price numeric, p_message text, p_legacy_quote_id uuid, p_event_id uuid, p_correlation_id uuid, p_auto_accept_engagement_id uuid, p_auto_accept_event_id uuid, p_auto_accept_engagement_event_id uuid, p_auto_accept_conversation_id uuid, p_auto_accept_customer_participant_id uuid, p_auto_accept_pro_participant_id uuid, p_auto_accept_conversation_event_id uuid, p_auto_accept_customer_participant_event_id uuid, p_auto_accept_pro_participant_event_id uuid, p_actor_type platform.actor_type, p_actor_ref text)
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

    perform work.auto_approve_location_disclosure_for_directed_booking(
      p_engagement_id => p_auto_accept_engagement_id,
      p_engagement_event_id => p_auto_accept_engagement_event_id,
      p_correlation_id => p_correlation_id
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

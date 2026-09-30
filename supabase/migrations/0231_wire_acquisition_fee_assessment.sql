-- Payments Slice A (WP A4) — the live wire. work.approve_location_disclosure() (0183) is
-- "the one and only place an engagement reaches 'active' and marketplace.engagement.
-- created fires" — its own header's words, and the real "this booking is genuinely
-- happening" moment named throughout 0230. This migration is the one place this slice
-- departs from every other engine epic's "no live wiring" restraint on purpose: the
-- brief's own instruction is a working system, not another engine built ahead of its
-- caller, and Epic 22's own precedent (Subscription calling workspace.grant_capability()
-- directly, "the first true cross-engine contract call this session has made") already
-- established that a real cross-schema call from inside a write path, not just an event a
-- future consumer might react to someday, is within this architecture's own rules when
-- the calling engine genuinely needs the callee's decision synchronously — which this
-- does: whether a fee attaches is decided once, at the moment booking is confirmed, not
-- asynchronously after the fact.
--
-- TWO NEW REQUIRED PARAMETERS, NOT DEFAULTED — ADR-0022's OWN DISCIPLINE
--
-- p_fee_assessment_id/p_fee_assessment_event_id are the assessment row's own id and its
-- disclosure event's id. ADR-0022 puts identifier generation in the application, and
-- every id-accepting function in this codebase already refuses to default one (platform.
-- emit_event() among them) — these two are no exception, even though (unlike
-- p_engagement_event_id in 0183) there is exactly one real caller to update, done in the
-- same migration, immediately below.

drop function if exists work.approve_location_disclosure(uuid, uuid, uuid, uuid, platform.actor_type, text);
drop function if exists api.approve_location_disclosure(uuid, uuid, uuid, uuid, platform.actor_type, text);

create or replace function work.approve_location_disclosure(
  p_engagement_id          uuid,
  p_disclosure_id          uuid,
  p_engagement_event_id    uuid,
  p_fee_assessment_id      uuid,
  p_fee_assessment_event_id uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_request_id      uuid;
  v_quote_id        uuid;
  v_requesting_ws   uuid;
  v_performing_ws   uuid;
  v_status          text;
  v_approver        uuid;
begin
  select e.request_id, e.quote_id, e.requesting_workspace_id, e.performing_workspace_id, e.status
    into v_request_id, v_quote_id, v_requesting_ws, v_performing_ws, v_status
  from work.engagements e
  where e.id = p_engagement_id;

  if v_request_id is null then
    raise exception
      'work.approve_location_disclosure: engagement % does not exist', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'pending_disclosure' then
    raise exception
      'work.approve_location_disclosure: engagement % is % , not pending_disclosure', p_engagement_id, v_status
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select person_ref into v_approver from identity.identities where auth_user_id = auth.uid();

  insert into work.location_disclosures (
    id, request_id, quote_id, disclosing_workspace_id, receiving_workspace_id, approved_by
  ) values (
    p_disclosure_id, v_request_id, v_quote_id, v_requesting_ws, v_performing_ws, v_approver
  );

  update work.engagements set status = 'active' where id = p_engagement_id;

  update work.requests set status = 'booked', updated_at = now() where id = v_request_id;

  perform platform.emit_event(
    p_event_id       => p_engagement_event_id,
    p_event_type     => 'marketplace.engagement.created',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'engagement',
    p_subject_id     => p_engagement_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('requestId', v_request_id, 'performingWorkspaceId', v_performing_ws)
  );

  -- Payments Slice A — decides, in the same transaction that confirms the booking,
  -- whether this is the first real Klussie introduction between these two workspaces.
  -- See this migration's own header for why this call is real live wiring, not another
  -- unwired engine addition.
  perform commerce.assess_acquisition_fee_on_engagement(
    p_assessment_id  => p_fee_assessment_id,
    p_engagement_id  => p_engagement_id,
    p_event_id       => p_fee_assessment_event_id,
    p_correlation_id => p_correlation_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref
  );
end;
$$;

comment on function work.approve_location_disclosure(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'The founder-mandated explicit disclosure-consent action -- "Adres delen en boeking bevestigen" (0183). Only place an engagement reaches active and only place marketplace.engagement.created fires. Payments Slice A (0231) added the acquisition-fee assessment call in the same transaction — see this migration''s own header for why. Not SECURITY DEFINER itself, reachable only via api.approve_location_disclosure().';

create or replace function api.approve_location_disclosure(
  p_engagement_id uuid, p_disclosure_id uuid, p_engagement_event_id uuid,
  p_fee_assessment_id uuid, p_fee_assessment_event_id uuid,
  p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.approve_location_disclosure(
    p_engagement_id, p_disclosure_id, p_engagement_event_id,
    p_fee_assessment_id, p_fee_assessment_event_id,
    p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

revoke all on function work.approve_location_disclosure(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function api.approve_location_disclosure(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.approve_location_disclosure(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;

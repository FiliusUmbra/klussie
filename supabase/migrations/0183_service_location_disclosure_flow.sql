-- Founder decision (continued from 0182): the actual behavior change. Corrects
-- work.accept_quote() (originally 0087/0090-era, most recently defined 0146) so quote
-- acceptance no longer implicitly discloses the exact address -- it never did that on
-- purpose, but it did create an 'active' engagement immediately, and this schema's own
-- RLS admits an 'active' engagement's performing workspace to the property row
-- unconditionally. The fix is entirely about *when* an engagement reaches 'active', not
-- about workspace.grant_engagement_access() or 0162's consumer, neither of which changes
-- here at all.
--
-- Never edits a shipped migration -- this is `create or replace function` against
-- already-defined functions, the same idiom 0173-0179 already used repeatedly this
-- cutover for the same reason.

-- =========================================================================
-- 1 · CORRECTED work.accept_quote() — creates the engagement 'pending_disclosure', not
-- 'active'; moves the request to accepted_pending_location_approval, not booked; does NOT
-- emit marketplace.engagement.created here anymore (moved to disclosure approval, below) —
-- 0162's own consumer is unmodified and unaware this changed; it only ever reacts to the
-- event, and the event now simply fires later than it used to.

create or replace function work.accept_quote(p_quote_id uuid, p_engagement_id uuid, p_event_id uuid, p_engagement_event_id uuid, p_declined_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_request_id          uuid;
  v_offering_ws          uuid;
  v_price                numeric;
  v_requesting_ws         uuid;
  v_declined_ids          uuid[];
begin
  select request_id, offering_workspace_id, price
    into v_request_id, v_offering_ws, v_price
  from work.quotes
  where id = p_quote_id and status = 'sent';

  if v_request_id is null then
    raise exception
      'work.accept_quote: quote % does not exist or is not open', p_quote_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update work.quotes
  set status = 'accepted', responded_at = now()
  where id = p_quote_id;

  with declined as (
    update work.quotes
    set status = 'declined', responded_at = now()
    where request_id = v_request_id and id <> p_quote_id and status = 'sent'
    returning id
  )
  select array_agg(id) into v_declined_ids from declined;

  select requesting_workspace_id into v_requesting_ws
  from work.requests where id = v_request_id;

  -- Founder decision: quote acceptance alone must not disclose the address. The request
  -- moves to accepted_pending_location_approval, not booked -- the client reads this
  -- status specifically to render the disclosure-consent prompt, not a confirmation screen.
  update work.requests
  set status = 'accepted_pending_location_approval', updated_at = now()
  where id = v_request_id;

  -- Still created now, not deferred -- work.accept_quote_for_caller() opens the customer<->
  -- pro conversation immediately after this call returns, and that needs a real engagement
  -- row to reference (checked directly: work.open_conversation_for_engagement() only reads
  -- requesting_workspace_id/performing_workspace_id, not status). 'pending_disclosure' is
  -- what makes this safe -- 0182's own trigger refuses to let status reach 'active' without
  -- a matching, unrevoked work.location_disclosures row existing first.
  insert into work.engagements (
    id, request_id, quote_id, requesting_workspace_id, performing_workspace_id, agreed_price, status
  ) values (
    p_engagement_id, v_request_id, p_quote_id, v_requesting_ws, v_offering_ws, v_price, 'pending_disclosure'
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.quote.accepted',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'quote',
    p_subject_id     => p_quote_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('requestId', v_request_id, 'engagementId', p_engagement_id)
  );

  -- marketplace.engagement.created is deliberately NOT emitted here anymore -- see
  -- work.approve_location_disclosure() below, §2. p_engagement_event_id is still accepted
  -- as a parameter (unused here) so the client-side call shape and every existing caller of
  -- work.accept_quote_for_caller()/api.accept_quote() need no signature change; the id is
  -- reused as the engagement-creation event's own id when disclosure is approved.

  if v_declined_ids is not null then
    perform platform.emit_event(
      p_event_id       => p_declined_event_id,
      p_event_type     => 'marketplace.quote.declined',
      p_workspace_id   => v_requesting_ws,
      p_actor_type     => p_actor_type,
      p_actor_ref      => p_actor_ref,
      p_subject_type   => 'request',
      p_subject_id     => v_request_id,
      p_correlation_id => p_correlation_id,
      p_payload        => jsonb_build_object('declinedQuoteIds', to_jsonb(v_declined_ids), 'reason', 'superseded_by_acceptance')
    );
  end if;
end;
$$;

comment on function work.accept_quote(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Corrected for the mandatory-disclosure-consent founder decision (0182/0183): creates the engagement pending_disclosure, not active, and moves the request to accepted_pending_location_approval, not booked. marketplace.engagement.created no longer fires here -- see work.approve_location_disclosure(). Signature unchanged from the original (0146-era) definition; p_engagement_event_id is accepted but unused here, reused by the disclosure-approval step.';

-- =========================================================================
-- 2 · DISCLOSURE APPROVAL — the one and only place an engagement reaches 'active' and the
-- one and only place marketplace.engagement.created fires. 0162's consumer, unmodified,
-- reacts to this exactly as it always has.

create or replace function work.approve_location_disclosure(
  p_engagement_id   uuid,
  p_disclosure_id   uuid,
  p_engagement_event_id uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text
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

  -- The audit record and the enforcement gate, one insert -- 0182's own trigger checks for
  -- exactly this row before allowing the status update three lines below to succeed.
  insert into work.location_disclosures (
    id, request_id, quote_id, disclosing_workspace_id, receiving_workspace_id, approved_by
  ) values (
    p_disclosure_id, v_request_id, v_quote_id, v_requesting_ws, v_performing_ws, v_approver
  );

  update work.engagements set status = 'active' where id = p_engagement_id;

  update work.requests set status = 'booked', updated_at = now() where id = v_request_id;

  -- Same event type, same payload shape work.accept_quote() used to emit at acceptance
  -- time -- 0162's consumer needs no change at all, it simply receives this event later
  -- than it used to.
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
end;
$$;

comment on function work.approve_location_disclosure(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'The founder-mandated explicit disclosure-consent action -- "Adres delen en boeking bevestigen". Only place an engagement reaches active and only place marketplace.engagement.created fires (0162''s consumer unmodified). Inserts the audit/gate record (work.location_disclosures) in the same transaction as the status flip. Not SECURITY DEFINER itself, reachable only via api.approve_location_disclosure().';

create or replace function api.approve_location_disclosure(
  p_engagement_id uuid, p_disclosure_id uuid, p_engagement_event_id uuid,
  p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.approve_location_disclosure(p_engagement_id, p_disclosure_id, p_engagement_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

comment on function api.approve_location_disclosure(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'Delegate for work.approve_location_disclosure(). "Nog niet" calls nothing -- the request simply stays accepted_pending_location_approval; there is no decline function because there is nothing to record for declining.';

revoke all on function work.approve_location_disclosure(uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function api.approve_location_disclosure(uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.approve_location_disclosure(uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;

-- =========================================================================
-- 3 · ACCESS INSTRUCTIONS — separate customer control, settable any time after booked,
-- optional. Clearing on cancel/complete is already handled by 0182's own
-- engagements_revoke_access_on_terminal_status trigger.

create or replace function work.set_engagement_access_notes(p_engagement_id uuid, p_access_instructions text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_requesting_ws uuid;
  v_status        text;
  v_setter        uuid;
begin
  select requesting_workspace_id, status into v_requesting_ws, v_status
  from work.engagements where id = p_engagement_id;

  if v_requesting_ws is null or not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_requesting_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'active' then
    raise exception
      'work.set_engagement_access_notes: engagement % is % , not active', p_engagement_id, v_status
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select person_ref into v_setter from identity.identities where auth_user_id = auth.uid();

  insert into work.engagement_access_notes (engagement_id, access_instructions, set_by)
  values (p_engagement_id, p_access_instructions, v_setter)
  on conflict (engagement_id) do update
    set access_instructions = excluded.access_instructions, set_by = excluded.set_by, set_at = now(), cleared_at = null;
end;
$$;

comment on function work.set_engagement_access_notes(uuid, text) is
  'Founder decision: access instructions are a separate, optional customer action from disclosure approval, settable any time the engagement is active. Cleared automatically on cancellation/completion by 0182''s own engagements_revoke_access_on_terminal_status trigger.';

create or replace function api.set_engagement_access_notes(p_engagement_id uuid, p_access_instructions text)
returns void
language sql
security definer
set search_path = ''
as $$
  select work.set_engagement_access_notes(p_engagement_id, p_access_instructions);
$$;

revoke all on function work.set_engagement_access_notes(uuid, text) from public, anon, authenticated, service_role;
revoke all on function api.set_engagement_access_notes(uuid, text) from public, anon, service_role;
grant execute on function api.set_engagement_access_notes(uuid, text) to authenticated;

-- =========================================================================
-- 4 · APPROXIMATE-TIER READ PATH FOR MATCHING PROFESSIONALS — the only pre-approval
-- location signal a quoting pro ever receives, and the enforcement itself (its own select
-- list, not a policy someone could route around by querying the base table -- the base
-- table's own RLS already denies them entirely, since they hold no membership yet).
--
-- No new-schema "which services does this workspace offer" table exists yet (checked
-- directly) -- that linkage still lives only in legacy public.pro_services. Bridged via
-- service_id, which work.requests already carries and which is shared, unmodified, with
-- the legacy services catalogue -- the same reuse-not-re-derive precedent 0089 itself set.

create or replace function api.matching_requests_for_pro()
returns table (
  request_id uuid,
  category_id text,
  service_id uuid,
  when_pref text,
  budget numeric,
  municipality text,
  country text,
  distance_band text,
  property_type text,
  quote_prep_notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.category_id, r.service_id, r.when_pref, r.budget,
    p.municipality, p.country,
    case
      -- Distance banding is a placeholder shape, not a real distance calculation --
      -- the pro's own service-area coordinates do not exist anywhere in this schema yet.
      -- Bucket edges themselves are an open question (plan §15.9 item 3), not decided here.
      when p.latitude is null or p.longitude is null then null
      else 'unknown'
    end as distance_band,
    p.property_type,
    p.quote_prep_notes
  from work.requests r
  join public.pro_services ps
    on ps.service_id = r.service_id
   and ps.workspace_id in (select workspace_id from workspace.current_memberships())
  left join property.properties p
    on p.id = coalesce(
      r.property_id,
      (select a.property_id from property.assets a where a.id = r.asset_id),
      (select l.property_id from property.locations l where l.id = r.location_id)
    )
  where r.status in ('collecting', 'quotes_ready');
$$;

comment on function api.matching_requests_for_pro() is
  'Founder decision: matching professionals receive only municipality/country/a distance band/property type/non-identifying prep notes before disclosure approval -- never street, house number, postcode (or any prefix), coordinates, or access instructions. This function''s own select list is the enforcement; the base property.properties row is already unreachable to a quoting-but-not-yet-approved workspace via its existing RLS. Distance banding is a placeholder (no service-area geocoding exists yet, plan §15.9 item 3) -- not a real calculation.';

revoke all on function api.matching_requests_for_pro() from public, anon, service_role;
grant execute on function api.matching_requests_for_pro() to authenticated;

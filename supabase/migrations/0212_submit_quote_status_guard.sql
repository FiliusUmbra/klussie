-- Found by the same systematic *_for_caller() sweep that led to 0210 (PR #155): a
-- different class of gap in the same neighbourhood, in work.submit_quote() (0090) rather
-- than its own caller wrapper.
--
-- work.submit_quote() has never checked the request's own current status before
-- inserting a new quote -- only its own follow-up UPDATE is guarded ("where ... and
-- status = 'collecting'", a no-op once true). A pro could submit a real quote against a
-- request that has already moved to accepted_pending_location_approval, booked,
-- completed, reviewed, cancelled, or location_confirmation_required -- a job that is no
-- longer actually available.
--
-- NOT A TENANT-BOUNDARY BREACH -- work.accept_quote() ALREADY GUARDS THE REAL RISK
--
-- The dangerous-sounding version of this ("could this create a second engagement on an
-- already-booked request?") is already impossible: quotes_one_per_request_per_offeror
-- (0086) means a given offering workspace can only ever hold ONE quote row per request,
-- and work.accept_quote() only ever accepts a quote whose own status is still 'sent'
-- (0090's own "quote % does not exist or is not open" check) -- a request can only ever
-- be booked once. This is a narrower, real correctness gap: a pro can waste a real
-- quote (and, in the directed-booking case, trigger a pointless attempted auto-accept)
-- on a request that is no longer actually open, with no error telling them so.
--
-- IN PRACTICE, RARELY REACHABLE -- BUT A REAL RACE, NOT PURELY THEORETICAL
--
-- fetchProLeads() (src/lib/requests.js) already excludes any lead whose correlated
-- work.requests row has moved past 'collecting', via api.request_lifecycle_statuses() --
-- an ordinary pro browsing their own leads list is not routinely shown a request that
-- is no longer open. The gap is a genuine race: two pros load their own leads within the
-- same short window, one's quote is accepted, the other's stale list still shows the
-- request as open when they submit theirs moments later.
--
-- THE FIX
--
-- One check, at the very top of work.submit_quote() (0090), matching
-- work.accept_quote()'s own established shape immediately below it in the same
-- migration ("quote % does not exist or is not open", object_not_in_prerequisite_state):
-- the request must currently be 'collecting' or 'quotes_ready' -- open, whether or not a
-- quote has been submitted yet. Any other status (including a wholly unknown
-- p_request_id, non-enumerating the same way every other check in this codebase already
-- is) is refused before any insert happens. Every legitimate case is unaffected: a
-- second, third, or Nth quote from a DIFFERENT offering workspace on the same still-open
-- 'quotes_ready' request -- the entire point of the marketplace -- continues to work
-- exactly as before, since 'quotes_ready' remains an accepted status here.
--
-- SAME SIGNATURE, SAME MECHANISM -- NOT A NEW DECISION

create or replace function work.submit_quote(
  p_quote_id                uuid,
  p_request_id              uuid,
  p_offering_workspace_id   uuid,
  p_price                   numeric,
  p_message                 text,
  p_event_id                uuid,
  p_correlation_id          uuid,
  p_actor_type              platform.actor_type,
  p_actor_ref               text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from work.requests where id = p_request_id and status in ('collecting', 'quotes_ready')
  ) then
    raise exception
      'work.submit_quote: request % is not open for quotes', p_request_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into work.quotes (id, request_id, offering_workspace_id, price, message)
  values (p_quote_id, p_request_id, p_offering_workspace_id, p_price, p_message);

  -- Mirrors handle_quote_sent()'s own guarded update — only the first quote moves the
  -- request out of collecting; every later one is a no-op here too, the identical
  -- reasoning booking_request_lifecycle's own quotes_ready self-loop already encodes
  -- (Epic 09, migration 0070).
  update work.requests
  set status = 'quotes_ready', updated_at = now()
  where id = p_request_id and status = 'collecting';

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.quote.submitted',
    p_workspace_id   => p_offering_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'quote',
    p_subject_id     => p_quote_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('requestId', p_request_id, 'price', p_price)
  );
end;
$$;

comment on function work.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, platform.actor_type, text) is
  'Submits a quote from the offering workspace (§19). Refuses when the request is not currently open for quotes (0212) -- collecting or quotes_ready only; any other status, or a wholly unknown request id, is refused identically. Moves a still-collecting request to quotes_ready on its first quote (a no-op once already there). Emits marketplace.quote.submitted. Not SECURITY DEFINER, granted to nobody, reachable only from work.submit_quote_for_caller().';

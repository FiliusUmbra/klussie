-- Foundation Freeze Epic 01, Slice A: complete the domain event bus.
--
-- Of the full planned chain (RequestCreated -> QuoteSubmitted -> QuoteAccepted
-- -> PaymentAuthorized -> ProfessionalDispatched -> ProfessionalArrived ->
-- JobStarted -> JobCompleted -> ReviewSubmitted), only five have a real
-- underlying state transition in the schema today. This migration wires
-- exactly those five, via the same security-definer-trigger pattern already
-- used by handle_quote_sent/handle_quote_accepted/handle_new_review (see
-- ADR-0004) -- events fire at the database layer, not from client JS, so
-- they're reliable regardless of which code path triggers the mutation.
--
-- Deliberately NOT wired here, and why:
--   - PaymentAuthorized: no real payment system exists yet (Epic 04).
--   - ProfessionalDispatched / ProfessionalArrived: no corresponding status
--     exists anywhere in the schema. Inventing one just to fire an event
--     would misrepresent capability that doesn't exist -- left as a named,
--     honest gap for whichever future epic actually adds real dispatch
--     logistics, not invented here.

-- =========================================================================
-- REQUESTCREATED -- new trigger, no prior trigger existed on insert.
create or replace function public.handle_new_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.emit_domain_event('RequestCreated', jsonb_build_object(
    'requestId', new.id,
    'customerId', new.customer_id,
    'serviceId', new.service_id,
    'categoryId', new.category_id
  ));
  return new;
end;
$$;

create trigger on_request_created
  after insert on public.service_requests
  for each row execute function public.handle_new_request();

-- =========================================================================
-- QUOTESUBMITTED -- extends the existing handle_quote_sent() trigger.
create or replace function public.handle_quote_sent()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.service_requests
  set status = 'quotes_ready'
  where id = new.request_id and status = 'collecting';

  perform public.emit_domain_event('QuoteSubmitted', jsonb_build_object(
    'requestId', new.request_id,
    'quoteId', new.id,
    'proId', new.pro_id,
    'price', new.price
  ));

  return new;
end;
$$;

-- =========================================================================
-- QUOTEACCEPTED -- extends the existing handle_quote_accepted() trigger.
-- Emitted inside the same guarded branch as the existing booking logic, so
-- this only fires on a genuine collecting->accepted transition, never on an
-- unrelated update to an already-accepted quote row.
create or replace function public.handle_quote_accepted()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update public.service_requests
    set status = 'booked', booked_pro_id = new.pro_id
    where id = new.request_id;

    update public.quotes
    set status = 'declined', responded_at = now()
    where request_id = new.request_id and id <> new.id and status = 'sent';

    insert into public.conversations (request_id, customer_id, pro_id)
    select sr.id, sr.customer_id, new.pro_id
    from public.service_requests sr
    where sr.id = new.request_id
    on conflict (request_id) do nothing;

    new.responded_at = now();

    perform public.emit_domain_event('QuoteAccepted', jsonb_build_object(
      'requestId', new.request_id,
      'quoteId', new.id,
      'proId', new.pro_id
    ));
  end if;
  return new;
end;
$$;

-- =========================================================================
-- JOBCOMPLETED -- new trigger. src/lib/requests.js's markComplete() does a
-- plain status update with no trigger behind it today; this adds one,
-- guarded so it only fires on a genuine transition into 'completed', not
-- every update to an already-completed row.
create or replace function public.handle_job_completed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.emit_domain_event('JobCompleted', jsonb_build_object(
      'requestId', new.id,
      'customerId', new.customer_id,
      'proId', new.booked_pro_id
    ));
  end if;
  return new;
end;
$$;

create trigger on_job_completed
  after update on public.service_requests
  for each row execute function public.handle_job_completed();

-- =========================================================================
-- REVIEWSUBMITTED -- extends the existing handle_new_review() trigger.
create or replace function public.handle_new_review()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.pro_stats
  set rating_count = rating_count + 1,
      rating_avg = round((((rating_avg * rating_count) + new.stars) / (rating_count + 1))::numeric, 2)
  where pro_id = new.pro_id;

  update public.service_requests
  set status = 'reviewed'
  where id = new.request_id;

  perform public.emit_domain_event('ReviewSubmitted', jsonb_build_object(
    'reviewId', new.id,
    'requestId', new.request_id,
    'proId', new.pro_id,
    'stars', new.stars
  ));

  return new;
end;
$$;

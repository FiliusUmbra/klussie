-- Epic 12 WP06 — the marketplace engine contract: request lifecycle, quoting,
-- acceptance, engagement completion, and reads.
--
-- event_type CORRECTED TO ADR-0019's OWN FORMAT — FOUND DURING EPIC 15
--
-- ADR-0019 requires `event_type` as `<engine>.<aggregate>.<past-participle>`, enforced by
-- platform.events' own `events_type_format` check (0021). Every call below used a bare
-- PascalCase name, conflating SYSTEM_ARCHITECTURE.md §8.4's own CONCEPTUAL event names
-- with the literal serialized column value — a mistake caught session-wide while building
-- Epic 15's own diagnostic (`implementation/epic-15/COMPLETION.md` §6). Corrected: engine
-- = marketplace (§8.4's own section), aggregate matching each event's own `subject_type`
-- (request/quote/engagement) except `ReviewSubmitted`, whose `subject_type` is `'request'`
-- for storage reasons (no `work.reviews` aggregate exists yet) but whose logical aggregate
-- is still a review — `marketplace.review.submitted`, not `marketplace.request.submitted`,
-- which would misname what happened. `RequestCreated` -> `marketplace.request.created`;
-- `RequestWithdrawn` -> `marketplace.request.withdrawn`; `QuoteSubmitted` -> `marketplace.
-- quote.submitted`; `QuoteDeclined` -> `marketplace.quote.declined`; `QuoteAccepted` ->
-- `marketplace.quote.accepted`; `EngagementCreated` -> `marketplace.engagement.created`;
-- `EngagementCompleted` -> `marketplace.engagement.completed`; `EngagementCancelled` ->
-- `marketplace.engagement.cancelled`; `ReviewSubmitted` -> `marketplace.review.submitted`.
--
-- NO api.* DELEGATE — property.reparent_location()'s PRECEDENT, NOW A SIXTH TIME
--
-- No client caller exists yet — see 0085's own header for this epic's full scope
-- boundary. All thirteen functions below are granted to klussie_engine_work only.
--
-- work.accept_quote() DOES NOT MINT MULTIPLE IDS FOR THE OTHER QUOTES IT DECLINES
--
-- Accepting a quote declines every other open quote on the same request — legacy's own
-- handle_quote_accepted() does exactly this in one UPDATE statement. That UPDATE is
-- reused here (one statement, however many rows it touches), but it does NOT emit one
-- QuoteDeclined event per declined row, because that would require minting N event ids
-- with none supplied — exactly the shape work.generate_due_obligation() (Epic 10) and
-- work.grant_capability() (Epic 04) already ruled out for the identical reason. Instead,
-- ONE consolidated event fires, with every declined quote's id in its payload, using
-- p_declined_event_id — a single, required, caller-supplied parameter, used only when
-- there was in fact at least one other quote to decline. This is the fourth time this
-- exact shape (a conditional, single, always-required id parameter for a variable-count
-- side effect) has been needed in this roadmap; the pattern is now well-established.
--
-- THE SCOPED ACCESS GRANT IS NOT BUILT HERE — NOT EVEN AS AN UNWIRED FUNCTION, BECAUSE
-- IT CANNOT BE, FROM THIS SCHEMA
--
-- §8/§19: "Accepting a quote creates an engagement, which creates a scoped, time-bounded
-- membership for the performing workspace." The first draft of this migration built
-- work.grant_engagement_access(), a function living in `work` that INSERTs directly into
-- workspace.memberships. Checked against migration 0019's own grant table before this
-- shipped: klussie_engine_work holds no privilege whatsoever on workspace.memberships —
-- only klussie_engine_workspace does (migration 0030) — so that function would fail on
-- privileges the moment anyone actually called it, which is precisely what §9's "an
-- engine writing another engine's schema must fail on privileges" rule exists to
-- guarantee. This is not a restriction to work around with a grant; workspace.workspaces
-- section of SYSTEM_ARCHITECTURE.md already names the correct shape directly: "Events
-- consumed. EngagementAccepted (to create a scoped, expiring grant)" — the Workspace
-- engine consumes an event and creates the grant itself, with its own role, inside its
-- own schema. This epic emits real events with a real engagement id in every payload
-- (below); a future Workspace-owned consumer, not built in this epic or anywhere in this
-- roadmap yet (no real background event consumer exists — MASTER_CONTEXT.md §12), is
-- where the grant itself belongs. Recorded in implementation/epic-12/COMPLETION.md §5 as
-- a real architectural finding, not a restatement of the "no live wiring" restraint
-- every other engine epic has held — this one is a genuine cross-schema boundary the
-- code itself enforces, caught before it shipped rather than left to fail at runtime on
-- a real database.
--
-- ONE NAMING INCONSISTENCY IN THE FROZEN DOCUMENTS THEMSELVES, NOTED RATHER THAN
-- SILENTLY RESOLVED
--
-- SYSTEM_ARCHITECTURE.md §8.4 names this engine's own produced event EngagementCreated;
-- the Workspace engine's own section names the event it consumes for the identical
-- real-world moment EngagementAccepted. This migration emits EngagementCreated, matching
-- §8.4's authority over what THIS engine produces — the discrepancy is between two
-- sections of the frozen architecture describing the same fact, not a decision this
-- migration had to make, and is recorded rather than quietly papered over.
--
-- work.mark_request_reviewed() EXISTS WITHOUT A work.reviews TABLE BEHIND IT
--
-- Legacy handle_new_review() has two effects: it updates pro_stats (a projection this
-- epic does not touch — reputation stays deferred, see implementation/epic-12/
-- COMPLETION.md §5) and it moves service_requests.status to 'reviewed'. Only the second
-- is a request-lifecycle fact this engine owns. Review CONTENT — stars, body — has no
-- new-schema home yet; public.reviews remains where it lives. This function completes
-- the request's own state machine (collecting -> quotes_ready -> booked -> completed ->
-- reviewed) without inventing a review aggregate this epic was not asked to build.

-- =========================================================================
-- THE LOGIC — request lifecycle

create or replace function work.create_request(
  p_request_id             uuid,
  p_requesting_workspace_id uuid,
  p_property_id            uuid,
  p_asset_id               uuid,
  p_location_id            uuid,
  p_category_id            text,
  p_service_id             uuid,
  p_details                text,
  p_when_pref              text,
  p_budget                 numeric,
  p_event_id               uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into work.requests (
    id, requesting_workspace_id, property_id, asset_id, location_id,
    category_id, service_id, details, when_pref, budget
  ) values (
    p_request_id, p_requesting_workspace_id, p_property_id, p_asset_id, p_location_id,
    p_category_id, p_service_id, p_details, p_when_pref, p_budget
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.request.created',
    p_workspace_id   => p_requesting_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'request',
    p_subject_id     => p_request_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('categoryId', p_category_id, 'serviceId', p_service_id)
  );
end;
$$;

comment on function work.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, platform.actor_type, text) is
  'Creates a request at status = collecting (the table''s own default). Mirrors on_request_created (migration 0012).';

create or replace function work.withdraw_request(
  p_request_id      uuid,
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
  v_workspace_id  uuid;
begin
  update work.requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id and status in ('collecting', 'quotes_ready')
  returning requesting_workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception
      'work.withdraw_request: request % does not exist or is past the point a withdrawal applies', p_request_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.request.withdrawn',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'request',
    p_subject_id     => p_request_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function work.withdraw_request(uuid, uuid, uuid, platform.actor_type, text) is
  'Withdraws a request before it is booked. No current caller exercises this (no writer of status = cancelled exists in the legacy product either), but §8.4 names RequestWithdrawn as a real produced event and request lifecycle as a real owned responsibility — built as a genuine contract entry, not left absent for lack of a caller today.';

-- =========================================================================
-- THE LOGIC — quoting

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
  'Mirrors handle_quote_sent() (migrations 0001/0012): the first quote moves the request to quotes_ready; every later one leaves it exactly where it was.';

create or replace function work.decline_quote(
  p_quote_id        uuid,
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
  v_offering_ws  uuid;
begin
  update work.quotes
  set status = 'declined', responded_at = now()
  where id = p_quote_id and status = 'sent'
  returning offering_workspace_id into v_offering_ws;

  if v_offering_ws is null then
    raise exception
      'work.decline_quote: quote % does not exist or is not open', p_quote_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.quote.declined',
    p_workspace_id   => v_offering_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'quote',
    p_subject_id     => p_quote_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('reason', 'declined')
  );
end;
$$;

comment on function work.decline_quote(uuid, uuid, uuid, platform.actor_type, text) is
  'One quote, explicitly declined by whoever offered it — a genuinely single-row action, unlike the bulk decline inside work.accept_quote() below. No current legacy caller (the product only ever declines the losing quotes as a side effect of acceptance), but a real, distinct action §8.4''s own event list names.';

-- =========================================================================
-- THE LOGIC — acceptance (the largest function in this migration)

create or replace function work.accept_quote(
  p_quote_id            uuid,
  p_engagement_id        uuid,
  p_event_id             uuid,
  p_engagement_event_id  uuid,
  p_declined_event_id    uuid,
  p_correlation_id       uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref            text
)
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

  -- Mirrors handle_quote_accepted()'s own bulk decline (migrations 0001/0012) in one
  -- statement, however many rows it touches — see this migration's own header for why
  -- no per-row event follows it.
  with declined as (
    update work.quotes
    set status = 'declined', responded_at = now()
    where request_id = v_request_id and id <> p_quote_id and status = 'sent'
    returning id
  )
  select array_agg(id) into v_declined_ids from declined;

  select requesting_workspace_id into v_requesting_ws
  from work.requests where id = v_request_id;

  update work.requests
  set status = 'booked', updated_at = now()
  where id = v_request_id;

  insert into work.engagements (
    id, request_id, quote_id, requesting_workspace_id, performing_workspace_id, agreed_price
  ) values (
    p_engagement_id, v_request_id, p_quote_id, v_requesting_ws, v_offering_ws, v_price
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

  perform platform.emit_event(
    p_event_id       => p_engagement_event_id,
    p_event_type     => 'marketplace.engagement.created',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'engagement',
    p_subject_id     => p_engagement_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('requestId', v_request_id, 'performingWorkspaceId', v_offering_ws)
  );

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
  'Mirrors handle_quote_accepted() (migrations 0001/0012) exactly: accepts one quote, declines every other open quote on the same request in one statement, books the request, and creates the engagement — all in one transaction. Does NOT create the scoped workspace.memberships grant — that belongs to the Workspace engine, consuming this function''s own EngagementCreated event, not to this schema at all. See this migration''s own header.';

-- =========================================================================
-- THE LOGIC — engagement resolution

create or replace function work.complete_engagement(
  p_engagement_id   uuid,
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
  v_requesting_ws  uuid;
  v_request_id      uuid;
begin
  update work.engagements
  set status = 'completed', completed_at = now()
  where id = p_engagement_id and status = 'active'
  returning requesting_workspace_id, request_id into v_requesting_ws, v_request_id;

  if v_requesting_ws is null then
    raise exception
      'work.complete_engagement: engagement % does not exist or is not active', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update work.requests
  set status = 'completed', updated_at = now()
  where id = v_request_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.engagement.completed',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'engagement',
    p_subject_id     => p_engagement_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function work.complete_engagement(uuid, uuid, uuid, platform.actor_type, text) is
  'Mirrors src/lib/requests.js''s markComplete(): the request follows the engagement to completed. Does not create a Service Record — that connection (§14.3: "produces a Service Record on completion") is named, not wired, in work.engagements.service_record_id''s own comment (0087).';

create or replace function work.cancel_engagement(
  p_engagement_id   uuid,
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
  v_requesting_ws  uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception
      'work.cancel_engagement: a cancellation reason is required'
      using errcode = 'invalid_parameter_value';
  end if;

  update work.engagements
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
  where id = p_engagement_id and status = 'active'
  returning requesting_workspace_id into v_requesting_ws;

  if v_requesting_ws is null then
    raise exception
      'work.cancel_engagement: engagement % does not exist or is not active', p_engagement_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.engagement.cancelled',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'engagement',
    p_subject_id     => p_engagement_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('reason', p_reason)
  );
end;
$$;

comment on function work.cancel_engagement(uuid, text, uuid, uuid, platform.actor_type, text) is
  'No current legacy equivalent exists (nothing cancels a booking today), but §19''s own status vocabulary and this engine''s "Managing the bilateral relationship" responsibility (§8.4) both name it as real. Requires a reason, matching work.cancel_maintenance_obligation()''s own posture (Epic 10).';

create or replace function work.mark_request_reviewed(
  p_request_id      uuid,
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
  v_requesting_ws  uuid;
begin
  update work.requests
  set status = 'reviewed', updated_at = now()
  where id = p_request_id and status = 'completed'
  returning requesting_workspace_id into v_requesting_ws;

  if v_requesting_ws is null then
    raise exception
      'work.mark_request_reviewed: request % does not exist or is not completed', p_request_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'marketplace.review.submitted',
    p_workspace_id   => v_requesting_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'request',
    p_subject_id     => p_request_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function work.mark_request_reviewed(uuid, uuid, uuid, platform.actor_type, text) is
  'Completes the request''s own state machine (mirrors handle_new_review()''s status side effect, migrations 0001/0012). Review content itself has no new-schema home yet — see this migration''s own header.';

-- =========================================================================
-- THE LOGIC — reads

create or replace function work.my_requests(p_workspace_id uuid)
returns table (id uuid, category_id text, service_id uuid, status text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select r.id, r.category_id, r.service_id, r.status, r.created_at
  from work.requests r
  where r.requesting_workspace_id = p_workspace_id;
$$;

create or replace function work.resolve_request(p_request_id uuid)
returns table (
  id uuid, requesting_workspace_id uuid, property_id uuid, asset_id uuid, location_id uuid,
  category_id text, service_id uuid, details text, when_pref text, budget numeric,
  status text, workflow_instance_id uuid, created_at timestamptz, updated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select r.id, r.requesting_workspace_id, r.property_id, r.asset_id, r.location_id,
         r.category_id, r.service_id, r.details, r.when_pref, r.budget,
         r.status, r.workflow_instance_id, r.created_at, r.updated_at
  from work.requests r
  where r.id = p_request_id;
$$;

create or replace function work.quotes_for_request(p_request_id uuid)
returns table (id uuid, offering_workspace_id uuid, price numeric, message text, status text, sent_at timestamptz, responded_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select q.id, q.offering_workspace_id, q.price, q.message, q.status, q.sent_at, q.responded_at
  from work.quotes q
  where q.request_id = p_request_id
  order by q.sent_at;
$$;

create or replace function work.my_quotes(p_workspace_id uuid)
returns table (id uuid, request_id uuid, price numeric, status text, sent_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select q.id, q.request_id, q.price, q.status, q.sent_at
  from work.quotes q
  where q.offering_workspace_id = p_workspace_id;
$$;

create or replace function work.my_engagements(p_workspace_id uuid)
returns table (id uuid, request_id uuid, requesting_workspace_id uuid, performing_workspace_id uuid, agreed_price numeric, status text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select e.id, e.request_id, e.requesting_workspace_id, e.performing_workspace_id, e.agreed_price, e.status, e.created_at
  from work.engagements e
  where e.requesting_workspace_id = p_workspace_id or e.performing_workspace_id = p_workspace_id;
$$;

-- =========================================================================
-- ACCESS

revoke all on function work.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.withdraw_request(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.decline_quote(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.accept_quote(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.complete_engagement(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.cancel_engagement(uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.mark_request_reviewed(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function work.my_requests(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.resolve_request(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.quotes_for_request(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.my_quotes(uuid)
  from public, anon, authenticated, service_role;
revoke all on function work.my_engagements(uuid)
  from public, anon, authenticated, service_role;

grant execute on function work.create_request(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.withdraw_request(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.submit_quote(uuid, uuid, uuid, numeric, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.decline_quote(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.accept_quote(uuid, uuid, uuid, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.complete_engagement(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.cancel_engagement(uuid, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.mark_request_reviewed(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_work;
grant execute on function work.my_requests(uuid)
  to klussie_engine_work;
grant execute on function work.resolve_request(uuid)
  to klussie_engine_work;
grant execute on function work.quotes_for_request(uuid)
  to klussie_engine_work;
grant execute on function work.my_quotes(uuid)
  to klussie_engine_work;
grant execute on function work.my_engagements(uuid)
  to klussie_engine_work;

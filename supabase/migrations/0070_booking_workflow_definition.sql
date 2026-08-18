-- Epic 09 WP05 — the real booking-lifecycle definition: the five legacy triggers'
-- decisions, reproduced as published, versioned configuration.
--
-- This is the deliverable Conflict 3's resolution actually describes — "decisions...
-- move to workflow definitions" — not a hypothetical example, the ACTUAL rules
-- on_quote_sent, on_quote_accepted, on_job_completed and on_review_created carry today
-- (public.service_requests.status / public.quotes.status, migrations 0001 and 0012).
-- Not wired to those tables — see 0066's header for why that is Epic 12's own job — but
-- a real, checkable artifact proving the shape is correct before Epic 12 pins a live
-- instance to it.
--
-- STAGE NAMES AND EVENT KEYS ARE THE EXISTING VOCABULARY, NOT NEW ONES
--
-- Stages are public.service_requests.status' own five values, unchanged: collecting,
-- quotes_ready, booked, completed, reviewed. Event keys are the domain event names
-- migration 0012 already emits: RequestCreated, QuoteSubmitted, QuoteAccepted,
-- JobCompleted, ReviewSubmitted. Reusing rather than renaming means the shadow
-- verification (VERIFY_BOOKING_WORKFLOW_DEFINITION.sql) and Epic 12's eventual wiring
-- both have nothing to translate.
--
-- THE ONE STAGE-GRAPH DETAIL THE LEGACY TRIGGERS HANDLE IMPLICITLY, MADE EXPLICIT HERE
--
-- handle_quote_sent() guards its own update with `where status = 'collecting'` — a
-- second and any later quote submitted while already quotes_ready changes nothing. A
-- workflow instance has no such implicit guard; without a matching rule, a second
-- QuoteSubmitted from quotes_ready would be an impossible transition and work.
-- transition_workflow_instance() would raise. Rule 3 below is a deliberate
-- quotes_ready -> quotes_ready self-loop on the same event, reproducing the legacy
-- no-op exactly rather than turning a harmless second quote into an error.
--
-- WHAT IS DELIBERATELY NOT REPRODUCED HERE, AND WHY
--
-- handle_quote_accepted() does three things: move the request to 'booked' (the
-- transition), decline every other open quote, and open a conversation. Only the first
-- is a stage transition — the other two are the "cascading changes" Conflict 3 also
-- names as belonging to workflow definitions eventually, but no action/effect mechanism
-- exists on work.workflow_transition_rules yet (this epic's own restraint — see 0066).
-- Epic 12 designs that mechanism when it has a real instance to attach the effect to;
-- recorded here as a named gap, not silently dropped.
--
-- ACTOR_ROLE — READ FROM THE REAL CALLERS, NOT ASSUMED
--
-- Checked against src/lib/requests.js and src/customer/CustomerApp.jsx rather than
-- guessed: service_requests are customer-created (RequestCreated), quotes are
-- pro-submitted (QuoteSubmitted, both rules), acceptance is a customer action
-- (CustomerApp.jsx's own acceptQuote, QuoteAccepted), markComplete is called from
-- CustomerApp.jsx (JobCompleted — a customer action; the pro never marks their own job
-- complete in the current product), and reviews are customer-authored (ReviewSubmitted).
--
-- WHY A do BLOCK, NOT A PLAIN INSERT — IDEMPOTENCY WITH A GENERATED PRIMARY KEY
--
-- Every id below is a real UUIDv7, minted by platform.uuid_v7_at(now()) per roadmap §3's
-- own rule ("a backfill that can only be run once is a backfill that cannot be
-- trusted") — but a plain re-run of `insert ... values (platform.uuid_v7_at(now()), ...)`
-- would mint a NEW id on every run and either violate work.workflow_definitions_key_
-- version_unique (leaving a half-failed statement) or, with `on conflict do nothing` on
-- only the parent, silently orphan freshly-minted stage/rule ids no definition ever
-- referenced. A do block resolves this exactly once per run: mint and insert only if
-- the (definition_key, version) pair does not already exist, otherwise a pure no-op —
-- the same guarantee the CTE-based backfills (0026, 0052, 0060) give their own inserts,
-- expressed procedurally because this seed's parent-then-children shape has no existing
-- source table to select the same ids back out of on a second run.

do $$
declare
  v_definition_id uuid;
begin
  if exists (
    select 1 from work.workflow_definitions
    where definition_key = 'booking_request_lifecycle' and version = 1
  ) then
    return;
  end if;

  v_definition_id := platform.uuid_v7_at(now());

  insert into work.workflow_definitions (id, definition_key, version, workspace_id, name, description)
  values (
    v_definition_id,
    'booking_request_lifecycle',
    1,
    null,
    'Booking request lifecycle',
    'The path a service request follows from creation to review, reproducing the decisions public.on_request_created / on_quote_sent / on_quote_accepted / on_job_completed / on_review_created carry today (SUPABASE_ARCHITECTURE.md §23 Conflict 3). Not yet wired to a live instance — see this migration''s own header.'
  );

  insert into work.workflow_stages (id, definition_id, stage_key, sequence, is_terminal) values
    (platform.uuid_v7_at(now()), v_definition_id, 'collecting',   1, false),
    (platform.uuid_v7_at(now()), v_definition_id, 'quotes_ready', 2, false),
    (platform.uuid_v7_at(now()), v_definition_id, 'booked',       3, false),
    (platform.uuid_v7_at(now()), v_definition_id, 'completed',    4, false),
    (platform.uuid_v7_at(now()), v_definition_id, 'reviewed',     5, true);

  insert into work.workflow_transition_rules (id, definition_id, from_stage, to_stage, event_key, actor_role) values
    -- Rule 1: instance start. Mirrors on_request_created (migration 0012).
    (platform.uuid_v7_at(now()), v_definition_id, null,           'collecting',   'RequestCreated',  'customer'),
    -- Rule 2: the first quote moves the request out of collecting. Mirrors
    -- handle_quote_sent's `where status = 'collecting'` branch (migrations 0001/0012).
    (platform.uuid_v7_at(now()), v_definition_id, 'collecting',   'quotes_ready', 'QuoteSubmitted',  'pro'),
    -- Rule 3: every later quote is a no-op stage-wise — see this migration's own header.
    (platform.uuid_v7_at(now()), v_definition_id, 'quotes_ready', 'quotes_ready', 'QuoteSubmitted',  'pro'),
    -- Rule 4: acceptance books the request. Mirrors handle_quote_accepted's own guarded
    -- branch (migrations 0001/0012) — the decline-other-quotes and open-conversation
    -- side effects are the named gap in this migration's own header.
    (platform.uuid_v7_at(now()), v_definition_id, 'quotes_ready', 'booked',       'QuoteAccepted',   'customer'),
    -- Rule 5: completion. Mirrors handle_job_completed's guarded `old.status is
    -- distinct from 'completed'` branch (migration 0012).
    (platform.uuid_v7_at(now()), v_definition_id, 'booked',       'completed',    'JobCompleted',    'customer'),
    -- Rule 6: review closes the instance (reviewed is terminal). Mirrors
    -- handle_new_review (migrations 0001/0012).
    (platform.uuid_v7_at(now()), v_definition_id, 'completed',    'reviewed',     'ReviewSubmitted', 'customer');
end;
$$;

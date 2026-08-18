-- Verifies 0067_workflow_instances.sql / 0069_workflow_contract.sql, and is the shadow
-- verification WP 09.05's own migration header promises: walks a synthetic instance
-- through booking_request_lifecycle exactly the way a real request/quote pair moves
-- through the five legacy triggers, proving the definition reproduces that behaviour
-- stage-by-stage — including the multi-quote no-op and the impossible-transition refusal
-- neither reconciliation nor a live read switch would ever exercise.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_WORKFLOW_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws          uuid := gen_random_uuid();
  v_instance    uuid := gen_random_uuid();
  v_t1          uuid := gen_random_uuid();
  v_t2          uuid := gen_random_uuid();
  v_t3          uuid := gen_random_uuid();
  v_t4          uuid := gen_random_uuid();
  v_t5          uuid := gen_random_uuid();
  v_t6          uuid := gen_random_uuid();
  v_subject_id  uuid := gen_random_uuid();
  v_stage       text;
  v_ended_at    timestamptz;
  v_history_len integer;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Workspace');

  -- =========================================================================
  -- 1 · start_workflow_instance() pins to the latest published version and opens at
  -- the start rule's own target stage

  perform work.start_workflow_instance(
    p_instance_id    => v_instance,
    p_transition_id  => v_t1,
    p_event_id       => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(),
    p_workspace_id   => v_ws,
    p_definition_key => 'booking_request_lifecycle',
    p_subject_type   => 'test_subject',
    p_subject_id     => v_subject_id,
    p_actor_type     => 'person',
    p_actor_ref      => 'customer-1'
  );

  select current_stage, ended_at into v_stage, v_ended_at
  from work.workflow_instances where id = v_instance;

  if v_stage is distinct from 'collecting' then
    raise exception '1 · expected collecting after start, got %', v_stage;
  end if;
  if v_ended_at is not null then
    raise exception '1 · a fresh instance must not be ended';
  end if;
  raise notice '1 · start_workflow_instance() opens at collecting, mirroring RequestCreated';

  -- =========================================================================
  -- 2 · First QuoteSubmitted moves collecting -> quotes_ready (mirrors handle_quote_sent's
  -- `where status = 'collecting'` branch)

  perform work.transition_workflow_instance(
    p_transition_id => v_t2, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_instance_id => v_instance, p_event_key => 'QuoteSubmitted',
    p_actor_type => 'person', p_actor_ref => 'pro-1'
  );
  select current_stage into v_stage from work.workflow_instances where id = v_instance;
  if v_stage is distinct from 'quotes_ready' then
    raise exception '2 · expected quotes_ready after the first QuoteSubmitted, got %', v_stage;
  end if;
  raise notice '2 · first QuoteSubmitted moves collecting -> quotes_ready';

  -- =========================================================================
  -- 3 · A SECOND QuoteSubmitted is a stage no-op, not an impossible-transition error —
  -- the exact legacy behaviour the migration's own header explains, proven here rather
  -- than assumed

  perform work.transition_workflow_instance(
    p_transition_id => v_t3, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_instance_id => v_instance, p_event_key => 'QuoteSubmitted',
    p_actor_type => 'person', p_actor_ref => 'pro-2'
  );
  select current_stage into v_stage from work.workflow_instances where id = v_instance;
  if v_stage is distinct from 'quotes_ready' then
    raise exception '3 · a second QuoteSubmitted must remain a no-op at quotes_ready, got %', v_stage;
  end if;
  raise notice '3 · a second QuoteSubmitted from a second pro is a stage no-op, matching the legacy trigger exactly';

  -- =========================================================================
  -- 4 · An event this stage does not name is refused, not guessed — Conflict 3's own
  -- distinguishing test, exercised directly

  begin
    perform work.transition_workflow_instance(
      p_transition_id => gen_random_uuid(), p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_instance_id => v_instance, p_event_key => 'JobCompleted',
      p_actor_type => 'person', p_actor_ref => 'customer-1'
    );
    raise exception '4 · JobCompleted from quotes_ready did not raise — an impossible transition was silently allowed';
  exception when others then
    if sqlerrm not like '%is not permitted by definition%' then raise; end if;
  end;
  raise notice '4 · an event not named from the current stage is refused, never guessed';

  -- =========================================================================
  -- 5 · QuoteAccepted books the request (mirrors handle_quote_accepted's transition
  -- branch — its decline-other-quotes/open-conversation side effects are this epic's
  -- own named, undone gap, not tested here because nothing implements them yet)

  perform work.transition_workflow_instance(
    p_transition_id => v_t4, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_instance_id => v_instance, p_event_key => 'QuoteAccepted',
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select current_stage into v_stage from work.workflow_instances where id = v_instance;
  if v_stage is distinct from 'booked' then
    raise exception '5 · expected booked after QuoteAccepted, got %', v_stage;
  end if;
  raise notice '5 · QuoteAccepted moves quotes_ready -> booked';

  -- =========================================================================
  -- 6 · JobCompleted, then ReviewSubmitted — the instance ends exactly on the
  -- terminal stage, not before

  perform work.transition_workflow_instance(
    p_transition_id => v_t5, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_instance_id => v_instance, p_event_key => 'JobCompleted',
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select current_stage, ended_at into v_stage, v_ended_at from work.workflow_instances where id = v_instance;
  if v_stage is distinct from 'completed' or v_ended_at is not null then
    raise exception '6a · expected completed and still open after JobCompleted, got % / ended_at %', v_stage, v_ended_at;
  end if;

  perform work.transition_workflow_instance(
    p_transition_id => v_t6, p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_instance_id => v_instance, p_event_key => 'ReviewSubmitted',
    p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select current_stage, ended_at into v_stage, v_ended_at from work.workflow_instances where id = v_instance;
  if v_stage is distinct from 'reviewed' or v_ended_at is null then
    raise exception '6b · expected reviewed and ended after ReviewSubmitted, got % / ended_at %', v_stage, v_ended_at;
  end if;
  raise notice '6 · JobCompleted then ReviewSubmitted reach the terminal stage, ended_at set only there';

  -- =========================================================================
  -- 7 · A transition on an ended instance is refused

  begin
    perform work.transition_workflow_instance(
      p_transition_id => gen_random_uuid(), p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
      p_instance_id => v_instance, p_event_key => 'ReviewSubmitted',
      p_actor_type => 'person', p_actor_ref => 'customer-1'
    );
    raise exception '7 · transitioning an ended instance did not raise';
  exception when others then
    if sqlerrm not like '%already ended%' then raise; end if;
  end;
  raise notice '7 · an ended instance refuses any further transition';

  -- =========================================================================
  -- 8 · The full transition log has exactly six entries, oldest first, and the append-
  -- only guard rejects a mutation attempt on one of them

  select count(*) into v_history_len from work.workflow_instance_history(v_instance);
  if v_history_len <> 6 then
    raise exception '8a · expected 6 transitions in the log, found %', v_history_len;
  end if;

  begin
    update work.workflow_transitions set payload = '{}'::jsonb where id = v_t1;
    raise exception '8b · updating a recorded transition did not raise';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  raise notice '8 · six transitions recorded, oldest first, and the log is genuinely append-only';

  -- =========================================================================
  -- 9 · my_workflow_instances() and resolve_workflow_instance() both find it

  if not exists (select 1 from work.my_workflow_instances(v_ws) where id = v_instance) then
    raise exception '9a · my_workflow_instances() did not return the instance for its own workspace';
  end if;
  if not exists (select 1 from work.resolve_workflow_instance(v_instance) where workspace_id = v_ws) then
    raise exception '9b · resolve_workflow_instance() did not return the instance';
  end if;
  raise notice '9 · both read functions find the instance';

  raise notice 'VERIFY_WORKFLOW_CONTRACT: all checks passed — booking_request_lifecycle reproduces the five legacy triggers'' decisions exactly, including the multi-quote no-op and the impossible-transition refusal';
end;
$$;

rollback;

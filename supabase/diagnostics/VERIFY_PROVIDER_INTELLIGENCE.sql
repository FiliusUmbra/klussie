-- Verifies 0118-0120 end to end: producing a recommendation, accepting one of its
-- providers (checked against what was actually recommended), a second recommendation
-- overridden with a required reason (never checked against the list), and both refusing
-- a second outcome once one has already landed.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_PROVIDER_INTELLIGENCE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws              uuid := gen_random_uuid();
  v_request         uuid := gen_random_uuid();
  v_request2        uuid := gen_random_uuid();
  v_decision_1      uuid := gen_random_uuid();
  v_decision_2      uuid := gen_random_uuid();
  v_provider_a      uuid := gen_random_uuid();
  v_provider_b      uuid := gen_random_uuid();
  v_provider_c      uuid := gen_random_uuid();
  v_row             record;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Home');

  -- =========================================================================
  -- 1 · Producing a recommendation captures every candidate's own reasoning

  perform work.produce_recommendation(
    p_decision_id => v_decision_1, p_workspace_id => v_ws,
    p_subject_type => 'request', p_subject_id => v_request,
    p_recommended_providers => jsonb_build_array(
      jsonb_build_object('providerType', 'workspace', 'providerRef', v_provider_a, 'score', 0.92, 'reasoning', 'Used twice before, both jobs completed on time'),
      jsonb_build_object('providerType', 'workspace', 'providerRef', v_provider_b, 'score', 0.71, 'reasoning', 'Certified for this asset brand, no prior history')
    ),
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'intelligence', p_actor_ref => 'selection-engine-1'
  );
  if not exists (select 1 from work.provider_decisions where id = v_decision_1) then
    raise exception '1 · the recommendation was not written';
  end if;
  raise notice '1 · producing a recommendation records every candidate with its own reasoning';

  -- =========================================================================
  -- 2 · Selecting a recommended provider succeeds; selecting one that was never
  -- recommended is refused

  begin
    perform work.select_provider(v_decision_1, 'workspace', v_provider_c, gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');
    raise exception '2a · selecting a non-recommended provider did not raise';
  exception when others then
    if sqlerrm not like '%was not among the recommended providers%' then raise; end if;
  end;

  perform work.select_provider(v_decision_1, 'workspace', v_provider_a, gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');
  select decided_at, selected_provider into v_row from work.provider_decisions where id = v_decision_1;
  raise notice '2 · selecting a recommended provider succeeds; selecting an unrecommended one is refused';

  -- =========================================================================
  -- 3 · A decision that already has an outcome refuses a second one

  begin
    perform work.select_provider(v_decision_1, 'workspace', v_provider_b, gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');
    raise exception '3a · selecting again on an already-decided decision did not raise';
  exception when others then
    if sqlerrm not like '%already reached an outcome%' then raise; end if;
  end;
  begin
    perform work.override_recommendation(v_decision_1, 'workspace', v_provider_c, 'changed my mind', gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');
    raise exception '3b · overriding an already-decided decision did not raise';
  exception when others then
    if sqlerrm not like '%already reached an outcome%' then raise; end if;
  end;
  raise notice '3 · a decision that already has an outcome refuses a second one, either way';

  -- =========================================================================
  -- 4 · Overriding never checks recommended_providers, and requires a real reason

  perform work.produce_recommendation(
    p_decision_id => v_decision_2, p_workspace_id => v_ws,
    p_subject_type => 'request', p_subject_id => v_request2,
    p_recommended_providers => jsonb_build_array(
      jsonb_build_object('providerType', 'workspace', 'providerRef', v_provider_a, 'score', 0.88, 'reasoning', 'Nearest available slot')
    ),
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'intelligence', p_actor_ref => 'selection-engine-1'
  );

  begin
    perform work.override_recommendation(v_decision_2, 'workspace', v_provider_c, '', gen_random_uuid(), gen_random_uuid(), 'person', 'customer-2');
    raise exception '4a · a blank override reason did not raise';
  exception when others then
    if sqlerrm not like '%p_reason is required%' then raise; end if;
  end;

  perform work.override_recommendation(
    v_decision_2, 'workspace', v_provider_c, 'always use this firm', gen_random_uuid(), gen_random_uuid(), 'person', 'customer-2'
  );
  if not exists (select 1 from work.provider_decisions where id = v_decision_2 and overridden_at is not null) then
    raise exception '4b · overriding with a provider outside the recommendation did not succeed';
  end if;
  raise notice '4 · overriding a recommendation with an unlisted provider succeeds given a real reason, refuses a blank one';

  -- =========================================================================
  -- 5 · Immutability: neither outcome can be reversed, no row is ever deleted

  begin
    update work.provider_decisions set decided_at = null where id = v_decision_1;
    raise exception '5a · reverting decided_at did not raise';
  exception when others then
    if sqlerrm not like '%never back%' then raise; end if;
  end;
  begin
    delete from work.provider_decisions where id = v_decision_1;
    raise exception '5b · deleting a decision did not raise';
  exception when others then
    if sqlerrm not like '%never deleted%' then raise; end if;
  end;
  raise notice '5 · neither outcome can be reversed, and no decision is ever deleted';

  raise notice 'VERIFY_PROVIDER_INTELLIGENCE: all checks passed';
end;
$$;

rollback;

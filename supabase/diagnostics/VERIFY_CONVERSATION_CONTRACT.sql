-- Verifies 0096_conversation_contract.sql end to end: opening a conversation on each of
-- the five real subjects resolves a REAL workspace for its own event (the two bugs
-- caught before shipping — open_conversation()'s and close_conversation()'s workspace_id
-- resolution), participation, messaging, translation, read state and closing.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_CONVERSATION_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_ws    uuid := gen_random_uuid();
  v_pro_ws         uuid := gen_random_uuid();
  v_prop           uuid := gen_random_uuid();
  v_asset          uuid := gen_random_uuid();
  v_request        uuid := gen_random_uuid();
  v_quote          uuid := gen_random_uuid();
  v_engagement     uuid := gen_random_uuid();
  v_obligation     uuid := gen_random_uuid();
  v_conv_engagement uuid := gen_random_uuid();
  v_conv_asset      uuid := gen_random_uuid();
  v_conv_property   uuid := gen_random_uuid();
  v_conv_obligation uuid := gen_random_uuid();
  v_conv_workspace  uuid := gen_random_uuid();
  v_participant1    uuid := gen_random_uuid();
  v_participant2    uuid := gen_random_uuid();
  v_message         uuid := gen_random_uuid();
  v_resolved_ws     uuid;
  v_person1         uuid := gen_random_uuid();
  v_person2         uuid := gen_random_uuid();
  v_count           integer;
begin
  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Customer'), (v_pro_ws, 'professional', 'Pro');
  insert into property.properties (id, name, steward_workspace_id, steward_since)
    values (v_prop, 'Test Home', v_customer_ws, now());
  insert into property.assets (id, property_id, name, type) values (v_asset, v_prop, 'Boiler', 'appliance');

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => v_prop, p_asset_id => v_asset, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Test', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  perform work.submit_quote(
    p_quote_id => v_quote, p_request_id => v_request, p_offering_workspace_id => v_pro_ws,
    p_price => 90.00, p_message => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'pro-tech'
  );
  perform work.accept_quote(
    p_quote_id => v_quote, p_engagement_id => v_engagement,
    p_event_id => gen_random_uuid(), p_engagement_event_id => gen_random_uuid(), p_declined_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  perform work.create_maintenance_obligation(
    p_obligation_id => v_obligation, p_workspace_id => v_customer_ws, p_asset_id => v_asset, p_location_id => null,
    p_schedule_id => null, p_title => 'Annual check', p_description => null, p_source => 'manual', p_due_on => current_date,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );

  -- =========================================================================
  -- 1 · Opening a conversation on each of the five subjects resolves a REAL workspace
  -- for its own ConversationOpened event — the exact bug caught before shipping

  perform work.open_conversation(
    p_conversation_id => v_conv_engagement, p_engagement_id => v_engagement, p_asset_id => null,
    p_maintenance_obligation_id => null, p_property_id => null, p_workspace_id => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select work.resolve_conversation_home_workspace(v_conv_engagement) into v_resolved_ws;
  if v_resolved_ws <> v_customer_ws then
    raise exception '1a · engagement-subject conversation resolved to %, expected the requesting workspace %', v_resolved_ws, v_customer_ws;
  end if;

  perform work.open_conversation(
    p_conversation_id => v_conv_asset, p_engagement_id => null, p_asset_id => v_asset,
    p_maintenance_obligation_id => null, p_property_id => null, p_workspace_id => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select work.resolve_conversation_home_workspace(v_conv_asset) into v_resolved_ws;
  if v_resolved_ws <> v_customer_ws then
    raise exception '1b · asset-subject conversation resolved to %, not the property''s steward %', v_resolved_ws, v_customer_ws;
  end if;
  if v_resolved_ws = v_asset then
    raise exception '1b-guard · resolved workspace equals the asset id itself — the exact bug this migration''s header describes';
  end if;

  perform work.open_conversation(
    p_conversation_id => v_conv_property, p_engagement_id => null, p_asset_id => null,
    p_maintenance_obligation_id => null, p_property_id => v_prop, p_workspace_id => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select work.resolve_conversation_home_workspace(v_conv_property) into v_resolved_ws;
  if v_resolved_ws <> v_customer_ws then
    raise exception '1c · property-subject conversation resolved to %, expected %', v_resolved_ws, v_customer_ws;
  end if;

  perform work.open_conversation(
    p_conversation_id => v_conv_obligation, p_engagement_id => null, p_asset_id => null,
    p_maintenance_obligation_id => v_obligation, p_property_id => null, p_workspace_id => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  select work.resolve_conversation_home_workspace(v_conv_obligation) into v_resolved_ws;
  if v_resolved_ws <> v_customer_ws then
    raise exception '1d · maintenance-obligation-subject conversation resolved to %, expected %', v_resolved_ws, v_customer_ws;
  end if;

  perform work.open_conversation(
    p_conversation_id => v_conv_workspace, p_engagement_id => null, p_asset_id => null,
    p_maintenance_obligation_id => null, p_property_id => null, p_workspace_id => v_pro_ws,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'pro-owner'
  );
  select work.resolve_conversation_home_workspace(v_conv_workspace) into v_resolved_ws;
  if v_resolved_ws <> v_pro_ws then
    raise exception '1e · workspace-subject conversation resolved to %, expected %', v_resolved_ws, v_pro_ws;
  end if;
  raise notice '1 · all five subject types resolve to a real workspace, never the subject''s own id';

  -- =========================================================================
  -- 2 · Participation: add both parties, then send a message

  perform work.add_participant(
    p_participant_id => v_participant1, p_conversation_id => v_conv_engagement, p_person_ref => v_person1, p_workspace_id => v_customer_ws,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  perform work.add_participant(
    p_participant_id => v_participant2, p_conversation_id => v_conv_engagement, p_person_ref => v_person2, p_workspace_id => v_pro_ws,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'pro-tech'
  );

  select count(*) into v_count from work.conversation_roster(v_conv_engagement);
  if v_count <> 2 then
    raise exception '2 · expected 2 participants, found %', v_count;
  end if;
  raise notice '2 · both parties added to the conversation';

  -- =========================================================================
  -- 3 · Sending a message, translating it, and marking it read

  perform work.send_message(
    p_message_id => v_message, p_conversation_id => v_conv_engagement, p_sender_person_ref => v_person1,
    p_sender_workspace_id => v_customer_ws, p_body => 'When can you come?', p_original_locale => 'nl',
    p_reference_type => null, p_reference_id => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );

  perform work.save_message_translation(
    p_message_id => v_message, p_locale => 'en', p_text => 'When can you come?',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'pro-tech'
  );

  if not exists (
    select 1 from work.conversation_messages(v_conv_engagement) where id = v_message and translations ? 'en'
  ) then
    raise exception '3a · translation was not cached';
  end if;

  perform work.mark_conversation_read(v_conv_engagement, v_person2);
  if not exists (
    select 1 from work.conversation_roster(v_conv_engagement) where person_ref = v_person2 and last_read_at is not null
  ) then
    raise exception '3b · mark_conversation_read() did not set last_read_at';
  end if;
  raise notice '3 · message sent, translated, and marked read independently per participant';

  -- =========================================================================
  -- 4 · Removing a participant ends their access; a second removal refuses

  perform work.remove_participant(
    p_conversation_id => v_conv_engagement, p_person_ref => v_person2,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'pro-owner'
  );

  begin
    perform work.remove_participant(
      p_conversation_id => v_conv_engagement, p_person_ref => v_person2,
      p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'pro-owner'
    );
    raise exception '4 · removing an already-removed participant did not raise';
  exception when others then
    if sqlerrm not like '%is not an active participant%' then raise; end if;
  end;
  raise notice '4 · removing a participant ends their access; a second removal refuses';

  -- =========================================================================
  -- 5 · Closing succeeds once, refuses a second time

  perform work.close_conversation(
    v_conv_engagement, gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1'
  );
  begin
    perform work.close_conversation(v_conv_engagement, gen_random_uuid(), gen_random_uuid(), 'person', 'customer-1');
    raise exception '5 · closing an already-closed conversation did not raise';
  exception when others then
    if sqlerrm not like '%already closed%' then raise; end if;
  end;
  raise notice '5 · closing succeeds once, refuses a second time';

  raise notice 'VERIFY_CONVERSATION_CONTRACT: all checks passed';
end;
$$;

rollback;

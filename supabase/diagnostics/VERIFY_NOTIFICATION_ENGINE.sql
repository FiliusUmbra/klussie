-- Verifies 0115-0117 end to end: raising a notification with a resolved recipient list,
-- delivering/seeing/acting on one recipient's receipt, escalating an unacknowledged one,
-- setting a preference per membership, and the identity-scoped inbox composed at read
-- time — including that it disappears once the membership ends.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_NOTIFICATION_ENGINE.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ws              uuid := gen_random_uuid();
  v_auth_1          uuid := gen_random_uuid();
  v_auth_2          uuid := gen_random_uuid();
  v_person_1        uuid := gen_random_uuid();
  v_person_2        uuid := gen_random_uuid();
  v_membership_1    uuid := gen_random_uuid();
  v_membership_2    uuid := gen_random_uuid();
  v_notification    uuid := gen_random_uuid();
  v_delivery_1      uuid := gen_random_uuid();
  v_delivery_2      uuid := gen_random_uuid();
  v_pref_id         uuid := gen_random_uuid();
  v_count           integer;
  v_status          timestamptz;
begin
  insert into workspace.workspaces (id, type, name) values (v_ws, 'personal', 'Test Home');
  insert into identity.identities (person_ref, auth_user_id, full_name) values
    (v_person_1, v_auth_1, 'Member One'), (v_person_2, v_auth_2, 'Member Two');
  insert into workspace.memberships (id, workspace_id, person_ref, role, state) values
    (v_membership_1, v_ws, v_person_1, 'owner', 'active'),
    (v_membership_2, v_ws, v_person_2, 'member', 'active');

  -- =========================================================================
  -- 1 · Raising a notification fans out to both resolved recipients in one call, no id
  -- minted internally

  perform platform.raise_notification(
    p_notification_id => v_notification, p_workspace_id => v_ws,
    p_category => 'obligation_due', p_headline => 'Boiler service is due next week',
    p_subject_type => null, p_subject_id => null, p_source_event_id => null,
    p_recipients => jsonb_build_array(
      jsonb_build_object('personRef', v_person_1, 'deliveryId', v_delivery_1, 'channel', 'in_app'),
      jsonb_build_object('personRef', v_person_2, 'deliveryId', v_delivery_2, 'channel', 'email')
    ),
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(),
    p_actor_type => 'system', p_actor_ref => 'maintenance-scheduler'
  );
  select count(*) into v_count from platform.notification_deliveries where notification_id = v_notification;
  if v_count <> 2 then
    raise exception '1 · expected 2 delivery receipts, got %', v_count;
  end if;
  raise notice '1 · raising a notification fans out to both resolved recipients in one call';

  -- =========================================================================
  -- 2 · Delivered, seen, acted — each a one-way transition, refusing a repeat

  perform platform.mark_notification_delivered(v_delivery_1, gen_random_uuid(), gen_random_uuid(), 'system', 'channel-adapter');
  perform platform.mark_notification_seen(v_delivery_1, gen_random_uuid(), gen_random_uuid(), 'person', 'member-1');
  perform platform.mark_notification_acted(v_delivery_1, gen_random_uuid(), gen_random_uuid(), 'person', 'member-1');

  select acted_at into v_status from platform.notification_deliveries where id = v_delivery_1;
  if v_status is null then
    raise exception '2a · acted_at was not set';
  end if;

  begin
    perform platform.mark_notification_seen(v_delivery_1, gen_random_uuid(), gen_random_uuid(), 'person', 'member-1');
    raise exception '2b · marking an already-seen delivery seen again did not raise';
  exception when others then
    if sqlerrm not like '%already seen%' then raise; end if;
  end;
  raise notice '2 · delivered, seen and acted are recorded, each refusing to repeat';

  -- =========================================================================
  -- 3 · An unacted delivery can be escalated; an acted one cannot

  perform platform.escalate_notification(
    v_delivery_2, 'no response after 48 hours', gen_random_uuid(), gen_random_uuid(), 'system', 'escalation-job'
  );
  begin
    perform platform.escalate_notification(v_delivery_1, 'already handled', gen_random_uuid(), gen_random_uuid(), 'system', 'escalation-job');
    raise exception '3 · escalating an already-acted-on delivery did not raise';
  exception when others then
    if sqlerrm not like '%already been acted on%' then raise; end if;
  end;
  raise notice '3 · escalation is refused once a recipient has acted';

  -- =========================================================================
  -- 4 · Preferences are per membership — setting one twice updates in place, no error,
  -- no duplicate row

  perform platform.set_notification_preference(v_pref_id, v_membership_1, '{"obligation_due": {"email": false}}'::jsonb);
  perform platform.set_notification_preference(gen_random_uuid(), v_membership_1, '{"obligation_due": {"email": true}}'::jsonb);
  select count(*) into v_count from platform.notification_preferences where membership_id = v_membership_1;
  if v_count <> 1 then
    raise exception '4 · expected exactly one preference row per membership, got %', v_count;
  end if;
  raise notice '4 · setting a preference twice updates the same row, never duplicates it';

  -- =========================================================================
  -- 5 · The inbox: each member sees only their own delivery, and it disappears once
  -- their membership ends

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_1)::text, true);
  select count(*) into v_count from platform.my_inbox();
  if v_count <> 1 then
    raise exception '5a · expected member one to see exactly their own one delivery, got %', v_count;
  end if;

  update workspace.memberships set state = 'ended' where id = v_membership_1;
  select count(*) into v_count from platform.my_inbox();
  if v_count <> 0 then
    raise exception '5b · a member whose membership ended still sees inbox items, got %', v_count;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_2)::text, true);
  select count(*) into v_count from platform.my_inbox();
  if v_count <> 1 then
    raise exception '5c · expected member two to still see their own one delivery, got %', v_count;
  end if;
  raise notice '5 · the inbox is composed at read time per identity, and disappears the moment a membership ends';

  raise notice 'VERIFY_NOTIFICATION_ENGINE: all checks passed';
end;
$$;

rollback;

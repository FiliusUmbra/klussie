-- Epic 22 WP03 — the subscription engine contract: activate, start a trial, change plan,
-- renew, lapse, expire a trial, and read the current subscription.
--
-- event_type FOLLOWS ADR-0019's OWN FORMAT FROM THE START — THE SEVENTH EPIC IN A ROW
--
-- SYSTEM_ARCHITECTURE.md §11.1's own produced-event list has six entries:
-- SubscriptionActivated/Changed/Renewed/Lapsed -> subscription.subscription.<participle>;
-- TrialStarted/Expired -> subscription.trial.<participle>. Engine token is `subscription`,
-- the snake_case of §11.1's own section title. Two aggregate tokens, not one — a
-- subscription's own lifecycle and a trial's own lifecycle are stated as genuinely
-- different events in the frozen list, not the same event with a flag.
--
-- THE FIRST TRUE CROSS-ENGINE CONTRACT CALL THIS SESSION HAS MADE
--
-- Every function this session has written until now calls only its own schema's tables and
-- platform.emit_event()/write_audit_record(). SYSTEM_ARCHITECTURE.md §11.1 is explicit that
-- Subscription "does not own capability grants themselves — it *requests* them, and
-- Capability decides" — so this migration calls workspace.grant_capability()/
-- workspace.withdraw_capability() directly, Epic 04's own contract functions, owned by
-- klussie_engine_workspace. klussie_engine_commerce needed USAGE on schema workspace and
-- EXECUTE on both functions, granted here for the first time — the same "grant only when a
-- real caller needs it" discipline every cross-schema grant this session has followed, now
-- applied to a genuine cross-ENGINE call rather than a cross-schema read.
--
-- CAPABILITIES ARE GRANTED IN THE PLAN'S OWN ORDER, AND WITHDRAWN IN REVERSE — NOT A STYLE
-- CHOICE, A CORRECTNESS REQUIREMENT
--
-- 0127's own header explains why platform.plans.capability_keys is dependency-ordered for
-- granting. workspace.withdraw_capability() has the mirror-image precondition: it refuses
-- to withdraw a capability while something still held depends on it (§6.2). Withdrawing a
-- plan's full bundle therefore walks capability_keys in REVERSE — dependents first, their
-- dependencies last — the exact opposite traversal from granting, over the same array.
--
-- GRANT/WITHDRAW LOOPS SWALLOW ONLY "ALREADY HOLDS" / "DOES NOT CURRENTLY HOLD" — EVERY
-- OTHER FAILURE STILL PROPAGATES
--
-- A workspace may already hold a capability from another source (a preset backfill, an
-- operator grant) before its first subscription activates, or may have had one withdrawn
-- already before a lapse reaches it. Both are real, harmless overlaps this contract
-- tolerates by catching exactly those two `workspace.*_capability()` error messages and
-- continuing; a genuine dependency violation (§6.2's own blocking-capability exception) is
-- a real bug in this migration's own bundle ordering and is never swallowed.

-- =========================================================================
-- THE LOGIC — activate / start a trial

create or replace function commerce.activate_subscription(
  p_subscription_id uuid,
  p_workspace_id     uuid,
  p_plan_key         text,
  p_payer            jsonb,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_capability_key text;
begin
  insert into commerce.subscriptions (id, workspace_id, plan_key, payer, status)
  values (p_subscription_id, p_workspace_id, p_plan_key, p_payer, 'active');

  for v_capability_key in
    select value from jsonb_array_elements_text(
      (select capability_keys from platform.plans where plan_key = p_plan_key)
    ) with ordinality order by ordinality
  loop
    begin
      perform workspace.grant_capability(
        gen_random_uuid(), gen_random_uuid(), p_workspace_id, v_capability_key, 'subscription',
        gen_random_uuid(), p_correlation_id, p_actor_type, p_actor_ref
      );
    exception when others then
      if sqlerrm not like '%already holds%' then raise; end if;
    end;
  end loop;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.subscription.activated',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'subscription',
    p_subject_id     => p_subscription_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('planKey', p_plan_key)
  );
end;
$$;

comment on function commerce.activate_subscription(uuid, uuid, text, jsonb, uuid, uuid, platform.actor_type, text) is
  'Creates the workspace''s one subscription row and grants every capability its plan bundles, in the catalogue''s own dependency-safe order. Already-held capabilities (e.g. from a preset) are tolerated, not refused.';

create or replace function commerce.start_trial(
  p_subscription_id uuid,
  p_workspace_id     uuid,
  p_plan_key         text,
  p_payer            jsonb,
  p_trial_ends_at    timestamptz,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_capability_key text;
begin
  insert into commerce.subscriptions (id, workspace_id, plan_key, payer, status, trial_ends_at)
  values (p_subscription_id, p_workspace_id, p_plan_key, p_payer, 'trialing', p_trial_ends_at);

  for v_capability_key in
    select value from jsonb_array_elements_text(
      (select capability_keys from platform.plans where plan_key = p_plan_key)
    ) with ordinality order by ordinality
  loop
    begin
      perform workspace.grant_capability(
        gen_random_uuid(), gen_random_uuid(), p_workspace_id, v_capability_key, 'trial',
        gen_random_uuid(), p_correlation_id, p_actor_type, p_actor_ref
      );
    exception when others then
      if sqlerrm not like '%already holds%' then raise; end if;
    end;
  end loop;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.trial.started',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'subscription',
    p_subject_id     => p_subscription_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('planKey', p_plan_key, 'trialEndsAt', p_trial_ends_at)
  );
end;
$$;

comment on function commerce.start_trial(uuid, uuid, text, jsonb, timestamptz, uuid, uuid, platform.actor_type, text) is
  'Same shape as activate_subscription(), status trialing, capabilities granted with source ''trial'' rather than ''subscription'' so expire_trial() can tell them apart later.';

-- =========================================================================
-- THE LOGIC — change plan

create or replace function commerce.change_plan(
  p_subscription_id uuid,
  p_new_plan_key     text,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id   uuid;
  v_old_plan_key   text;
  v_capability_key text;
begin
  select workspace_id, plan_key into v_workspace_id, v_old_plan_key
  from commerce.subscriptions where id = p_subscription_id;

  if v_workspace_id is null then
    raise exception 'commerce.change_plan: subscription % does not exist', p_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Grant every capability the new plan bundles that the old plan did not, in the new
  -- plan's own dependency-safe order.
  for v_capability_key in
    select value from jsonb_array_elements_text(
      (select capability_keys from platform.plans where plan_key = p_new_plan_key)
    ) with ordinality
    where value not in (
      select value from jsonb_array_elements_text(
        (select capability_keys from platform.plans where plan_key = v_old_plan_key)
      )
    )
    order by ordinality
  loop
    begin
      perform workspace.grant_capability(
        gen_random_uuid(), gen_random_uuid(), v_workspace_id, v_capability_key, 'subscription',
        gen_random_uuid(), p_correlation_id, p_actor_type, p_actor_ref
      );
    exception when others then
      if sqlerrm not like '%already holds%' then raise; end if;
    end;
  end loop;

  -- Withdraw every capability the old plan bundled that the new plan does not, in REVERSE
  -- of the old plan's own order (0130's own header: dependents before their dependencies).
  for v_capability_key in
    select value from jsonb_array_elements_text(
      (select capability_keys from platform.plans where plan_key = v_old_plan_key)
    ) with ordinality
    where value not in (
      select value from jsonb_array_elements_text(
        (select capability_keys from platform.plans where plan_key = p_new_plan_key)
      )
    )
    order by ordinality desc
  loop
    begin
      perform workspace.withdraw_capability(
        v_workspace_id, v_capability_key, gen_random_uuid(),
        gen_random_uuid(), p_correlation_id, p_actor_type, p_actor_ref
      );
    exception when others then
      if sqlerrm not like '%does not currently hold%' then raise; end if;
    end;
  end loop;

  update commerce.subscriptions set plan_key = p_new_plan_key where id = p_subscription_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.subscription.changed',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'subscription',
    p_subject_id     => p_subscription_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('fromPlanKey', v_old_plan_key, 'toPlanKey', p_new_plan_key)
  );
end;
$$;

comment on function commerce.change_plan(uuid, text, uuid, uuid, platform.actor_type, text) is
  '"Translating a plan into the capability set Capability should grant" (§11.1). Grants the bundle difference in the new plan''s own order, withdraws the difference in the old plan''s reverse order — the precondition workspace.withdraw_capability() itself enforces.';

-- =========================================================================
-- THE LOGIC — renew / lapse / expire a trial

create or replace function commerce.renew_subscription(
  p_subscription_id uuid,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  update commerce.subscriptions set renewed_at = now()
  where id = p_subscription_id
  returning workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception 'commerce.renew_subscription: subscription % does not exist', p_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.subscription.renewed',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'subscription',
    p_subject_id     => p_subscription_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function commerce.renew_subscription(uuid, uuid, uuid, platform.actor_type, text) is
  'A renewal changes no capability — the plan is unchanged, only renewed_at moves.';

create or replace function commerce.lapse_subscription(
  p_subscription_id uuid,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id   uuid;
  v_plan_key       text;
  v_capability_key text;
begin
  select workspace_id, plan_key into v_workspace_id, v_plan_key
  from commerce.subscriptions where id = p_subscription_id;

  if v_workspace_id is null then
    raise exception 'commerce.lapse_subscription: subscription % does not exist', p_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  for v_capability_key in
    select value from jsonb_array_elements_text(
      (select capability_keys from platform.plans where plan_key = v_plan_key)
    ) with ordinality order by ordinality desc
  loop
    begin
      perform workspace.withdraw_capability(
        v_workspace_id, v_capability_key, gen_random_uuid(),
        gen_random_uuid(), p_correlation_id, p_actor_type, p_actor_ref
      );
    exception when others then
      if sqlerrm not like '%does not currently hold%' then raise; end if;
    end;
  end loop;

  update commerce.subscriptions set status = 'lapsed', lapsed_at = now() where id = p_subscription_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.subscription.lapsed',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'subscription',
    p_subject_id     => p_subscription_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('planKey', v_plan_key)
  );
end;
$$;

comment on function commerce.lapse_subscription(uuid, uuid, uuid, platform.actor_type, text) is
  '§11''s own rule, unchanged since Epic 04: "behaviour is removed, data is not." Withdraws every capability the plan granted, in reverse order, and marks the subscription lapsed — no data this session has built anywhere is touched.';

create or replace function commerce.expire_trial(
  p_subscription_id uuid,
  p_event_id         uuid,
  p_correlation_id   uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref        text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id   uuid;
  v_plan_key       text;
  v_status         text;
  v_capability_key text;
begin
  select workspace_id, plan_key, status into v_workspace_id, v_plan_key, v_status
  from commerce.subscriptions where id = p_subscription_id;

  if v_workspace_id is null then
    raise exception 'commerce.expire_trial: subscription % does not exist', p_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_status <> 'trialing' then
    raise exception 'commerce.expire_trial: subscription % is not trialing', p_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  for v_capability_key in
    select value from jsonb_array_elements_text(
      (select capability_keys from platform.plans where plan_key = v_plan_key)
    ) with ordinality order by ordinality desc
  loop
    begin
      perform workspace.withdraw_capability(
        v_workspace_id, v_capability_key, gen_random_uuid(),
        gen_random_uuid(), p_correlation_id, p_actor_type, p_actor_ref
      );
    exception when others then
      if sqlerrm not like '%does not currently hold%' then raise; end if;
    end;
  end loop;

  update commerce.subscriptions set status = 'lapsed', lapsed_at = now(), trial_ends_at = null
  where id = p_subscription_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.trial.expired',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'subscription',
    p_subject_id     => p_subscription_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('planKey', v_plan_key)
  );
end;
$$;

comment on function commerce.expire_trial(uuid, uuid, uuid, platform.actor_type, text) is
  'An unconverted trial withdraws its own trial-granted capabilities exactly like a lapse, and the subscription lands in status lapsed — a trial that was never activated has no "active-without-a-trial" state to fall back to.';

-- =========================================================================
-- THE LOGIC — read

create or replace function commerce.current_subscription_for(
  p_workspace_id uuid
)
returns table (
  id            uuid,
  plan_key      text,
  payer         jsonb,
  status        text,
  trial_ends_at timestamptz,
  started_at    timestamptz,
  renewed_at    timestamptz
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.plan_key, s.payer, s.status, s.trial_ends_at, s.started_at, s.renewed_at
  from commerce.subscriptions s
  where s.workspace_id = p_workspace_id;
$$;

comment on function commerce.current_subscription_for(uuid) is
  'The one subscription a workspace holds, if any (§11.1''s own public contract: "current subscription").';

-- =========================================================================
-- ACCESS — klussie_engine_commerce needs schema workspace for the first time, to call
-- Capability's own grant/withdraw functions directly (this migration's own header). No
-- api.* delegate — the seventeenth occurrence.

grant usage on schema workspace to klussie_engine_commerce;

grant execute on function workspace.grant_capability(uuid, uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_commerce;
grant execute on function workspace.withdraw_capability(uuid, text, uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_commerce;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'commerce.activate_subscription(uuid, uuid, text, jsonb, uuid, uuid, platform.actor_type, text)',
    'commerce.start_trial(uuid, uuid, text, jsonb, timestamptz, uuid, uuid, platform.actor_type, text)',
    'commerce.change_plan(uuid, text, uuid, uuid, platform.actor_type, text)',
    'commerce.renew_subscription(uuid, uuid, uuid, platform.actor_type, text)',
    'commerce.lapse_subscription(uuid, uuid, uuid, platform.actor_type, text)',
    'commerce.expire_trial(uuid, uuid, uuid, platform.actor_type, text)',
    'commerce.current_subscription_for(uuid)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', fn);
    execute pg_catalog.format('grant execute on function %s to klussie_engine_commerce', fn);
  end loop;
end;
$$;

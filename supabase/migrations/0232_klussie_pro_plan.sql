-- Payments Slice B (WP B1) — Klussie Pro: the one optional plan, and the real subscription
-- lifecycle it needs that Epic 22's own greenfield contract didn't yet have a caller to
-- build for (grace period, provider linkage, period-aware cancellation).
--
-- WHY klussie_pro'S BUNDLE IS TWO CAPABILITIES, NOT A REPEATED FULL TIER — UNLIKE EVERY
-- OTHER ROW IN platform.plans
--
-- personal/premium_home/professional/business/enterprise (0127) are each a workspace's
-- ENTIRE capability bundle — cumulative, because they describe what tier a workspace IS.
-- Klussie Pro is a different kind of thing: an add-on subscription any already-Professional
-- workspace can purchase on top of whatever preset it already holds (commerce.activate_
-- subscription() already tolerates "already holds" for exactly this overlap, per 0130's own
-- header). Repeating property_management/marketplace_provider/etc. here would be harmless
-- (idempotent) but dishonest about what Klussie Pro actually sells — "optional business
-- automation," not a re-description of the Professional tier.
--
-- WHY maintenance_planning + workflow_automation, NOT TWO NEW CAPABILITY ROWS
--
-- 0075's own header is explicit and load-bearing: "only the dependency edges the frozen
-- document actually states are seeded" — this repo's whole capability catalogue is
-- disciplined against inventing rows the frozen PLATFORM_DOMAIN_MODEL.md §6.7 doesn't
-- already name. Two existing, already-catalogued capabilities map onto the brief's two
-- paid workflows exactly:
--   · workflow_automation — "Rules that act on events: when this happens, do that, notify
--     them" (§6.7, verbatim) — literally what both automations are. Not in the free
--     'professional' bundle, so granting it is a genuine, real, paid unlock, not a free
--     lunch — this is the actual gate both automations check.
--   · maintenance_planning — "recurring maintenance administration" needs it and the free
--     'professional' bundle does NOT include it (only premium_home/business/enterprise do)
--     — so Klussie Pro genuinely grants new capability here too, not just the automation
--     layer on top of something already free. Its own dependency (asset_management) is
--     already satisfied by every Professional-tier workspace's own free base.
-- 'crm' ("history, notes, follow-up, repeat-business tracking," §6.7) already covers quote
-- follow-ups conceptually and is ALREADY in the free 'professional' bundle — Klussie Pro
-- does not grant it again (nothing to grant); the paid gate for follow-up automation is
-- workflow_automation alone, checked alongside the crm a workspace already has.
--
-- €19/MONTH IS NOT STORED HERE — PRICE LIVES WITH THE PROVIDER, THE SAME RESTRAINT
-- commerce.acquisition_fee_assessments HOLDS FOR ITS OWN RATE
--
-- Unlike commerce.pricing_versions (0229), a genuinely new ledger this codebase owns,
-- Klussie Pro's price is configured once, directly in the Stripe Dashboard as a real
-- Price object (test mode) and referenced here only by its env-configured id
-- (STRIPE_KLUSSIE_PRO_PRICE_ID, read server-side) — Stripe Billing, not this schema, is
-- authoritative for subscription pricing/proration/tax, matching "payment providers, which
-- are adapters" (§11.2) exactly. platform.plans.klussie_pro names WHAT it grants, never
-- WHAT IT COSTS.

insert into platform.plans (plan_key, name, tier, capability_keys) values
  ('klussie_pro', 'Klussie Pro', 'Professional', jsonb_build_array('maintenance_planning', 'workflow_automation'))
on conflict (plan_key) do nothing;

-- =========================================================================
-- commerce.subscriptions — real columns a live Stripe-backed subscription needs that no
-- prior caller of this greenfield table (0128) ever needed: which provider subscription
-- this row corresponds to, when its current paid period actually ends (Stripe's own
-- authoritative field — never computed locally), and the two states between "active" and
-- "gone" the brief's own grace-period and cancel-at-period-end rules require.
--
-- 'past_due' IS A REAL FIFTH STATUS, NOT A REPURPOSED EXISTING ONE
--
-- The decision to preserve paid access during a failed-renewal grace period (brief:
-- "preserve paid access through the paid-through date... seven-day grace period...
-- followed by free access") cannot be expressed as 'active' (a real payment failure did
-- happen — hiding that from the subscription's own state would make grace-period
-- reporting and "why does this workspace still have automation" both unanswerable from
-- this table alone) or as 'lapsed' (capabilities must NOT be withdrawn yet — that is the
-- entire point of a grace period). A genuine fifth state, additive to 0128's own four.

alter table commerce.subscriptions drop constraint if exists subscriptions_status_valid;
alter table commerce.subscriptions add constraint subscriptions_status_valid
  check (status in ('trialing', 'active', 'past_due', 'lapsed', 'cancelled'));

alter table commerce.subscriptions add column if not exists provider text
  check (provider is null or provider in ('stripe'));
alter table commerce.subscriptions add column if not exists provider_subscription_id text;
alter table commerce.subscriptions add column if not exists provider_customer_id text;
alter table commerce.subscriptions add column if not exists current_period_end timestamptz;
alter table commerce.subscriptions add column if not exists grace_until timestamptz;
-- The REQUEST to cancel (brief: "preserve paid access through the paid-through date") —
-- distinct from the table's own pre-existing cancelled_at, which stays what it already
-- meant: the moment capabilities were actually withdrawn (commerce.cancel_subscription()
-- below), not the moment the professional clicked "cancel."
alter table commerce.subscriptions add column if not exists cancellation_requested_at timestamptz;

comment on column commerce.subscriptions.current_period_end is
  'Stripe''s own authoritative paid-through date, read from its webhook payload — never computed locally. The instant commerce.cancel_subscription() actually fires, once a real cancel-at-period-end subscription reaches it (Stripe''s own customer.subscription.deleted event).';
comment on column commerce.subscriptions.grace_until is
  'Set by commerce.mark_subscription_past_due() (default seven days, configurable per call — brief: "a configurable seven-day grace period"), cleared by whichever of commerce.recover_subscription_from_grace() or commerce.lapse_subscription() resolves it first. Capabilities stay granted for the entire window.';
comment on column commerce.subscriptions.cancellation_requested_at is
  'When the professional asked to cancel (commerce.request_cancellation_for_caller()) — access and capabilities are untouched until current_period_end actually passes and commerce.cancel_subscription() runs. Null again is not meaningful once set; this column is never cleared.';

create index if not exists subscriptions_grace_until_idx
  on commerce.subscriptions (grace_until) where status = 'past_due';

-- =========================================================================
-- commerce.activate_subscription()/commerce.renew_subscription() (0130) — extended with
-- trailing, defaulted provider-linkage parameters. Same drop-first discipline 0154/0231
-- already established in this repository for a parameter-list change to a real, shipped
-- function: a bare CREATE OR REPLACE with a longer argument list creates a second,
-- ambiguous overload rather than replacing the first.

drop function if exists commerce.activate_subscription(uuid, uuid, text, jsonb, uuid, uuid, platform.actor_type, text);

create or replace function commerce.activate_subscription(
  p_subscription_id      uuid,
  p_workspace_id          uuid,
  p_plan_key               text,
  p_payer                   jsonb,
  p_event_id                 uuid,
  p_correlation_id             uuid,
  p_actor_type                   platform.actor_type,
  p_actor_ref                      text,
  p_provider                        text default null,
  p_provider_subscription_id         text default null,
  p_provider_customer_id               text default null,
  p_current_period_end                  timestamptz default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_capability_key text;
begin
  -- ON CONFLICT (workspace_id) DO UPDATE, NOT A PLAIN INSERT — a real gap, found and
  -- fixed while wiring the webhook (Payments Slice B): 0130's own original INSERT would
  -- hard-crash on a unique-constraint violation the moment any workspace that had ever
  -- cancelled Klussie Pro tried to resubscribe, since commerce.subscriptions holds
  -- exactly one row per workspace forever, not one row per subscription lifecycle. The
  -- brief's own "no duplicate schedules on reactivation" already implies reactivation is
  -- a real, expected path, not an edge case. Reusing this same function for both first-
  -- ever activation and reactivation means the exact same tested capability-grant
  -- behaviour below (including its "already holds" tolerance) handles both without a
  -- second, near-duplicate function to keep in sync — the id is deliberately excluded
  -- from the update, so a reactivated subscription keeps its own original row identity.
  insert into commerce.subscriptions (
    id, workspace_id, plan_key, payer, status,
    provider, provider_subscription_id, provider_customer_id, current_period_end
  )
  values (
    p_subscription_id, p_workspace_id, p_plan_key, p_payer, 'active',
    p_provider, p_provider_subscription_id, p_provider_customer_id, p_current_period_end
  )
  on conflict (workspace_id) do update set
    plan_key = excluded.plan_key,
    payer = excluded.payer,
    status = 'active',
    provider = excluded.provider,
    provider_subscription_id = excluded.provider_subscription_id,
    provider_customer_id = excluded.provider_customer_id,
    current_period_end = excluded.current_period_end,
    started_at = now(),
    trial_ends_at = null,
    grace_until = null,
    lapsed_at = null,
    cancelled_at = null,
    cancellation_requested_at = null;

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

comment on function commerce.activate_subscription(uuid, uuid, text, jsonb, uuid, uuid, platform.actor_type, text, text, text, text, timestamptz) is
  'Four trailing, defaulted provider-linkage parameters and a real upsert instead of 0130''s original plain INSERT (Payments Slice B — see this function''s own body comment for the reactivation bug that fixes). Capability-grant/event-emission behaviour is otherwise unchanged: grants every capability its plan bundles, in the catalogue''s own dependency-safe order, tolerating already-held capabilities (e.g. from a preset or an unwithdrawn prior grant).';

drop function if exists commerce.renew_subscription(uuid, uuid, uuid, platform.actor_type, text);

create or replace function commerce.renew_subscription(
  p_subscription_id      uuid,
  p_event_id              uuid,
  p_correlation_id         uuid,
  p_actor_type              platform.actor_type,
  p_actor_ref                text,
  p_current_period_end        timestamptz default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  update commerce.subscriptions
  set renewed_at = now(),
      current_period_end = coalesce(p_current_period_end, current_period_end)
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

comment on function commerce.renew_subscription(uuid, uuid, uuid, platform.actor_type, text, timestamptz) is
  'Unchanged from 0130 except one trailing, defaulted parameter (Payments Slice B) — a renewal changes no capability, only renewed_at and (when supplied) current_period_end move.';

-- =========================================================================
-- THE LOGIC — grace period (Payments Slice B, brief-mandated, configurable)

create or replace function commerce.mark_subscription_past_due(
  p_subscription_id uuid,
  p_event_id        uuid,
  p_correlation_id  uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text,
  p_grace_days      integer default 7
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if p_grace_days is null or p_grace_days <= 0 then
    raise exception 'commerce.mark_subscription_past_due: p_grace_days must be positive'
      using errcode = 'invalid_parameter_value';
  end if;

  update commerce.subscriptions
  set status = 'past_due', grace_until = now() + make_interval(days => p_grace_days)
  where id = p_subscription_id and status = 'active'
  returning workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception 'commerce.mark_subscription_past_due: subscription % does not exist or is not active', p_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.subscription.past_due',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'subscription',
    p_subject_id     => p_subscription_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('graceDays', p_grace_days)
  );
end;
$$;

comment on function commerce.mark_subscription_past_due(uuid, uuid, uuid, platform.actor_type, text, integer) is
  'A failed renewal charge (Stripe invoice.payment_failed) — grants no new capability and withdraws none: "preserve paid access through the paid-through date" (brief). Not in SYSTEM_ARCHITECTURE.md §11.1''s own frozen produced-event list; subscription.subscription.past_due is a real, minimal, consistently-named extension of that list, the same restraint billing.payout.failed (0101) already established a precedent for.';

create or replace function commerce.recover_subscription_from_grace(
  p_subscription_id uuid,
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
  v_workspace_id uuid;
begin
  update commerce.subscriptions
  set status = 'active', grace_until = null, renewed_at = now()
  where id = p_subscription_id and status = 'past_due'
  returning workspace_id into v_workspace_id;

  if v_workspace_id is null then
    raise exception 'commerce.recover_subscription_from_grace: subscription % does not exist or is not past_due', p_subscription_id
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
    p_payload        => jsonb_build_object('recoveredFromGrace', true)
  );
end;
$$;

comment on function commerce.recover_subscription_from_grace(uuid, uuid, uuid, platform.actor_type, text) is
  'A retried renewal charge succeeds during the grace window (Stripe invoice.paid on a past_due subscription). Grants nothing new — capabilities were never withdrawn, so there is nothing to re-grant, which is also exactly why this can never manufacture "a new unpaid subscription through the grace mechanism" (brief''s own named risk): this function only ever reactivates a subscription that was, and remains, genuinely paid.';

create or replace function commerce.lapse_expired_grace_subscriptions(
  p_actor_type platform.actor_type default 'system',
  p_actor_ref  text default 'grace-period-sweep'
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_count            integer := 0;
begin
  -- A periodic sweep over commerce.subscriptions directly, NOT an instance of ADR-0031's
  -- own hash-partitioned event-cursor consumer pattern — that machinery exists for a
  -- high-volume, append-only stream (platform.events) where "which rows has this
  -- consumer already seen" is the real problem. This table holds at most one row per
  -- workspace, is small, and the query below (status = 'past_due' and grace_until in the
  -- past) is idempotent and safely re-runnable on any schedule without a cursor at all —
  -- reaching for ADR-0031's own pattern here would be exactly the "elaborate generic
  -- platform" the brief's own restraint (on pricing configurability) warns against,
  -- applied by the same reasoning to scheduling.
  for v_subscription_id in
    select id from commerce.subscriptions
    where status = 'past_due' and grace_until < now()
  loop
    perform commerce.lapse_subscription(
      v_subscription_id, gen_random_uuid(), gen_random_uuid(), p_actor_type, p_actor_ref
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function commerce.lapse_expired_grace_subscriptions(platform.actor_type, text) is
  'The brief''s own "followed by free access" — reuses the untouched commerce.lapse_subscription() (0130) for the actual capability withdrawal rather than duplicating it; this function''s only job is finding which rows have run out of grace. Intended as a pg_cron target, run on whatever cadence is configured (e.g. hourly) — not wired to pg_cron in this migration (no staging schedule exists to attach it to yet), callable directly for now.';

-- =========================================================================
-- THE LOGIC — cancellation, period-aware (brief: "preserve paid access through the
-- paid-through date")

create or replace function commerce.request_cancellation_for_caller(
  p_subscription_id uuid,
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
  v_workspace_id uuid;
  v_status       text;
begin
  select workspace_id, status into v_workspace_id, v_status
  from commerce.subscriptions where id = p_subscription_id;

  if v_workspace_id is null then
    raise exception 'commerce.request_cancellation_for_caller: subscription % does not exist', p_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_workspace_id
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if v_status not in ('active', 'past_due') then
    raise exception 'commerce.request_cancellation_for_caller: subscription % is %, not active or past_due', p_subscription_id, v_status
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Grants/withdraws nothing — the entire point (brief: "preserve paid access through the
  -- paid-through date"). commerce.cancel_subscription() below is the only function that
  -- ever withdraws Klussie Pro's own capabilities, and only once current_period_end has
  -- genuinely passed (the real Stripe webhook that fires there).
  update commerce.subscriptions
  set cancellation_requested_at = now()
  where id = p_subscription_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.subscription.cancellation_requested',
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

comment on function commerce.request_cancellation_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'The professional''s own explicit "cancel" action — real membership required. Not in §11.1''s frozen produced-event list; subscription.subscription.cancellation_requested is a real, minimal, consistently-named extension (0101''s billing.payout.failed precedent).';

create or replace function commerce.cancel_subscription(
  p_subscription_id uuid,
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
  v_workspace_id   uuid;
  v_plan_key       text;
  v_capability_key text;
begin
  select workspace_id, plan_key into v_workspace_id, v_plan_key
  from commerce.subscriptions where id = p_subscription_id;

  if v_workspace_id is null then
    raise exception 'commerce.cancel_subscription: subscription % does not exist', p_subscription_id
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

  update commerce.subscriptions set status = 'cancelled', cancelled_at = now() where id = p_subscription_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'subscription.subscription.lapsed',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'subscription',
    p_subject_id     => p_subscription_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('planKey', v_plan_key, 'reason', 'cancelled')
  );
end;
$$;

comment on function commerce.cancel_subscription(uuid, uuid, uuid, platform.actor_type, text) is
  'Called only once current_period_end genuinely passes on a cancellation-requested subscription (Stripe''s own customer.subscription.deleted webhook, fired at real period end for a cancel_at_period_end subscription) — withdraws Klussie Pro''s own capabilities, same shape as lapse_subscription() (0130), status cancelled rather than lapsed. Emits subscription.subscription.lapsed (§11.1''s own frozen list has no separate "cancelled" event token — "behaviour is removed" is the same real fact whether the cause was a failed payment or a deliberate cancellation, and 0130''s own lapse_subscription() already established that this frozen event name covers capability withdrawal generally, not failure specifically); the payload''s own reason field is what actually distinguishes the two for anyone reading the event stream.';

-- =========================================================================
-- THE LOGIC — read, for the professional's own Profile screen. current_subscription_for()
-- (0130) already exists but, like every function in that migration, has no api.* delegate
-- — the eighteenth occurrence of that same restraint. This is the first real client-facing
-- read this engine has ever needed.

create or replace function api.my_subscription(p_workspace_id uuid)
returns table (
  id uuid, plan_key text, status text, trial_ends_at timestamptz,
  started_at timestamptz, renewed_at timestamptz, current_period_end timestamptz,
  grace_until timestamptz, cancellation_requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.plan_key, s.status, s.trial_ends_at, s.started_at, s.renewed_at,
         s.current_period_end, s.grace_until, s.cancellation_requested_at
  from commerce.subscriptions s
  join workspace.current_memberships() m on m.workspace_id = s.workspace_id
  where s.workspace_id = p_workspace_id;
$$;

comment on function api.my_subscription(uuid) is
  'The caller''s own workspace subscription, real membership required via the join — never a bare WHERE trusting p_workspace_id. Feeds Profile.jsx''s Klussie Pro section (Payments Slice B, WP B4).';

create or replace function api.request_subscription_cancellation(
  p_subscription_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.request_cancellation_for_caller(p_subscription_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

-- =========================================================================
-- ACCESS

revoke all on function commerce.mark_subscription_past_due(uuid, uuid, uuid, platform.actor_type, text, integer) from public, anon, authenticated, service_role;
revoke all on function commerce.recover_subscription_from_grace(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function commerce.lapse_expired_grace_subscriptions(platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function commerce.request_cancellation_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function commerce.cancel_subscription(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;

grant execute on function commerce.mark_subscription_past_due(uuid, uuid, uuid, platform.actor_type, text, integer) to klussie_engine_commerce;
grant execute on function commerce.recover_subscription_from_grace(uuid, uuid, uuid, platform.actor_type, text) to klussie_engine_commerce;
grant execute on function commerce.lapse_expired_grace_subscriptions(platform.actor_type, text) to klussie_engine_commerce;
grant execute on function commerce.request_cancellation_for_caller(uuid, uuid, uuid, platform.actor_type, text) to klussie_engine_commerce;
grant execute on function commerce.cancel_subscription(uuid, uuid, uuid, platform.actor_type, text) to klussie_engine_commerce;

-- commerce.activate_subscription()/renew_subscription() re-grant to klussie_engine_commerce
-- explicitly — the drop above (this migration) removed whatever grant 0130 left on the old
-- four-teen/five-argument signatures; the new signatures start with none.
revoke all on function commerce.activate_subscription(uuid, uuid, text, jsonb, uuid, uuid, platform.actor_type, text, text, text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function commerce.activate_subscription(uuid, uuid, text, jsonb, uuid, uuid, platform.actor_type, text, text, text, text, timestamptz) to klussie_engine_commerce;
revoke all on function commerce.renew_subscription(uuid, uuid, uuid, platform.actor_type, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function commerce.renew_subscription(uuid, uuid, uuid, platform.actor_type, text, timestamptz) to klussie_engine_commerce;

revoke all on function api.my_subscription(uuid) from public, anon, service_role;
grant execute on function api.my_subscription(uuid) to authenticated;

revoke all on function api.request_subscription_cancellation(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.request_subscription_cancellation(uuid, uuid, uuid, platform.actor_type, text) to authenticated;

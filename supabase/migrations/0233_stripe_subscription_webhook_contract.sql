-- Payments Slice B (WP B2) — the Stripe Billing webhook trust boundary: deduplication,
-- and a thin, service_role-only delegate layer onto the untouched subscription contract
-- (0130/0232).
--
-- WHY service_role, HERE, WHEN NOTHING ELSE IN THIS CODEBASE EVER USES IT
--
-- api/_lib/auth.js's own header states the rule every other endpoint holds: "Deliberately
-- does NOT use the Supabase service role key... least-privilege by construction" —
-- PRODUCT_CONSTITUTION.md Rule 5, "no endpoint trusts a caller it hasn't verified." A
-- Stripe webhook has no user session to hold a bearer token for at all — Stripe calls this
-- codebase's own server, not the other way around — so the ONLY question Rule 5 actually
-- asks is whether the caller is verified, not which specific mechanism does the verifying.
-- api/stripe-subscription-webhook.js (WP B2's own Vercel function) verifies the request via
-- Stripe's own HMAC signature (STRIPE_WEBHOOK_SECRET, a server-only secret, never sent to
-- or readable by any client — the same "no client code holds a secret it doesn't need"
-- restraint Rule 5 states in the same sentence) BEFORE it ever reaches Postgres. That
-- verification is what makes service_role safe here, not a general exception to Rule 5 —
-- every function below is granted ONLY to service_role, and ONLY this one Vercel route
-- ever uses the service-role client; no other file in this codebase should ever import it.
--
-- WHY A THIN DELEGATE LAYER, NOT A DIRECT GRANT ON THE EXISTING commerce.* FUNCTIONS
--
-- commerce.activate_subscription()/renew_subscription()/mark_subscription_past_due()/
-- recover_subscription_from_grace()/cancel_subscription() (0130/0232) are deliberately
-- revoked from service_role — granting service_role directly on them would make every
-- future caller of those exact names ambiguous about whether it's reachable from a
-- verified webhook or not. A distinctly-named wrapper per action, doing nothing but
-- resolving the one thing a webhook payload has that a normal caller doesn't (a Stripe
-- subscription id, not this schema's own uuid) and delegating, keeps the "who may call
-- this" question answerable by name alone, the same reason `api.*` exists as a distinct
-- schema for the client-facing case.
--
-- DEDUPLICATION IS A REAL TABLE, NOT TRUST IN STRIPE'S OWN DASHBOARD-LEVEL RETRY BEHAVIOUR
--
-- Stripe explicitly documents at-least-once delivery — the same event can and does arrive
-- more than once. commerce.processed_stripe_webhook_events is the idempotency key: the
-- webhook handler inserts the event id before acting on it, and a conflict (already seen)
-- means skip, not re-apply. This is what the brief's own "deduplication... safe retry
-- handling" asks for, structurally, not by convention.
--
-- OUT-OF-ORDER DELIVERY — A NAMED, ACCEPTED LIMITATION, NOT SOLVED HERE
--
-- Stripe also does not guarantee delivery order. Every function below performs a real,
-- current-state-checking precondition (activate only onto no existing row, past_due only
-- from active, recovery only from past_due, and so on) — an event that arrives genuinely
-- out of order mostly fails its own precondition and is safely ignored rather than
-- corrupting state, but a pathological reordering (a .deleted arriving before the .updated
-- that preceded it in Stripe's own timeline) is not reconciled against Stripe's own live
-- API state here. Building that reconciliation is real, additional scope the brief's own
-- restraint ("do not build an elaborate generic pricing platform," applied here by the same
-- reasoning) argues against speculatively building before a real ordering failure is ever
-- observed.

create table if not exists commerce.processed_stripe_webhook_events (
  stripe_event_id text        not null,
  event_type      text        not null,
  processed_at    timestamptz not null default now(),

  constraint processed_stripe_webhook_events_pkey primary key (stripe_event_id)
);

comment on table commerce.processed_stripe_webhook_events is
  'The idempotency ledger for Payments Slice B''s Stripe Billing webhook — one row per Stripe event id, ever. Existence of a row is the only fact that matters; never read for its own sake beyond that.';

revoke all on commerce.processed_stripe_webhook_events from anon, authenticated, service_role;
grant select, insert on commerce.processed_stripe_webhook_events to klussie_engine_commerce;
alter table commerce.processed_stripe_webhook_events enable row level security;

-- =========================================================================
-- THE LOGIC — record-or-skip. Returns true the first time a given Stripe event id is
-- seen (the caller should process it), false on every later delivery of the same id (the
-- caller should skip it) — a single round trip, not a separate SELECT then INSERT (which
-- would race two concurrent deliveries of the same retried event against each other).

create or replace function commerce.record_stripe_webhook_event(
  p_stripe_event_id text,
  p_event_type      text
)
returns boolean
language sql
set search_path = ''
as $$
  insert into commerce.processed_stripe_webhook_events (stripe_event_id, event_type)
  values (p_stripe_event_id, p_event_type)
  on conflict (stripe_event_id) do nothing
  returning true;
$$;

comment on function commerce.record_stripe_webhook_event(text, text) is
  'Returns a single true row on first sight of this Stripe event id, and zero rows (not false) on a repeat — the webhook handler treats "no row" as skip. Not a general audit log; commerce.processed_stripe_webhook_events (above) exists only to answer "have I seen this id before," nothing else.';

-- =========================================================================
-- THE LOGIC — resolve a Stripe subscription id back to this schema's own row. Every
-- lifecycle event after the first carries only the Stripe subscription id, never this
-- schema's own uuid — this is the one lookup every function below needs before it can
-- delegate.

create or replace function commerce.subscription_id_for_provider(p_provider_subscription_id text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from commerce.subscriptions where provider_subscription_id = p_provider_subscription_id;
$$;

-- =========================================================================
-- THE DELEGATES — one per lifecycle transition the webhook drives. Each is a thin
-- pass-through onto the untouched contract (0130/0232); none contains real logic of its
-- own beyond what the header above already explains.

create or replace function commerce.activate_subscription_from_stripe_event(
  p_subscription_id           uuid,
  p_workspace_id               uuid,
  p_plan_key                    text,
  p_payer                        jsonb,
  p_event_id                      uuid,
  p_correlation_id                 uuid,
  p_provider_subscription_id         text,
  p_provider_customer_id               text,
  p_current_period_end                  timestamptz
)
returns void
language sql
set search_path = ''
as $$
  select commerce.activate_subscription(
    p_subscription_id, p_workspace_id, p_plan_key, p_payer, p_event_id, p_correlation_id,
    'system', 'stripe-webhook',
    'stripe', p_provider_subscription_id, p_provider_customer_id, p_current_period_end
  );
$$;

create or replace function commerce.renew_subscription_from_stripe_event(
  p_provider_subscription_id text,
  p_event_id                  uuid,
  p_correlation_id             uuid,
  p_current_period_end          timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_subscription_id uuid;
begin
  v_subscription_id := commerce.subscription_id_for_provider(p_provider_subscription_id);
  if v_subscription_id is null then
    raise exception 'commerce.renew_subscription_from_stripe_event: no subscription for provider id %', p_provider_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- A renewal webhook can arrive while the subscription is genuinely past_due (the
  -- professional's card was fixed and the retried invoice succeeded) as easily as while
  -- it is plainly active (the ordinary monthly renewal) — both are real "this is paid"
  -- facts, so both are handled here rather than asking the webhook handler to know which
  -- of two functions to call for what is, from Stripe's own event shape, one event type
  -- (invoice.paid).
  if exists (select 1 from commerce.subscriptions where id = v_subscription_id and status = 'past_due') then
    perform commerce.recover_subscription_from_grace(v_subscription_id, p_event_id, p_correlation_id, 'system', 'stripe-webhook');
    update commerce.subscriptions set current_period_end = coalesce(p_current_period_end, current_period_end) where id = v_subscription_id;
  else
    perform commerce.renew_subscription(v_subscription_id, p_event_id, p_correlation_id, 'system', 'stripe-webhook', p_current_period_end);
  end if;
end;
$$;

create or replace function commerce.mark_subscription_past_due_from_stripe_event(
  p_provider_subscription_id text,
  p_event_id                  uuid,
  p_correlation_id             uuid,
  p_grace_days                  integer default 7
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_subscription_id uuid;
begin
  v_subscription_id := commerce.subscription_id_for_provider(p_provider_subscription_id);
  if v_subscription_id is null then
    raise exception 'commerce.mark_subscription_past_due_from_stripe_event: no subscription for provider id %', p_provider_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  perform commerce.mark_subscription_past_due(v_subscription_id, p_event_id, p_correlation_id, 'system', 'stripe-webhook', p_grace_days);
end;
$$;

create or replace function commerce.cancel_subscription_from_stripe_event(
  p_provider_subscription_id text,
  p_event_id                  uuid,
  p_correlation_id             uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_subscription_id uuid;
begin
  v_subscription_id := commerce.subscription_id_for_provider(p_provider_subscription_id);
  if v_subscription_id is null then
    raise exception 'commerce.cancel_subscription_from_stripe_event: no subscription for provider id %', p_provider_subscription_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  perform commerce.cancel_subscription(v_subscription_id, p_event_id, p_correlation_id, 'system', 'stripe-webhook');
end;
$$;

comment on function commerce.activate_subscription_from_stripe_event(uuid, uuid, text, jsonb, uuid, uuid, text, text, timestamptz) is
  'Stripe checkout.session.completed. Thin delegate onto commerce.activate_subscription() (0232) — actor_type/actor_ref are fixed to system/stripe-webhook here, never caller-supplied, since a webhook request carries no real person to attribute the action to.';
comment on function commerce.renew_subscription_from_stripe_event(text, uuid, uuid, timestamptz) is
  'Stripe invoice.paid — resolves both the ordinary-renewal and recovered-from-grace cases (see this function''s own body comment for why one event type maps to two possible contract calls).';
comment on function commerce.mark_subscription_past_due_from_stripe_event(text, uuid, uuid, integer) is
  'Stripe invoice.payment_failed.';
comment on function commerce.cancel_subscription_from_stripe_event(text, uuid, uuid) is
  'Stripe customer.subscription.deleted — fired at the real end of a cancel-at-period-end subscription''s current period, never at the moment cancellation was requested (commerce.request_cancellation_for_caller(), 0232, already handled that moment separately).';

-- =========================================================================
-- THE api.* WRAPPERS — THE ONLY WAY ANY OF THE ABOVE IS ACTUALLY REACHABLE
--
-- Checked directly before writing this section: every client call anywhere in this
-- codebase's src/lib/*.js goes through `.schema("api")` — no file ever calls
-- `.schema("commerce")`, `.schema("work")`, or any other schema name. This is not a
-- convention this migration is free to break: PostgREST (Supabase's REST/RPC layer,
-- which is what a `supabase-js` `.rpc()` call actually reaches) only exposes the schemas
-- a project explicitly lists, and `api` is the only one this project's every existing
-- caller has ever needed exposed. Without this section, the service-role webhook client
-- in api/stripe-subscription-webhook.js would get "schema not found" from every one of
-- the six functions above, GRANTs notwithstanding — a real gap, found and fixed while
-- writing the webhook handler itself, before it was ever exercised. Five thin,
-- SECURITY DEFINER wrappers, one per action the webhook handler actually calls
-- (commerce.subscription_id_for_provider is internal-only — nothing outside this
-- migration ever calls it directly, so it gets no wrapper).

create or replace function api.record_stripe_webhook_event(p_stripe_event_id text, p_event_type text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select commerce.record_stripe_webhook_event(p_stripe_event_id, p_event_type);
$$;

create or replace function api.activate_subscription_from_stripe_event(
  p_subscription_id uuid, p_workspace_id uuid, p_plan_key text, p_payer jsonb,
  p_event_id uuid, p_correlation_id uuid,
  p_provider_subscription_id text, p_provider_customer_id text, p_current_period_end timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.activate_subscription_from_stripe_event(
    p_subscription_id, p_workspace_id, p_plan_key, p_payer, p_event_id, p_correlation_id,
    p_provider_subscription_id, p_provider_customer_id, p_current_period_end
  );
$$;

create or replace function api.renew_subscription_from_stripe_event(
  p_provider_subscription_id text, p_event_id uuid, p_correlation_id uuid, p_current_period_end timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.renew_subscription_from_stripe_event(p_provider_subscription_id, p_event_id, p_correlation_id, p_current_period_end);
$$;

create or replace function api.mark_subscription_past_due_from_stripe_event(
  p_provider_subscription_id text, p_event_id uuid, p_correlation_id uuid, p_grace_days integer default 7
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.mark_subscription_past_due_from_stripe_event(p_provider_subscription_id, p_event_id, p_correlation_id, p_grace_days);
$$;

create or replace function api.cancel_subscription_from_stripe_event(
  p_provider_subscription_id text, p_event_id uuid, p_correlation_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.cancel_subscription_from_stripe_event(p_provider_subscription_id, p_event_id, p_correlation_id);
$$;

-- =========================================================================
-- ACCESS
--
-- The six commerce.* functions: reachable only from the api.* wrappers above, which run
-- with their own owner's elevated privileges (SECURITY DEFINER) once invoked — the same
-- "not SECURITY DEFINER itself, reachable only via api.*" shape every other engine
-- contract in this codebase holds, applied here for the first time to a service_role
-- caller instead of an authenticated one.
--
-- The five api.* wrappers: service_role, and only service_role. Never authenticated,
-- never anon — a webhook request carries no Supabase user session at all, so granting
-- these to authenticated would not even be reachable by a real user, but leaving that
-- grant off entirely, explicitly, is the point being made, not an oversight to notice
-- later.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'commerce.record_stripe_webhook_event(text, text)',
    'commerce.subscription_id_for_provider(text)',
    'commerce.activate_subscription_from_stripe_event(uuid, uuid, text, jsonb, uuid, uuid, text, text, timestamptz)',
    'commerce.renew_subscription_from_stripe_event(text, uuid, uuid, timestamptz)',
    'commerce.mark_subscription_past_due_from_stripe_event(text, uuid, uuid, integer)',
    'commerce.cancel_subscription_from_stripe_event(text, uuid, uuid)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'api.record_stripe_webhook_event(text, text)',
    'api.activate_subscription_from_stripe_event(uuid, uuid, text, jsonb, uuid, uuid, text, text, timestamptz)',
    'api.renew_subscription_from_stripe_event(text, uuid, uuid, timestamptz)',
    'api.mark_subscription_past_due_from_stripe_event(text, uuid, uuid, integer)',
    'api.cancel_subscription_from_stripe_event(text, uuid, uuid)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', fn);
    execute pg_catalog.format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

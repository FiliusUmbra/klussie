-- Payments Slice 1 (WP 1) — a professional workspace's own payout account, the link to
-- a real Stripe Connect Express account. No money moves in this slice — see this
-- migration's own header for what deliberately stays out.
--
-- WHY NO STATUS COLUMNS — DETAILS_SUBMITTED/CHARGES_ENABLED/PAYOUTS_ENABLED ARE NEVER
-- STORED HERE
--
-- api/_lib/auth.js's own header states the rule this migration holds itself to: "no
-- service role key... least-privilege by construction" (PRODUCT_CONSTITUTION.md rule 5).
-- A SECURITY DEFINER function reachable by `authenticated` cannot tell "called from our
-- own server code, which already verified this against Stripe" apart from "called
-- directly against PostgREST with the same bearer token, by whoever holds it" — anyone
-- who can obtain their own access token can call any function granted to `authenticated`
-- directly, bypassing whatever a Vercel route around it does. Storing
-- payouts_enabled/charges_enabled as columns a client-reachable function writes would let
-- a workspace's own member mark their own account "active" without ever completing real
-- Stripe onboarding — a real integrity gap this table structurally avoids by not writing
-- those facts as writable state anywhere. `api/stripe-connect-status.js` asks Stripe
-- directly, every time, and never persists the answer (see that file's own header).
--
-- This table therefore holds only the one immutable fact this slice actually needs: which
-- Stripe account id a workspace's own payout account resolves to. No guard trigger for a
-- mutable-except shape (commerce.payments' own pattern) — there is no mutable column here
-- to guard.
--
-- ONE ROW PER (WORKSPACE, PROVIDER) — `provider` NAMED NOW, ONLY `stripe` IMPLEMENTED
--
-- SYSTEM_ARCHITECTURE.md §11.2: "Does not own. Payment providers, which are adapters."
-- `provider` exists so a second adapter (were one ever added) has a real column to key
-- on rather than a migration inventing one retroactively — the same restraint
-- commerce.payments' own header already holds for its single-provider present.

create table if not exists commerce.payout_accounts (
  id                    uuid        not null,

  workspace_id          uuid        not null
                        references workspace.workspaces (id),

  provider              text        not null default 'stripe'
                        check (provider in ('stripe')),
  provider_account_id   text        not null,

  created_at            timestamptz not null default now(),

  constraint payout_accounts_pkey primary key (id),
  constraint payout_accounts_one_per_workspace_provider unique (workspace_id, provider)
);

comment on table commerce.payout_accounts is
  'A professional workspace''s own real Stripe Connect Express account id (Payments Slice 1). Fully immutable, one row per (workspace, provider) — see this migration''s own header for why live status (details_submitted/charges_enabled/payouts_enabled) is never stored here.';
comment on column commerce.payout_accounts.provider_account_id is
  'The real Stripe account id (acct_...) created by api/stripe-connect-onboarding.js. Never trust this as evidence the account is actually usable — always ask Stripe directly (api/stripe-connect-status.js).';

create index if not exists payout_accounts_workspace_idx
  on commerce.payout_accounts (workspace_id);

alter table commerce.payout_accounts enable row level security;

-- No DELETE, matching commerce.payments'/invoices' own "financial-adjacent record,
-- never removed" restraint (§22) — a workspace that stops using Stripe still has a real
-- history of once having connected one. Disconnecting a payout account is a real,
-- deliberately deferred gap: no function here does it, and none should be added without
-- first deciding what happens to it once the platform actually holds funds against it.
revoke all on commerce.payout_accounts from public, anon, authenticated, service_role;
grant select, insert on commerce.payout_accounts to klussie_engine_commerce;

-- =========================================================================
-- THE LOGIC — create (Option B's own lazy-creation shape: api/stripe-connect-onboarding.js
-- calls this once it has a real Stripe account id, matching property.create_property_for_
-- caller()'s own "the live-caller entry point" role)

create or replace function commerce.create_payout_account_for_caller(
  p_payout_account_id  uuid,
  p_workspace_id        uuid,
  p_provider             text,
  p_provider_account_id   text,
  p_event_id               uuid,
  p_correlation_id          uuid,
  p_actor_type               platform.actor_type,
  p_actor_ref                 text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id
  ) then
    raise exception
      'commerce.create_payout_account_for_caller: caller may not create a payout account for workspace %', p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  insert into commerce.payout_accounts (id, workspace_id, provider, provider_account_id)
  values (p_payout_account_id, p_workspace_id, p_provider, p_provider_account_id);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    -- Not in SYSTEM_ARCHITECTURE.md §11.2's own frozen event list — a real, minimal
    -- extension of its naming pattern, the same restraint 0101's own billing.payout.failed
    -- already established a precedent for (see that migration's own header).
    p_event_type     => 'billing.payout_account.connected',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'payout_account',
    p_subject_id     => p_payout_account_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('provider', p_provider)
  );
end;
$$;

comment on function commerce.create_payout_account_for_caller(uuid, uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'The live-caller entry point (Payments Slice 1) — checks the caller''s own membership in p_workspace_id, then links it to a real Stripe account id already created server-side. No "already has one" guard beyond the table''s own unique constraint: api/stripe-connect-onboarding.js checks commerce.my_payout_account() first and reuses an existing account rather than ever calling this twice for the same workspace. Not SECURITY DEFINER, granted to nobody, reachable only from api.create_payout_account().';

-- =========================================================================
-- THE LOGIC — read

create or replace function commerce.my_payout_account(p_workspace_id uuid)
returns table (id uuid, provider text, provider_account_id text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select pa.id, pa.provider, pa.provider_account_id, pa.created_at
  from commerce.payout_accounts pa
  join workspace.current_memberships() m on m.workspace_id = pa.workspace_id
  where pa.workspace_id = p_workspace_id;
$$;

comment on function commerce.my_payout_account(uuid) is
  'The caller''s own payout account for a workspace they are really a member of — the join against workspace.current_memberships() is the real authorization check, the same shape property.my_properties() already uses, not a bare WHERE trusting p_workspace_id alone. Not SECURITY DEFINER, granted to nobody, reachable only from api.my_payout_account().';

-- =========================================================================
-- THE DELEGATES

create or replace function api.create_payout_account(
  p_payout_account_id  uuid,
  p_workspace_id        uuid,
  p_provider             text,
  p_provider_account_id   text,
  p_event_id               uuid,
  p_correlation_id          uuid,
  p_actor_type               platform.actor_type,
  p_actor_ref                 text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.create_payout_account_for_caller(
    p_payout_account_id, p_workspace_id, p_provider, p_provider_account_id,
    p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.create_payout_account(uuid, uuid, text, text, uuid, uuid, platform.actor_type, text) is
  'Delegate for commerce.create_payout_account_for_caller() (ADR-0026''s split). Called once from api/stripe-connect-onboarding.js after Stripe confirms a real account id exists.';

create or replace function api.my_payout_account(p_workspace_id uuid)
returns table (id uuid, provider text, provider_account_id text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from commerce.my_payout_account(p_workspace_id);
$$;

comment on function api.my_payout_account(uuid) is
  'Delegate for commerce.my_payout_account(). Called from api/stripe-connect-onboarding.js (to decide whether to reuse an existing Stripe account) and api/stripe-connect-status.js (to know which account to ask Stripe about).';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed, the same discipline every
-- prior api.* delegate in this codebase follows.

revoke all on function commerce.create_payout_account_for_caller(uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function commerce.my_payout_account(uuid)
  from public, anon, authenticated, service_role;

revoke all on function api.create_payout_account(uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  from public, anon, service_role;
grant execute on function api.create_payout_account(uuid, uuid, text, text, uuid, uuid, platform.actor_type, text)
  to authenticated;

revoke all on function api.my_payout_account(uuid)
  from public, anon, service_role;
grant execute on function api.my_payout_account(uuid)
  to authenticated;

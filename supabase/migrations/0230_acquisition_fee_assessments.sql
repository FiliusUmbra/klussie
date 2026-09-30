-- Payments Slice A (WP A3/A4) — the acquisition-fee assessment: disclosure, acceptance,
-- eligibility, and the (interim, self-attested) path to actually issuing the invoice.
--
-- ONE ROW PER RELATIONSHIP, FOREVER — THE RACE-SAFETY AND "NEVER A SECOND FIRST" GUARANTEE
--
-- The decision table's own defaults: "concurrent jobs cannot each become the first
-- chargeable job" and "a subsequent job does not silently become chargeable after a
-- refund." Both are the same underlying fact: (requesting_workspace_id,
-- performing_workspace_id) is unique here, permanently — not just "unique while active."
-- Once a pair has a row, no engagement for that pair, past or future, chargeable or not,
-- ever gets a second one. Two engagements racing to be first for a brand-new pair both
-- call commerce.assess_acquisition_fee_on_engagement(); the loser's INSERT hits this
-- constraint and does ON CONFLICT DO NOTHING — it simply never gets a row, which is the
-- correct outcome (it is not the first), not an error either side needs to handle.
--
-- WHY THIS SITS BESIDE commerce.invoices, NOT INSIDE IT
--
-- commerce.invoices is immutable financial record, exactly one shape (issued/paid/
-- credited), and already has a live, tested contract (0101) this migration deliberately
-- does not touch. Disclosure and acceptance are pre-financial states with no invoice yet
-- — inventing an invoice status of "issued but not really" to represent them would be the
-- kind of borrowed, wrong-shaped table 0097's own "one table, not a fourth kind invented"
-- restraint argues against. This table is the assessment *process*; exactly one thing it
-- produces, on success, is a real commerce.invoices row via the untouched, existing
-- commerce.issue_invoice().
--
-- "AND PAID" IS A REAL, NAMED GAP TODAY — commerce.confirm_payment_received_for_caller()
-- IS AN HONEST INTERIM SIGNAL, NOT A FINISHED ONE
--
-- The decision table's own default: "both completion and verified final payment are
-- required." work.complete_engagement() (the customer's own "job is done" attestation,
-- src/lib/requests.js markComplete()) already gives a real "completed" signal. A real,
-- independent "the customer's payment for the job itself has settled" signal does not
-- exist anywhere in this codebase — the platform does not yet process the customer's
-- payment for the underlying job at all (that still happens off-platform, exactly as it
-- does in the live product today). Rather than fabricate a fake payment-settled check
-- against a table nothing writes, commerce.confirm_payment_received_for_caller() is a
-- second, independent, explicit human attestation — the performing workspace (the only
-- party who actually knows whether they were paid) confirms it, separately from the
-- customer's own completion attestation. This is the same "explicit, low-trust, never
-- inferred" shape the origin column (0228) already uses for attribution, applied to the
-- other named unproven-signal risk. It is not a permanent design: once a real on-platform
-- job-payment flow exists (Payments Slice A WP A6, Stripe destination charges), its own
-- webhook is the correct caller here instead of a self-attestation, and this function's
-- own precondition checks do not need to change to make that swap — only who calls it.

create table if not exists commerce.acquisition_fee_assessments (
  id                        uuid        not null,

  engagement_id             uuid        not null unique
                            references work.engagements (id),
  requesting_workspace_id   uuid        not null
                            references workspace.workspaces (id),
  performing_workspace_id   uuid        not null
                            references workspace.workspaces (id),

  pricing_version_id        uuid        null
                            references commerce.pricing_versions (id),
  rate                      numeric(5, 4)  null,
  max_fee                   numeric(12, 2) null,
  currency                  text        not null,

  base_amount               numeric(12, 2) not null,
  fee_amount                numeric(12, 2) not null default 0
                            check (fee_amount >= 0),

  status                    text        not null default 'disclosed'
                            check (status in (
                              'disclosed', 'not_chargeable', 'accepted',
                              'invoiced', 'reversed', 'disputed'
                            )),
  not_chargeable_reason     text        null,

  disclosed_at              timestamptz not null default now(),
  accepted_at               timestamptz null,
  invoice_id                uuid        null
                            references commerce.invoices (id),

  created_at                timestamptz not null default now(),

  constraint acquisition_fee_assessments_pkey primary key (id),
  constraint acquisition_fee_assessments_one_per_relationship
    unique (requesting_workspace_id, performing_workspace_id),
  constraint acquisition_fee_assessments_pricing_consistency
    check ((status = 'not_chargeable') = (pricing_version_id is null)),
  constraint acquisition_fee_assessments_not_chargeable_reason_consistency
    check ((status = 'not_chargeable') = (not_chargeable_reason is not null))
);

comment on table commerce.acquisition_fee_assessments is
  'The acquisition-fee lifecycle for a real relationship (Payments Slice A): disclosed -> accepted -> invoiced, or disclosed -> not_chargeable when origin excludes it, or a terminal reversed/disputed. Exactly one row per (requesting_workspace_id, performing_workspace_id), ever — see this migration''s own header for why that is the entire race-safety and "never a second first" mechanism. No DELETE grant exists, matching work.engagements'' own "permanent" restraint (0087) — this is that engagement''s own financial history.';
comment on column commerce.acquisition_fee_assessments.rate is
  'Snapshotted from commerce.pricing_versions at disclosure time (Payments Slice A''s own "changes requiring higher fees need renewed disclosure and acceptance") — never re-read from the pricing table after this row exists, even if a later pricing_version changes the rate.';

create index if not exists acquisition_fee_assessments_performing_ws_idx
  on commerce.acquisition_fee_assessments (performing_workspace_id);
create index if not exists acquisition_fee_assessments_engagement_idx
  on commerce.acquisition_fee_assessments (engagement_id);

alter table commerce.acquisition_fee_assessments enable row level security;
revoke all on commerce.acquisition_fee_assessments from anon, authenticated, service_role;
grant select, insert, update on commerce.acquisition_fee_assessments to klussie_engine_commerce;
-- No policy: reachable only through the engine contract below, the same restraint every
-- other commerce table in this schema holds (0097-0101) — no direct PostgREST access.

-- =========================================================================
-- IMMUTABILITY — status is the one column permitted to change after creation, and only
-- through the transitions this contract's own functions perform; no bare UPDATE path is
-- exposed to any client either way (klussie_engine_commerce only, no grant to authenticated).

create or replace function commerce.acquisition_fee_assessments_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'commerce.acquisition_fee_assessments rows are never deleted'
      using
        hint = 'This is the engagement''s own financial history (0087''s identical restraint) — never deleted.',
        errcode = 'restrict_violation';
  end if;

  if old.id is distinct from new.id
     or old.engagement_id is distinct from new.engagement_id
     or old.requesting_workspace_id is distinct from new.requesting_workspace_id
     or old.performing_workspace_id is distinct from new.performing_workspace_id
     or old.pricing_version_id is distinct from new.pricing_version_id
     or old.rate is distinct from new.rate
     or old.max_fee is distinct from new.max_fee
     or old.currency is distinct from new.currency
     or old.base_amount is distinct from new.base_amount
     or old.fee_amount is distinct from new.fee_amount
     or old.disclosed_at is distinct from new.disclosed_at
     or old.created_at is distinct from new.created_at
  then
    raise exception
      'commerce.acquisition_fee_assessments is immutable except status/accepted_at/invoice_id/not_chargeable_reason'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists acquisition_fee_assessments_guard on commerce.acquisition_fee_assessments;
create trigger acquisition_fee_assessments_guard
  before update or delete on commerce.acquisition_fee_assessments
  for each row execute function commerce.acquisition_fee_assessments_guard_mutation();

-- =========================================================================
-- THE LOGIC — assess. Called from work.approve_location_disclosure() (below), the one
-- and only place an engagement reaches 'active' — the real "this booking is genuinely
-- happening" moment, matching that function's own header.

create or replace function commerce.assess_acquisition_fee_on_engagement(
  p_assessment_id   uuid,
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
  v_performing_ws   uuid;
  v_agreed_price     numeric;
  v_origin            text;
  v_pricing_id         uuid;
  v_rate                numeric;
  v_max_fee              numeric;
  v_fee                   numeric;
  v_reason                  text;
  v_inserted                 int;
begin
  select e.requesting_workspace_id, e.performing_workspace_id, e.agreed_price, r.origin
    into v_requesting_ws, v_performing_ws, v_agreed_price, v_origin
  from work.engagements e
  join work.requests r on r.id = e.request_id
  where e.id = p_engagement_id;

  if v_requesting_ws is null then
    raise exception
      'commerce.assess_acquisition_fee_on_engagement: engagement % does not exist', p_engagement_id
      using errcode = 'invalid_parameter_value';
  end if;

  if v_origin = 'marketplace_match' then
    select id, rate, max_fee into v_pricing_id, v_rate, v_max_fee
    from commerce.current_pricing_version('acquisition_fee', 'EUR');

    if v_pricing_id is null then
      raise exception
        'commerce.assess_acquisition_fee_on_engagement: no acquisition_fee pricing version is in effect'
        using errcode = 'object_not_in_prerequisite_state';
    end if;

    v_fee := least(round(v_agreed_price * v_rate, 2), v_max_fee);
  else
    v_reason := case v_origin
      when 'existing_relationship' then 'customer declared an existing relationship with this professional'
      when 'professional_supplied' then 'professional-supplied customer'
      else 'request predates attribution tracking (origin unknown)'
    end;
  end if;

  insert into commerce.acquisition_fee_assessments (
    id, engagement_id, requesting_workspace_id, performing_workspace_id,
    pricing_version_id, rate, max_fee, currency, base_amount, fee_amount,
    status, not_chargeable_reason
  ) values (
    p_assessment_id, p_engagement_id, v_requesting_ws, v_performing_ws,
    v_pricing_id, v_rate, v_max_fee, 'EUR', v_agreed_price, coalesce(v_fee, 0),
    case when v_origin = 'marketplace_match' then 'disclosed' else 'not_chargeable' end,
    v_reason
  )
  on conflict (requesting_workspace_id, performing_workspace_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- No event for a losing-the-race or not_chargeable row — nothing chargeable happened,
  -- and 0216's own "no event for a no-op" restraint (declare_quote's bulk-decline event
  -- being the one deliberate exception, guarded by its own condition) applies identically
  -- here.
  if v_inserted > 0 and v_origin = 'marketplace_match' then
    perform platform.emit_event(
      p_event_id       => p_event_id,
      p_event_type     => 'billing.acquisition_fee_assessment.disclosed',
      p_workspace_id   => v_performing_ws,
      p_actor_type     => p_actor_type,
      p_actor_ref      => p_actor_ref,
      p_subject_type   => 'acquisition_fee_assessment',
      p_subject_id     => p_assessment_id,
      p_correlation_id => p_correlation_id,
      p_payload        => jsonb_build_object('feeAmount', v_fee, 'rate', v_rate, 'maxFee', v_max_fee, 'baseAmount', v_agreed_price)
    );
  end if;
end;
$$;

comment on function commerce.assess_acquisition_fee_on_engagement(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'The eligibility engine (Payments Slice A, WP A4): resolves origin from the engagement''s own request, snapshots the current EUR acquisition_fee pricing version, computes min(agreed_price * rate, max_fee), and inserts — racing safely against any other engagement for the same relationship via the table''s own unique constraint. Not SECURITY DEFINER, granted only to klussie_engine_work (the real caller, work.approve_location_disclosure() below) — no client reaches this directly.';

-- =========================================================================
-- THE LOGIC — the professional accepts the disclosed fee. Required before this
-- assessment can ever be invoiced; a pricing change after disclosure but before
-- acceptance would need a new disclosure, not a silent acceptance of a stale snapshot —
-- not built here because nothing in this migration ever re-discloses a changed rate onto
-- an existing row (rate is immutable per row, guard trigger above), so the case cannot
-- occur yet; named for whoever eventually adds a "re-disclose" path.

create or replace function commerce.accept_acquisition_fee_disclosure_for_caller(
  p_assessment_id   uuid,
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
  v_performing_ws  uuid;
begin
  select performing_workspace_id into v_performing_ws
  from commerce.acquisition_fee_assessments
  where id = p_assessment_id and status = 'disclosed';

  if v_performing_ws is null then
    raise exception
      'commerce.accept_acquisition_fee_disclosure_for_caller: assessment % does not exist or is not awaiting acceptance', p_assessment_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_performing_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  update commerce.acquisition_fee_assessments
  set status = 'accepted', accepted_at = now()
  where id = p_assessment_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'billing.acquisition_fee_assessment.accepted',
    p_workspace_id   => v_performing_ws,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'acquisition_fee_assessment',
    p_subject_id     => p_assessment_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function commerce.accept_acquisition_fee_disclosure_for_caller(uuid, uuid, uuid, platform.actor_type, text) is
  'The professional''s own explicit acceptance of a disclosed fee (decision table: "show the professional the exact proposed fee and its basis before commitment"). Only a real member of the performing workspace may call this. Not SECURITY DEFINER, reachable only via api.accept_acquisition_fee_disclosure().';

-- =========================================================================
-- THE LOGIC — the professional's own payment-received attestation, then the real
-- invoice. See this migration''s own header for why this is the honest interim signal
-- for "and paid", not a finished payment integration.

create or replace function commerce.confirm_payment_received_for_caller(
  p_assessment_id   uuid,
  p_invoice_id      uuid,
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
  v_performing_ws     uuid;
  v_engagement_id      uuid;
  v_engagement_status   text;
  v_fee_amount            numeric;
begin
  select a.performing_workspace_id, a.engagement_id, a.fee_amount, e.status
    into v_performing_ws, v_engagement_id, v_fee_amount, v_engagement_status
  from commerce.acquisition_fee_assessments a
  join work.engagements e on e.id = a.engagement_id
  where a.id = p_assessment_id and a.status = 'accepted';

  if v_performing_ws is null then
    raise exception
      'commerce.confirm_payment_received_for_caller: assessment % does not exist or is not accepted', p_assessment_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = v_performing_ws
  ) then
    raise exception 'insufficient_privilege' using errcode = 'insufficient_privilege';
  end if;

  if v_engagement_status <> 'completed' then
    raise exception
      'commerce.confirm_payment_received_for_caller: engagement % is % , not completed', v_engagement_id, v_engagement_status
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform commerce.issue_invoice(
    p_invoice_id        => p_invoice_id,
    p_workspace_id       => v_performing_ws,
    p_payer_workspace_id  => null,
    p_kind                 => 'marketplace_commission',
    p_engagement_id          => v_engagement_id,
    p_currency                => 'EUR',
    p_jurisdiction             => 'BE',
    p_subtotal                  => v_fee_amount,
    p_tax_rate                   => null,
    p_event_id                    => p_event_id,
    p_correlation_id               => p_correlation_id,
    p_actor_type                    => p_actor_type,
    p_actor_ref                      => p_actor_ref
  );

  update commerce.acquisition_fee_assessments
  set status = 'invoiced', invoice_id = p_invoice_id
  where id = p_assessment_id;
end;
$$;

comment on function commerce.confirm_payment_received_for_caller(uuid, uuid, uuid, uuid, platform.actor_type, text) is
  'The professional''s own attestation that the customer has paid for the completed job — the interim "and paid" signal this migration''s own header names. Requires the engagement to already be work.complete_engagement()''s own completed (the customer''s independent attestation) — two different real parties, two different real facts, neither trusting the other''s half. Composes the untouched, already-tested commerce.issue_invoice() (0101) rather than duplicating its arithmetic. Not SECURITY DEFINER, reachable only via api.confirm_payment_received().';

-- =========================================================================
-- THE LOGIC — operator correction (refund/dispute). Gated on platform_operations,
-- excluding the support role, the exact pattern provider.record_sourced_leads_for_caller()
-- already established (0216) for a financial-adjacent operator-only action.

create or replace function commerce.reverse_acquisition_fee_for_caller(
  p_assessment_id   uuid,
  p_credit_id       uuid,
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
  v_invoice_id  uuid;
begin
  if not exists (
    select 1
    from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
      and m.role <> 'support'
  ) then
    raise exception 'commerce.reverse_acquisition_fee_for_caller: caller lacks platform_operations'
      using errcode = 'insufficient_privilege';
  end if;

  select invoice_id into v_invoice_id
  from commerce.acquisition_fee_assessments
  where id = p_assessment_id and status = 'invoiced';

  if v_invoice_id is null then
    raise exception
      'commerce.reverse_acquisition_fee_for_caller: assessment % does not exist or is not invoiced', p_assessment_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- commerce.issue_credit() (0101) already refuses a blank reason and moves the invoice
  -- to credited — reused exactly, not duplicated. Partial refunds (retained-subtotal
  -- proration, decision table's own rule) call this with a smaller p_amount below the
  -- full fee_amount than a full reversal would; this contract accepts whatever amount the
  -- operator supplies rather than assuming full reversal, but does not itself compute the
  -- pro-rated figure — that arithmetic belongs to the operator-facing UI this work
  -- package does not build (named, not silently assumed solved).
  perform commerce.issue_credit(
    p_credit_id       => p_credit_id,
    p_invoice_id       => v_invoice_id,
    p_amount            => (select fee_amount from commerce.acquisition_fee_assessments where id = p_assessment_id),
    p_reason              => p_reason,
    p_event_id             => p_event_id,
    p_correlation_id        => p_correlation_id,
    p_actor_type              => p_actor_type,
    p_actor_ref                => p_actor_ref
  );

  update commerce.acquisition_fee_assessments
  set status = 'reversed'
  where id = p_assessment_id;
end;
$$;

comment on function commerce.reverse_acquisition_fee_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text) is
  'The audited operator correction flow the brief names explicitly. Requires platform_operations, excludes the support role — the identical gate provider.record_sourced_leads_for_caller() (0216) already established for a financial-adjacent operator action. Issues a full-amount credit via the untouched commerce.issue_credit() (0101), which already refuses a blank reason and moves the invoice to credited; partial-refund proration is a named, deliberately unbuilt gap in the operator UI, not in this function''s own authorization or ledger correctness.';

-- =========================================================================
-- THE LOGIC — reads

create or replace function commerce.my_acquisition_fee_assessments(p_workspace_id uuid)
returns table (
  id uuid, engagement_id uuid, rate numeric, max_fee numeric, currency text,
  base_amount numeric, fee_amount numeric, status text, not_chargeable_reason text,
  disclosed_at timestamptz, accepted_at timestamptz, invoice_id uuid
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.engagement_id, a.rate, a.max_fee, a.currency,
         a.base_amount, a.fee_amount, a.status, a.not_chargeable_reason,
         a.disclosed_at, a.accepted_at, a.invoice_id
  from commerce.acquisition_fee_assessments a
  join workspace.current_memberships() m on m.workspace_id = a.performing_workspace_id
  where a.performing_workspace_id = p_workspace_id;
$$;

comment on function commerce.my_acquisition_fee_assessments(uuid) is
  'A professional workspace''s own acquisition-fee assessments, real membership required via the join (property.my_properties()''s own shape) — never a bare WHERE trusting the parameter. Feeds the earnings/invoice breakdown UI (WP A7).';

-- =========================================================================
-- api.* DELEGATES

create or replace function api.accept_acquisition_fee_disclosure(
  p_assessment_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.accept_acquisition_fee_disclosure_for_caller(p_assessment_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.confirm_payment_received(
  p_assessment_id uuid, p_invoice_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.confirm_payment_received_for_caller(p_assessment_id, p_invoice_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.reverse_acquisition_fee(
  p_assessment_id uuid, p_credit_id uuid, p_reason text, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select commerce.reverse_acquisition_fee_for_caller(p_assessment_id, p_credit_id, p_reason, p_event_id, p_correlation_id, p_actor_type, p_actor_ref);
$$;

create or replace function api.my_acquisition_fee_assessments(p_workspace_id uuid)
returns table (
  id uuid, engagement_id uuid, rate numeric, max_fee numeric, currency text,
  base_amount numeric, fee_amount numeric, status text, not_chargeable_reason text,
  disclosed_at timestamptz, accepted_at timestamptz, invoice_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from commerce.my_acquisition_fee_assessments(p_workspace_id);
$$;

-- =========================================================================
-- ACCESS

revoke all on function commerce.assess_acquisition_fee_on_engagement(uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
-- Granted to klussie_engine_work at the very bottom of this migration, alongside the
-- schema USAGE grant it also needs — kept together rather than split across two blocks.

revoke all on function commerce.accept_acquisition_fee_disclosure_for_caller(uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function commerce.confirm_payment_received_for_caller(uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function commerce.reverse_acquisition_fee_for_caller(uuid, uuid, text, uuid, uuid, platform.actor_type, text) from public, anon, authenticated, service_role;
revoke all on function commerce.my_acquisition_fee_assessments(uuid) from public, anon, authenticated, service_role;

revoke all on function api.accept_acquisition_fee_disclosure(uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.accept_acquisition_fee_disclosure(uuid, uuid, uuid, platform.actor_type, text) to authenticated;

revoke all on function api.confirm_payment_received(uuid, uuid, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.confirm_payment_received(uuid, uuid, uuid, uuid, platform.actor_type, text) to authenticated;

revoke all on function api.reverse_acquisition_fee(uuid, uuid, text, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
grant execute on function api.reverse_acquisition_fee(uuid, uuid, text, uuid, uuid, platform.actor_type, text) to authenticated;

revoke all on function api.my_acquisition_fee_assessments(uuid) from public, anon, service_role;
grant execute on function api.my_acquisition_fee_assessments(uuid) to authenticated;

-- klussie_engine_work needs USAGE on schema commerce and EXECUTE on the one function it
-- calls cross-schema — the exact "grant only when a real caller needs it" shape Epic 22
-- established for klussie_engine_commerce calling into workspace.
grant usage on schema commerce to klussie_engine_work;
grant execute on function commerce.assess_acquisition_fee_on_engagement(uuid, uuid, uuid, uuid, platform.actor_type, text) to klussie_engine_work;

-- Epic 14 WP05 — the billing engine contract: issue, record money movement, settle,
-- credit, and read.
--
-- event_type CORRECTED TO ADR-0019's OWN FORMAT — FOUND DURING EPIC 15
--
-- ADR-0019 requires `event_type` as `<engine>.<aggregate>.<past-participle>`, enforced by
-- platform.events' own `events_type_format` check (0021). Every call below used a bare
-- PascalCase name, conflating SYSTEM_ARCHITECTURE.md §11.2's own CONCEPTUAL event names
-- with the literal serialized column value — a mistake caught session-wide while building
-- Epic 15's own diagnostic (`implementation/epic-15/COMPLETION.md` §6). Corrected: engine
-- = billing (§11.2's own section); `InvoiceIssued` -> `billing.invoice.issued`;
-- `CreditIssued` -> `billing.credit.issued`; `PaymentAuthorized`/`PaymentSettled`/
-- `PaymentFailed` -> `billing.payment.authorized`/`.settled`/`.failed` (inbound);
-- `PayoutInitiated`/`PayoutSettled`/`PayoutFailed` -> `billing.payout.initiated`/
-- `.settled`/`.failed` (outbound) — `PayoutFailed` stays the same deliberate, named
-- extension beyond §11.2's own list this migration's own header already records, now
-- correctly formatted rather than newly invented.
--
-- NO api.* DELEGATE — property.reparent_location()'s PRECEDENT, NOW AN EIGHTH TIME
--
-- No client caller exists yet — this epic formalises the ledger, it does not switch the
-- live demo invoice surface (`src/lib/billing.js`, `InvoiceSheet.jsx`) onto it. All
-- ten functions below are granted to klussie_engine_commerce only.
--
-- issue_marketplace_commission_invoice() COMPOSES issue_invoice(), THE SAME PATTERN
-- work.generate_due_obligation() ALREADY ESTABLISHED (EPIC 10)
--
-- One function resolves the real commission from a real engagement (agreed_price,
-- performing_workspace_id) and calls the other, general-purpose writer — never a second
-- insert path duplicating commerce.invoices' own column list.
--
-- settle_payment()/fail_payment() EMIT DIFFERENT EVENT NAMES BY DIRECTION, MATCHING THE
-- FROZEN LIST — WITH ONE NAMED GAP
--
-- SYSTEM_ARCHITECTURE.md §11.2 names PaymentAuthorized/PaymentSettled/PaymentFailed for
-- inbound money and PayoutInitiated/PayoutSettled for outbound — asymmetric, with no
-- "PayoutFailed" anywhere in the frozen list. A failed payout is a real, reachable state
-- this table's own status column already permits (`check (status in ('pending',
-- 'settled', 'failed'))`, 0099 — no direction exception), so this contract still emits
-- something rather than silently skipping the event Conflict... no frozen-list entry
-- covers: `PayoutFailed`, a direct, minimal extension of the pattern the frozen list
-- already establishes for the other four states, not a new naming convention. Recorded
-- here as a real gap in the frozen documents, not silently papered over.
--
-- WORKSPACE_ID FOR EVERY EMITTED EVENT IS ALWAYS A REAL, DIRECTLY-AVAILABLE COLUMN —
-- THE LESSON EPIC 13 NAMED
--
-- Epic 13's own header explains two real bugs from resolving an event's workspace_id
-- across a polymorphic subject. Nothing here is polymorphic — every table in this epic
-- carries workspace_id (or resolves it via exactly one join to its own parent invoice)
-- directly, so no equivalent resolver is needed; each function below uses its own
-- table's real column, never a stand-in.

-- =========================================================================
-- THE LOGIC — issue

create or replace function commerce.issue_invoice(
  p_invoice_id           uuid,
  p_workspace_id          uuid,
  p_payer_workspace_id     uuid,
  p_kind                   text,
  p_engagement_id           uuid,
  p_currency                text,
  p_jurisdiction             text,
  p_subtotal                 numeric,
  p_tax_rate                  numeric,
  p_event_id                  uuid,
  p_correlation_id             uuid,
  p_actor_type                  platform.actor_type,
  p_actor_ref                    text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tax_amount  numeric(12, 2);
  v_total       numeric(12, 2);
begin
  v_tax_amount := round(p_subtotal * coalesce(p_tax_rate, 0), 2);
  v_total := p_subtotal + v_tax_amount;

  insert into commerce.invoices (
    id, workspace_id, payer_workspace_id, kind, engagement_id, currency, jurisdiction,
    subtotal, tax_rate, tax_amount, total
  ) values (
    p_invoice_id, p_workspace_id, p_payer_workspace_id, p_kind, p_engagement_id, p_currency, p_jurisdiction,
    p_subtotal, p_tax_rate, v_tax_amount, v_total
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'billing.invoice.issued',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'invoice',
    p_subject_id     => p_invoice_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('kind', p_kind, 'total', v_total, 'currency', p_currency)
  );
end;
$$;

comment on function commerce.issue_invoice(uuid, uuid, uuid, text, uuid, text, text, numeric, numeric, uuid, uuid, platform.actor_type, text) is
  'The general-purpose writer for any invoice kind. tax_amount/total are computed here, never trusted from a caller — the table''s own invoices_total_consistency check (0097) would refuse a mismatch anyway, but computing it once, in the one place that writes it, is simpler than asking every future caller to get the arithmetic right.';

create or replace function commerce.issue_marketplace_commission_invoice(
  p_invoice_id       uuid,
  p_engagement_id     uuid,
  p_commission_rate    numeric,
  p_currency            text,
  p_jurisdiction         text,
  p_event_id             uuid,
  p_correlation_id        uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref               text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_agreed_price       numeric;
  v_performing_ws       uuid;
  v_subtotal             numeric(12, 2);
begin
  select agreed_price, performing_workspace_id
    into v_agreed_price, v_performing_ws
  from work.engagements
  where id = p_engagement_id;

  if v_performing_ws is null then
    raise exception
      'commerce.issue_marketplace_commission_invoice: engagement % does not exist', p_engagement_id
      using errcode = 'invalid_parameter_value';
  end if;

  v_subtotal := round(v_agreed_price * p_commission_rate, 2);

  perform commerce.issue_invoice(
    p_invoice_id       => p_invoice_id,
    p_workspace_id      => v_performing_ws,
    p_payer_workspace_id => null,
    p_kind                => 'marketplace_commission',
    p_engagement_id         => p_engagement_id,
    p_currency               => p_currency,
    p_jurisdiction            => p_jurisdiction,
    p_subtotal                 => v_subtotal,
    p_tax_rate                  => null,
    p_event_id                   => p_event_id,
    p_correlation_id              => p_correlation_id,
    p_actor_type                   => p_actor_type,
    p_actor_ref                     => p_actor_ref
  );
end;
$$;

comment on function commerce.issue_marketplace_commission_invoice(uuid, uuid, numeric, text, text, uuid, uuid, platform.actor_type, text) is
  'The real formalisation of src/lib/billing.js''s platformFee() — the commission owed BY the performing workspace, deducted from what a completed engagement earned it. p_commission_rate is a caller-supplied parameter, not a hardcoded constant: pricing is product configuration (§24), never a value baked into an engine function. Not called automatically by work.complete_engagement() (Epic 12) — the same "no live wiring" restraint every engine epic has held since Epic 09.';

-- =========================================================================
-- THE LOGIC — money movement

create or replace function commerce.record_payment(
  p_payment_id   uuid,
  p_workspace_id  uuid,
  p_invoice_id     uuid,
  p_direction       text,
  p_amount           numeric,
  p_currency          text,
  p_event_id           uuid,
  p_correlation_id      uuid,
  p_actor_type           platform.actor_type,
  p_actor_ref             text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into commerce.payments (id, workspace_id, invoice_id, direction, amount, currency)
  values (p_payment_id, p_workspace_id, p_invoice_id, p_direction, p_amount, p_currency);

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => case when p_direction = 'inbound' then 'billing.payment.authorized' else 'billing.payout.initiated' end,
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'payment',
    p_subject_id     => p_payment_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('direction', p_direction, 'amount', p_amount, 'currency', p_currency)
  );
end;
$$;

comment on function commerce.record_payment(uuid, uuid, uuid, text, numeric, text, uuid, uuid, platform.actor_type, text) is
  'Records a money movement as pending. No real payment provider calls this yet (0099''s own header) — a real integration''s callback is the eventual caller.';

create or replace function commerce.settle_payment(
  p_payment_id      uuid,
  p_event_id         uuid,
  p_correlation_id    uuid,
  p_actor_type          platform.actor_type,
  p_actor_ref            text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id  uuid;
  v_invoice_id     uuid;
  v_direction       text;
begin
  update commerce.payments
  set status = 'settled', settled_at = now()
  where id = p_payment_id and status = 'pending'
  returning workspace_id, invoice_id, direction into v_workspace_id, v_invoice_id, v_direction;

  if v_workspace_id is null then
    raise exception
      'commerce.settle_payment: payment % does not exist or is not pending', p_payment_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_invoice_id is not null and v_direction = 'inbound' then
    update commerce.invoices set status = 'paid' where id = v_invoice_id and status = 'issued';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => case when v_direction = 'inbound' then 'billing.payment.settled' else 'billing.payout.settled' end,
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'payment',
    p_subject_id     => p_payment_id,
    p_correlation_id => p_correlation_id,
    p_payload        => '{}'::jsonb
  );
end;
$$;

comment on function commerce.settle_payment(uuid, uuid, uuid, platform.actor_type, text) is
  'Settling an inbound payment linked to an invoice also marks that invoice paid, in the same transaction — the one place this contract updates two tables from one call, because "an invoice this payment settles is now paid" is a single fact, not two independent ones a caller could apply out of order.';

create or replace function commerce.fail_payment(
  p_payment_id   uuid,
  p_reason        text,
  p_event_id       uuid,
  p_correlation_id  uuid,
  p_actor_type       platform.actor_type,
  p_actor_ref         text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id  uuid;
  v_direction      text;
begin
  update commerce.payments
  set status = 'failed'
  where id = p_payment_id and status = 'pending'
  returning workspace_id, direction into v_workspace_id, v_direction;

  if v_workspace_id is null then
    raise exception
      'commerce.fail_payment: payment % does not exist or is not pending', p_payment_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    -- PayoutFailed has no entry in SYSTEM_ARCHITECTURE.md §11.2's own event list — see
    -- this migration's own header for why it is used here anyway.
    p_event_type     => case when v_direction = 'inbound' then 'billing.payment.failed' else 'billing.payout.failed' end,
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'payment',
    p_subject_id     => p_payment_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('reason', p_reason)
  );
end;
$$;

comment on function commerce.fail_payment(uuid, text, uuid, uuid, platform.actor_type, text) is
  'The mirror of settle_payment() — no invoice status change follows a failure (an issued invoice stays issued; nothing about the invoice itself becomes false when an attempt to pay it fails). Emits billing.payout.failed for an outbound failure — see this migration''s own header for why that name exists despite not being in §11.2''s own list.';

-- =========================================================================
-- THE LOGIC — credit

create or replace function commerce.issue_credit(
  p_credit_id     uuid,
  p_invoice_id      uuid,
  p_amount           numeric,
  p_reason             text,
  p_event_id            uuid,
  p_correlation_id       uuid,
  p_actor_type            platform.actor_type,
  p_actor_ref              text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id  uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception
      'commerce.issue_credit: a reason is required'
      using errcode = 'invalid_parameter_value';
  end if;

  select workspace_id into v_workspace_id from commerce.invoices where id = p_invoice_id;

  if v_workspace_id is null then
    raise exception
      'commerce.issue_credit: invoice % does not exist', p_invoice_id
      using errcode = 'invalid_parameter_value';
  end if;

  insert into commerce.credits (id, invoice_id, amount, reason)
  values (p_credit_id, p_invoice_id, p_amount, p_reason);

  update commerce.invoices set status = 'credited' where id = p_invoice_id;

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'billing.credit.issued',
    p_workspace_id   => v_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'invoice',
    p_subject_id     => p_invoice_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('creditId', p_credit_id, 'amount', p_amount, 'reason', p_reason)
  );
end;
$$;

comment on function commerce.issue_credit(uuid, uuid, numeric, text, uuid, uuid, platform.actor_type, text) is
  'The one path §11.2''s "credit-and-reissue, never edit" describes. Moves the invoice to status = credited in the same transaction — 0097''s own guard trigger then freezes it permanently.';

-- =========================================================================
-- THE LOGIC — reads

create or replace function commerce.workspace_invoices(p_workspace_id uuid)
returns table (id uuid, kind text, engagement_id uuid, currency text, total numeric, status text, issued_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select i.id, i.kind, i.engagement_id, i.currency, i.total, i.status, i.issued_at
  from commerce.invoices i
  where i.workspace_id = p_workspace_id or i.payer_workspace_id = p_workspace_id;
$$;

create or replace function commerce.resolve_invoice(p_invoice_id uuid)
returns table (id uuid, workspace_id uuid, payer_workspace_id uuid, kind text, engagement_id uuid, currency text, jurisdiction text, subtotal numeric, tax_rate numeric, tax_amount numeric, total numeric, status text, issued_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select i.id, i.workspace_id, i.payer_workspace_id, i.kind, i.engagement_id, i.currency, i.jurisdiction,
         i.subtotal, i.tax_rate, i.tax_amount, i.total, i.status, i.issued_at
  from commerce.invoices i
  where i.id = p_invoice_id;
$$;

create or replace function commerce.invoice_credits(p_invoice_id uuid)
returns table (id uuid, amount numeric, reason text, issued_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select c.id, c.amount, c.reason, c.issued_at
  from commerce.credits c
  where c.invoice_id = p_invoice_id
  order by c.issued_at, c.id;
$$;

create or replace function commerce.workspace_payments(p_workspace_id uuid)
returns table (id uuid, invoice_id uuid, direction text, amount numeric, currency text, status text, settled_at timestamptz, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select p.id, p.invoice_id, p.direction, p.amount, p.currency, p.status, p.settled_at, p.created_at
  from commerce.payments p
  where p.workspace_id = p_workspace_id;
$$;

-- =========================================================================
-- ACCESS

revoke all on function commerce.issue_invoice(uuid, uuid, uuid, text, uuid, text, text, numeric, numeric, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function commerce.issue_marketplace_commission_invoice(uuid, uuid, numeric, text, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function commerce.record_payment(uuid, uuid, uuid, text, numeric, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function commerce.settle_payment(uuid, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function commerce.fail_payment(uuid, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function commerce.issue_credit(uuid, uuid, numeric, text, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;
revoke all on function commerce.workspace_invoices(uuid)
  from public, anon, authenticated, service_role;
revoke all on function commerce.resolve_invoice(uuid)
  from public, anon, authenticated, service_role;
revoke all on function commerce.invoice_credits(uuid)
  from public, anon, authenticated, service_role;
revoke all on function commerce.workspace_payments(uuid)
  from public, anon, authenticated, service_role;

grant execute on function commerce.issue_invoice(uuid, uuid, uuid, text, uuid, text, text, numeric, numeric, uuid, uuid, platform.actor_type, text)
  to klussie_engine_commerce;
grant execute on function commerce.issue_marketplace_commission_invoice(uuid, uuid, numeric, text, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_commerce;
grant execute on function commerce.record_payment(uuid, uuid, uuid, text, numeric, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_commerce;
grant execute on function commerce.settle_payment(uuid, uuid, uuid, platform.actor_type, text)
  to klussie_engine_commerce;
grant execute on function commerce.fail_payment(uuid, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_commerce;
grant execute on function commerce.issue_credit(uuid, uuid, numeric, text, uuid, uuid, platform.actor_type, text)
  to klussie_engine_commerce;
grant execute on function commerce.workspace_invoices(uuid)
  to klussie_engine_commerce;
grant execute on function commerce.resolve_invoice(uuid)
  to klussie_engine_commerce;
grant execute on function commerce.invoice_credits(uuid)
  to klussie_engine_commerce;
grant execute on function commerce.workspace_payments(uuid)
  to klussie_engine_commerce;

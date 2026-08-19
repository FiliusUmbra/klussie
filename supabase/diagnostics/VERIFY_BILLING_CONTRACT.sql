-- Verifies 0097/0098/0099/0101 end to end: issuing a real marketplace commission
-- invoice from a real engagement, settling an inbound payment against it (which must
-- mark the invoice paid in the same transaction), recording and settling an outbound
-- payout, issuing a credit, and every immutability guard.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_BILLING_CONTRACT.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_customer_ws   uuid := gen_random_uuid();
  v_pro_ws        uuid := gen_random_uuid();
  v_request       uuid := gen_random_uuid();
  v_quote         uuid := gen_random_uuid();
  v_engagement    uuid := gen_random_uuid();
  v_invoice       uuid := gen_random_uuid();
  v_payment_in    uuid := gen_random_uuid();
  v_payment_out   uuid := gen_random_uuid();
  v_credit        uuid := gen_random_uuid();
  v_status        text;
  v_total         numeric;
begin
  insert into workspace.workspaces (id, type, name) values
    (v_customer_ws, 'personal', 'Customer'), (v_pro_ws, 'professional', 'Pro');

  perform work.create_request(
    p_request_id => v_request, p_requesting_workspace_id => v_customer_ws,
    p_property_id => null, p_asset_id => null, p_location_id => null,
    p_category_id => null, p_service_id => null, p_details => 'Test', p_when_pref => 'flexible', p_budget => 100.00,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );
  perform work.submit_quote(
    p_quote_id => v_quote, p_request_id => v_request, p_offering_workspace_id => v_pro_ws,
    p_price => 100.00, p_message => null,
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'pro-tech'
  );
  perform work.accept_quote(
    p_quote_id => v_quote, p_engagement_id => v_engagement,
    p_event_id => gen_random_uuid(), p_engagement_event_id => gen_random_uuid(), p_declined_event_id => gen_random_uuid(),
    p_correlation_id => gen_random_uuid(), p_actor_type => 'person', p_actor_ref => 'customer-1'
  );

  -- =========================================================================
  -- 1 · A real marketplace commission invoice, computed from the real engagement

  perform commerce.issue_marketplace_commission_invoice(
    p_invoice_id => v_invoice, p_engagement_id => v_engagement, p_commission_rate => 0.12,
    p_currency => 'EUR', p_jurisdiction => 'BE',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'system', p_actor_ref => 'diagnostic-billing-job'
  );

  select total, status into v_total, v_status from commerce.resolve_invoice(v_invoice);
  if v_total <> 12.00 then
    raise exception '1a · expected commission of 12.00 (12%% of 100.00), got %', v_total;
  end if;
  if v_status <> 'issued' then
    raise exception '1b · expected status issued, got %', v_status;
  end if;

  if not exists (select 1 from commerce.invoices where id = v_invoice and workspace_id = (
    select performing_workspace_id from work.engagements where id = v_engagement
  )) then
    raise exception '1c · the invoice is not owed by the performing workspace';
  end if;
  raise notice '1 · a real commission invoice is computed correctly from a real engagement';

  -- =========================================================================
  -- 2 · Settling an inbound payment linked to the invoice marks it paid, in the same
  -- transaction

  perform commerce.record_payment(
    p_payment_id => v_payment_in, p_workspace_id => (select performing_workspace_id from work.engagements where id = v_engagement),
    p_invoice_id => v_invoice, p_direction => 'inbound', p_amount => 12.00, p_currency => 'EUR',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'system', p_actor_ref => 'diagnostic-billing-job'
  );
  perform commerce.settle_payment(
    v_payment_in, gen_random_uuid(), gen_random_uuid(), 'system', 'diagnostic-billing-job'
  );

  select status into v_status from commerce.resolve_invoice(v_invoice);
  if v_status <> 'paid' then
    raise exception '2 · expected the invoice to become paid after its payment settled, got %', v_status;
  end if;
  raise notice '2 · settling the linked inbound payment marks the invoice paid';

  -- =========================================================================
  -- 3 · A payment cannot be settled twice

  begin
    perform commerce.settle_payment(v_payment_in, gen_random_uuid(), gen_random_uuid(), 'system', 'diagnostic-billing-job');
    raise exception '3 · settling an already-settled payment did not raise';
  exception when others then
    if sqlerrm not like '%does not exist or is not pending%' then raise; end if;
  end;
  raise notice '3 · a payment cannot be settled twice';

  -- =========================================================================
  -- 4 · An outbound payout, unrelated to any invoice, settles independently

  perform commerce.record_payment(
    p_payment_id => v_payment_out, p_workspace_id => (select performing_workspace_id from work.engagements where id = v_engagement),
    p_invoice_id => null, p_direction => 'outbound', p_amount => 88.00, p_currency => 'EUR',
    p_event_id => gen_random_uuid(), p_correlation_id => gen_random_uuid(), p_actor_type => 'system', p_actor_ref => 'diagnostic-billing-job'
  );
  perform commerce.settle_payment(v_payment_out, gen_random_uuid(), gen_random_uuid(), 'system', 'diagnostic-billing-job');

  select status into v_status from commerce.workspace_payments((select performing_workspace_id from work.engagements where id = v_engagement))
  where id = v_payment_out;
  if v_status <> 'settled' then
    raise exception '4 · expected the payout to settle, got %', v_status;
  end if;
  raise notice '4 · an outbound payout settles independently of any invoice';

  -- =========================================================================
  -- 5 · A credit against the paid invoice moves it to credited, permanently

  perform commerce.issue_credit(
    v_credit, v_invoice, 12.00, 'Full refund — job was cancelled after payment',
    gen_random_uuid(), gen_random_uuid(), 'person', 'support-agent'
  );
  select status into v_status from commerce.resolve_invoice(v_invoice);
  if v_status <> 'credited' then
    raise exception '5a · expected credited, got %', v_status;
  end if;

  begin
    update commerce.invoices set status = 'paid' where id = v_invoice;
    raise exception '5b · reverting a credited invoice did not raise';
  exception when others then
    if sqlerrm not like '%permanently frozen%' then raise; end if;
  end;
  raise notice '5 · a credit moves the invoice to credited, which is then permanently frozen';

  -- =========================================================================
  -- 6 · The credit log itself is append-only

  begin
    update commerce.credits set amount = 0 where id = v_credit;
    raise exception '6 · updating a credit did not raise';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  raise notice '6 · the credit log refuses mutation';

  raise notice 'VERIFY_BILLING_CONTRACT: all checks passed';
end;
$$;

rollback;

-- Epic 14 WP03 — Payments and Payouts, one table with a direction, not two duplicated
-- shapes.
--
-- §11.2 names both "Payments" and "Payouts" among what this engine owns, and separately
-- lists distinct event names for each (PaymentAuthorized/Settled/Failed vs
-- PayoutInitiated/Settled). The two are structurally the same fact — a money movement
-- against a workspace, in a currency, eventually settling or failing — differing only in
-- direction: inbound (collected FROM a workspace, e.g. commission) or outbound (paid OUT
-- to a workspace, e.g. a performing workspace's net earnings). One table with a
-- `direction` column, not two duplicated tables, matching how work.maintenance_
-- obligations (Epic 10) uses one `source` column rather than four near-identical
-- tables for manual/schedule/compliance/prediction-sourced rows.
--
-- NO REAL PROVIDER — SEE 0097's OWN HEADER
--
-- "Does not own. Payment providers, which are adapters" (§11.2). This table records
-- money movement as fact; nothing here calls Stripe or any other real provider. A real
-- provider's callbacks are exactly what commerce.settle_payment() (0101) exists to
-- receive, once one exists.
--
-- IMMUTABLE EXCEPT status/settled_at — THE SAME PATTERN AS commerce.invoices, WITH TWO
-- POSSIBLE TERMINALS INSTEAD OF ONE
--
-- pending may move to settled OR failed, exactly once; neither is reachable from the
-- other.

create table if not exists commerce.payments (
  id                uuid        not null,

  workspace_id      uuid        not null
                    references workspace.workspaces (id),
  invoice_id        uuid        null
                    references commerce.invoices (id),

  direction         text        not null
                    check (direction in ('inbound', 'outbound')),

  amount            numeric(12, 2) not null
                    check (amount > 0),
  currency          text        not null,

  status            text        not null default 'pending'
                    check (status in ('pending', 'settled', 'failed')),
  settled_at        timestamptz null,

  created_at        timestamptz not null default now(),

  constraint payments_pkey primary key (id),
  constraint payments_settled_consistency
    check (status <> 'settled' or settled_at is not null)
);

comment on table commerce.payments is
  'A money movement against a workspace (§11.2) — inbound (collected from it, e.g. commission) or outbound (paid out to it, e.g. net marketplace earnings). No real payment provider exists yet (MASTER_CONTEXT.md §12) — this is the structural ledger a real provider''s callbacks would eventually write into.';
comment on column commerce.payments.direction is
  'inbound or outbound — one table, not two duplicated shapes. See this migration''s own header.';
comment on column commerce.payments.invoice_id is
  'What this settles, if it settles an invoice at all. Nullable: a payout to a performing workspace''s net earnings is not itself billed by an invoice the platform issues to them.';

create index if not exists payments_workspace_idx
  on commerce.payments (workspace_id);
create index if not exists payments_invoice_idx
  on commerce.payments (invoice_id) where invoice_id is not null;

-- =========================================================================
-- IMMUTABILITY — status/settled_at are the only columns permitted to change, and only
-- once, from pending to a real terminal

create or replace function commerce.payments_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'commerce.payments rows are never deleted'
      using
        hint = 'Financial history is statutory evidence (§22) — never deleted.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.workspace_id is distinct from old.workspace_id
       or new.invoice_id is distinct from old.invoice_id
       or new.direction is distinct from old.direction
       or new.amount is distinct from old.amount
       or new.currency is distinct from old.currency
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'commerce.payments is immutable except status/settled_at'
        using errcode = 'restrict_violation';
    end if;

    if old.status <> 'pending' then
      raise exception
        'commerce.payments: a settled or failed payment is permanently frozen'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function commerce.payments_guard_mutation() is
  'Identical in shape to commerce.invoices_guard_mutation() (migration 0097) — every column frozen except two, permitting exactly one transition out of pending, into either real terminal.';

drop trigger if exists payments_guard_mutation on commerce.payments;
create trigger payments_guard_mutation
  before update or delete on commerce.payments
  for each row execute function commerce.payments_guard_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on commerce.payments to klussie_engine_commerce;
revoke all on commerce.payments from anon, authenticated, service_role;

alter table commerce.payments enable row level security;

-- No policy yet — WP 14.04's own job.

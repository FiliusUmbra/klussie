-- Epic 14 WP02 — Credits: the correction mechanism, append-only, forever.
--
-- §11.2: "Corrections by credit-and-reissue, never edit." A credit is the only way an
-- invoice's own total is ever effectively adjusted after issuance — never by touching
-- the invoice row itself (0097's own guard trigger already forbids that).

create table if not exists commerce.credits (
  id            uuid        not null,

  invoice_id    uuid        not null
                references commerce.invoices (id),

  amount        numeric(12, 2) not null
                check (amount > 0),
  reason        text        not null,

  issued_at     timestamptz not null default now(),

  constraint credits_pkey primary key (id)
);

comment on table commerce.credits is
  'A correction against an invoice (§11.2) — append-only, permanent. commerce.issue_credit() (0101) is the only writer, and always moves the parent invoice to status = ''credited'' in the same transaction.';
comment on column commerce.credits.amount is
  'Always positive — a credit reduces what was owed, expressed as a magnitude, not a signed adjustment. Whether it fully or partially offsets the invoice is a fact the reason records, not a structural distinction this table enforces.';

create index if not exists credits_invoice_idx
  on commerce.credits (invoice_id);

create or replace function commerce.credits_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'commerce.credits is append-only: % rejected', tg_op
    using
      hint = 'A recorded credit is permanent. A further correction is a new credit.',
      errcode = 'restrict_violation';
end;
$$;

comment on function commerce.credits_reject_mutation() is
  'Identical in shape to work.service_record_amendments_reject_mutation() (migration 0082) and every other append-only guard in this schema.';

drop trigger if exists credits_append_only on commerce.credits;
create trigger credits_append_only
  before update or delete on commerce.credits
  for each row execute function commerce.credits_reject_mutation();

-- =========================================================================
-- ACCESS

revoke all on commerce.credits from anon, authenticated, service_role;

alter table commerce.credits enable row level security;

-- No policy yet — WP 14.04's own job.

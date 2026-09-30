-- Payments Slice A (WP A1) — versioned, configurable acquisition-fee pricing.
-- PRODUCT_CONSTITUTION.md Rule 2: "pricing rules, thresholds — if it's a business
-- decision, it's data, not source code." commerce.issue_marketplace_commission_invoice()
-- (0101) already takes its rate as a caller-supplied parameter rather than a constant —
-- this table is what supplies that parameter for real, instead of a literal at the call
-- site, and adds the one thing that function's signature does not carry at all: a cap.
--
-- APPEND-ONLY, LIKE commerce.credits — A PRICING CHANGE IS A NEW ROW, NEVER AN EDIT
--
-- The acquisition-fee decision table's own rule: "changes requiring higher fees need
-- renewed disclosure and acceptance." That is only checkable if a fee already disclosed
-- to a professional can never retroactively change value under them — snapshotting
-- pricing_version_id onto a real assessment row (0230) is what makes that possible, and
-- it only means something if this table itself never mutates a row after the fact.
--
-- fee_kind EXISTS NOW WITH ONE REAL VALUE, MATCHING commerce.invoices.kind's OWN IDIOM
--
-- Not overengineered into a generic "pricing platform" (the brief's own instruction) —
-- one real kind, a real column so a second kind is a data row later, not a schema change.

create table if not exists commerce.pricing_versions (
  id              uuid        not null,

  fee_kind        text        not null default 'acquisition_fee'
                  check (fee_kind in ('acquisition_fee')),

  rate            numeric(5, 4)  not null
                  check (rate >= 0 and rate <= 1),
  max_fee         numeric(12, 2) not null
                  check (max_fee > 0),
  currency        text        not null,

  is_test_mode    boolean     not null default true,

  effective_from  timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  constraint pricing_versions_pkey primary key (id)
);

comment on table commerce.pricing_versions is
  'Versioned, configurable pricing for revenue features that need a rate a caller can snapshot (Payments Slice A, brief-mandated "configurable, versioned pricing"). Append-only — never edit a published version; a pricing change is always a new row with a later effective_from. commerce.current_pricing_version() resolves "the version in effect now" for a real caller to snapshot.';
comment on column commerce.pricing_versions.is_test_mode is
  'Brief-mandated TEST-MODE defaults ship as real rows with is_test_mode = true, not a separate table or a hardcoded branch — a real launch decision flips to a new is_test_mode = false row, never edits this one (Rule 2/3: configuration, not a deploy).';

create index if not exists pricing_versions_kind_effective_idx
  on commerce.pricing_versions (fee_kind, effective_from desc);

-- =========================================================================
-- IMMUTABILITY — append-only, the same guard shape as commerce.credits (0098).

create or replace function commerce.pricing_versions_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'commerce.pricing_versions is append-only: % rejected', tg_op
    using
      hint = 'A pricing change is a new version with a later effective_from, never an edit to a published one.',
      errcode = 'restrict_violation';
end;
$$;

drop trigger if exists pricing_versions_guard_mutation on commerce.pricing_versions;
create trigger pricing_versions_guard_mutation
  before update or delete on commerce.pricing_versions
  for each row execute function commerce.pricing_versions_reject_mutation();

-- =========================================================================
-- THE LOGIC — read the version in effect right now. stable, not immutable: "now" moves.

create or replace function commerce.current_pricing_version(p_fee_kind text, p_currency text)
returns table (id uuid, rate numeric, max_fee numeric, currency text, is_test_mode boolean, effective_from timestamptz)
language sql
stable
set search_path = ''
as $$
  select pv.id, pv.rate, pv.max_fee, pv.currency, pv.is_test_mode, pv.effective_from
  from commerce.pricing_versions pv
  where pv.fee_kind = p_fee_kind
    and pv.currency = p_currency
    and pv.effective_from <= now()
  order by pv.effective_from desc, pv.created_at desc
  limit 1;
$$;

comment on function commerce.current_pricing_version(text, text) is
  'The version a real caller snapshots at disclosure time (Payments Slice A, WP A3). Ties by effective_from resolve to the most recently inserted row — pricing_versions_kind_effective_idx keeps this a real index scan, not a sequential one.';

-- =========================================================================
-- ACCESS

revoke all on commerce.pricing_versions from anon, authenticated, service_role;
grant select, insert on commerce.pricing_versions to klussie_engine_commerce;

revoke all on function commerce.current_pricing_version(text, text) from public, anon, authenticated, service_role;
grant execute on function commerce.current_pricing_version(text, text) to klussie_engine_commerce;

alter table commerce.pricing_versions enable row level security;
-- No policy: this is platform-wide configuration, not a workspace aggregate, the same
-- placement (and the same "no client SELECT grant yet") platform.plans holds today
-- (Epic 22 completion record §5.1/§6) — read only through the commerce engine contract.

-- =========================================================================
-- SEED — the brief's own TEST-MODE defaults, in effect immediately.

insert into commerce.pricing_versions (id, fee_kind, rate, max_fee, currency, is_test_mode, effective_from)
values ('018f6e6e-0000-7000-8000-000000000001', 'acquisition_fee', 0.05, 75.00, 'EUR', true, '2026-01-01T00:00:00Z')
on conflict (id) do nothing;

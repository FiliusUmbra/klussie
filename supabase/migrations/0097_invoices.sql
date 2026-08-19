-- Epic 14 WP01 — the Invoice aggregate: the first real revenue path.
--
-- READ BEFORE DESIGN
--
-- DATABASE_ARCHITECTURE.md §22 / SYSTEM_ARCHITECTURE.md §11.2: "Money. Immutable,
-- statutory, multi-currency and multi-jurisdiction from the first record." Lives in
-- `commerce` (migration 0018 already created the schema, unused until now), owned by
-- klussie_engine_commerce — migration 0019's own pairing: "Subscription and Billing
-- engines. Owns schema commerce."
--
-- SUBSCRIPTION IS DELIBERATELY NOT THIS EPIC — THE ROADMAP ALREADY SPLITS THEM, SIX
-- EPICS APART
--
-- SYSTEM_ARCHITECTURE.md names two separate engines in one section (§11.1 Subscription,
-- §11.2 Billing) sharing one schema. The roadmap's own epic sequence already resolves
-- which comes first: Epic 14 is Billing, sequenced here "because it becomes possible the
-- moment engagements complete correctly" (roadmap §10); Epic 22 is Subscription, six
-- epics later, in the Services and Commercial tier. §11.2 itself: "Does not own...
-- Subscriptions." This is not a scope decision this epic makes — it is already made,
-- and this migration holds it: no subscription concept appears anywhere below.
--
-- NO REAL PAYMENT PROVIDER — "Does not own. Payment providers, which are adapters."
--
-- MASTER_CONTEXT.md §12 already tracks "No payment system... Stripe Connect
-- integration" as its own separate debt item. This epic is not that integration — it is
-- the structural ledger a real provider's callbacks would eventually write into. Today,
-- `src/lib/billing.js`'s PLATFORM_COMMISSION_RATE/platformFee()/netPayout() are pure
-- client-side display math with no persisted record anywhere — "commission is currently
-- a display-only constant" (roadmap §10). This migration formalises that fact as a real,
-- immutable ledger; it does not move real money.
--
-- ONE TABLE, NOT A SEPARATE "COMMISSION RECORD" TABLE
--
-- §11.2 lists "Invoices. Charges. Payments. Payouts. Commission records" among what this
-- engine owns. Nothing in either frozen document gives "commission record" its own
-- distinct shape anywhere the way §13.2 gave Service Record one — interpreted here as
-- the specific *kind* of invoice this epic's own real revenue source produces
-- (`kind = 'marketplace_commission'`), not a fourth table invented with no stated shape
-- to build against. `kind` is real and extensible for whichever future epic adds another
-- reason to bill a workspace.
--
-- payer_workspace_id IS A FORWARD-COMPATIBLE COLUMN, MATCHING THIS SCHEMA'S OWN IDIOM
--
-- §22: "the payer is a reference rather than an assumption — a subscription's paying
-- party need not be the workspace itself." Stated for Subscription (Epic 22) but the
-- identical principle already applies to invoices generally ("Future consolidated
-- billing"). Nullable, unpopulated by anything in this epic — the same
-- forward-compatible-column pattern `work.requests.workflow_instance_id` (Epic 12) and
-- `property.document_types.is_public` (Epic 08) both already used ahead of their own
-- first real writer.
--
-- CORRECTIONS ARE CREDITS (0098), NEVER AN EDIT — THE SAME ONE-EXCEPTION-COLUMN GUARD
-- SINCE work.service_records
--
-- "Corrections by credit-and-reissue, never edit" (§11.2). status is the one column
-- this table permits changing after creation, and only forward: issued -> paid ->
-- credited, or issued -> credited directly. Once credited, permanently frozen.

create table if not exists commerce.invoices (
  id                    uuid        not null,

  workspace_id          uuid        not null
                        references workspace.workspaces (id),
  payer_workspace_id    uuid        null
                        references workspace.workspaces (id),

  kind                  text        not null
                        check (kind in ('marketplace_commission', 'subscription', 'other')),
  engagement_id         uuid        null
                        references work.engagements (id),

  currency              text        not null,
  jurisdiction           text        not null,

  subtotal               numeric(12, 2) not null,
  tax_rate                numeric(5, 4)  null,
  tax_amount              numeric(12, 2) not null default 0,
  total                   numeric(12, 2) not null,

  status                  text        not null default 'issued'
                          check (status in ('issued', 'paid', 'credited')),

  issued_at               timestamptz not null default now(),

  constraint invoices_pkey primary key (id),
  constraint invoices_kind_engagement_consistency
    check ((kind = 'marketplace_commission') = (engagement_id is not null)),
  constraint invoices_total_consistency
    check (total = subtotal + tax_amount)
);

comment on table commerce.invoices is
  'The first real financial record (§22, §11.2) — immutable, multi-currency, multi-jurisdiction from the first row. kind = ''marketplace_commission'' is the only real revenue source this epic produces (roadmap §10: "sequenced here because it becomes possible the moment engagements complete correctly"); ''subscription'' and ''other'' are named, real, and unpopulated until Epic 22 and whichever future work needs them.';
comment on column commerce.invoices.jurisdiction is
  'The jurisdiction whose rules governed this record, at the time it was created (§22) — never re-resolved later, even if the workspace''s own jurisdiction changes.';
comment on column commerce.invoices.payer_workspace_id is
  'Null means the workspace itself pays — the ordinary case today. Set only by future consolidated-billing work (Epic 22''s own "How it evolves"); nothing in this epic populates it.';

create index if not exists invoices_workspace_idx
  on commerce.invoices (workspace_id);
create index if not exists invoices_engagement_idx
  on commerce.invoices (engagement_id) where engagement_id is not null;

-- =========================================================================
-- IMMUTABILITY — status is the one column permitted to change, forward only

create or replace function commerce.invoices_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'commerce.invoices rows are never deleted'
      using
        hint = 'Financial history is statutory evidence (§22) — never deleted, only credited.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.workspace_id is distinct from old.workspace_id
       or new.payer_workspace_id is distinct from old.payer_workspace_id
       or new.kind is distinct from old.kind
       or new.engagement_id is distinct from old.engagement_id
       or new.currency is distinct from old.currency
       or new.jurisdiction is distinct from old.jurisdiction
       or new.subtotal is distinct from old.subtotal
       or new.tax_rate is distinct from old.tax_rate
       or new.tax_amount is distinct from old.tax_amount
       or new.total is distinct from old.total
       or new.issued_at is distinct from old.issued_at
    then
      raise exception
        'commerce.invoices is immutable except status'
        using
          hint = 'A correction is a credit (commerce.credits, 0098), never an edit to the invoice.',
          errcode = 'restrict_violation';
    end if;

    if old.status = 'credited' then
      raise exception
        'commerce.invoices: a credited invoice is permanently frozen'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function commerce.invoices_guard_mutation() is
  'Identical in shape to work.service_records_guard_mutation() (migration 0081) — every column frozen except one, here permitting a real forward path (issued -> paid -> credited) rather than a single flip, with credited as a true terminal state.';

drop trigger if exists invoices_guard_mutation on commerce.invoices;
create trigger invoices_guard_mutation
  before update or delete on commerce.invoices
  for each row execute function commerce.invoices_guard_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on commerce.invoices to klussie_engine_commerce;
revoke all on commerce.invoices from anon, authenticated, service_role;

-- Cross-schema reads this engine genuinely needs — named and narrow, per migration
-- 0019's own rule ("each cross-schema read is granted by the epic that has a real query
-- needing it"). work.engagements.agreed_price/performing_workspace_id are what
-- commerce.issue_marketplace_commission_invoice() (0101) resolves a commission from.
grant usage on schema work to klussie_engine_commerce;
grant select on work.engagements to klussie_engine_commerce;

alter table commerce.invoices enable row level security;

-- No policy yet — WP 14.04's own job.

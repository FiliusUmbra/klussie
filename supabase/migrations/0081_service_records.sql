-- Epic 11 WP01 — the Service Record shared core: one object, two legitimate owners,
-- immutable except for one explicit exception.
--
-- "THE MOST CONSEQUENTIAL AGGREGATE IN THE DOCUMENT" — READ TWICE BEFORE WRITING ANY SQL
--
-- DATABASE_ARCHITECTURE.md §17: "Two parties with legitimate differing interests in one
-- record means every visibility rule must be deliberate, and a mistake exposes a
-- business's cost base to its customer or a household's private notes to a contractor.
-- This is the highest-risk surface in the architecture." PLATFORM_DOMAIN_MODEL.md §32
-- item 5 names §13.2's split as "the part DATABASE_ARCHITECTURE.md must get exactly
-- right." Read in full before this migration was written: §17, §13.2, and
-- SYSTEM_ARCHITECTURE.md §8.2 — three independent statements of the identical
-- classification table, cross-checked against each other rather than trusted from one
-- reading.
--
-- THREE BOUNDARIES, DELIBERATELY NOT THE SAME THING (§17's own framing)
--
-- Authorship (who may write what), visibility (who may read what) and lifecycle (who may
-- end it) are usually one axis. Here they are three: the performing workspace authors the
-- work, the property's workspace authors approval and its own annotations, and NEITHER
-- may end the record at all. This migration builds the shared core only — the two
-- private annexes and the amendment log are WP 11.02; the write/read contract enforcing
-- the authorship split is WP 11.04.
--
-- THE CORE HAS NO owning_workspace_id COLUMN — IT "FOLLOWS THE PROPERTY," NOT A STORED
-- STEWARD, WHICH IS WHY IT IS NOT SHAPED LIKE property.documents
--
-- §17's own transfer table is explicit and asymmetric: when a property changes steward,
-- the core is "Unaffected — follows the property," while the property annex (WP 11.02)
-- "Stays with the previous steward." A document (Epic 08) freezes owning_workspace_id at
-- creation because a document's ownership does not follow anything — it simply belongs to
-- whoever created it. A service record's core belongs to the PROPERTY, dynamically,
-- exactly the way property.assets and property.locations already carry no workspace_id
-- of their own and resolve visibility through property_id -> property.properties.
-- steward_workspace_id (the current, mutable pointer, ADR-0028). This migration follows
-- that precedent for the core's property-side visibility (WP 11.03 resolves it, live, at
-- read time) rather than reusing property.documents' frozen-owning-workspace shape,
-- because the two aggregates answer different questions about "whose is this."
--
-- performing_workspace_id IS THE PERMANENT GRANT ITSELF — NOT A SEPARATE GRANTS TABLE
--
-- §17: "The performing workspace holds a permanent, non-revocable grant to the core —
-- the one grant in the architecture that does not expire." property.document_shares
-- (Epic 08) models sharing as a separate table because a document may be shared with
-- MANY workspaces, revocably. A service record has exactly ONE performing workspace,
-- permanently — a plain NOT NULL column on the core row already IS the grant; a separate
-- grants table would model a one-row set with more structure than the concept has. There
-- is no withdraw path for it anywhere in this schema, which is the "non-revocable" rule
-- enforced by omission rather than by a check.
--
-- WHAT IS NOT A COLUMN HERE, AND WHY — RICH, VARIABLE CONTENT IS jsonb, NOT FIFTEEN
-- NULLABLE COLUMNS
--
-- §13.2, verbatim: "Every one of those is optional. A household's tap washer produces a
-- service record with four fields; a hospital's annual boiler inspection produces one
-- with two hundred and a statutory certificate." Every field in the classification table
-- carries the SAME visibility rule (shared core, visible to both parties equally) — RLS
-- does not need per-field typing to enforce that, only "is this row visible at all." The
-- handful of fields treated as real, typed columns below are the ones another part of
-- this architecture already depends on structurally: work_performed (the one field even
-- a four-field record cannot omit — "the permanent record of... what was done"),
-- performed_at, agreed_price (feeds Billing, Epic 14), customer_approved* (the
-- authorship-split field the property side alone may set — WP 11.04), and warranty_until
-- ("Warranties arising are already core content with validity periods," §17, feeding a
-- future warranty claim without redesign). Everything else — diagnosis, symptoms, cause,
-- technicians, labour and travel time, materials, quantities, part numbers, manufacturer,
-- measurements, recommendations, AI summary — lives in `content jsonb`, matching §13.2's
-- own trade-off: "capture almost nothing by default... the cost of writing them is an
-- architectural concern, not a UI detail."
--
-- PHOTOS, VIDEO, DOCUMENTS AND CERTIFICATES — A NAMED CONNECTION, NOT BUILT HERE
--
-- §13.2 lists these as core content. property.document_attachments (Epic 08) scopes to
-- exactly four subjects — property, location, asset, workspace — and its own header
-- names "maintenance record and marketplace engagement" as deliberately excluded because
-- neither table existed yet. work.service_records is a fifth real candidate subject,
-- exactly the same shape. Not added here: this migration does not alter an already-open,
-- already-reviewed Epic 08 migration to reach into its surface uninvited. Named for
-- whichever future work first needs a service record's photos attached through the
-- document engine rather than duplicated into a jsonb field.

create table if not exists work.service_records (
  id                      uuid        not null,

  property_id             uuid        not null
                          references property.properties (id),
  asset_id                uuid        null
                          references property.assets (id),
  location_id             uuid        null
                          references property.locations (id),

  performing_workspace_id uuid        not null
                          references workspace.workspaces (id),

  performed_at            timestamptz not null,
  work_performed          text        not null,

  agreed_price            numeric(12, 2) null,
  price_currency          text        null,

  warranty_until          date        null,

  customer_approved       boolean     not null default false,
  customer_approved_at    timestamptz null,

  ai_summary              text        null,
  recommendations         text        null,

  -- Diagnosis, symptoms, cause, technicians present, labour/travel time, materials,
  -- quantities, part numbers, manufacturer information, measurements — every field
  -- §13.2 lists that no other part of this architecture yet references structurally.
  -- See this migration's own header.
  content                 jsonb       not null default '{}'::jsonb,

  created_at              timestamptz not null default now(),

  constraint service_records_pkey primary key (id),
  constraint service_records_at_most_one_subject
    check (num_nonnulls(asset_id, location_id) <= 1),
  constraint service_records_approval_consistency
    check (customer_approved = (customer_approved_at is not null))
);

comment on table work.service_records is
  'The shared core (DATABASE_ARCHITECTURE.md §17, PLATFORM_DOMAIN_MODEL.md §13.2) — one record, homed with the property, permanently readable by the performing workspace. No owning_workspace_id: property-side visibility resolves through property_id -> property.properties.steward_workspace_id, live, the same shape property.assets/locations already use, because the core "follows the property" (§17) rather than freezing to a steward the way property.documents freezes to its creator.';
comment on column work.service_records.performing_workspace_id is
  'The permanent, non-revocable grant itself (§17) — not a row in a separate shares table. No column, guard or function anywhere in this schema ever clears it; that omission is the "non-revocable" rule.';
comment on column work.service_records.customer_approved is
  'The ONE field the property''s workspace may set on this row — the authorship split''s explicit exception, enforced by work.service_records_guard_mutation() below, not merely by convention.';
comment on column work.service_records.content is
  'Every optional, variable field §13.2 lists that nothing else in this architecture yet depends on structurally. A household''s record may leave this ''{}''; a hospital''s may fill it with two hundred fields'' worth of measurements and part numbers.';

create index if not exists service_records_property_idx
  on work.service_records (property_id);
create index if not exists service_records_performing_workspace_idx
  on work.service_records (performing_workspace_id);
create index if not exists service_records_asset_idx
  on work.service_records (asset_id) where asset_id is not null;
create index if not exists service_records_location_idx
  on work.service_records (location_id) where location_id is not null;

-- =========================================================================
-- IMMUTABILITY — every column is frozen at creation except customer_approved and
-- customer_approved_at, which may move from unset to set exactly once. §17: "Completed
-- records are immutable... corrections are amendments." Amendments are WP 11.02's own
-- append-only table, never an update to this row.

create or replace function work.service_records_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'work.service_records rows are never deleted'
      using
        hint = 'A service record is permanent (§17). There is no delete in this engine''s contract, by design.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.property_id is distinct from old.property_id
       or new.asset_id is distinct from old.asset_id
       or new.location_id is distinct from old.location_id
       or new.performing_workspace_id is distinct from old.performing_workspace_id
       or new.performed_at is distinct from old.performed_at
       or new.work_performed is distinct from old.work_performed
       or new.agreed_price is distinct from old.agreed_price
       or new.price_currency is distinct from old.price_currency
       or new.warranty_until is distinct from old.warranty_until
       or new.ai_summary is distinct from old.ai_summary
       or new.recommendations is distinct from old.recommendations
       or new.content is distinct from old.content
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'work.service_records is immutable except customer_approved/customer_approved_at'
        using
          hint = 'A correction is an amendment (work.service_record_amendments, WP 11.02), never an edit to the core.',
          errcode = 'restrict_violation';
    end if;

    if old.customer_approved and not new.customer_approved then
      raise exception
        'work.service_records: customer_approved may move from false to true only, never back'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function work.service_records_guard_mutation() is
  'Identical in shape to work.workflow_definitions_reject_mutation() (migration 0066) — every column frozen except one named exception, plus an unconditional delete guard. The exception here is narrower still: customer_approved may only move false -> true, never reset.';

drop trigger if exists service_records_guard_mutation on work.service_records;
create trigger service_records_guard_mutation
  before update or delete on work.service_records
  for each row execute function work.service_records_guard_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

-- The one permitted mutation path (customer_approved/customer_approved_at), via the
-- contract function (WP 11.04) only.
grant update on work.service_records to klussie_engine_work;

-- DELETE withheld unconditionally — see the guard trigger above; this grant would be
-- meaningless to add and is deliberately absent, unlike property.documents' conditional
-- delete grant (Epic 08), because nothing about a service record is ever convenience-
-- class.
revoke all on work.service_records from anon, authenticated, service_role;

alter table work.service_records enable row level security;

-- No policy yet — WP 11.03's own job, once the combined property-current-steward-OR-
-- performing-workspace predicate can be written against both this table and its annexes
-- together.

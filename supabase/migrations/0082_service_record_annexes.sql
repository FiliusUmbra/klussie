-- Epic 11 WP02 — the two private annexes, and the append-only amendment log.
--
-- §17: "A Service Record is a shared core plus a private annex per participating
-- workspace. The core holds facts about the work. Each annex holds that party's own
-- commercial and internal context." Two ordinary workspace-scoped tables — "the annexes
-- are ordinary workspace-scoped records," unlike the core (0081), which is neither.
--
-- THE PROPERTY ANNEX FREEZES ITS WORKSPACE AT CREATION — THE CORE'S OWN HEADER'S EXACT
-- MIRROR IMAGE
--
-- 0081's header explains why the core has no owning_workspace_id: it "follows the
-- property," live, through the current steward. The property annex is the deliberate
-- opposite, per §17's own transfer table: "Property changes steward | Property annex:
-- Stays with the previous steward." A steward's own private annotations, approvals and
-- budget context do not transfer to whoever stewards the property next — only the
-- shared core does. This table therefore stores owning_workspace_id directly, frozen at
-- creation, the same shape property.documents already uses for the identical reason
-- (an owner that does not follow anything).
--
-- THE PERFORMING ANNEX HAS NO WORKSPACE COLUMN OF ITS OWN TO FREEZE — IT ALREADY HAS ONE,
-- ON THE CORE
--
-- performing_workspace_id never changes (0081's guard trigger freezes it, and nothing in
-- this schema ever reassigns which workspace performed a piece of work). The performing
-- annex therefore has no reason to duplicate it — its own workspace_id is always exactly
-- service_records.performing_workspace_id, resolved by a join rather than a second
-- column that could, in principle, drift from the first.
--
-- AT MOST ONE ANNEX PER SERVICE RECORD PER SIDE — A UNIQUE CONSTRAINT, NOT A CONVENTION
--
-- Unlike work.maintenance_schedules -> work.maintenance_obligations (many obligations
-- per schedule) or property.documents -> property.document_shares (many shares per
-- document), each service record has exactly one performing annex and at most one
-- property annex, ever — a unique index on service_record_id enforces this at the
-- database layer rather than trusting the contract function (WP 11.04) alone.
--
-- AMENDMENTS ARE FREE-TEXT CORRECTIONS TO THE CORE, NOT TO EITHER ANNEX
--
-- §17: "Completed records are immutable. Corrections are amendments carrying their own
-- author, time and reason, appended to the record." The annexes are ordinary mutable
-- data (this migration's own header) — a business editing its own internal notes is not
-- a correction to evidence, it is an update to a private record it already owns freely.
-- Amendments exist only for the shared core, where immutability is the whole point.

-- =========================================================================
-- THE PERFORMING ANNEX — commercial and internal context, the performing workspace's own

create table if not exists work.service_record_performing_annexes (
  id                    uuid        not null,
  service_record_id     uuid        not null
                        references work.service_records (id),

  internal_cost         numeric(12, 2) null,
  margin                numeric(12, 2) null,
  supplier_used         text        null,
  supplier_price        numeric(12, 2) null,
  scheduling_notes      text        null,
  internal_commentary   text        null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint service_record_performing_annexes_pkey primary key (id),
  constraint service_record_performing_annexes_one_per_record unique (service_record_id)
);

comment on table work.service_record_performing_annexes is
  '"A business''s cost base is its own information" (§13.2). Visibility follows work.service_records.performing_workspace_id via a join (WP 11.03) — no workspace_id column here to duplicate a value the core already holds immutably.';

-- =========================================================================
-- THE PROPERTY ANNEX — the property side's own context, frozen to whoever stewarded the
-- property at the moment this annex was written

create table if not exists work.service_record_property_annexes (
  id                    uuid        not null,
  service_record_id     uuid        not null
                        references work.service_records (id),

  -- Frozen at creation — see this migration's own header. Not a foreign key to
  -- property.properties.steward_workspace_id (which is mutable); a direct snapshot,
  -- the same shape property.documents.owning_workspace_id already holds.
  owning_workspace_id   uuid        not null
                        references workspace.workspaces (id),

  annotations           text        null,
  internal_approvals    text        null,
  budget_context        text        null,
  private_assessment    text        null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint service_record_property_annexes_pkey primary key (id),
  constraint service_record_property_annexes_one_per_record unique (service_record_id)
);

comment on table work.service_record_property_annexes is
  '"Its own annotations, internal approvals, budget context" (§13.2). owning_workspace_id is a frozen snapshot of the steward at the moment this annex was written — a later change of steward leaves it exactly as it was, matching §17''s own transfer table for this table specifically (the opposite of the core''s own live resolution, 0081).';

-- =========================================================================
-- AMENDMENTS — append-only, forever, either party may author one

create table if not exists work.service_record_amendments (
  id                    uuid        not null,
  service_record_id     uuid        not null
                        references work.service_records (id),

  authored_by_workspace_id uuid     not null
                          references workspace.workspaces (id),

  field_key             text        not null,
  previous_value        text        null,
  corrected_value       text        null,
  reason                text        not null,

  amended_at            timestamptz not null default now(),

  constraint service_record_amendments_pkey primary key (id)
);

comment on table work.service_record_amendments is
  '"Corrections are amendments carrying their own author, time and reason, appended to the record" (§17). "The current reading of a record is the core plus its amendment chain." field_key/previous_value/corrected_value are text — general enough to describe a correction to any core field (typed or inside content jsonb) without a second copy of the core''s own type system.';
comment on column work.service_record_amendments.authored_by_workspace_id is
  'Either the performing workspace or the property''s current steward — §17 does not restrict which party may correct which field, only that every correction is attributed, timed and reasoned. work.amend_service_record() (WP 11.04) trusts its caller to pass the real authoring workspace, the same trust platform.emit_event() places in every engine that calls it.';

create index if not exists service_record_amendments_record_idx
  on work.service_record_amendments (service_record_id, amended_at);

create or replace function work.service_record_amendments_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'work.service_record_amendments is append-only: % rejected', tg_op
    using
      hint = 'A recorded amendment is permanent. A further correction is a new amendment.',
      errcode = 'restrict_violation';
end;
$$;

comment on function work.service_record_amendments_reject_mutation() is
  'Identical in shape to work.workflow_transitions_reject_mutation() (migration 0067) and every other append-only guard in this schema.';

drop trigger if exists service_record_amendments_append_only on work.service_record_amendments;
create trigger service_record_amendments_append_only
  before update or delete on work.service_record_amendments
  for each row execute function work.service_record_amendments_reject_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

-- Both annexes are ordinary Transactional data — mutable in place by their owning
-- workspace, via the contract function (WP 11.04).
grant update on work.service_record_performing_annexes to klussie_engine_work;
grant update on work.service_record_property_annexes to klussie_engine_work;

-- DELETE withheld from all three tables. An annex belongs to a permanent core and is
-- never independently removed; amendments are append-only.
revoke all on work.service_record_performing_annexes from anon, authenticated, service_role;
revoke all on work.service_record_property_annexes from anon, authenticated, service_role;
revoke all on work.service_record_amendments from anon, authenticated, service_role;

alter table work.service_record_performing_annexes enable row level security;
alter table work.service_record_property_annexes enable row level security;
alter table work.service_record_amendments enable row level security;

-- No policy yet — WP 11.03's own job.

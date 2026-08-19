-- Epic 10 WP01 — the Maintenance Schedule aggregate: the recurring rule that generates
-- obligations, kept structurally separate from the obligations it produces.
--
-- DATABASE_ARCHITECTURE.md §16: "Owned by the workspace, anchored to an asset or
-- location. Created manually, by schedule, by compliance obligation, or by prediction."
-- SYSTEM_ARCHITECTURE.md §8.1: "generated schedules dominate the volume" — the schedule
-- is the primary value driver this engine exists for, not an edge case, so it is a real
-- aggregate rather than a column on the obligation it eventually produces. Lives in
-- `work`, owned by klussie_engine_work — the same schema/role migration 0019 names for
-- "Maintenance, Service Record, Workflow, Marketplace and Conversation engines," where
-- Epic 09's Workflow Engine already landed.
--
-- ANCHORED TO AN ASSET OR LOCATION — THE SAME "EXACTLY ONE SUBJECT" SHAPE AS
-- property.document_attachments, NARROWED TO WHAT §16 ACTUALLY NAMES
--
-- §16 says "anchored to an asset or location," not the four subjects
-- property.document_attachments offers (property, location, asset, workspace) — a
-- schedule about an entire property or the whole workspace isn't a concept this
-- migration invents ahead of a real need. Two nullable columns, `check
-- (num_nonnulls(asset_id, location_id) = 1)`, the same idiom Epic 08 established.
--
-- RECURRENCE IS A NATIVE interval, NOT A COLUMN COUNTING MONTHS
--
-- A boiler service is annual; a fire-extinguisher check is every six months; a filter
-- change might be quarterly. PostgreSQL's own `interval` type expresses all of these
-- without inventing a unit-and-count pair the database would have to interpret itself —
-- `next_due_on + recurrence` is exact date arithmetic PostgreSQL already gets right,
-- including across month-length and leap-year boundaries.
--
-- NO VERSION HISTORY, UNLIKE EVERY ADR-0028 AGGREGATE SO FAR
--
-- Nothing in §16 requires a schedule's past configuration to be reconstructable the way
-- a workflow definition's does (§18) or a document's version history does (§15) — a
-- schedule is Transactional (§4), mutable in place, exactly like property.assets or
-- work.maintenance_obligations before it closes (0072). Pausing (`active = false`) and
-- resuming are ordinary updates, not a new version.

create table if not exists work.maintenance_schedules (
  id             uuid        not null,

  workspace_id   uuid        not null
                 references workspace.workspaces (id),
  asset_id       uuid        null
                 references property.assets (id),
  location_id    uuid        null
                 references property.locations (id),

  title          text        not null,
  description    text        null,

  recurrence     interval    not null
                 check (recurrence > interval '0'),
  next_due_on    date        not null,

  active         boolean     not null default true,
  cancelled_at   timestamptz null,

  created_at     timestamptz not null default now(),

  constraint maintenance_schedules_pkey primary key (id),
  constraint maintenance_schedules_one_subject
    check (num_nonnulls(asset_id, location_id) = 1),
  constraint maintenance_schedules_cancelled_consistency
    check ((active) or (cancelled_at is not null))
);

comment on table work.maintenance_schedules is
  'The recurring rule an obligation is generated from (DATABASE_ARCHITECTURE.md §16). Anchored to exactly one of an asset or a location — never a whole property or workspace, which §16 does not name. work.generate_due_obligation() (0074) is the only writer of next_due_on going forward.';
comment on column work.maintenance_schedules.recurrence is
  'A native interval (e.g. ''6 months'', ''1 year''), not a count-and-unit pair — exact date arithmetic PostgreSQL already performs correctly across month-length and leap-year boundaries.';
comment on column work.maintenance_schedules.active is
  'False once cancelled. work.generate_due_obligation() (0074) only considers active schedules — cancelling one stops it from generating further obligations without deleting its history.';

create index if not exists maintenance_schedules_workspace_idx
  on work.maintenance_schedules (workspace_id);
create index if not exists maintenance_schedules_due_idx
  on work.maintenance_schedules (next_due_on) where active;

-- =========================================================================
-- MUTABILITY AND ACCESS
--
-- Transactional (§4): mutated in place by the contract function (0074), never deleted —
-- a cancelled schedule is retained the same way a cancelled obligation retains its
-- cancellation reason (§16), so the record of "this used to run" is never lost.

grant update on work.maintenance_schedules to klussie_engine_work;
revoke all on work.maintenance_schedules from anon, authenticated, service_role;

alter table work.maintenance_schedules enable row level security;

-- No policy yet — WP 10.03 adds it once work.maintenance_obligations exists to write
-- both isolation policies against the same shape together.

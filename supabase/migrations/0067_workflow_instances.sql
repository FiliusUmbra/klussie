-- Epic 09 WP02 — the Workflow Instance aggregate: one workspace-scoped run of a
-- definition, its current stage a maintained convenience, its transition log the truth.
--
-- DATABASE_ARCHITECTURE.md §18: "An instance's transition log is append-only and is the
-- truth. Its current stage is a maintained convenience derived from that log
-- (Principle 6)." ADR-0028's shape, a fourth time: a mutable current-state pointer
-- (work.workflow_instances.current_stage) plus a genuinely append-only log
-- (work.workflow_transitions) of every stage this instance has ever occupied — the same
-- relationship property.documents/document_versions, property.assets/asset_placements
-- and property.properties/stewardship_periods already hold. No circular pointer: the log
-- does not reference "the current row," the aggregate holds its own current value
-- directly, exactly as 0055's own header explains for documents.
--
-- WHAT "SUBJECT" MEANS HERE, AND WHY THERE IS NO FOREIGN KEY TO ONE
--
-- §18 describes an instance as "one workspace-scoped run of a definition" over some real
-- process — but as 0066's header explains, nothing in this schema yet has a real
-- workspace-scoped process to attach one to (requests/quotes aren't workspace-scoped
-- until Epic 12; no maintenance obligation, service record or engagement exists yet
-- either). subject_type/subject_id is therefore a polymorphic (text, uuid) pair with no
-- foreign key — not a gap, but reuse of an already-real precedent already in this
-- codebase: platform.emit_event() (migration 0023) takes the identical
-- p_subject_type text, p_subject_id uuid pair for the identical reason, and has done
-- since before this epic existed. A future engine attaching real instances validates its
-- own subject_id against its own table before calling work.start_workflow_instance() —
-- the same responsibility split property.document_attachments already places on its
-- callers for its own four optional subject columns (Epic 08), generalised here to a
-- fully open set of future subject tables rather than four named ones.
--
-- ACTOR_TYPE REUSES platform.actor_type, NOT A NEW ENUM
--
-- migration 0021 already declares platform.actor_type ('person', 'system',
-- 'integration', 'intelligence') for the Event Backbone. A workflow transition's actor is
-- the identical concept — who or what caused this — so the existing type is reused
-- directly rather than a second, workflow-scoped enum meaning the same thing.

-- =========================================================================
-- THE INSTANCE AGGREGATE — a mutable current-stage pointer

create table if not exists work.workflow_instances (
  id             uuid        not null,

  workspace_id   uuid        not null
                 references workspace.workspaces (id),
  definition_id  uuid        not null
                 references work.workflow_definitions (id),

  subject_type   text        not null,
  subject_id     uuid        not null,

  current_stage  text        not null,

  started_at     timestamptz not null default now(),
  ended_at       timestamptz null,

  constraint workflow_instances_pkey primary key (id),
  constraint workflow_instances_current_stage_fkey
    foreign key (definition_id, current_stage)
    references work.workflow_stages (definition_id, stage_key),
  constraint workflow_instances_ended_after_started
    check (ended_at is null or ended_at >= started_at)
);

comment on table work.workflow_instances is
  'One workspace-scoped run of a work.workflow_definitions version, pinned to it permanently via definition_id — §18: "References the exact definition version it started under, permanently." current_stage is maintained by work.transition_workflow_instance() (WP 09.04), never written directly by a client.';
comment on column work.workflow_instances.subject_type is
  'What real thing, in some other engine''s schema, this instance is a process about. No foreign key — see header. Read together with subject_id.';
comment on column work.workflow_instances.ended_at is
  'Set the moment a transition lands on a stage where work.workflow_stages.is_terminal is true. Null means the instance is still open — §18: "Workflows may be open for years... there is no assumption anywhere that a process completes quickly."';

create index if not exists workflow_instances_workspace_idx
  on work.workflow_instances (workspace_id);
create index if not exists workflow_instances_subject_idx
  on work.workflow_instances (subject_type, subject_id);

-- =========================================================================
-- THE TRANSITION LOG — append-only, the truth per §18. definition_id is denormalised
-- from the owning instance at insert time (never independently settable) purely so the
-- composite foreign keys below can hold the log to the same reachability graph the
-- instance's own definition declares, without a join back through workflow_instances to
-- get there.

create table if not exists work.workflow_transitions (
  id             uuid        not null,
  instance_id    uuid        not null
                 references work.workflow_instances (id),
  definition_id  uuid        not null
                 references work.workflow_definitions (id),

  from_stage     text        null,
  to_stage       text        not null,
  event_key      text        not null,

  actor_type     platform.actor_type not null,
  actor_ref      text        null,

  payload        jsonb       not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),

  constraint workflow_transitions_pkey primary key (id),
  constraint workflow_transitions_from_stage_fkey
    foreign key (definition_id, from_stage)
    references work.workflow_stages (definition_id, stage_key),
  constraint workflow_transitions_to_stage_fkey
    foreign key (definition_id, to_stage)
    references work.workflow_stages (definition_id, stage_key)
);

comment on table work.workflow_transitions is
  'The truth §18 describes: "An instance''s transition log is append-only and is the truth." Every entry corresponds to exactly one row work.workflow_transition_rules already permitted at the moment it was applied — work.transition_workflow_instance() (WP 09.04) is the only writer, and it refuses anything the rules table does not name.';
comment on column work.workflow_transitions.actor_ref is
  'A person reference or an integration/system identifier, matching the meaning platform.events.actor_ref already carries for the same platform.actor_type column (migration 0021) — no foreign key, for the identical erasure reason Conflict 6 states: a durable record must never hold a hard reference to identity.';

create index if not exists workflow_transitions_instance_idx
  on work.workflow_transitions (instance_id, occurred_at);

-- No dedicated per-instance sequence column, unlike platform.events.subject_sequence.
-- ADR-0019's gapless sequence exists because platform.events is partitioned and a
-- consumer must detect a lost row from a gap in the counter alone. work.workflow_
-- transitions is not partitioned and is always read through work.resolve_workflow_
-- instance() (WP 09.04), ordered by occurred_at — id (UUIDv7, ADR-0022) is already
-- time-ordered, so insertion order is recoverable without a second counter to keep
-- gapless under concurrent writers.

-- =========================================================================
-- IMMUTABILITY — the log never changes once written; the instance mutates only through
-- the contract function (WP 09.04), never via direct client UPDATE (no grant is given).

create or replace function work.workflow_transitions_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'work.workflow_transitions is append-only: % rejected', tg_op
    using
      hint = 'A recorded transition is permanent. A correction is a new transition describing the correction.',
      errcode = 'restrict_violation';
end;
$$;

comment on function work.workflow_transitions_reject_mutation() is
  'Identical in shape to work.workflow_definition_children_reject_mutation() (migration 0066), property.document_versions_reject_mutation() (migration 0055), property.asset_placements_reject_mutation() (migration 0048), property.stewardship_periods_reject_mutation() (migration 0039) and workspace.membership_history_reject_mutation() (migration 0030).';

drop trigger if exists workflow_transitions_append_only on work.workflow_transitions;
create trigger workflow_transitions_append_only
  before update or delete on work.workflow_transitions
  for each row execute function work.workflow_transitions_reject_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

-- workflow_instances.current_stage/ended_at are Transactional (§4): mutated in place by
-- the contract function, inside the same transaction that appends the transition row.
grant update on work.workflow_instances to klussie_engine_work;

-- DELETE withheld from both tables — an instance is never removed (its history is the
-- truth an audit may depend on), and a transition is never removed (append-only, above).
revoke all on work.workflow_instances from anon, authenticated, service_role;
revoke all on work.workflow_transitions from anon, authenticated, service_role;

alter table work.workflow_instances enable row level security;
alter table work.workflow_transitions enable row level security;

-- No policy yet — WP 09.03 adds the real isolation policies once both tables exist to
-- write them against together.

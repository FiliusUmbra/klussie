-- Epic 09 WP01 — the Workflow Definition aggregate: stages and transition rules as
-- versioned, published configuration.
--
-- DATABASE_ARCHITECTURE.md §18: "Every process is configuration, not code. This is where
-- the platform's business rules live (domain model §14.2)." Two aggregates, deliberately
-- separate: Workflow Definition (this migration) and Workflow Instance (WP 09.02). Lives
-- in `work`, owned by klussie_engine_work — the same schema/role migration 0019 already
-- names for "Maintenance, Service Record, Workflow, Marketplace and Conversation engines."
--
-- WHY THIS EPIC EXISTS: SUPABASE_ARCHITECTURE.md §23 CONFLICT 3
--
-- "PLATFORM_DOMAIN_MODEL.md §14.2 places business rules in versioned workflow
-- definitions, explicitly not in storage-layer triggers. The existing schema does the
-- opposite: on_quote_accepted, on_job_completed, on_review_created, on_request_created
-- and on_quote_sent carry the booking state machine in triggers." The conflict's own
-- resolution gives the distinguishing test applied throughout this epic: *does this
-- trigger make a decision, or refuse an impossibility?* Constraints stay triggers;
-- decisions become workflow definitions.
--
-- READ BEFORE DESIGN — WHAT THIS EPIC DOES NOT DO, AND WHY, FOUND BEFORE WRITING ANY SQL
--
-- The roadmap's own one-line summary reads "this epic ends the trigger-based state
-- machine." Checked against what the five legacy triggers actually govern
-- (public.service_requests.status, public.quotes.status) and against
-- DATABASE_ARCHITECTURE.md §18 itself ("Workflow Instance — one workspace-scoped run of
-- a definition"): a workflow instance requires a real workspace-scoped subject. Requests
-- and quotes are not workspace-scoped today — they key off profiles.id
-- (customer_id/pro_id), not a workspace — and Epic 12's own roadmap line is explicit that
-- this is *its* job: "Marketplace Engine. Requests, quotes, engagements migrated onto the
-- new schema and driven by workflow definitions rather than triggers." Building a bridge
-- from legacy profile-keyed rows to workspace-scoped instances now would mean inventing,
-- ahead of schedule, exactly the request/quote-to-workspace resolution Epic 12 is
-- sequenced to do properly — a worse foundation than waiting six migrations for the real
-- one. Constraint 24.15 calls the five triggers "migration targets... for the migration
-- milestone," not "for this epic" specifically, which is consistent with this reading.
--
-- So: Epic 09 builds the real, generic engine and authors the actual booking-lifecycle
-- rules as a genuine published definition (this migration, WP 09.05) — a real, load-
-- bearing deliverable in its own right, since "decisions... move to workflow
-- definitions" describes the definition's existence, not only its eventual wiring. It
-- does NOT touch public.service_requests, public.quotes, or retire any of the five
-- legacy triggers. That switch is recorded as Epic 12's own work package, not silently
-- dropped — see docs/IMPLEMENTATION_ROADMAP.md's Epic 09 section and
-- implementation/epic-09/COMPLETION.md §5.
--
-- WHY NO BACKFILL, UNLIKE EVERY PRECEDING ENGINE EPIC
--
-- Epics 05-08 each migrated real existing data into a new aggregate. Workflow has no
-- predecessor data to migrate — the closest existing structure (service_requests/quotes
-- status columns) is exactly what the paragraph above explains cannot yet become a real
-- instance subject. This epic is shaped like Epic 05's original build, not Epics 06-08's
-- six-step migration: new capability, proven with its own real configuration and
-- structural tests, not a legacy-table cutover.
--
-- CAPABILITY-AWARE, JURISDICTION-AWARE — DECLARED BUT NOT YET ENFORCED
--
-- §18 says a definition "declares the capabilities it requires; a workspace sees only
-- definitions it can run," and is "jurisdiction-aware... a Belgian statutory inspection
-- and a Dutch one are two definitions, not two code paths." No Capability engine exists
-- yet in this roadmap to enforce the first, and nothing in the product is
-- jurisdiction-differentiated yet to exercise the second — inventing enforcement for
-- either now would be building capability that doesn't exist, the same restraint
-- Epic 08 held for maintenance-record subjects. Both concerns stay real, named gaps
-- rather than silently built around.
--
-- "WHO MAY PERFORM," "EVIDENCE REQUIRED," "TIMING EXPECTATIONS," "NOTIFICATIONS" — NOT
-- BUILT HERE, FOR THE SAME REASON
--
-- §18 lists all of these as part of what a definition describes. Of them, only "who may
-- perform" corresponds to something real today (identity roles) and is included below as
-- workflow_transition_rules.actor_role. "Evidence required" has no collection step in the
-- legacy triggers this definition reproduces; "timing expectations" has no SLA/timer
-- concept anywhere in the current schema; "notifications" is Epic 19's own engine, not
-- built. Each is a real, named future column, not invented ahead of a consumer.

-- =========================================================================
-- THE DEFINITION AGGREGATE — immutable once published, versioned per definition_key

create table if not exists work.workflow_definitions (
  id                uuid        not null,

  definition_key    text        not null,
  version           integer     not null
                     check (version >= 1),

  -- null = platform-scoped catalog entry, available to every workspace. Not null =
  -- workspace-authored, for the "future workflow editor" §18 names as a later product
  -- surface over this same structure. Nothing writes a non-null value yet — the column
  -- exists so that surface needs no later ALTER, the same forward-compatible-column
  -- pattern property.document_types.is_public (Epic 08) and property.assets.warranty_
  -- expires_on (Epic 07) both already used.
  workspace_id      uuid        null
                     references workspace.workspaces (id),

  name              text        not null,
  description       text        null,

  published_at      timestamptz not null default now(),
  deprecated_at     timestamptz null,

  created_at        timestamptz not null default now(),

  constraint workflow_definitions_pkey primary key (id),
  constraint workflow_definitions_key_version_unique unique (definition_key, version)
);

comment on table work.workflow_definitions is
  'A versioned, published description of a process (DATABASE_ARCHITECTURE.md §18) — "Immutable once published. A change produces a new version." No draft state: there is no editor yet (§18''s own "future workflow editor" is explicitly deferred), so every row here is inserted already published, the same one-shot-catalog shape property.document_types (Epic 08) and property.facet_types (Epic 07) both use.';
comment on column work.workflow_definitions.workspace_id is
  'Null = platform-scoped catalog entry. Not null = workspace-authored (no writer yet — reserved for the future workflow editor §18 names).';
comment on column work.workflow_definitions.deprecated_at is
  'The only column ever updated after publication. Deprecating retires a version from new instances without disturbing instances already pinned to it (§18: "definitions are never deleted while referenced; they are deprecated").';

-- =========================================================================
-- STAGES — the definition's own named states

create table if not exists work.workflow_stages (
  id             uuid    not null,
  definition_id  uuid    not null
                 references work.workflow_definitions (id),
  stage_key      text    not null,
  sequence       integer not null,
  is_terminal    boolean not null default false,

  constraint workflow_stages_pkey primary key (id),
  constraint workflow_stages_definition_key_unique unique (definition_id, stage_key)
);

comment on table work.workflow_stages is
  'The named states a work.workflow_instances row governed by this definition may occupy. sequence is informational ordering for display only — the actual reachability graph is workflow_transition_rules, not this column.';
comment on column work.workflow_stages.is_terminal is
  'True once an instance reaching this stage is done — work.workflow_instances.ended_at is set the moment a transition lands here (WP 09.02/09.04).';

-- =========================================================================
-- TRANSITION RULES — the reachability graph: (from_stage, event_key) -> to_stage

create table if not exists work.workflow_transition_rules (
  id             uuid    not null,
  definition_id  uuid    not null
                 references work.workflow_definitions (id),

  -- Null = the rule that starts a new instance (no prior stage). Not part of the
  -- composite FK below when null — Postgres' default MATCH SIMPLE skips the check
  -- whenever any column of a composite FK is null, which is exactly the behaviour
  -- wanted: an instance's first transition has no from_stage to validate.
  from_stage     text    null,
  to_stage       text    not null,
  event_key      text    not null,

  -- Who may cause this transition. Free-form, matching the only real vocabulary that
  -- exists today (identity roles) rather than a formal RBAC/capability reference that
  -- would be invented ahead of the engine that owns it — see the header note.
  actor_role     text    null,

  constraint workflow_transition_rules_pkey primary key (id),
  constraint workflow_transition_rules_unique unique (definition_id, from_stage, event_key),
  constraint workflow_transition_rules_from_stage_fkey
    foreign key (definition_id, from_stage)
    references work.workflow_stages (definition_id, stage_key),
  constraint workflow_transition_rules_to_stage_fkey
    foreign key (definition_id, to_stage)
    references work.workflow_stages (definition_id, stage_key)
);

comment on table work.workflow_transition_rules is
  'The reachability graph a definition permits: from a given stage, a given event moves an instance to exactly one target stage. work.transition_workflow_instance() (WP 09.04) looks up (definition_id, current_stage, event_key) here and raises when no row matches — an impossible transition is refused, per Conflict 3''s own distinguishing test, not silently allowed.';
comment on column work.workflow_transition_rules.from_stage is
  'Null identifies the rule that starts a new instance — work.start_workflow_instance() (WP 09.04) looks up (definition_id, from_stage is null) to find it.';

-- =========================================================================
-- IMMUTABILITY — published configuration, guarded the same way every Historical
-- object in this schema already is: a trigger, not a grant, because "may update only
-- deprecated_at" is a per-column condition a GRANT cannot express.

create or replace function work.workflow_definitions_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'work.workflow_definitions rows are never deleted'
      using
        hint = 'A version in force is deprecated, not removed. Deprecating leaves it valid for instances already pinned to it.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.definition_key is distinct from old.definition_key
       or new.version is distinct from old.version
       or new.workspace_id is distinct from old.workspace_id
       or new.name is distinct from old.name
       or new.description is distinct from old.description
       or new.published_at is distinct from old.published_at
       or new.created_at is distinct from old.created_at
    then
      raise exception
        'work.workflow_definitions is immutable once published, except deprecated_at'
        using
          hint = 'A changed rule is a new version (a new row), never an edit to a published one.',
          errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function work.workflow_definitions_reject_mutation() is
  'Enforces "Immutable once published. A change produces a new version." (§18) — every column may change never, except deprecated_at, and no row is ever deleted while it could still be a live instance''s pin.';

drop trigger if exists workflow_definitions_guard_mutation on work.workflow_definitions;
create trigger workflow_definitions_guard_mutation
  before update or delete on work.workflow_definitions
  for each row execute function work.workflow_definitions_reject_mutation();

create or replace function work.workflow_definition_children_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    '% is append-only once its definition is published: % rejected', tg_table_name, tg_op
    using
      hint = 'A definition''s stages and transition rules are fixed at publication. A changed process is a new definition version.',
      errcode = 'restrict_violation';
end;
$$;

comment on function work.workflow_definition_children_reject_mutation() is
  'Identical in shape to work.workflow_definitions_reject_mutation() above, applied unconditionally (no deprecated_at-style exception exists for a stage or a rule) to both work.workflow_stages and work.workflow_transition_rules.';

drop trigger if exists workflow_stages_append_only on work.workflow_stages;
create trigger workflow_stages_append_only
  before update or delete on work.workflow_stages
  for each row execute function work.workflow_definition_children_reject_mutation();

drop trigger if exists workflow_transition_rules_append_only on work.workflow_transition_rules;
create trigger workflow_transition_rules_append_only
  before update or delete on work.workflow_transition_rules
  for each row execute function work.workflow_definition_children_reject_mutation();

-- =========================================================================
-- ACCESS

alter table work.workflow_definitions enable row level security;
alter table work.workflow_stages enable row level security;
alter table work.workflow_transition_rules enable row level security;

-- No policy yet on any of the three — configuration nobody reads directly from the
-- client. WP 09.03/09.04 add the real read path once the contract exists to serve it
-- through, the same restraint property.document_types (Epic 08) and property.facet_types
-- (Epic 07) both held before their own first caller existed. The absent policy is
-- still the deny.

revoke all on work.workflow_definitions from anon, authenticated, service_role;
revoke all on work.workflow_stages from anon, authenticated, service_role;
revoke all on work.workflow_transition_rules from anon, authenticated, service_role;

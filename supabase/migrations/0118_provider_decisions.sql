-- Epic 18 WP01 — provider decisions, recommendations shown, and customer overrides:
-- `work.provider_decisions` — built retroactively, the same shape Epic 04 (Capability
-- Engine) held: branched off the latest tip (epic-19) rather than its chronological
-- position, on explicit instruction, not silently reordering an already-pushed stack.
--
-- THE SAME REBUILD-TEST CORRECTION AS PROPERTY MEMORY, A SECOND TIME — §36 FINDING 2
--
-- DATABASE_ARCHITECTURE.md §36 finding 2: "Provider Intelligence was classified entirely
-- as a projection. But a recommendation shown, a decision taken and a customer override
-- are facts about what happened, not interpretations... scores remain a projection;
-- decisions, recommendations shown, and overrides are an append-only aggregate." This is
-- the identical shape §36 finding 1 forced on Property Memory (Epic 17's own
-- knowledge.memory_versions) — a projection half nothing here builds (see this
-- migration's own closing note), and a real, permanent aggregate half, which this table
-- is.
--
-- SCOPED PLACEMENT — THE SAME SILENT GAP EPIC 19 FOUND FOR NOTIFICATION, RESOLVED
-- DIFFERENTLY HERE, AND THE DIFFERENCE IS THE POINT
--
-- Neither SUPABASE_ARCHITECTURE.md §7's own schema table nor ROLES.md names a schema or
-- engine role for Provider Intelligence, the identical silence Epic 19 found for
-- Notification. §7's own stated reason for schema grouping is join locality — "keeps the
-- common joins within a schema" — not which numbered tier a section happens to sit under
-- in a different document. Notification had no natural join partner (its own nearest
-- analogue, Audit, was chosen for being an equally cross-cutting concern with a genuine
-- aggregate). Provider Intelligence is different: §9.3's own "Dependencies" line names
-- Marketplace directly, and a decision is fundamentally "for THIS request, recommend THIS
-- provider" — the same join-local reasoning that already puts Marketplace, Service
-- Record, Workflow, Maintenance and Conversation together in `work`, owned by
-- klussie_engine_work. This migration follows that placement, the sixth engine sharing
-- one schema rather than a twelfth schema of its own — and, as a direct consequence,
-- needs zero new cross-schema grants (klussie_engine_work already reaches everything this
-- epic's contract touches, including platform.events via 0106's own fix).
--
-- SUBJECT IS POLYMORPHIC, NOT A REAL FOREIGN KEY — THE SAME RESTRAINT
-- knowledge.workspace_edges AND platform.notifications ALREADY HOLD
--
-- "A need" (§9.3's own word) could be a work.requests row today; nothing requires it stay
-- that way as "future expansion" (predictive dispatch, capacity-aware selection) adds
-- other kinds of need. subject_type/subject_id, unconstrained by foreign key, the same
-- posture platform.events.subject_type/subject_id itself holds (ADR-0019) and every
-- polymorphic-subject aggregate this session has built since has reused rather than
-- reinvented.
--
-- PROVIDER IDENTITY IS jsonb, NOT A TYPED (workspace_id | person_ref) COLUMN PAIR — A
-- REAL AMBIGUITY §14.4'S OWN REFRAME MAKES STRUCTURAL, NOT AN OVERSIGHT
--
-- PLATFORM_DOMAIN_MODEL.md §14.4's own six-source table names "Internal team — the
-- workspace's own members" alongside "Marketplace supply — providing workspaces" as
-- equally legitimate provider sources: one is a person, the other a workspace, and future
-- sources (contracted providers, external directories) may be neither. A recommended
-- provider is recorded as {providerType, providerRef, score, reasoning} inside jsonb —
-- recommended_providers is the array a recommendation shows; selected_provider and
-- overridden_provider are the identical shape, singular, for whichever one outcome
-- followed.
--
-- EXPLAINABILITY IS STRUCTURAL — §9.3'S OWN WORDS, TAKEN LITERALLY
--
-- "The inputs to a recommendation are captured *with* it, because recomputing an
-- explanation later against changed data yields a different explanation, which is worse
-- than none." recommended_providers therefore is not a set of provider references to be
-- re-scored on read — each entry carries its own reasoning, frozen at the moment it was
-- produced, required and non-empty.
--
-- ONE ROW, THREE POSSIBLE OUTCOMES, AT MOST ONE EVER TRUE — SELECTED AND OVERRIDDEN ARE
-- MUTUALLY EXCLUSIVE
--
-- A recommendation is produced; later, exactly one of two things happens to it: the
-- customer accepts a recommended provider (selected_provider set, matching one of
-- recommended_providers) or picks someone else entirely (overridden_provider set, with a
-- reason). Never both — a decision that was overridden was not also separately
-- "selected." Guarded structurally, not left to application discipline.
--
-- PROVIDER SCORES — THE PROJECTION HALF OF §36 FINDING 2 — ARE NOT BUILT HERE
--
-- §29's own classification: "Provider scores are a projection. Rebuildable at any time."
-- Unlike knowledge.current_property_memory() (Epic 17), which could be a trivial "latest
-- published version" read because memory versions are themselves the thing being
-- surfaced, a provider score requires real reasoning — relationship history, Workspace
-- Knowledge, compliance, availability — computed by whatever future engine actually
-- performs that judgement (§9.3's own "Scale": "invoked per need, asynchronously"), not a
-- SQL structural task this migration can respond to with a table. Named here as a
-- deliberate, real gap, not silently narrowed scope.

create table if not exists work.provider_decisions (
  id                       uuid        not null,

  workspace_id             uuid        not null
                           references workspace.workspaces (id),

  subject_type             text        not null,
  subject_id               uuid        not null,

  recommended_providers    jsonb       not null,
  recommended_at           timestamptz not null default now(),

  selected_provider        jsonb       null,
  decided_at               timestamptz null,

  overridden_provider      jsonb       null,
  override_reason          text        null,
  overridden_at            timestamptz null,

  actor_type               platform.actor_type not null,
  actor_ref                text        not null,

  constraint provider_decisions_pkey primary key (id),
  constraint provider_decisions_recommendations_not_empty
    check (jsonb_array_length(recommended_providers) > 0),
  constraint provider_decisions_selected_pair
    check ((selected_provider is null) = (decided_at is null)),
  constraint provider_decisions_overridden_pair
    check (
      (overridden_provider is null) = (overridden_at is null)
      and (override_reason is null) = (overridden_at is null)
    ),
  constraint provider_decisions_one_outcome
    check (not (decided_at is not null and overridden_at is not null))
);

comment on table work.provider_decisions is
  'Provider decisions, recommendations shown, and customer overrides (DATABASE_ARCHITECTURE.md §29, §36 finding 2) — an aggregate, append-only, Historical: facts about what happened, not interpretations. Provider scores (the projection half of the same finding) are not built here — see this migration''s own header.';
comment on column work.provider_decisions.recommended_providers is
  '[{providerType, providerRef, score, reasoning}, ...] — the inputs to the recommendation, captured at the moment it was produced (§9.3: "explainability is structural"), never recomputed on read.';
comment on column work.provider_decisions.selected_provider is
  '{providerType, providerRef} — set once, only if the customer accepted a recommended provider. Mutually exclusive with overridden_provider.';
comment on column work.provider_decisions.overridden_provider is
  '{providerType, providerRef} — set once, only if the customer chose someone the recommendation did not name. Mutually exclusive with selected_provider.';

create index if not exists provider_decisions_workspace_idx
  on work.provider_decisions (workspace_id, recommended_at desc);
create index if not exists provider_decisions_subject_idx
  on work.provider_decisions (subject_type, subject_id);

-- =========================================================================
-- IMMUTABILITY — every column frozen except selected_provider/decided_at and
-- overridden_provider/override_reason/overridden_at, each pair one-way

create or replace function work.provider_decisions_guard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'work.provider_decisions rows are never deleted'
      using
        hint = 'A recommendation, once shown, is permanent — the record of what the platform proposed and why.',
        errcode = 'restrict_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.workspace_id is distinct from old.workspace_id
       or new.subject_type is distinct from old.subject_type
       or new.subject_id is distinct from old.subject_id
       or new.recommended_providers is distinct from old.recommended_providers
       or new.recommended_at is distinct from old.recommended_at
       or new.actor_type is distinct from old.actor_type
       or new.actor_ref is distinct from old.actor_ref
    then
      raise exception
        'work.provider_decisions is immutable except selected_provider, decided_at, overridden_provider, override_reason and overridden_at'
        using errcode = 'restrict_violation';
    end if;

    if old.decided_at is not null and new.decided_at is distinct from old.decided_at then
      raise exception
        'work.provider_decisions: decided_at may move from null to set only, never back'
        using errcode = 'restrict_violation';
    end if;
    if old.overridden_at is not null and new.overridden_at is distinct from old.overridden_at then
      raise exception
        'work.provider_decisions: overridden_at may move from null to set only, never back'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function work.provider_decisions_guard_mutation() is
  'Immutability guard for work.provider_decisions — two independent one-way outcome pairs on one row, the same shape work.service_records_guard_mutation() (Epic 11) and platform.notification_deliveries_guard_mutation() (Epic 19) already established.';

drop trigger if exists provider_decisions_guard_mutation on work.provider_decisions;
create trigger provider_decisions_guard_mutation
  before update or delete on work.provider_decisions
  for each row execute function work.provider_decisions_guard_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on work.provider_decisions to klussie_engine_work;
revoke all on work.provider_decisions from anon, authenticated, service_role;

alter table work.provider_decisions enable row level security;
-- No policy yet — WP 18.02's own job.

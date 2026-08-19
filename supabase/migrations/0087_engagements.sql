-- Epic 12 WP03 — the Engagement aggregate: the commitment, a bilateral object homed
-- with the requesting workspace.
--
-- DATABASE_ARCHITECTURE.md §19: "the engagement (the commitment, a bilateral object
-- homed with the requesting workspace)." "The engagement is the access-granting object.
-- Accepting a quote creates an engagement, which creates a scoped, time-bounded
-- membership (§10) for the performing workspace over exactly the locations and assets
-- the work concerns."
--
-- HOMED WITH THE REQUESTING WORKSPACE — BOTH SIDES DENORMALISED, MATCHING THE
-- BILATERAL-OBJECT SHAPE §6/CONFLICT 7 ALREADY ESTABLISHES
--
-- requesting_workspace_id and performing_workspace_id are both stored directly rather
-- than resolved by joining through work.requests/work.quotes — a bilateral object's own
-- two parties are exactly the kind of value worth denormalising for isolation-policy
-- convenience, the same reasoning work.workflow_transitions denormalises definition_id
-- (migration 0067) and property.document_shares denormalises its own pair (Epic 08).
--
-- service_record_id IS THE REAL CONNECTION TO EPIC 11, UNPOPULATED UNTIL COMPLETION
--
-- §14.3/§13.2: "A marketplace engagement produces a Service Record on completion." The
-- column exists now — the same forward-compatible-column pattern 0085's own
-- workflow_instance_id uses for Epic 09 — but nothing populates it in this epic; no
-- completion path is wired to Service Record creation yet (0085's own header explains
-- why the live wiring generally is not this epic's job).
--
-- THE SCOPED MEMBERSHIP ITSELF IS NOT CREATED BY ANY TRIGGER HERE — SEE 0085's HEADER
--
-- work.grant_engagement_access() (WP 12.06) is a real, callable function that creates
-- the actual workspace.memberships row §10/§19 describe — but nothing in this migration,
-- or any other in this epic, calls it automatically. A row in work.engagements existing
-- is not the same event as a real grant of access; conflating them here would make an
-- "add a table" migration a live authorization change the moment it runs against
-- production data with real engagements already present.

create table if not exists work.engagements (
  id                        uuid        not null,

  request_id                uuid        not null
                            references work.requests (id),
  quote_id                  uuid        not null
                            references work.quotes (id),

  requesting_workspace_id   uuid        not null
                            references workspace.workspaces (id),
  performing_workspace_id   uuid        not null
                            references workspace.workspaces (id),

  agreed_price               numeric(10, 2) not null,

  status                     text        not null default 'active'
                             check (status in ('active', 'completed', 'cancelled')),
  completed_at               timestamptz null,
  cancelled_at                timestamptz null,
  cancellation_reason         text        null,

  -- The forward connection to Epic 11 — see this migration's own header.
  service_record_id           uuid        null
                              references work.service_records (id),

  -- The forward connection to Epic 10 — the maintenance obligation this engagement, if
  -- any, was created to resolve. Nullable: most engagements today originate from a
  -- direct request, not a generated obligation, since nothing yet creates one from the
  -- other.
  maintenance_obligation_id   uuid        null
                              references work.maintenance_obligations (id),

  created_at                  timestamptz not null default now(),

  constraint engagements_pkey primary key (id),
  constraint engagements_completed_consistency
    check (status <> 'completed' or completed_at is not null),
  constraint engagements_cancelled_consistency
    check (status <> 'cancelled' or (cancelled_at is not null and cancellation_reason is not null))
);

comment on table work.engagements is
  'The commitment (§19) — a bilateral object, both parties denormalised directly rather than resolved through work.requests/work.quotes, matching every other bilateral object''s own convenience in this schema. "Engagements and their financial consequences are permanent" — no delete grant exists for this table, ever.';
comment on column work.engagements.service_record_id is
  'Set on completion, by whichever future work package wires EngagementCompleted -> a real Service Record (§14.3). Unpopulated in this epic.';
comment on column work.engagements.maintenance_obligation_id is
  'Set when this engagement was created to resolve a real obligation (Epic 10) rather than a direct request. Unpopulated in this epic — nothing yet creates an engagement from an obligation.';

create index if not exists engagements_requesting_workspace_idx
  on work.engagements (requesting_workspace_id);
create index if not exists engagements_performing_workspace_idx
  on work.engagements (performing_workspace_id);
create index if not exists engagements_request_idx
  on work.engagements (request_id);

-- =========================================================================
-- IMMUTABILITY ONCE TERMINAL — the same conditional-guard shape
-- work.maintenance_obligations_reject_terminal_mutation() (Epic 10) already established:
-- an open engagement is ordinary Transactional data, a resolved one is frozen.

create or replace function work.engagements_reject_terminal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'cancelled') then
    raise exception
      'work.engagements: engagement % is % and immutable', old.id, old.status
      using
        hint = 'A completed or cancelled engagement, and its financial consequences, are permanent (§19). There is nothing to correct on a resolved engagement.',
        errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

comment on function work.engagements_reject_terminal_mutation() is
  'Identical in shape to work.maintenance_obligations_reject_terminal_mutation() (migration 0072) — guards the row once status is terminal, not the table unconditionally.';

drop trigger if exists engagements_guard_terminal on work.engagements;
create trigger engagements_guard_terminal
  before update on work.engagements
  for each row execute function work.engagements_reject_terminal_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on work.engagements to klussie_engine_work;

-- DELETE withheld unconditionally — "permanent" (§19), no exception.
revoke all on work.engagements from anon, authenticated, service_role;

alter table work.engagements enable row level security;

-- No policy yet — WP 12.04's own job.

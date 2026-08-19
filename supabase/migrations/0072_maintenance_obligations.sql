-- Epic 10 WP02 — the Maintenance Obligation aggregate: what is due, authoritative once
-- created, retained permanently once resolved.
--
-- DATABASE_ARCHITECTURE.md §16: "a maintenance obligation (something is due) is
-- authoritative and belongs to this aggregate. A maintenance prediction (something is
-- becoming due) is derived from memory and belongs in the Derived class. Conflating them
-- would make a guess indistinguishable from a duty." No Derived-class prediction table
-- exists in this migration — Intelligence (Epic 17) owns predictions; this aggregate
-- only owns obligations, including ones a human has promoted from a prediction, which is
-- exactly what `source = 'prediction'` records without needing the prediction machinery
-- itself to exist yet.
--
-- "DUE" AND "OVERDUE" ARE NOT STORED COLUMNS — THEY ARE THE SAME AUTHORITATIVE due_on,
-- READ RELATIVE TO THE CURRENT DATE
--
-- SYSTEM_ARCHITECTURE.md §8.1 lists ObligationDue and ObligationOverdue among this
-- engine's events, which reads as though "due" and "overdue" were state transitions a
-- row moves through. They are not: due_on does not change when a date rolls past it, so
-- there is no write to attach an event to, and firing one on a schedule would need a
-- cron job with no real consumer yet (Notification, Epic 19, is unbuilt; nothing in the
-- product reads maintenance state at all). Building that wiring now would be inventing
-- infrastructure ahead of a consumer, the same restraint Epic 09's own header held for
-- "evidence required" and "timing expectations." work.my_maintenance_obligations()
-- (0074) computes due/overdue at read time from due_on and status, which is the whole
-- of what those words mean for an obligation that has not changed. The literal
-- ObligationDue/ObligationOverdue events, and whatever scheduled job would emit them,
-- are a named, deliberate gap — see this migration's own header, repeated in
-- implementation/epic-10/COMPLETION.md.
--
-- ONCE TERMINAL, AN OBLIGATION IS IMMUTABLE — A GUARD TRIGGER, NOT A GRANT
--
-- §16: "Completed obligations are retained permanently — a schedule adhered to is
-- compliance evidence. Cancelled ones retain their cancellation and its reason." An
-- open obligation is ordinary Transactional data (its title, description or due_on may
-- be corrected before it resolves); once status reaches 'completed' or 'cancelled' the
-- row is frozen. This is a single mutable row, not ADR-0028's two-table shape — there is
-- no history to log, because there is exactly one terminal state per obligation, unlike
-- a document's supersession chain or a workflow instance's transition log. A trigger
-- guards it because "no column but nothing may change once terminal" is a per-row
-- condition no GRANT can express, the same reasoning `documents_guard_deletion()`
-- (Epic 08) already used for a conditional rule.
--
-- "PRODUCES WORKFLOW INSTANCES" — NOT WIRED HERE, AND WHY
--
-- §16 lists this relationship, but no maintenance-specific workflow definition exists:
-- the only published definition today is Epic 09's own booking_request_lifecycle, which
-- describes a marketplace request, not a maintenance obligation's own process. Inventing
-- a maintenance workflow definition with no real multi-stage process behind it (nothing
-- in the current product schedules, dispatches or verifies maintenance work) would be
-- configuration with no real consumer — status alone (open/completed/cancelled) is the
-- whole truth needed today. A future epic building real dispatch/verification steps
-- defines that workflow and starts a real instance against it.

create table if not exists work.maintenance_obligations (
  id                    uuid        not null,

  workspace_id          uuid        not null
                        references workspace.workspaces (id),
  asset_id              uuid        null
                        references property.assets (id),
  location_id           uuid        null
                        references property.locations (id),
  schedule_id           uuid        null
                        references work.maintenance_schedules (id),

  title                 text        not null,
  description           text        null,

  source                text        not null
                        check (source in ('manual', 'schedule', 'compliance', 'prediction')),
  due_on                date        not null,

  status                text        not null default 'open'
                        check (status in ('open', 'completed', 'cancelled')),
  completed_at          timestamptz null,
  cancelled_at          timestamptz null,
  cancellation_reason   text        null,

  created_at            timestamptz not null default now(),

  constraint maintenance_obligations_pkey primary key (id),
  constraint maintenance_obligations_one_subject
    check (num_nonnulls(asset_id, location_id) = 1),
  constraint maintenance_obligations_schedule_matches_source
    check ((source = 'schedule') = (schedule_id is not null)),
  constraint maintenance_obligations_completed_consistency
    check (status <> 'completed' or completed_at is not null),
  constraint maintenance_obligations_cancelled_consistency
    check (status <> 'cancelled' or (cancelled_at is not null and cancellation_reason is not null))
);

comment on table work.maintenance_obligations is
  'Something due (DATABASE_ARCHITECTURE.md §16) — authoritative, unlike a prediction. Anchored to exactly one of an asset or a location, matching work.maintenance_schedules'' own shape (0071). "Due" and "overdue" are not columns here — see this migration''s own header.';
comment on column work.maintenance_obligations.schedule_id is
  'Set if and only if source = ''schedule'' (enforced by maintenance_obligations_schedule_matches_source) — the schedule that generated this row, via work.generate_due_obligation() (0074).';
comment on column work.maintenance_obligations.cancellation_reason is
  '§16: "Cancelled ones retain their cancellation and its reason." Required the moment status becomes ''cancelled'', enforced by the table check rather than left to caller discipline.';

create index if not exists maintenance_obligations_workspace_idx
  on work.maintenance_obligations (workspace_id);
create index if not exists maintenance_obligations_open_due_idx
  on work.maintenance_obligations (due_on) where status = 'open';

-- =========================================================================
-- IMMUTABILITY ONCE TERMINAL

create or replace function work.maintenance_obligations_reject_terminal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'cancelled') then
    raise exception
      'work.maintenance_obligations: obligation % is % and immutable', old.id, old.status
      using
        hint = 'A completed or cancelled obligation is retained permanently, unchanged (DATABASE_ARCHITECTURE.md §16). There is nothing to correct on a closed record.',
        errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

comment on function work.maintenance_obligations_reject_terminal_mutation() is
  'Guards the row once status reaches a terminal value, not the table unconditionally — an open obligation stays ordinary Transactional data, matching the conditional-guard shape property.documents_guard_deletion() (Epic 08) already established for a per-row rule a GRANT cannot express.';

drop trigger if exists maintenance_obligations_guard_terminal on work.maintenance_obligations;
create trigger maintenance_obligations_guard_terminal
  before update on work.maintenance_obligations
  for each row execute function work.maintenance_obligations_reject_terminal_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

grant update on work.maintenance_obligations to klussie_engine_work;

-- DELETE withheld entirely — retained permanently once it exists, open or terminal
-- (§16: even a merely-open obligation that turns out to be a mistake is cancelled, with
-- a reason, never removed).
revoke all on work.maintenance_obligations from anon, authenticated, service_role;

alter table work.maintenance_obligations enable row level security;

-- No policy yet — WP 10.03's own job.

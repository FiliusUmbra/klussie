-- Epic 04 WP03 — the Capability Grant aggregate: what a workspace currently holds, and
-- the permanent record of every grant and withdrawal.
--
-- DATABASE_ARCHITECTURE.md §11: "Grants are added and withdrawn; the history of grants
-- is append-only, because interpreting a past decision requires knowing what the
-- workspace could do at the time." Lives in `workspace`, owned by klussie_engine_workspace
-- — migration 0019's own pairing: "Workspace and Capability engines. Owns schema
-- workspace."
--
-- SHAPED LIKE workspace.memberships/membership_history, NOT ADR-0028
--
-- Every other current-state-plus-history aggregate in this schema so far (property
-- stewardship, asset placement, document versioning, workflow instances) follows
-- ADR-0028: ONE current value per parent row, with a closed-period log of what it used
-- to be. A capability grant is not that shape — a workspace holds a SET of capabilities
-- concurrently, exactly the way a workspace holds a set of members, never a single
-- current one. workspace.memberships (migration 0030) is the closer, better-fitting
-- precedent: a mutable current row per (workspace, holder) pair, state transitioning in
-- place, plus a full-row-snapshot history table recording every transition — reused here
-- unmodified rather than forcing ADR-0028's single-slot shape onto a concept that is
-- actually a set.
--
-- NO UNIQUENESS ON (workspace_id, capability_key) — THE SAME REASON workspace.memberships
-- HAS NONE ON (person_ref, workspace_id)
--
-- migration 0030's own comment: "A person may hold a second membership in a workspace
-- they previously left — DATABASE_ARCHITECTURE.md §10 requires the ended one retained as
-- history, not replaced." A capability withdrawn and later re-granted is the identical
-- shape: the withdrawn row stays exactly as it was (a true past fact), and a new row
-- represents the new grant period. "Currently held" is therefore not "the row for this
-- (workspace, capability)" but "the row for this (workspace, capability) with no
-- withdrawn_at, if one exists" — resolved by work.workspace_has_capability() (WP 04.05),
-- never assumed by a unique index that would make re-granting an UPDATE instead of a new
-- fact.

create table if not exists workspace.capability_grants (
  id              uuid        not null,

  workspace_id    uuid        not null
                  references workspace.workspaces (id),
  capability_key  text        not null
                  references platform.capabilities (capability_key),

  -- How this grant came to exist (DATABASE_ARCHITECTURE.md §11: "Created by
  -- subscription, trial, negotiation or operator action"). No Subscription engine
  -- exists yet (Epic 22) — 'preset' is this epic's own real source, for grants applied
  -- by work.apply_capability_preset() (WP 04.05); the other three are named ahead of
  -- their own future callers, the same restraint property.document_types.retention_class
  -- held for 'evidence' before Epic 08 had a document classified that way.
  source          text        not null
                  check (source in ('preset', 'subscription', 'trial', 'negotiation', 'operator')),

  granted_at      timestamptz not null default now(),
  withdrawn_at    timestamptz null,

  constraint capability_grants_pkey primary key (id),
  constraint capability_grants_withdrawn_after_granted
    check (withdrawn_at is null or withdrawn_at >= granted_at)

  -- No unique (workspace_id, capability_key) — see this migration's own header.
);

comment on table workspace.capability_grants is
  'Every capability a workspace currently holds, or once held (DATABASE_ARCHITECTURE.md §11) — shaped like workspace.memberships (migration 0030), not ADR-0028, because a workspace holds a SET of capabilities, not one current value. Held = withdrawn_at is null. Mutated in place only by work.withdraw_capability() (WP 04.05, setting withdrawn_at) — every other column is set once, at grant time.';
comment on column workspace.capability_grants.withdrawn_at is
  'Null while held. §11: "Withdrawal removes behaviour and never data" — no query anywhere may use a withdrawn grant to make data unreachable; that rule binds every capability-gated feature, not this table.';

create index if not exists capability_grants_workspace_idx
  on workspace.capability_grants (workspace_id);
create index if not exists capability_grants_held_idx
  on workspace.capability_grants (workspace_id, capability_key) where withdrawn_at is null;

-- =========================================================================
-- GRANT HISTORY — append-only, forever, a full-row snapshot per change (the same shape
-- workspace.membership_history already holds, migration 0030)

create table if not exists workspace.capability_grant_history (
  id              uuid        not null,

  grant_id        uuid        not null
                  references workspace.capability_grants (id),
  workspace_id    uuid        not null
                  references workspace.workspaces (id),
  capability_key  text        not null
                  references platform.capabilities (capability_key),

  source          text        not null,
  granted_at      timestamptz not null,
  withdrawn_at    timestamptz null,

  changed_at      timestamptz not null default now(),

  constraint capability_grant_history_pkey primary key (id)
);

comment on table workspace.capability_grant_history is
  'Every change to a capability grant, permanently — identical shape and purpose to workspace.membership_history (migration 0030): "who had access to what, when" for capabilities instead of membership. workspace_id and capability_key are carried directly rather than derived by joining through grant_id, matching membership_history''s own reasoning (DATABASE_ARCHITECTURE.md §5''s tenancy rule).';

create index if not exists capability_grant_history_grant_id_idx
  on workspace.capability_grant_history (grant_id, changed_at);
create index if not exists capability_grant_history_workspace_idx
  on workspace.capability_grant_history (workspace_id, changed_at);

-- Append-only, enforced the same way as workspace.membership_history (migration 0030):
-- withheld privileges below, plus a guard trigger here.
create or replace function workspace.capability_grant_history_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'workspace.capability_grant_history is append-only: % rejected', tg_op
    using
      hint = 'A recorded grant change is permanent. A correction is a new history row describing the correction.',
      errcode = 'restrict_violation';
end;
$$;

comment on function workspace.capability_grant_history_reject_mutation() is
  'Identical in shape to workspace.membership_history_reject_mutation() (migration 0030), work.workflow_transitions_reject_mutation() (migration 0067), and every other append-only guard in this schema.';

drop trigger if exists capability_grant_history_append_only on workspace.capability_grant_history;
create trigger capability_grant_history_append_only
  before update or delete on workspace.capability_grant_history
  for each row execute function workspace.capability_grant_history_reject_mutation();

-- =========================================================================
-- MUTABILITY AND ACCESS

-- Transactional current state (§4): withdrawn_at is mutated in place by
-- work.withdraw_capability() (WP 04.05).
grant update on workspace.capability_grants to klussie_engine_workspace;

-- DELETE withheld from both — a grant, once it exists, is never removed (§11's own
-- "the history of grants is append-only" applies to the current table too: a withdrawn
-- grant stays as a row with withdrawn_at set, never deleted).
revoke all on workspace.capability_grants from anon, authenticated, service_role;
revoke all on workspace.capability_grant_history from anon, authenticated, service_role;

alter table workspace.capability_grants enable row level security;
alter table workspace.capability_grant_history enable row level security;

-- No policy yet — WP 04.04's own job.

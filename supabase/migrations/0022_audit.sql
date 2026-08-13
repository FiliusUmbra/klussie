-- Epic 01 WP05 — the audit trail.
--
-- DATABASE_ARCHITECTURE.md §33: who did what, in which workspace, when, and under what
-- authority. Enterprise procurement requires it; regulated industries cannot buy without
-- it.
--
-- AUDIT IS AN AGGREGATE, NOT A PROJECTION, AND THE DIFFERENCE IS STRUCTURAL
--
-- It looks derivable from platform.events and must not be (§33). Three reasons, and the
-- third is the one visible in this file:
--   · It records things events do not — a denied access attempt, a failed
--     authentication, a permission check that refused. Those are not domain facts about
--     the business and have no place in the stream timelines and memory consume.
--   · It must be independently trustworthy. A record derived from another record inherits
--     its weaknesses, and auditors ask what the trail says, not what it was computed from.
--   · Different retention, different readers.
--
-- The `outcome` column is where reason one becomes a schema fact: a denied attempt
-- produces no domain event, so there is nothing to derive it from.
--
-- WRITABLE BY NO APPLICATION ROLE AT ALL
--
-- §8, stated exactly that way: "Audit rows arrive through a privileged path, and the
-- inability of any user-facing role to write them is what makes the trail worth having."
-- So this migration REVOKES the insert that 0019's default privileges would otherwise
-- have granted the owning engine. After this file runs, nothing but the table owner can
-- write here, and nothing at all can update or delete.
--
-- The privileged write path itself is NOT in this package — see the work package's
-- findings, which raise it as unallocated rather than absorbing it.
--
-- SCOPE
--
-- One table, nullable workspace, null meaning platform-scoped (ADR-0021). §23 pushed
-- workspace-less facts out of platform.events and into audit deliberately; this is where
-- they land. Null is a scope and never an omission.
--
-- Range-partitioned by time only (§19) — not hash-by-workspace as events are, because a
-- nullable partition key would gather every platform-scoped record in one place.

-- =========================================================================
-- OUTCOME
--
-- Permitted or denied. §10.4 requires recording denied attempts "which no domain event
-- captures", and this is the column that makes audit irreducible to the event stream.
--
-- An enum rather than a boolean: `outcome = 'denied'` reads as what it is at a call site,
-- where `permitted = false` reads as a flag someone forgot to set. Widening it later —
-- 'error', say — is an additive change to an enum, which is cheap.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'audit_outcome' and n.nspname = 'platform'
  ) then
    create type platform.audit_outcome as enum ('permitted', 'denied');
  end if;
end;
$$;

comment on type platform.audit_outcome is
  'Whether the audited action was permitted or refused. Recording denied attempts is what makes audit irreducible to the event stream (SYSTEM_ARCHITECTURE.md §10.4).';

-- =========================================================================
-- THE TABLE
--
-- `actor_type` is platform.actor_type, the same enum platform.events uses. That is not
-- convenience: §33 requires "every action taken by the platform's intelligence on a
-- person's behalf, marked as machine-originated", and `actor_type = 'intelligence'` IS
-- that marking. A second mechanism for the same fact would be two places to get it wrong.
--
-- No foreign keys, for the same reasons as platform.events, plus one specific to audit:
-- §5's table of allowed references says "Audit → anything: audit must survive the deletion
-- of what it describes; that is the point of audit."

create table if not exists platform.audit_records (
  audit_id        uuid                    not null,
  occurred_at     timestamptz             not null,
  workspace_id    uuid,
  actor_type      platform.actor_type     not null,
  actor_ref       text                    not null,
  action          text                    not null,
  subject_type    text                    not null,
  subject_id      uuid,
  outcome         platform.audit_outcome  not null,
  authority       text,
  correlation_id  uuid,
  detail          jsonb                   not null default '{}'::jsonb,

  -- Must include the partition key.
  constraint audit_records_pkey primary key (occurred_at, audit_id),

  -- Constraints, not business rules: each refuses an impossibility (§4).
  constraint audit_records_action_format check (action ~ '^[a-z_]+\.[a-z_]+$'),
  constraint audit_records_action_not_blank check (length(trim(action)) > 0),
  constraint audit_records_actor_not_blank check (length(trim(actor_ref)) > 0)
) partition by range (occurred_at);

comment on table platform.audit_records is
  'The audit trail. Append-only, permanent, writable by no application role. One table for both workspace-scoped and platform-scoped actions, per ADR-0021.';

comment on column platform.audit_records.workspace_id is
  'The workspace the action happened in. NULL means the action was platform-scoped (ADR-0021) — it never means unknown or not recorded. A record whose workspace could not be determined is a defect in the caller, not a null.';
comment on column platform.audit_records.actor_type is
  'Who acted. actor_type = ''intelligence'' IS DATABASE_ARCHITECTURE.md §33''s "marked as machine-originated" — there is no second flag for it.';
comment on column platform.audit_records.outcome is
  'Permitted or denied. Denied attempts are why audit cannot be derived from platform.events: a refusal emits no domain event.';
comment on column platform.audit_records.authority is
  'Under what authority the actor acted — the membership, role, capability or support grant. §33''s fourth question, and what makes a decision explainable after the fact.';
comment on column platform.audit_records.correlation_id is
  'Shared with ADR-0019''s envelope, so an audit record and the events of the same action form one trace.';

-- =========================================================================
-- PARTITIONS
--
-- Yearly ranges plus a default, matching ADR-0020's reasoning for events: a missing range
-- must not fail the caller's transaction. Three leaves rather than twenty-four, because
-- there is no hash dimension here.
--
-- The default's emptiness is checked by VERIFY_AUDIT.sql. A row in it means a range was
-- missing when the record was written.

do $$
declare
  y integer;
begin
  foreach y in array array[2026, 2027] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'platform' and c.relname = format('audit_records_%s', y)
    ) then
      execute format(
        'create table platform.%I partition of platform.audit_records
           for values from (%L) to (%L)',
        format('audit_records_%s', y),
        format('%s-01-01 00:00:00+00', y),
        format('%s-01-01 00:00:00+00', y + 1)
      );
    end if;
  end loop;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'platform' and c.relname = 'audit_records_default'
  ) then
    create table platform.audit_records_default partition of platform.audit_records default;
  end if;
end;
$$;

-- =========================================================================
-- INDEXES
--
-- The three read paths §10 names for audit: "By workspace and time, by actor, by subject."

-- By workspace and time. Partial: platform-scoped records have no workspace, and this
-- index answers the tenant question, so indexing the nulls would add every platform
-- action to an index that never wants them.
create index if not exists audit_records_workspace_idx
  on platform.audit_records (workspace_id, occurred_at desc)
  where workspace_id is not null;

-- By actor — "everything this operator did", which under ADR-0021 spans both scopes in
-- one scan. That is the query the single-table decision exists to keep simple.
create index if not exists audit_records_actor_idx
  on platform.audit_records (actor_ref, occurred_at desc);

-- By subject — "everything that happened to this thing".
create index if not exists audit_records_subject_idx
  on platform.audit_records (subject_type, subject_id, occurred_at desc)
  where subject_id is not null;

-- =========================================================================
-- APPEND-ONLY
--
-- §4 and §24 item 7: withheld privileges plus a guard trigger, because they fail
-- differently. On this table the trigger matters more than on any other — an audit trail
-- that the operator can quietly edit is not a trail, and the operator is precisely the
-- role with the most reason to want to.

create or replace function platform.audit_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'platform.audit_records is append-only: % rejected', tg_op
    using
      hint = 'The audit trail is permanent. A correction is a new record describing the correction.',
      errcode = 'restrict_violation';
end;
$$;

comment on function platform.audit_reject_mutation() is
  'Immutability guard for platform.audit_records. An integrity constraint, not a business rule (SUPABASE_ARCHITECTURE.md §4): it refuses an impossibility rather than making a decision.';

drop trigger if exists audit_records_append_only on platform.audit_records;
create trigger audit_records_append_only
  before update or delete on platform.audit_records
  for each row execute function platform.audit_reject_mutation();

-- =========================================================================
-- ACCESS
--
-- Readable by workspace administrators and by the operator; writable by no application
-- role at all (§8).
--
-- The workspace-administrator half needs membership, which does not exist until Epic 03.
-- Its policy is written by that epic. The operator half is implementable now and is
-- implemented now, so "administrators can read" is true rather than pending.

alter table platform.audit_records enable row level security;

-- Unlike platform.events, this table HAS a policy: events are not client-readable at all
-- (§12), audit is readable by administrators (§8). The operator reads the whole trail,
-- both scopes — which is the query ADR-0021 exists to keep as one query.
drop policy if exists audit_records_operator_read on platform.audit_records;
create policy audit_records_operator_read
  on platform.audit_records
  for select
  to klussie_operator
  using (true);

-- This is the revoke that matters. 0019's default privileges granted the owning engine
-- SELECT and INSERT on everything created in `platform`; §8 says no application role may
-- write audit at all, so the INSERT comes back off. The engine keeps SELECT — reading its
-- own trail is not writing it.
revoke insert, update, delete on platform.audit_records from klussie_engine_platform;

grant select on platform.audit_records to klussie_operator;

-- Explicit, for the same reason as everywhere else in this epic: an absence of grants is
-- indistinguishable from an oversight.
revoke all on platform.audit_records from anon, authenticated, service_role;

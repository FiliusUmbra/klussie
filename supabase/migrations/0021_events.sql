-- Epic 01 WP04 — the event outbox.
--
-- SUPABASE_ARCHITECTURE.md §12: events are rows in `platform`, written in the same
-- transaction as the change they describe. This is the outbox pattern with the event
-- table as the outbox — no broker in the write path, no dual write, and no window in
-- which a change exists without its event. Consumers read forward from here (§13).
--
-- Every row carries the thirteen envelope fields of ADR-0019, plus its payload. The
-- membership rule that decided those thirteen: a field is in the envelope if and only if
-- a consumer needs it WITHOUT knowing what the event type means. Partitioning, retention,
-- deduplication and tracing are all performed by infrastructure that must never parse a
-- payload to do its job.
--
-- PARTITIONING
--
-- Hash by workspace, then range by time (§12, §19). Eight hash partitions, yearly ranges,
-- and a default range beneath each — the three parameters the frozen documents leave open,
-- decided in ADR-0020.
--
-- The workspace stays the LOGICAL boundary: carried on every row, filtered by every
-- policy, scoping every rebuild. It is explicitly not one physical partition each — ten
-- million partitions is not operable, and §19's rule is that partitioning is a technique
-- for managing size and is never the tenancy mechanism.
--
-- WHAT THE DATABASE DOES NOT GUARANTEE
--
-- `subject_sequence` is gapless and unique per subject, and PostgreSQL cannot enforce
-- either here: a unique constraint on a partitioned table must include every partition
-- key column, so including `occurred_at` would permit the same sequence twice in two time
-- partitions — precisely what the field exists to forbid. Uniqueness and gaplessness are
-- ENGINE invariants (ADR-0019). This is weaker than a constraint, and anyone assuming
-- otherwise will build on a guarantee the database is not making.
--
-- The same is true of `event_id`: it is unique in practice because it is a UUIDv7, not
-- because a constraint spanning partitions says so.
--
-- This table is inert. Nothing writes to it and nothing reads it; the existing
-- `public.domain_events` path (ADR-0004) is untouched and keeps working.

-- =========================================================================
-- ACTOR TYPE
--
-- The four kinds of thing that can cause an event (ADR-0019). An enum rather than text:
-- the set is closed, small, and the whole point of `intelligence` being distinguishable
-- from `person` is that "what did the AI do on its own" must be answerable without
-- parsing. `create type` has no `if not exists`, hence the guard.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'actor_type' and n.nspname = 'platform'
  ) then
    create type platform.actor_type as enum ('person', 'system', 'integration', 'intelligence');
  end if;
end;
$$;

comment on type platform.actor_type is
  'What kind of thing caused an event. ADR-0019: intelligence is distinguishable from person because "what did the AI do on its own" must be answerable without parsing a payload.';

-- =========================================================================
-- THE TABLE
--
-- Column order follows ADR-0019's table, so the two can be read side by side.
--
-- No foreign keys, deliberately and for three separate reasons:
--   · actor_ref — §11.4 and DATABASE_ARCHITECTURE.md §5: no durable record may key to
--     identity, or erasure becomes a cascade instead of a redaction.
--   · workspace_id — the workspace table does not exist until Epic 03, and an event is a
--     historical fact that must outlive the deletion of anything it refers to.
--   · subject_id — points into eight different engines' aggregates by design.

create table if not exists platform.events (
  event_id          uuid                 not null,
  event_type        text                 not null,
  event_version     smallint             not null default 1,
  workspace_id      uuid                 not null,
  actor_type        platform.actor_type  not null,
  actor_ref         text                 not null,
  subject_type      text                 not null,
  subject_id        uuid                 not null,
  subject_sequence  bigint               not null,
  occurred_at       timestamptz          not null,
  correlation_id    uuid                 not null,
  causation_id      uuid,
  is_derived        boolean              not null default false,
  payload           jsonb                not null default '{}'::jsonb,

  -- Must include both partition keys; PostgreSQL requires it (§12).
  constraint events_pkey primary key (workspace_id, occurred_at, event_id),

  -- Constraints, not business rules — each refuses an impossibility rather than making a
  -- decision, which is §4's distinguishing test.
  constraint events_type_format check (event_type ~ '^[a-z_]+\.[a-z_]+\.[a-z_]+$'),
  constraint events_version_positive check (event_version > 0),
  constraint events_sequence_positive check (subject_sequence > 0),
  constraint events_not_self_caused check (causation_id is null or causation_id <> event_id)
) partition by hash (workspace_id);

comment on table platform.events is
  'The event outbox. Append-only, permanent, not client-readable. Thirteen envelope fields per ADR-0019 plus payload. Hash-partitioned by workspace, range-sub-partitioned by time per ADR-0020.';

comment on column platform.events.event_type is
  '<engine>.<aggregate>.<past-participle>. A semantic change mints a new type; an additive one increments event_version (ADR-0019).';
comment on column platform.events.subject_sequence is
  'Gapless order within a subject, assigned by the owning engine in the writing transaction. NOT enforced by the database — see ADR-0019.';
comment on column platform.events.occurred_at is
  'When it became true, and the range partition key. NOT an ordering field: clock skew and equal timestamps make time unsafe for ordering. Ordering is subject_sequence.';
comment on column platform.events.correlation_id is
  'Everything caused by one originating action, generated once at the gateway and propagated unchanged — including by consumers emitting further events.';
comment on column platform.events.causation_id is
  'The direct parent. Null only for a root. Correlation gives the tree its membership; causation gives it its edges.';
comment on column platform.events.is_derived is
  'False for a canonical fact, true for a regenerable inference. On rebuild, canonical events are replayed and derived events are regenerated — so this must be structural, not a naming convention (ADR-0019).';

-- =========================================================================
-- PARTITIONS
--
-- Eight hash partitions, each range-partitioned by year, each with a default (ADR-0020).
--
-- The default is a safety net with a rule attached: a row in one is a DEFECT, because
-- events are written in the same transaction as the change they describe. Without a
-- default, a missing partition does not fail an event — it fails a customer's booking, at
-- midnight on the first of the year, when nobody is looking. VERIFY_EVENTS.sql checks
-- that the defaults are empty, which is how the lapse gets noticed instead.

do $$
declare
  h integer;
  hash_partition text;
begin
  for h in 0..7 loop
    hash_partition := format('events_w%s', h);

    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'platform' and c.relname = hash_partition
    ) then
      execute format(
        'create table platform.%I partition of platform.events
           for values with (modulus 8, remainder %s)
           partition by range (occurred_at)',
        hash_partition, h
      );
    end if;

    -- Two years of ranges. Granularity is chosen per period, so a later year may be
    -- monthly without touching anything already written (ADR-0020).
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'platform' and c.relname = hash_partition || '_2026'
    ) then
      execute format(
        'create table platform.%I partition of platform.%I
           for values from (''2026-01-01 00:00:00+00'') to (''2027-01-01 00:00:00+00'')',
        hash_partition || '_2026', hash_partition
      );
    end if;

    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'platform' and c.relname = hash_partition || '_2027'
    ) then
      execute format(
        'create table platform.%I partition of platform.%I
           for values from (''2027-01-01 00:00:00+00'') to (''2028-01-01 00:00:00+00'')',
        hash_partition || '_2027', hash_partition
      );
    end if;

    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'platform' and c.relname = hash_partition || '_default'
    ) then
      execute format(
        'create table platform.%I partition of platform.%I default',
        hash_partition || '_default', hash_partition
      );
    end if;
  end loop;
end;
$$;

-- =========================================================================
-- INDEXES
--
-- The four read paths §12 names. Created on the parent, so PostgreSQL propagates them to
-- every partition present and future — including partitions created years from now.

-- Subject ordering: "what happened to this boiler, in order" — the one ordering question
-- the platform actually guarantees an answer to (§23).
create index if not exists events_subject_idx
  on platform.events (workspace_id, subject_type, subject_id, subject_sequence);

-- Trace lookup: everything one originating action caused, across six consumers.
create index if not exists events_correlation_idx
  on platform.events (correlation_id);

-- Causal traversal: the edges of that tree. Partial, because a root event has none and
-- indexing the nulls would be indexing most of the table for a query that never asks.
create index if not exists events_causation_idx
  on platform.events (causation_id) where causation_id is not null;

-- Consumer cursor: read forward by time, with the UUIDv7 supplying the tiebreak for rows
-- sharing a timestamp (§12, §13).
create index if not exists events_cursor_idx
  on platform.events (occurred_at, event_id);

-- =========================================================================
-- APPEND-ONLY
--
-- §4 and §24 item 7: enforced by withheld privileges PLUS a guard trigger. Both, because
-- they fail differently — privileges stop an application role, and the trigger stops
-- everything else, including the superuser doing maintenance at speed and a consumer
-- running with BYPASSRLS.
--
-- §4 permits this trigger explicitly. Its distinguishing test is "does this trigger make a
-- decision, or refuse an impossibility?" — this one refuses an impossibility. It encodes
-- no process, no policy and no choice: it asserts that a fact, once written, stays
-- written.

create or replace function platform.events_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'platform.events is append-only: % rejected on %', tg_op, tg_table_name
    using
      hint = 'A fact that has been emitted cannot be changed or removed. Emit a correcting event instead.',
      errcode = 'restrict_violation';
end;
$$;

comment on function platform.events_reject_mutation() is
  'Immutability guard for platform.events. An integrity constraint, not a business rule (SUPABASE_ARCHITECTURE.md §4): it refuses an impossibility rather than making a decision.';

drop trigger if exists events_append_only on platform.events;
create trigger events_append_only
  before update or delete on platform.events
  for each row execute function platform.events_reject_mutation();

-- =========================================================================
-- ACCESS
--
-- RLS on every table without exception (§24 item 5). This one has NO policies, and that is
-- the point: §12 says the events table is not client-readable, and a table with RLS enabled
-- and no policy denies every role that does not bypass it. Users see timeline,
-- notifications and audit — shaped, scoped views of what events mean — never this.
--
-- Not FORCE: the owner must remain able to run migrations and maintenance against it, and
-- the roles that legitimately read the stream are background consumers on §7's elevated
-- path, not clients.

alter table platform.events enable row level security;

-- The owning engine gets SELECT and INSERT from 0019's default privileges, automatically,
-- because this table was created by postgres in `platform`. UPDATE and DELETE are absent
-- for the reason §4 gives, and the revoke below states it where it is enforced rather than
-- leaving it to be inferred from an absence.
revoke update, delete on platform.events from klussie_engine_platform;

-- The event deliverer reads the stream: that is its declared job in ROLES.md §2.2, and the
-- table it needs now exists. It never writes — a consumer that writes back creates a cycle
-- in which no one can say what caused what (DATABASE_ARCHITECTURE.md §23).
grant select on platform.events to klussie_consumer_delivery;

-- Explicit for the same reason as 0019's revokes: an absence of grants is
-- indistinguishable from an oversight.
revoke all on platform.events from anon, authenticated, service_role;

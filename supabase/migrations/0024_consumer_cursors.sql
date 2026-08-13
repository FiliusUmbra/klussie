-- Epic 01 WP07 — where a consumer's position and its poisoned events live.
--
-- SUPABASE_ARCHITECTURE.md §13: "Consumers read forward with a cursor. Each consumer
-- records its position per partition. Delivery is at-least-once and every consumer is
-- idempotent — the property that makes retry safe and makes replay identical to first
-- delivery."
--
-- And, for the failure path: "A poisoned event — one a consumer cannot process — is
-- quarantined with its position recorded, so one bad event never halts a stream
-- indefinitely; the quarantine is an operational alert rather than a silent skip."
--
-- Two tables, both mutable, which makes them the first tables in this schema that are not
-- append-only. docs/operations/ROLES.md §3 rule 2 says a mutable table opts in explicitly
-- and names its class, because 0019's default privileges deliberately grant only SELECT
-- and INSERT — so UPDATE is granted here, by name, with the reason attached.
--
-- MUTABILITY CLASS: both tables are Mutable (§4). A cursor that could not be updated
-- would not be a cursor, and neither table is history: the history is platform.events,
-- and these describe how far someone has read it. Losing them costs reprocessing, not
-- facts.
--
-- PER PARTITION, NOT PER STREAM. A consumer holds one cursor per hash partition of
-- platform.events — eight of them, per ADR-0020 — so partitions can be read
-- independently and a slow tenant's partition never blocks the other seven.
--
-- Nothing runs against these tables yet. No consumer is wired to anything real.

-- =========================================================================
-- CURSORS
--
-- The position is (occurred_at, event_id), matching the consumer-cursor read path §12
-- names and the events_cursor_idx that serves it. Time alone is not enough: two events
-- can share a timestamp, and the UUIDv7 event_id supplies the tiebreak that makes
-- "everything after this point" unambiguous.
--
-- A row with a null position is a consumer that has never read this partition, which is
-- different from one that has read it and found nothing.

create table if not exists platform.consumer_cursors (
  consumer_name     text        not null,
  partition_index   smallint    not null,
  last_occurred_at  timestamptz,
  last_event_id     uuid,
  updated_at        timestamptz not null default now(),

  constraint consumer_cursors_pkey primary key (consumer_name, partition_index),

  -- Constraints, not business rules (§4): each refuses an impossibility.
  constraint consumer_cursors_name_not_blank check (length(trim(consumer_name)) > 0),
  -- Matches ADR-0020's modulus. A cursor for partition 9 is a cursor for a partition that
  -- does not exist, and the consumer holding it would silently read nothing forever.
  constraint consumer_cursors_partition_in_range check (partition_index between 0 and 7),
  -- Half a position is not a position. Either both parts are set or neither is.
  constraint consumer_cursors_position_whole check (
    (last_occurred_at is null) = (last_event_id is null)
  )
);

comment on table platform.consumer_cursors is
  'How far each consumer has read each hash partition of platform.events. Mutable by design (SUPABASE_ARCHITECTURE.md §4) — losing a row costs reprocessing, not facts.';
comment on column platform.consumer_cursors.partition_index is
  'Which hash partition of platform.events, 0-7 per ADR-0020. One cursor per partition so a slow tenant''s partition never blocks the other seven.';
comment on column platform.consumer_cursors.last_occurred_at is
  'With last_event_id, the position already processed. Null means never read — which is not the same as read and found empty.';

-- =========================================================================
-- QUARANTINE
--
-- §13 again: a poisoned event is set aside with its position recorded so the stream
-- continues, and the quarantine is "an operational alert rather than a silent skip." The
-- resolved_at column is what keeps it an alert: an unresolved row is an open incident, and
-- something has to be able to ask how many there are.
--
-- Keyed by (consumer_name, event_id) rather than a surrogate: the same event poisoning two
-- different consumers is two independent problems, and the same event poisoning one
-- consumer twice is one problem with two attempts. The key says both.

create table if not exists platform.consumer_quarantine (
  consumer_name   text        not null,
  event_id        uuid        not null,
  occurred_at     timestamptz not null,
  workspace_id    uuid        not null,
  failure_reason  text        not null,
  attempts        integer     not null default 1,
  first_failed_at timestamptz not null default now(),
  last_failed_at  timestamptz not null default now(),
  resolved_at     timestamptz,

  constraint consumer_quarantine_pkey primary key (consumer_name, event_id),
  constraint consumer_quarantine_attempts_positive check (attempts > 0),
  constraint consumer_quarantine_reason_not_blank check (length(trim(failure_reason)) > 0)
);

comment on table platform.consumer_quarantine is
  'Events a consumer could not process, set aside so one bad event never halts a stream (SUPABASE_ARCHITECTURE.md §13). An unresolved row is an open incident, not a skipped event.';
comment on column platform.consumer_quarantine.resolved_at is
  'Null while the quarantine is an open incident. This column is what makes the quarantine an operational alert rather than a silent skip.';

-- The query an alert asks: what is currently broken, oldest first.
create index if not exists consumer_quarantine_open_idx
  on platform.consumer_quarantine (consumer_name, first_failed_at)
  where resolved_at is null;

-- =========================================================================
-- ACCESS
--
-- The four background consumer roles §9 names. They hold USAGE on the schemas they write
-- into; three of them did not hold it on `platform`, because 0019 granted it only to the
-- deliverer, whose declared job was reading the stream. Recording a cursor is now a real
-- need for all four — docs/operations/ROLES.md §3 rule 1 — so it is granted here.
--
-- Reading platform.events is deliberately NOT granted to the three. That belongs to the
-- epic that builds each consumer and knows what it reads. The scaffolding needs somewhere
-- to keep a position; it does not need the stream.
--
-- UPDATE is granted, which nothing else in this schema has. It is the exception ROLES.md
-- §3 rule 2 describes, and this is the migration naming its class out loud.

do $$
declare
  consumer_role text;
begin
  foreach consumer_role in array array[
    'klussie_consumer_projection', 'klussie_consumer_delivery',
    'klussie_consumer_search', 'klussie_consumer_analytics'
  ] loop
    execute format('grant usage on schema platform to %I', consumer_role);
    execute format(
      'grant select, insert, update on platform.consumer_cursors to %I', consumer_role
    );
    execute format(
      'grant select, insert, update on platform.consumer_quarantine to %I', consumer_role
    );
  end loop;
end;
$$;

-- The operator reads the quarantine: it is an alert surface, and §9 gives the operator
-- platform configuration and catalogues. It cannot clear one — resolving a quarantine is
-- the owning consumer's business, after the cause is fixed.
grant select on platform.consumer_quarantine to klussie_operator;
grant select on platform.consumer_cursors to klussie_operator;

-- No DELETE anywhere. A deleted cursor silently restarts a consumer from the beginning of
-- a partition, which at-least-once delivery makes survivable and nobody would notice.

alter table platform.consumer_cursors enable row level security;
alter table platform.consumer_quarantine enable row level security;

-- No policies, as with platform.events: these are background-work tables and no client
-- role reaches them. The absent policy is the deny (§24 item 5, §12).

revoke all on platform.consumer_cursors from anon, authenticated, service_role;
revoke all on platform.consumer_quarantine from anon, authenticated, service_role;

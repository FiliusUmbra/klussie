-- Verifies platform.events after 0021_events.sql.
--
-- Run with psql and ON_ERROR_STOP; each check raises an exception naming what is wrong:
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_EVENTS.sql
--
-- Checks 4 and 5 write rows and roll them back. Nothing here persists. Safe against any
-- environment, and deliberately runnable against a populated one — checks 6 and 7 are
-- ongoing operational checks, not one-time acceptance.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · The thirteen envelope fields, plus payload
--
-- ADR-0019's envelope is a decade-long contract and this table is designed never to be
-- rewritten. A missing field found here costs a drop-and-recreate; found after the first
-- event, it costs rewriting every partition.

do $$
declare
  expected text[] := array[
    'event_id', 'event_type', 'event_version', 'workspace_id', 'actor_type', 'actor_ref',
    'subject_type', 'subject_id', 'subject_sequence', 'occurred_at', 'correlation_id',
    'causation_id', 'is_derived', 'payload'
  ];
  actual text[];
  missing text[];
  extra text[];
begin
  select array_agg(attname order by attnum) into actual
  from pg_attribute
  where attrelid = 'platform.events'::regclass and attnum > 0 and not attisdropped;

  select array_agg(e) into missing from unnest(expected) e where not e = any(actual);
  select array_agg(a) into extra from unnest(actual) a where not a = any(expected);

  if missing is not null or extra is not null then
    raise exception 'Envelope mismatch. Missing: %. Unexpected: %', missing, extra;
  end if;

  -- workspace_id nullable would quietly destroy the "no workspace-less domain events"
  -- rule (DATABASE_ARCHITECTURE.md §23), which is what keeps tenancy total.
  if exists (
    select 1 from pg_attribute
    where attrelid = 'platform.events'::regclass
      and attname in ('workspace_id', 'is_derived', 'occurred_at', 'event_id')
      and not attnotnull
  ) then
    raise exception 'A field that must be NOT NULL is nullable';
  end if;

  raise notice '1 · thirteen envelope fields plus payload, with the right nullability';
end;
$$;

-- =========================================================================
-- 2 · Partitioned hash-then-range, with the modulus ADR-0020 fixed

do $$
declare
  parent_strategy "char";
  hash_partitions integer;
  leaf_count integer;
begin
  select partstrat into parent_strategy
  from pg_partitioned_table where partrelid = 'platform.events'::regclass;

  if parent_strategy <> 'h' then
    raise exception 'platform.events is not hash-partitioned (strategy %)', parent_strategy;
  end if;

  select count(*) into hash_partitions
  from pg_inherits where inhparent = 'platform.events'::regclass;

  if hash_partitions <> 8 then
    raise exception 'Expected 8 hash partitions (ADR-0020), found %', hash_partitions;
  end if;

  -- Every hash partition must itself be range-partitioned, or the time dimension —
  -- which is what §21 detaches and archives — does not exist for it.
  if exists (
    select 1 from pg_inherits i
    left join pg_partitioned_table p on p.partrelid = i.inhrelid
    where i.inhparent = 'platform.events'::regclass
      and (p.partstrat is distinct from 'r')
  ) then
    raise exception 'A hash partition is not range-sub-partitioned by time';
  end if;

  select count(*) into leaf_count
  from pg_inherits i
  join pg_inherits h on h.inhrelid = i.inhparent
  where h.inhparent = 'platform.events'::regclass;

  if leaf_count < 24 then
    raise exception 'Expected at least 24 leaf partitions, found %', leaf_count;
  end if;

  raise notice '2 · hash by workspace (modulus 8), range by time, % leaves', leaf_count;
end;
$$;

-- =========================================================================
-- 3 · Not client-readable, and not writable by any application role
--
-- §12: no authenticated role reads this table. §4: append-only means UPDATE and DELETE
-- are granted to nobody.

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(r, 'platform.events', 'SELECT') then
      problems := problems || format('%s can read platform.events', r);
    end if;
    if has_table_privilege(r, 'platform.events', 'INSERT') then
      problems := problems || format('%s can write platform.events', r);
    end if;
  end loop;

  foreach r in array array[
    'klussie_engine_platform', 'klussie_consumer_delivery', 'klussie_consumer_projection'
  ] loop
    if has_table_privilege(r, 'platform.events', 'UPDATE') then
      problems := problems || format('%s can UPDATE an append-only table', r);
    end if;
    if has_table_privilege(r, 'platform.events', 'DELETE') then
      problems := problems || format('%s can DELETE from an append-only table', r);
    end if;
  end loop;

  if not has_table_privilege('klussie_engine_platform', 'platform.events', 'INSERT') then
    problems := problems || 'the owning engine cannot insert an event';
  end if;
  if not has_table_privilege('klussie_consumer_delivery', 'platform.events', 'SELECT') then
    problems := problems || 'the event deliverer cannot read the stream';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'platform.events'::regclass) then
    problems := problems || 'row level security is not enabled';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'platform' and tablename = 'events') then
    problems := problems || 'a policy exists on a table that is not client-readable';
  end if;

  if array_length(problems, 1) is not null then
    raise exception 'Access posture wrong: %', array_to_string(problems, '; ');
  end if;

  raise notice '3 · unreadable by clients, unwritable by anyone but its engine, RLS on with no policies';
end;
$$;

-- =========================================================================
-- 4 · An insert routes to the right partition, and cannot then be changed
--
-- The behaviour the whole package exists for, exercised rather than inferred. Rolled back,
-- so the table is left exactly as it was found.

begin;

insert into platform.events (
  event_id, event_type, event_version, workspace_id, actor_type, actor_ref,
  subject_type, subject_id, subject_sequence, occurred_at, correlation_id,
  causation_id, is_derived, payload
) values (
  '01920000-0000-7000-8000-000000000001', 'platform.diagnostic.probed', 1,
  '01920000-0000-7000-8000-0000000000ff', 'system', 'VERIFY_EVENTS.sql',
  'diagnostic', '01920000-0000-7000-8000-0000000000aa', 1,
  '2026-06-15 12:00:00+00', '01920000-0000-7000-8000-0000000000cc',
  null, false, '{"probe": true}'::jsonb
);

do $$
declare
  landed_in text;
  mutation_allowed boolean := false;
begin
  select c.relname into landed_in
  from platform.events e
  join pg_class c on c.oid = e.tableoid
  where e.event_id = '01920000-0000-7000-8000-000000000001';

  if landed_in is null then
    raise exception 'The inserted event cannot be read back';
  end if;
  if landed_in not like 'events_w%\_2026' then
    raise exception 'Event landed in %, not a 2026 range partition', landed_in;
  end if;

  begin
    update platform.events set is_derived = true
    where event_id = '01920000-0000-7000-8000-000000000001';
    mutation_allowed := true;
  exception when others then
    null;
  end;
  if mutation_allowed then
    raise exception 'An event was UPDATE-able — the append-only guard did not fire';
  end if;

  mutation_allowed := false;
  begin
    delete from platform.events where event_id = '01920000-0000-7000-8000-000000000001';
    mutation_allowed := true;
  exception when others then
    null;
  end;
  if mutation_allowed then
    raise exception 'An event was DELETE-able — the append-only guard did not fire';
  end if;

  raise notice '4 · an event routes to % and resists update and delete', landed_in;
end;
$$;

rollback;

-- =========================================================================
-- 5 · The constraints refuse what they are meant to refuse
--
-- Each one refuses an impossibility rather than making a decision, which is §4's test for
-- what may live in the storage layer at all.

begin;

do $$
declare
  accepted text[] := '{}';
begin
  -- A malformed event type. Dispatch across six consumers depends on the
  -- <engine>.<aggregate>.<past-participle> shape.
  begin
    insert into platform.events (
      event_id, event_type, workspace_id, actor_type, actor_ref, subject_type,
      subject_id, subject_sequence, occurred_at, correlation_id, is_derived
    ) values (
      gen_random_uuid(), 'NotAValidType', gen_random_uuid(), 'system', 'probe',
      'diagnostic', gen_random_uuid(), 1, now(), gen_random_uuid(), false
    );
    accepted := accepted || 'a malformed event_type';
  exception when check_violation then null;
  end;

  -- A workspace-less event. DATABASE_ARCHITECTURE.md §23: platform-scoped actions are
  -- audit records, not domain events, which is what keeps this column non-nullable.
  begin
    insert into platform.events (
      event_id, event_type, workspace_id, actor_type, actor_ref, subject_type,
      subject_id, subject_sequence, occurred_at, correlation_id, is_derived
    ) values (
      gen_random_uuid(), 'platform.diagnostic.probed', null, 'system', 'probe',
      'diagnostic', gen_random_uuid(), 1, now(), gen_random_uuid(), false
    );
    accepted := accepted || 'an event with no workspace';
  exception when not_null_violation then null;
  end;

  -- A zero sequence. Gapless ordering starts at one; zero is a sentinel that would make
  -- "did I lose one" unanswerable.
  begin
    insert into platform.events (
      event_id, event_type, workspace_id, actor_type, actor_ref, subject_type,
      subject_id, subject_sequence, occurred_at, correlation_id, is_derived
    ) values (
      gen_random_uuid(), 'platform.diagnostic.probed', gen_random_uuid(), 'system', 'probe',
      'diagnostic', gen_random_uuid(), 0, now(), gen_random_uuid(), false
    );
    accepted := accepted || 'a subject_sequence of zero';
  exception when check_violation then null;
  end;

  -- An unknown actor kind. The enum is closed on purpose (ADR-0019).
  begin
    insert into platform.events (
      event_id, event_type, workspace_id, actor_type, actor_ref, subject_type,
      subject_id, subject_sequence, occurred_at, correlation_id, is_derived
    ) values (
      gen_random_uuid(), 'platform.diagnostic.probed', gen_random_uuid(), 'robot', 'probe',
      'diagnostic', gen_random_uuid(), 1, now(), gen_random_uuid(), false
    );
    accepted := accepted || 'an actor_type outside the enum';
  exception when invalid_text_representation then null;
  end;

  if array_length(accepted, 1) is not null then
    raise exception 'The table accepted: %', array_to_string(accepted, '; ');
  end if;

  raise notice '5 · malformed types, workspace-less events, zero sequences and unknown actors are all refused';
end;
$$;

rollback;

-- =========================================================================
-- 6 · The default partitions are empty
--
-- ADR-0020: a default partition exists so that a missing range fails a diagnostic rather
-- than a customer's booking — events are written in the same transaction as the change
-- they describe. A row in one means ranges were not created ahead of time. This is an
-- ongoing operational check, not a one-time acceptance criterion.

do $$
declare
  part record;
  occupied text[] := '{}';
  n bigint;
begin
  for part in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'platform' and c.relname like 'events\_w%\_default'
  loop
    execute format('select count(*) from platform.%I', part.relname) into n;
    if n > 0 then
      occupied := occupied || format('%s holds %s row(s)', part.relname, n);
    end if;
  end loop;

  if array_length(occupied, 1) is not null then
    raise exception
      'Events landed in a default partition — a time range was missing when they were written: %',
      array_to_string(occupied, '; ');
  end if;

  raise notice '6 · every default partition is empty';
end;
$$;

-- =========================================================================
-- 7 · A time range exists for the current year and the next
--
-- The lapse this catches is the one nobody notices: partitions run out silently, and the
-- first sign is a write landing in a default at midnight on the first of January.

do $$
declare
  y integer := extract(year from now())::integer;
  gaps text[] := '{}';
  target integer;
begin
  foreach target in array array[y, y + 1] loop
    if (select count(*) from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'platform' and c.relname like format('events\_w%%\_%s', target)) < 8 then
      gaps := gaps || format('%s has fewer than 8 range partitions', target);
    end if;
  end loop;

  if array_length(gaps, 1) is not null then
    raise exception 'Time ranges are missing: %', array_to_string(gaps, '; ');
  end if;

  raise notice '7 · % and % each have a range partition under every hash partition', y, y + 1;
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_EVENTS: all checks passed';
end;
$$;

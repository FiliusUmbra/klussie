-- Verifies platform.consumer_cursors and platform.consumer_quarantine after 0024.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_CONSUMERS.sql
--
-- Checks 3 and 4 write rows and roll them back. Nothing here persists.
--
-- Check 5 is an ongoing operational check rather than an acceptance criterion: it reports
-- open quarantines, which §13 calls "an operational alert rather than a silent skip". It
-- passes today because nothing consumes anything yet.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Both tables exist, and are the only mutable ones in this schema
--
-- Everything else in `platform` is append-only. These two are the exception
-- docs/operations/ROLES.md §3 rule 2 describes, and the exception has to be visible: a
-- cursor that could not be updated would not be a cursor.

do $$
declare
  problems text[] := '{}';
  r text;
begin
  foreach r in array array['consumer_cursors', 'consumer_quarantine'] loop
    if not exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'platform' and c.relname = r
    ) then
      problems := problems || pg_catalog.format('platform.%s is missing', r);
    end if;
  end loop;

  -- Neither carries an append-only guard, deliberately. If one appears, someone has
  -- applied the schema's default rule to the two tables it does not apply to.
  if exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid in ('platform.consumer_cursors'::regclass, 'platform.consumer_quarantine'::regclass)
      and not t.tgisinternal
  ) then
    problems := problems || 'a trigger exists on a table that must stay mutable'::text;
  end if;

  if array_length(problems, 1) is not null then
    raise exception '%', pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '1 · both tables exist and neither is guarded as append-only';
end;
$$;

-- =========================================================================
-- 2 · The consumers can move a cursor; nobody can delete one
--
-- UPDATE is the privilege this migration grants that nothing else in `platform` has. DELETE
-- is the one it withholds: a deleted cursor silently restarts a consumer from the beginning
-- of a partition, which at-least-once delivery makes survivable and therefore invisible.

do $$
declare
  problems text[] := '{}';
  r text;
  t text;
begin
  foreach r in array array[
    'klussie_consumer_projection', 'klussie_consumer_delivery',
    'klussie_consumer_search', 'klussie_consumer_analytics'
  ] loop
    foreach t in array array['platform.consumer_cursors', 'platform.consumer_quarantine'] loop
      if not pg_catalog.has_table_privilege(r, t, 'SELECT') then
        problems := problems || pg_catalog.format('%s cannot read %s', r, t);
      end if;
      if not pg_catalog.has_table_privilege(r, t, 'INSERT') then
        problems := problems || pg_catalog.format('%s cannot write %s', r, t);
      end if;
      if not pg_catalog.has_table_privilege(r, t, 'UPDATE') then
        problems := problems || pg_catalog.format('%s cannot advance %s', r, t);
      end if;
      if pg_catalog.has_table_privilege(r, t, 'DELETE') then
        problems := problems || pg_catalog.format('%s can DELETE from %s', r, t);
      end if;
    end loop;
  end loop;

  -- The operator watches the alert surface and cannot clear it: resolving a quarantine is
  -- the owning consumer's business, after the cause is fixed.
  if not pg_catalog.has_table_privilege('klussie_operator', 'platform.consumer_quarantine', 'SELECT') then
    problems := problems || 'the operator cannot see open quarantines'::text;
  end if;
  if pg_catalog.has_table_privilege('klussie_operator', 'platform.consumer_quarantine', 'UPDATE') then
    problems := problems || 'the operator can clear a quarantine it did not fix'::text;
  end if;

  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    foreach t in array array['platform.consumer_cursors', 'platform.consumer_quarantine'] loop
      if pg_catalog.has_table_privilege(r, t, 'SELECT') then
        problems := problems || pg_catalog.format('%s can read %s', r, t);
      end if;
    end loop;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Consumer storage access wrong: %', pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '2 · four consumers can read, write and advance; none can delete; no client role reaches either';
end;
$$;

-- =========================================================================
-- 3 · A cursor is one position per consumer per partition, or it is nothing
--
-- The constraints refuse an impossibility rather than making a decision (§4).

begin;

do $$
declare
  accepted text[] := '{}';
begin
  -- Half a position. A cursor with a time and no tiebreak cannot express "everything after
  -- this point" when two events share a timestamp.
  begin
    insert into platform.consumer_cursors (consumer_name, partition_index, last_occurred_at)
    values ('probe', 0, now());
    accepted := accepted || 'a cursor with a time but no event id'::text;
  exception when check_violation then null;
  end;

  -- A partition that does not exist. ADR-0020 fixes the modulus at 8, so a consumer
  -- holding a cursor for partition 9 would read nothing forever and look healthy.
  begin
    insert into platform.consumer_cursors (consumer_name, partition_index) values ('probe', 9);
    accepted := accepted || 'a cursor for a partition outside the modulus'::text;
  exception when check_violation then null;
  end;

  -- Two positions for one consumer in one partition.
  insert into platform.consumer_cursors (consumer_name, partition_index) values ('probe', 0);
  begin
    insert into platform.consumer_cursors (consumer_name, partition_index) values ('probe', 0);
    accepted := accepted || 'a second cursor for the same consumer and partition'::text;
  exception when unique_violation then null;
  end;

  if array_length(accepted, 1) is not null then
    raise exception 'consumer_cursors accepted: %', pg_catalog.array_to_string(accepted, '; ');
  end if;

  raise notice '3 · partial positions, impossible partitions and duplicate cursors are refused';
end;
$$;

rollback;

-- =========================================================================
-- 4 · A cursor advances, and re-quarantining one event counts attempts
--
-- The two mutations the scaffolding actually performs, exercised against the real tables.

begin;

do $$
declare
  v_attempts integer;
  v_event_id uuid;
begin
  insert into platform.consumer_cursors (consumer_name, partition_index) values ('probe', 3);

  update platform.consumer_cursors
  set last_occurred_at = '2026-06-15 12:00:00+00',
      last_event_id = '01920000-0000-7000-8000-0000000c0001',
      updated_at = now()
  where consumer_name = 'probe' and partition_index = 3;

  select last_event_id into v_event_id from platform.consumer_cursors
  where consumer_name = 'probe' and partition_index = 3;
  if v_event_id is null then
    raise exception 'a cursor could not be advanced';
  end if;

  -- The upsert the runner performs when the same event poisons the same consumer twice.
  -- The key is (consumer_name, event_id): one problem with two attempts, not two problems.
  insert into platform.consumer_quarantine (
    consumer_name, event_id, occurred_at, workspace_id, failure_reason
  ) values (
    'probe', '01920000-0000-7000-8000-0000000c0002', '2026-06-15 12:00:00+00',
    '01920000-0000-7000-8000-0000000c00ff', 'cannot parse payload'
  )
  on conflict (consumer_name, event_id) do update
  set attempts = platform.consumer_quarantine.attempts + 1,
      last_failed_at = now();

  insert into platform.consumer_quarantine (
    consumer_name, event_id, occurred_at, workspace_id, failure_reason
  ) values (
    'probe', '01920000-0000-7000-8000-0000000c0002', '2026-06-15 12:00:00+00',
    '01920000-0000-7000-8000-0000000c00ff', 'cannot parse payload'
  )
  on conflict (consumer_name, event_id) do update
  set attempts = platform.consumer_quarantine.attempts + 1,
      last_failed_at = now();

  select attempts into v_attempts from platform.consumer_quarantine
  where consumer_name = 'probe' and event_id = '01920000-0000-7000-8000-0000000c0002';

  if v_attempts <> 2 then
    raise exception 'Re-quarantining recorded % attempt(s), expected 2', v_attempts;
  end if;

  raise notice '4 · a cursor advances and a repeated poisoning counts attempts rather than duplicating';
end;
$$;

rollback;

-- =========================================================================
-- 5 · Nothing is currently quarantined
--
-- Operational, not acceptance. An unresolved row is an open incident: one bad event did not
-- halt a stream, and something is waiting for a person.

do $$
declare
  open_count integer;
  detail text;
begin
  select count(*) into open_count from platform.consumer_quarantine where resolved_at is null;

  if open_count > 0 then
    select pg_catalog.string_agg(
      pg_catalog.format('%s: %s (%s attempts)', consumer_name, failure_reason, attempts), '; '
    ) into detail
    from platform.consumer_quarantine where resolved_at is null;

    raise exception 'Open quarantines: %', detail;
  end if;

  raise notice '5 · no open quarantines';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_CONSUMERS: all checks passed';
end;
$$;

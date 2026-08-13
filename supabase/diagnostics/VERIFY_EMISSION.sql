-- Verifies platform.emit_event() after 0023_emit_event.sql.
--
-- Run with psql and ON_ERROR_STOP:
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_EMISSION.sql
--
-- Check 2 is the only one in this repository that deliberately COMMITS, because the
-- property under test — that a committed event survives — cannot be observed from inside
-- the transaction that wrote it. It cleans up after itself by suspending the append-only
-- guard for one session, which is the only way to remove a row from that table and is
-- itself evidence the guard works.
--
-- Safe against staging. Do NOT run against production: check 2 writes and then deletes
-- real rows in platform.events.

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · An event emitted in a rolled-back transaction does not exist
--
-- The first half of WP 01.06's acceptance, and the reason the helper is SQL rather than
-- JavaScript: a helper called over RPC gets its own transaction, so it could not fail this
-- test — it would have committed before the caller's work was decided.

begin;

do $$
declare
  v_sequence bigint;
  v_present integer;
begin
  v_sequence := platform.emit_event(
    p_event_id       => '01920000-0000-7000-8000-0000000e0001',
    p_event_type     => 'platform.diagnostic.emitted',
    p_workspace_id   => '01920000-0000-7000-8000-0000000e00ff',
    p_actor_type     => 'system',
    p_actor_ref      => 'VERIFY_EMISSION.sql',
    p_subject_type   => 'diagnostic',
    p_subject_id     => '01920000-0000-7000-8000-0000000e00aa',
    p_correlation_id => '01920000-0000-7000-8000-0000000e00cc',
    p_occurred_at    => '2026-06-15 12:00:00+00'
  );

  if v_sequence <> 1 then
    raise exception 'First event for a subject got sequence %, expected 1', v_sequence;
  end if;

  -- Visible inside its own transaction, which is what makes it usable by the engine that
  -- is still mid-change.
  select count(*) into v_present from platform.events
  where event_id = '01920000-0000-7000-8000-0000000e0001';
  if v_present <> 1 then
    raise exception 'The emitting transaction cannot see its own event';
  end if;

  raise notice '1a · emitted, sequence 1, visible inside the transaction';
end;
$$;

rollback;

do $$
declare
  v_present integer;
begin
  select count(*) into v_present from platform.events
  where event_id = '01920000-0000-7000-8000-0000000e0001';

  if v_present <> 0 then
    raise exception
      'An event emitted in a rolled-back transaction survived — a change that did not happen has a fact recorded for it';
  end if;

  raise notice '1b · the rolled-back event does not exist';
end;
$$;

-- =========================================================================
-- 2 · An event emitted in a committed transaction does exist, and sequences
--     advance gaplessly per subject
--
-- The second half of the acceptance. This section commits deliberately, then removes what
-- it wrote.

begin;

do $$
declare
  v_first bigint;
  v_second bigint;
  v_other bigint;
begin
  v_first := platform.emit_event(
    p_event_id       => '01920000-0000-7000-8000-0000000e0002',
    p_event_type     => 'platform.diagnostic.emitted',
    p_workspace_id   => '01920000-0000-7000-8000-0000000e00ff',
    p_actor_type     => 'system',
    p_actor_ref      => 'VERIFY_EMISSION.sql',
    p_subject_type   => 'diagnostic',
    p_subject_id     => '01920000-0000-7000-8000-0000000e00aa',
    p_correlation_id => '01920000-0000-7000-8000-0000000e00cc',
    p_occurred_at    => '2026-06-15 12:00:00+00'
  );

  v_second := platform.emit_event(
    p_event_id       => '01920000-0000-7000-8000-0000000e0003',
    p_event_type     => 'platform.diagnostic.emitted',
    p_workspace_id   => '01920000-0000-7000-8000-0000000e00ff',
    p_actor_type     => 'system',
    p_actor_ref      => 'VERIFY_EMISSION.sql',
    p_subject_type   => 'diagnostic',
    p_subject_id     => '01920000-0000-7000-8000-0000000e00aa',
    p_correlation_id => '01920000-0000-7000-8000-0000000e00cc',
    p_causation_id   => '01920000-0000-7000-8000-0000000e0002',
    p_occurred_at    => '2026-06-15 12:00:01+00'
  );

  -- A different subject in the same workspace starts again at 1. Ordering is per subject,
  -- never per workspace (DATABASE_ARCHITECTURE.md §23) — a workspace's stream is a merge
  -- of its subjects' streams and carries no total order across them.
  v_other := platform.emit_event(
    p_event_id       => '01920000-0000-7000-8000-0000000e0004',
    p_event_type     => 'platform.diagnostic.emitted',
    p_workspace_id   => '01920000-0000-7000-8000-0000000e00ff',
    p_actor_type     => 'system',
    p_actor_ref      => 'VERIFY_EMISSION.sql',
    p_subject_type   => 'diagnostic',
    p_subject_id     => '01920000-0000-7000-8000-0000000e00bb',
    p_correlation_id => '01920000-0000-7000-8000-0000000e00cc',
    p_occurred_at    => '2026-06-15 12:00:02+00'
  );

  if v_first <> 1 or v_second <> 2 then
    raise exception 'Sequence for one subject went %, % — expected 1, 2', v_first, v_second;
  end if;
  if v_other <> 1 then
    raise exception 'A different subject started at % rather than 1 — ordering leaked across subjects', v_other;
  end if;

  raise notice '2a · one subject sequences 1,2; a second subject starts again at 1';
end;
$$;

commit;

do $$
declare
  v_present integer;
  v_max bigint;
begin
  select count(*) into v_present from platform.events
  where correlation_id = '01920000-0000-7000-8000-0000000e00cc';

  if v_present <> 3 then
    raise exception 'Expected 3 committed events, found %', v_present;
  end if;

  -- Emitted again after the commit: the sequence continues rather than restarting, which
  -- is what makes "I received 7 after 5" mean a loss rather than a restart.
  select pg_catalog.max(subject_sequence) into v_max from platform.events
  where workspace_id = '01920000-0000-7000-8000-0000000e00ff'
    and subject_type = 'diagnostic'
    and subject_id = '01920000-0000-7000-8000-0000000e00aa';

  if v_max <> 2 then
    raise exception 'Committed sequence maximum is %, expected 2', v_max;
  end if;

  raise notice '2b · the committed events exist and the sequence persists across transactions';
end;
$$;

-- Cleanup. The append-only guard refuses DELETE even to the table owner, so it has to be
-- suspended for this session — the same mechanism ADR-0018 anticipated for restores, and
-- the friction an append-only table is supposed to have.
set session_replication_role = replica;
delete from platform.events where correlation_id = '01920000-0000-7000-8000-0000000e00cc';
reset session_replication_role;

do $$
declare
  v_left integer;
begin
  select count(*) into v_left from platform.events
  where correlation_id = '01920000-0000-7000-8000-0000000e00cc';
  if v_left <> 0 then
    raise exception 'Diagnostic events were left behind: % row(s)', v_left;
  end if;
  raise notice '2c · cleaned up; the table is as it was found';
end;
$$;

-- =========================================================================
-- 3 · The function refuses to invent what it must not invent
--
-- §3 puts identifier generation in the application, and SYSTEM_ARCHITECTURE.md §5 says
-- correlation_id is "propagated, never regenerated". A function that defaulted either
-- would silently start a new trace whenever an engine forgot to pass one.

begin;

do $$
declare
  accepted text[] := '{}';
  v_ignored bigint;
begin
  begin
    v_ignored := platform.emit_event(
      p_event_id       => null,
      p_event_type     => 'platform.diagnostic.emitted',
      p_workspace_id   => '01920000-0000-7000-8000-0000000e00ff',
      p_actor_type     => 'system',
      p_actor_ref      => 'probe',
      p_subject_type   => 'diagnostic',
      p_subject_id     => '01920000-0000-7000-8000-0000000e00aa',
      p_correlation_id => '01920000-0000-7000-8000-0000000e00cc'
    );
    accepted := accepted || 'an event with no event_id'::text;
  exception when not_null_violation then null;
  end;

  begin
    v_ignored := platform.emit_event(
      p_event_id       => '01920000-0000-7000-8000-0000000e0009',
      p_event_type     => 'platform.diagnostic.emitted',
      p_workspace_id   => '01920000-0000-7000-8000-0000000e00ff',
      p_actor_type     => 'system',
      p_actor_ref      => 'probe',
      p_subject_type   => 'diagnostic',
      p_subject_id     => '01920000-0000-7000-8000-0000000e00aa',
      p_correlation_id => null
    );
    accepted := accepted || 'an event with no correlation_id'::text;
  exception when not_null_violation then null;
  end;

  begin
    v_ignored := platform.emit_event(
      p_event_id       => '01920000-0000-7000-8000-0000000e000a',
      p_event_type     => 'NotAValidType',
      p_workspace_id   => '01920000-0000-7000-8000-0000000e00ff',
      p_actor_type     => 'system',
      p_actor_ref      => 'probe',
      p_subject_type   => 'diagnostic',
      p_subject_id     => '01920000-0000-7000-8000-0000000e00aa',
      p_correlation_id => '01920000-0000-7000-8000-0000000e00cc'
    );
    accepted := accepted || 'a malformed event_type'::text;
  exception when check_violation then null;
  end;

  if array_length(accepted, 1) is not null then
    raise exception 'emit_event accepted: %', pg_catalog.array_to_string(accepted, '; ');
  end if;

  raise notice '3 · missing identifiers and malformed types are refused, not defaulted';
end;
$$;

rollback;

-- =========================================================================
-- 4 · The function is reachable by engines and by nobody else
--
-- SECURITY DEFINER on a function that writes an append-only table: PostgreSQL grants
-- EXECUTE to PUBLIC by default, and that default would hand the whole security model to
-- anyone with a connection.

do $$
declare
  signature text := 'platform.emit_event(uuid, text, uuid, platform.actor_type, text, text, uuid, uuid, jsonb, uuid, smallint, boolean, timestamptz)';
  problems text[] := '{}';
  r text;
begin
  if not (select prosecdef from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'platform' and p.proname = 'emit_event') then
    problems := problems || 'emit_event is not SECURITY DEFINER — engines cannot reach platform'::text;
  end if;

  foreach r in array array['public', 'anon', 'authenticated', 'service_role'] loop
    if pg_catalog.has_function_privilege(r, signature, 'EXECUTE') then
      problems := problems || pg_catalog.format('%s can execute emit_event', r);
    end if;
  end loop;

  foreach r in array array[
    'klussie_engine_identity', 'klussie_engine_workspace', 'klussie_engine_property',
    'klussie_engine_work', 'klussie_engine_knowledge', 'klussie_engine_commerce',
    'klussie_engine_platform'
  ] loop
    if not pg_catalog.has_function_privilege(r, signature, 'EXECUTE') then
      problems := problems || pg_catalog.format('%s cannot emit events', r);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Emission access wrong: %', pg_catalog.array_to_string(problems, '; ');
  end if;

  raise notice '4 · security definer, executable by the seven engines and by nobody else';
end;
$$;

-- =========================================================================
-- 5 · The legacy path is untouched
--
-- ADR-0019 rules out reusing ADR-0004's signature and leaves public.domain_events
-- working. Five triggers still depend on it, and they are the product's live event path.

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'emit_domain_event'
  ) then
    raise exception 'public.emit_domain_event() is gone — the product''s live event path was removed';
  end if;

  if not exists (select 1 from pg_catalog.pg_class c
                 join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'domain_events') then
    raise exception 'public.domain_events is gone';
  end if;

  raise notice '5 · public.domain_events and its RPC are untouched';
end;
$$;

-- =========================================================================

do $$
begin
  raise notice 'VERIFY_EMISSION: all checks passed';
end;
$$;

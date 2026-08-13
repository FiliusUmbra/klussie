-- Epic 01 WP06 — the transactional event emission helper.
--
-- SUPABASE_ARCHITECTURE.md §12, constraint 5: events are written in the same transaction
-- as the change they describe, so that a change without an event is impossible.
-- SYSTEM_ARCHITECTURE.md §5 states the same property from the other side — "the
-- transaction ends at the event." Everything downstream happens afterwards and may fail
-- and retry without affecting the change that already succeeded.
--
-- That is why this is a SQL function and not a JavaScript one. A helper called over RPC
-- gets its own transaction, so an event emitted that way is an event with no change
-- attached — precisely the shape constraint 5 exists to forbid. An engine calls this from
-- inside the transaction that writes its aggregate, and a rollback takes both.
--
-- WHY SECURITY DEFINER
--
-- Not for convenience. An engine emits events about its own aggregates but does not own
-- `platform` — under 0019's grants, klussie_engine_work has no USAGE on that schema at
-- all, and giving it write access to another engine's schema is exactly what §9 exists to
-- prevent. SECURITY DEFINER lets every engine reach the backbone through its contract
-- rather than around it: the Event Backbone is "not an engine … a shared contract and
-- delivery mechanism every engine uses" (SYSTEM_ARCHITECTURE.md §5).
--
-- WHAT THE CALLER SUPPLIES, AND WHY
--
-- Identifiers are application-generated (§3). This function will not invent an event_id
-- or a correlation_id, and that is deliberate in both cases:
--   · event_id — §3 puts identifier generation in the application. UUIDv7 generation
--     arrives in WP 02.03; until then callers pass literals, and there are no production
--     callers yet.
--   · correlation_id — "propagated, never regenerated" (SYSTEM_ARCHITECTURE.md §5). A
--     function that defaulted it would silently start a new trace every time an engine
--     forgot to pass one, and the resulting hole is invisible until someone needs it.
--
-- ADR-0004's emit_domain_event() is NOT extended or superseded. It governs the legacy
-- public.domain_events table, which keeps working untouched (ADR-0019 rules the reuse out
-- explicitly).

create or replace function platform.emit_event(
  p_event_id        uuid,
  p_event_type      text,
  p_workspace_id    uuid,
  p_actor_type      platform.actor_type,
  p_actor_ref       text,
  p_subject_type    text,
  p_subject_id      uuid,
  p_correlation_id  uuid,
  p_payload         jsonb       default '{}'::jsonb,
  p_causation_id    uuid        default null,
  p_event_version   smallint    default 1,
  p_is_derived      boolean     default false,
  p_occurred_at     timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
begin
  -- ORDERING: gapless per subject, and this is where that costs something.
  --
  -- ADR-0019: subject_sequence is "assigned by the owning engine, inside the transaction
  -- that writes the aggregate, as the subject's current maximum plus one", and gapless, so
  -- that a consumer receiving 7 after 5 knows it lost one. Read-then-insert without a lock
  -- is a race: two concurrent transactions read the same maximum and write the same
  -- sequence. Nothing would catch it — the ADR is explicit that PostgreSQL cannot enforce
  -- uniqueness here, because a unique constraint on a partitioned table must include every
  -- partition key column, and including occurred_at would permit the same sequence twice
  -- in two time partitions.
  --
  -- So the lock is not an optimisation detail; without it the field does not mean what the
  -- ADR says it means. It is transaction-scoped, so it releases on commit or rollback with
  -- no unlock path to forget, and it serialises writes to ONE SUBJECT — per asset, per
  -- conversation, per engagement. That is the trade ADR-0019 chose deliberately over a
  -- per-workspace bottleneck, which would have made the platform's largest customers its
  -- slowest.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_workspace_id::text || ':' || p_subject_type || ':' || p_subject_id::text, 0
    )
  );

  -- `coalesce` is a SQL construct rather than a schema-qualifiable function, so it is
  -- written bare: it cannot be shadowed, and `search_path = ''` does not reach it.
  select coalesce(pg_catalog.max(subject_sequence), 0) + 1
    into v_sequence
  from platform.events
  where workspace_id = p_workspace_id
    and subject_type = p_subject_type
    and subject_id = p_subject_id;

  insert into platform.events (
    event_id, event_type, event_version, workspace_id, actor_type, actor_ref,
    subject_type, subject_id, subject_sequence, occurred_at, correlation_id,
    causation_id, is_derived, payload
  ) values (
    p_event_id, p_event_type, p_event_version, p_workspace_id, p_actor_type, p_actor_ref,
    p_subject_type, p_subject_id, v_sequence, p_occurred_at, p_correlation_id,
    p_causation_id, p_is_derived, p_payload
  );

  return v_sequence;
end;
$$;

comment on function platform.emit_event is
  'Emits a domain event inside the caller''s transaction, assigning the next gapless subject_sequence. Called from an engine''s own aggregate-writing transaction so that a change without an event is impossible (SUPABASE_ARCHITECTURE.md §12). Returns the sequence assigned.';

-- =========================================================================
-- ACCESS
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC. On a SECURITY DEFINER function
-- that writes an append-only table, that default is the whole security model inverted, so
-- it comes off first and the grants go on afterwards.

revoke all on function platform.emit_event(
  uuid, text, uuid, platform.actor_type, text, text, uuid, uuid,
  jsonb, uuid, smallint, boolean, timestamptz
) from public;

-- Every engine emits events about its own aggregates. The consumers are deliberately
-- absent: a consumer emitting a derived event is a real case (ADR-0019), but no such
-- consumer exists, and docs/operations/ROLES.md §3 rule 1 is that a privilege is granted
-- when there is a real caller needing it.
do $$
declare
  engine_role text;
begin
  foreach engine_role in array array[
    'klussie_engine_identity', 'klussie_engine_workspace', 'klussie_engine_property',
    'klussie_engine_work', 'klussie_engine_knowledge', 'klussie_engine_commerce',
    'klussie_engine_platform'
  ] loop
    execute pg_catalog.format(
      'grant execute on function platform.emit_event(
         uuid, text, uuid, platform.actor_type, text, text, uuid, uuid,
         jsonb, uuid, smallint, boolean, timestamptz
       ) to %I', engine_role
    );
  end loop;
end;
$$;
